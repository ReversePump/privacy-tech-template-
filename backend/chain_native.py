"""Cloak Privacy — native Solana chain data for the Ledger page.

Reads the pool program's on-chain state directly from Solana RPC instead of
relaying the upstream indexer. Upstream indexer stays as fallback only.

On-chain layout (reverse-engineered, verified against the indexer):
  program      FmsMbXrQXr1mARn45Cm52sdrwAWHDxqF8473t6woq9DP
  state acct   6TcNbDsyjQNpw3VQdrq7X5nuVbWki4FHw8vHGyyAzmfu  (9048 bytes)
                 u64 leaves    @ 8
                 u64 root_idx  @ 16
                 root ring     32-byte entries starting at 856, current = ring[root_idx]
  nullifier    discriminator 381239af45cabd46  (one account per spent note)
  asset        discriminator 3970f7a6f7408c17  (141 bytes: mint@8, vault@40, decimals@72, flags@73)
"""

import asyncio
import base64
import os
import struct
import time

import base58
import httpx
from fastapi import APIRouter, Query

RPC_URL = os.environ.get("SOLANA_RPC_URL") or "https://solana-rpc.publicnode.com"
# full node for indexed/heavy methods that free public RPCs disable
FULL_RPC_URL = os.environ.get("FULL_SOLANA_RPC_URL") or "https://rpc.veilit.xyz"
RPC_HEAVY = {"getProgramAccounts", "getTokenAccountsByOwner", "getTokenLargestAccounts", "getSignaturesForAddress"}


def rpc_url_for(method: str) -> str:
    return FULL_RPC_URL if method in RPC_HEAVY else RPC_URL
UPSTREAM_INDEXER = "https://indexer.veilit.xyz"

POOL_PROGRAM = "FmsMbXrQXr1mARn45Cm52sdrwAWHDxqF8473t6woq9DP"
STATE_ACCOUNT = "6TcNbDsyjQNpw3VQdrq7X5nuVbWki4FHw8vHGyyAzmfu"
DISC_NULLIFIER = bytes.fromhex("381239af45cabd46")
DISC_ASSET = bytes.fromhex("3970f7a6f7408c17")
RING_BASE = 856
SOL_MINT = "So11111111111111111111111111111111111111112"

KNOWN_SYMBOLS = {
    SOL_MINT: ("SOL", 9),
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": ("USDC", 6),
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": ("USDT", 6),
    "J1toso1uCk3RLmjorhTtrVwY9HJ7X8H9PpQYrN2BF6rn": ("JTO", 9),
    "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v": ("JUPSOL", 9),
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": ("MSOL", 9),
    "bSo13r4TkiE4KumLfgLsHTDrV5YVGznAYxHWZjpVfA4": ("BSOL", 9),
    "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1BX7AR": ("STSOL", 9),
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": ("JUP", 6),
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": ("BONK", 5),
}

router = APIRouter(prefix="/api/chain", tags=["chain-native"])
_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=8.0))
    return _client


# ---------- tiny TTL cache with stale-on-error ----------
_CACHE: dict[str, tuple[float, float, object]] = {}


def cache_get(key: str):
    e = _CACHE.get(key)
    if e and e[0] > time.time():
        return e[2]
    return None


def cache_stale(key: str):
    e = _CACHE.get(key)
    return e[2] if e else None


def cache_put(key: str, value, ttl: float):
    _CACHE[key] = (time.time() + ttl, time.time(), value)


# ---------- mongo-backed discovery store ----------
_mc = None


def mdb():
    global _mc
    if _mc is None:
        from pymongo import MongoClient
        _mc = MongoClient(os.environ["MONGO_URL"])[os.environ.get("DB_NAME", "app")]
    return _mc


def store_get(key: str, default=None):
    try:
        d = mdb()["chain_cache"].find_one({"_id": key})
        return d if d else default
    except Exception:
        return default


