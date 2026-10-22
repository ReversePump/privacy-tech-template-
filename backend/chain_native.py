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


# ---------- rpc ----------
async def rpc(method: str, params: list):
    r = await client().post(RPC_URL, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    r.raise_for_status()
    d = r.json()
    if "error" in d:
        raise RuntimeError(str(d["error"])[:160])
    return d.get("result")


async def rpc_batch(calls: list[tuple[str, list]]):
    payload = [{"jsonrpc": "2.0", "id": i + 1, "method": m, "params": p} for i, (m, p) in enumerate(calls)]
    r = await client().post(RPC_URL, json=payload)
    r.raise_for_status()
    out = {}
    for d in r.json():
        out[d.get("id", 0) - 1] = d.get("result")
    return [out.get(i) for i in range(len(calls))]


# ---------- account census (nullifiers + assets, cached 15 min) ----------
async def census():
    hit = cache_get("census")
    if hit is not None:
        return hit
    res = await rpc("getProgramAccounts", [POOL_PROGRAM, {
        "encoding": "base64", "dataSlice": {"offset": 0, "length": 141}, "commitment": "confirmed"}])
    nullifiers = 0
    assets = []
    vaults = {}
    for a in res or []:
        try:
            raw = base64.b64decode(a["account"]["data"][0])
        except Exception:
            continue
        if raw[:8] == DISC_NULLIFIER:
            nullifiers += 1
        elif raw[:8] == DISC_ASSET and len(raw) >= 141:
            mint = base58.b58encode(raw[8:40]).decode()
            vault = base58.b58encode(raw[40:72]).decode()
            decimals = raw[80]
            verified = bool(raw[82] & 1)
            sym = KNOWN_SYMBOLS.get(mint)
            assets.append({
                "mint": mint, "decimals": decimals,
                "symbol": sym[0] if sym else None, "verified": verified,
            })
            vaults[vault] = mint
    out = {"nullifiers": nullifiers, "assets": assets, "vaults": vaults}
    cache_put("census", out, 900)
    return out


# ---------- native stats ----------
async def stats_native():
    cen, state, slot = await asyncio.gather(census(), rpc("getAccountInfo", [STATE_ACCOUNT, {"encoding": "base64"}]), rpc("getSlot", [{"commitment": "confirmed"}]))
    raw = base64.b64decode(state["value"]["data"][0])
    leaves = struct.unpack_from("<Q", raw, 8)[0]
    root_idx = struct.unpack_from("<Q", raw, 16)[0]
    root = raw[RING_BASE + root_idx * 32: RING_BASE + root_idx * 32 + 32].hex()
    if not leaves or not root or len(root) != 64 or root == "0" * 64:
        raise RuntimeError("native stats sanity check failed")
    return {
        "leaves": leaves,
        "nullifiers": cen["nullifiers"],
        "assets": len(cen["assets"]),
        "root": root,
        "slot": slot,
        "source": "native",
    }


# ---------- native feed ----------
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


def _classify(sig, slot, at, meta, keys, vaults):
    if not meta or meta.get("err"):
        return None
    logs = "\n".join(meta.get("logMessages") or [])
    if "Instruction: Transact" not in logs:
        return None
    fee_payer = keys[0]["pubkey"] if isinstance(keys[0], dict) else keys[0]
    deltas = _token_deltas(meta, keys)
    if deltas:
        vault_side = {a: d for a, d in deltas.items() if a in vaults}
        if not vault_side:
            return None
        # main vault moves the full/net amount; fee accounts (also pool-owned) move 0.3% — take the largest
        v_addr, v = max(vault_side.items(), key=lambda x: abs(x[1]["delta"]))
        kind = "deposit" if v["delta"] > 0 else "withdraw"
        mint = v["mint"]
        # counterparty: the changed account that is not a vault
        other = [(a, d) for a, d in deltas.items() if a not in vaults]
        account = None
        if other:
            o_addr, o = max(other, key=lambda x: abs(x[1]["delta"]))
            # indexer semantics: deposits show the depositor wallet, exits show the fresh destination token account
            account = (o.get("owner") or o_addr) if kind == "deposit" else o_addr
        if not account:
            account = fee_payer
        return {"kind": kind, "account": account, "sig": sig, "slot": slot,
                "at": (at or 0) * 1000, "ts": (at or 0) * 1000, "amount": str(abs(v["delta"])), "mint": mint}
    # SOL path: lamport movement against the SOL vault
    lamp = _lamport_deltas(meta, keys)
    sol_vault = next((a for a, m in vaults.items() if m == SOL_MINT), None)
    if not sol_vault or sol_vault not in lamp:
        return None
    v_delta = lamp[sol_vault]
    kind = "deposit" if v_delta > 0 else "withdraw"
    if kind == "deposit":
        account = fee_payer
    else:
        others = {a: d for a, d in lamp.items() if a != sol_vault and a != fee_payer and d > 0}
        account = max(others, key=lambda a: others[a]) if others else fee_payer
    return {"kind": kind, "account": account, "sig": sig, "slot": slot,
            "at": (at or 0) * 1000, "ts": (at or 0) * 1000, "amount": str(abs(v_delta)), "mint": SOL_MINT}


async def feed_native(limit: int):
    cen = await census()
    vaults = cen["vaults"]
    sigs = await rpc("getSignaturesForAddress", [POOL_PROGRAM, {"limit": min(100, max(40, limit * 2)), "commitment": "confirmed"}])
    sigs = [s for s in (sigs or []) if not s.get("err")]
    if not sigs:
        return []
    txs = await rpc_batch([
        ("getTransaction", [s["signature"], {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0, "commitment": "confirmed"}])
        for s in sigs
    ])
    events = []
    for s, tx in zip(sigs, txs):
        if not tx:
            continue
        msg = (tx.get("transaction") or {}).get("message") or {}
        ev = _classify(s["signature"], tx.get("slot") or s.get("slot"), tx.get("blockTime"), tx.get("meta"), msg.get("accountKeys") or [], vaults)
        if ev:
            events.append(ev)
        if len(events) >= limit:
            break
    if not events:
        raise RuntimeError("native feed classified zero events")
    return events


async def assets_native():
    cen = await census()
    if not cen["assets"]:
        raise RuntimeError("native assets sanity check failed")
    out = []
    for a in cen["assets"]:
        out.append({
            "mint": a["mint"],
            "symbol": a["symbol"] or (a["mint"][:4] + "…"),
            "name": a["symbol"] or "Token",
            "decimals": a["decimals"],
            "verified": a["verified"],
        })
    return out


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