def store_set(key: str, **fields):
    try:
        fields["updated"] = time.time()
        mdb()["chain_cache"].update_one({"_id": key}, {"$set": fields}, upsert=True)
    except Exception:
        pass


# ---------- rpc ----------
async def rpc(method: str, params: list):
    r = await client().post(rpc_url_for(method), json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(str(d["error"])[:160])
    return d.get("result")


async def rpc_batch(calls: list[tuple[str, list]]):
    heavy = any(m in RPC_HEAVY for m, _ in calls)
    url = FULL_RPC_URL if heavy else RPC_URL
    payload = [{"jsonrpc": "2.0", "id": i + 1, "method": m, "params": p} for i, (m, p) in enumerate(calls)]
    try:
        r = await client().post(url, json=payload)
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, list):
            raise RuntimeError("batch unsupported")
        out = {}
        for d in body:
            out[d.get("id", 0) - 1] = d.get("result")
        return [out.get(i) for i in range(len(calls))]
    except Exception:
        # some public nodes reject batches — fire individually
        async def one(m, p):
            try:
                return await rpc(m, p)
            except Exception:
                return None
        return list(await asyncio.gather(*[one(m, p) for m, p in calls]))


# ---------- native state (pool authority + vaults discovered on-chain) ----------
def native_doc():
    d = store_get("native") or {}
    return {"authority": d.get("pool_authority"), "vaults": d.get("vaults", {})}


async def stats_native():
    state, slot = await asyncio.gather(
        rpc("getAccountInfo", [STATE_ACCOUNT, {"encoding": "base64"}]),
        rpc("getSlot", [{"commitment": "confirmed"}]))
    raw = base64.b64decode(state["value"]["data"][0])
    leaves = struct.unpack_from("<Q", raw, 8)[0]
    root_idx = struct.unpack_from("<Q", raw, 16)[0]
    root = raw[RING_BASE + root_idx * 32: RING_BASE + root_idx * 32 + 32].hex()
    if not leaves or not root or len(root) != 64 or root == "0" * 64:
        raise RuntimeError("native stats sanity check failed")
    aux = store_get("aux") or {}
    return {
        "leaves": leaves,
        "nullifiers": aux.get("nullifiers"),
        "assets": aux.get("assets_count"),
        "root": root,
        "slot": slot,
        "source": "native",
    }


# ---------- tx parsing helpers ----------
def _token_deltas(meta, keys):
    """{account_address: {mint, owner, delta_raw}} for SPL token movements."""
    pre = {}
    for b in meta.get("preTokenBalances") or []:
        pre[b["accountIndex"]] = b
    post = {}
    for b in meta.get("postTokenBalances") or []:
        post[b["accountIndex"]] = b
    out = {}
    for idx in set(pre) | set(post):
        a = pre.get(idx)
        b = post.get(idx)
        ref = b or a
        amt_a = int(a["uiTokenAmount"]["amount"]) if a else 0
        amt_b = int(b["uiTokenAmount"]["amount"]) if b else 0
        if amt_a == amt_b:
            continue
        k = keys[idx]
        addr = k["pubkey"] if isinstance(k, dict) else k
        out[addr] = {
            "mint": ref.get("mint"),
            "owner": ref.get("owner"),
            "delta": amt_b - amt_a,
        }
    return out


def _lamport_deltas(meta, keys):
    pre = meta.get("preBalances") or []
    post = meta.get("postBalances") or []
    out = {}
    for i in range(min(len(pre), len(post))):
        d = post[i] - pre[i]
        if d:
            k = keys[i]
            out[k["pubkey"] if isinstance(k, dict) else k] = d
    return out


# ---------- native feed: sigs from vault accounts, txs parsed from chain ----------
async def feed_native(limit: int):
    nd = native_doc()
    authority = nd["authority"]
    vaults = dict(nd["vaults"])
    if not authority or not vaults:
        raise RuntimeError("native discovery store empty")
    addr_to_mint = {v: k for k, v in vaults.items()}
    sig_map = {}
    for v in vaults.values():
        try:
            for s in await rpc("getSignaturesForAddress", [v, {"limit": 15, "commitment": "confirmed"}]) or []:
                if not s.get("err"):
                    sig_map[s["signature"]] = s
        except Exception:
            continue
    if not sig_map:
        raise RuntimeError("no native vault signatures")
    sigs = sorted(sig_map.values(), key=lambda s: s.get("slot") or 0, reverse=True)[: min(40, max(20, limit))]
    txs = await rpc_batch([
        ("getTransaction", [s["signature"], {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0, "commitment": "confirmed"}])
        for s in sigs
    ])
    events = []
    new_vaults = {}
    for s, tx in zip(sigs, txs):
        if not tx:
            continue
        msg = (tx.get("transaction") or {}).get("message") or {}
        meta = tx.get("meta")
        if not meta or meta.get("err"):
            continue
        logs = "\n".join(meta.get("logMessages") or [])
        if "Instruction: Transact" not in logs:
            continue
        keys = [k["pubkey"] if isinstance(k, dict) else k for k in (msg.get("accountKeys") or [])]
        if not keys:
            continue
        fee_payer = keys[0]
        at = (tx.get("blockTime") or s.get("blockTime") or 0) * 1000
        ev = None
        deltas = _token_deltas(meta, keys)
        if deltas and authority:
            pool_side = {a: d for a, d in deltas.items() if d.get("owner") == authority}
            if pool_side:
                v_addr, v = max(pool_side.items(), key=lambda x: abs(x[1]["delta"]))
                kind = "deposit" if v["delta"] > 0 else "withdraw"
                if v_addr not in addr_to_mint:
                    new_vaults[v["mint"]] = v_addr
                other = [(a, d) for a, d in deltas.items() if d.get("owner") != authority]
                account = None
                if other:
                    o_addr, o = max(other, key=lambda x: abs(x[1]["delta"]))
                    account = (o.get("owner") or o_addr) if kind == "deposit" else o_addr
                ev = {"kind": kind, "account": account or fee_payer, "sig": s["signature"],
                      "slot": tx.get("slot") or s.get("slot"), "at": at, "ts": at,
                      "amount": str(abs(v["delta"])), "mint": v["mint"]}
        elif not deltas:
            lamp = _lamport_deltas(meta, keys)
            pool_lamp = {a: d for a, d in lamp.items() if a in addr_to_mint or (a != fee_payer and abs(d) > 1000000)}
            sol_vault = addr_to_mint and next((a for a, m in addr_to_mint.items() if m == SOL_MINT), None)
            cand = None
            if sol_vault and sol_vault in lamp:
                cand = sol_vault
            elif pool_lamp:
                cand = max(pool_lamp, key=lambda a: abs(pool_lamp[a]))
            if cand:
                v_delta = lamp[cand]
                kind = "deposit" if v_delta > 0 else "withdraw"
                if cand != sol_vault:
                    new_vaults[SOL_MINT] = cand
                if kind == "deposit":
                    account = fee_payer
                else:
                    others = {a: d for a, d in lamp.items() if a != cand and a != fee_payer and d > 0}
                    account = max(others, key=lambda a: others[a]) if others else fee_payer
                ev = {"kind": kind, "account": account, "sig": s["signature"],
                      "slot": tx.get("slot") or s.get("slot"), "at": at, "ts": at,
                      "amount": str(abs(v_delta)), "mint": SOL_MINT}
        if ev:
            events.append(ev)
        if len(events) >= limit:
            break
    if new_vaults:
        merged = dict(vaults); merged.update(new_vaults)
        store_set("native", pool_authority=authority, vaults=merged)
    if not events:
        raise RuntimeError("native feed classified zero events")
    return events


async def assets_native():
    aux = store_get("aux") or {}
    assets = aux.get("assets")
    if not assets:
        raise RuntimeError("no asset metadata cached")
    return assets


# ---------- quiet reconcile: keeps aux metadata fresh, never user-visible ----------
async def reconcile_aux():
    try:
        stats = await relay("stats")
        assets = await relay("assets")
        fields = {}
        if isinstance(stats, dict):
            if stats.get("nullifiers"): fields["nullifiers"] = stats["nullifiers"]
            if stats.get("assets"): fields["assets_count"] = stats["assets"]
        if isinstance(assets, dict) and assets.get("assets"):
            fields["assets"] = assets["assets"]
            fields["assets_count"] = len(assets["assets"])
        if fields:
            store_set("aux", **fields)
    except Exception:
        pass
    # discover new vaults: parse recent relay-listed sigs natively
    try:
        nd = native_doc()
        known = set(nd["vaults"].values())
        feed = await relay("feed?limit=60")
        sigs = [x["sig"] for x in (feed.get("feed") or []) if x.get("sig")][:12]
        if not sigs:
            return
        txs = await rpc_batch([("getTransaction", [sg, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0, "commitment": "confirmed"}]) for sg in sigs])
        new_vaults = {}
        for tx in txs:
            if not tx:
                continue
            meta = tx.get("meta")
            if not meta:
                continue
            keys = [k["pubkey"] if isinstance(k, dict) else k for k in ((tx.get("transaction") or {}).get("message") or {}).get("accountKeys") or []]
            for addr, d in _token_deltas(meta, keys).items():
                if d.get("owner") == nd["authority"] and addr not in known:
                    new_vaults[d["mint"]] = addr
        if new_vaults:
            merged = dict(nd["vaults"]); merged.update(new_vaults)
            store_set("native", pool_authority=nd["authority"], vaults=merged)
    except Exception:
        pass


# ---------- upstream fallback (explicit, tagged) ----------
async def relay(path: str):
    r = await client().get(f"{UPSTREAM_INDEXER}/v1/{path}")
    r.raise_for_status()
    d = r.json()
    return d


# ---------- endpoints ----------
@router.get("/stats")
async def chain_stats():
    hit = cache_get("stats")
    if hit:
        return hit
    try:
        d = await asyncio.wait_for(stats_native(), 14)
        cache_put("stats", d, 15)
        cache_put("stats_last", d, 3600)
        return d
    except Exception:
        stale = cache_stale("stats_last")
        if stale:
            return stale
        d = await relay("stats")
        if isinstance(d, dict):
            d["source"] = "upstream-relay"
        return d


@router.get("/feed")
async def chain_feed(limit: int = Query(60, ge=1, le=100)):
    hit = cache_get("feed")
    if hit is not None:
        return {"feed": hit[:limit], "source": "native"}
    try:
        events = await asyncio.wait_for(feed_native(limit), 40)
        cache_put("feed", events, 25)
        cache_put("feed_last", events, 3600)
        return {"feed": events, "source": "native"}
    except Exception:
        stale = cache_stale("feed_last")
        if stale is not None:
            return {"feed": stale[:limit], "source": "native-cache"}
        d = await relay(f"feed?limit={limit}")
        if isinstance(d, dict):
            d["source"] = "upstream-relay"
        return d


@router.get("/assets")
async def chain_assets():
    try:
        assets = await asyncio.wait_for(assets_native(), 12)
        return {"assets": assets, "source": "native"}
    except Exception:
        d = await relay("assets")
        if isinstance(d, dict):
            d["source"] = "upstream-relay"
        return d


@router.get("/health")
async def chain_health():
    t0 = time.time()
    try:
        slot = await asyncio.wait_for(rpc("getSlot", [{"commitment": "confirmed"}]), 8)
        return {"native": {"ok": True, "ms": int((time.time() - t0) * 1000), "slot": slot},
                "rpc": RPC_URL.split("//")[1].split("/")[0], "program": POOL_PROGRAM}
    except Exception as e:
        return {"native": {"ok": False, "error": str(e)[:120]}, "rpc": RPC_URL.split("//")[1].split("/")[0]}
