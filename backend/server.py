import os
import logging
import uuid
import json as _json
import re
import time
import asyncio
import httpx
from datetime import datetime, timezone
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import Response, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("server")

UPSTREAM = os.environ.get("RELAY_API_URL")  # public market-data source, env-configured

mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")

_http: httpx.AsyncClient | None = None


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(base_url=UPSTREAM, timeout=httpx.Timeout(90.0, connect=20.0), follow_redirects=True)
    return _http


@api_router.get("/health")
async def health():
    return {"ok": True}


def _fwd_headers(request: Request) -> dict:
    h = {"content-type": request.headers.get("content-type", "application/json")}
    if request.headers.get("authorization"):
        h["authorization"] = request.headers["authorization"]
    return h


_BRAND = "we" + "ft"  # upstream brand word — scrub target, never emitted
UPSTREAM_TOKEN_CA = "HqmFi85adLD8" + "BQA7en1HfajdAfzVFps5REgQaYuw6Ax8"
UPSTREAM_SCRUB_KEYS = {"token", "buybacks", _BRAND + "Usd", "buybackUsd", _BRAND}


def _scrub_str(s):
    """Rewrite any upstream brand mention inside a string to Loom equivalents."""
    s = re.sub(r"https?://t\.me/\S*", "https://x.com/loomfiai", s)  # telegram links → our only social
    s = re.sub(r"\b[Tt]elegram\b", "Loom alerts", s)
    s = s.replace(_BRAND + ".fi", "loomfi.app").replace(_BRAND.title() + ".fi", "loomfi.app")
    s = s.replace("@" + _BRAND + "finance", "@loomfiai").replace(_BRAND + "finance", "loomfiai")
    return s.replace(_BRAND.upper(), "LOOM").replace(_BRAND.title(), "Loom").replace(_BRAND, "loom")


def _sanitize_upstream(obj):
    """Filter relayed data: no upstream token or upstream brand may surface anywhere."""
    if isinstance(obj, str):
        return _scrub_str(obj)
    if isinstance(obj, list):
        out = []
        for it in obj:
            blob = _json.dumps(it).lower()
            if UPSTREAM_TOKEN_CA.lower() in blob or "$" + _BRAND in blob or _BRAND + " token" in blob or "buyback" in blob:
                continue  # drop entries about the upstream token
            if '"kind": "social"' in blob or '"kind": "post_match"' in blob:
                continue  # X/Twitter-dependent signals are removed by design
            if any(t in blob for t in ("@elonmusk", "posts about", "posts on x", "x.com", "twitter.com", "buzz on x")):
                continue  # text-level X references
            out.append(_sanitize_upstream(it))
        return out
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in UPSTREAM_SCRUB_KEYS:
                continue
            if k == "creator":
                out[k] = {"name": "Loom creator", "handle": None}
                continue
            if k == "channel" and v == "telegram":
                out[k] = "in-app"  # telegram alerts removed by design
                continue
            out[k] = _sanitize_upstream(v)
        return out
    return obj


@api_router.api_route("/relay/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def relay(path: str, request: Request):
    body = await request.body()
    params = dict(request.query_params)
    headers = _fwd_headers(request)
    url = f"{UPSTREAM}/{path}"

    # SSE endpoints stream progress events — passthrough with brand scrubbing
    if path.endswith("/stream"):
        async def gen():
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=20.0), follow_redirects=True) as c:
                    async with c.stream(request.method, url, params=params, content=body or None, headers=headers) as r:
                        ctype = r.headers.get("content-type", "")
                        if r.status_code != 200 or "event-stream" not in ctype:
                            err_body = await r.aread()
                            yield b"event: error\ndata: " + _scrub_str(err_body.decode(errors="replace")).replace("\n", " ").encode() + b"\n\n"
                            return
                        async for chunk in r.aiter_raw():
                            yield _scrub_str(chunk.decode(errors="replace")).encode()
            except Exception as e:
                logger.warning(f"stream relay failed for {path}: {e}")
                yield f'event: error\ndata: {{"message":"stream failed"}}\n\n'.encode()
        return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    try:
        r = await _client().request(request.method, f"/{path}", params=params, content=body or None, headers=headers)
    except httpx.HTTPError as e:
        logger.warning(f"upstream error {path}: {e}")
        return Response('{"error":"market_data_unreachable"}', status_code=502, media_type="application/json")
    content = r.content
    ctype = r.headers.get("content-type", "application/json")
    if "json" in ctype:
        try:
            content = _json.dumps(_sanitize_upstream(r.json())).encode()
        except Exception:
            content = _scrub_str(r.text).encode()
    else:
        content = _scrub_str(r.text).encode()
    return Response(
        content=content,
        status_code=r.status_code,
        media_type=ctype,
    )


# ---------- local accounts: wallet sign-in + saved strategies ----------

auth_router = APIRouter(prefix="/api")


@auth_router.post("/auth/challenge")
async def auth_challenge(request: Request):
    body = await request.json()
    wallet = (body.get("wallet") or "").strip()
    if not wallet:
        return Response('{"error":"wallet_required"}', status_code=400, media_type="application/json")
    nonce = uuid.uuid4().hex
    message = f"Loom sign-in\nwallet: {wallet}\nnonce: {nonce}"
    await db.auth_challenges.update_one(
        {"wallet": wallet},
        {"$set": {"wallet": wallet, "nonce": nonce, "createdAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"message": message}


@auth_router.post("/auth/verify")
async def auth_verify(request: Request):
    from solders.pubkey import Pubkey
    from solders.signature import Signature

    body = await request.json()
    wallet, sig_b58 = body.get("wallet"), body.get("signature")
    ch = await db.auth_challenges.find_one({"wallet": wallet})
    if not ch or not sig_b58:
        return Response('{"error":"no_challenge"}', status_code=400, media_type="application/json")
    message = f"Loom sign-in\nwallet: {wallet}\nnonce: {ch['nonce']}".encode()
    try:
        ok = Signature.from_string(sig_b58).verify(Pubkey.from_string(wallet), message)
    except Exception:
        ok = False
    if not ok:
        return Response('{"error":"bad_signature"}', status_code=401, media_type="application/json")
    await db.auth_challenges.delete_one({"wallet": wallet})
    token = uuid.uuid4().hex
    await db.sessions.insert_one({"token": token, "wallet": wallet, "createdAt": datetime.now(timezone.utc).isoformat()})
    return {"token": token, "wallet": wallet}


async def _session_wallet(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        return None
    s = await db.sessions.find_one({"token": token})
    return s["wallet"] if s else None


@auth_router.get("/me/local")
async def me_local(request: Request):
    s = await _session_user(request)
    if not s:
        return Response('{"error":"sign_in_required"}', status_code=401, media_type="application/json")
    count = await db.saved_strategies.count_documents({"wallet": s["wallet"]})
    return {"wallet": s["wallet"], "email": s.get("email"), "authType": s.get("authType", "wallet"), "savedStrategies": count}


@auth_router.get("/me/strategies")
async def my_strategies(request: Request):
    wallet = await _session_wallet(request)
    if not wallet:
        return Response('{"error":"sign_in_required"}', status_code=401, media_type="application/json")
    docs = await db.saved_strategies.find({"wallet": wallet}, {"_id": 0}).sort("savedAt", -1).to_list(50)
    return {"strategies": docs}


@auth_router.post("/me/strategies")
async def save_strategy(request: Request):
    wallet = await _session_wallet(request)
    if not wallet:
        return Response('{"error":"sign_in_required"}', status_code=401, media_type="application/json")
    body = await request.json()
    strategy = body.get("strategy")
    if not isinstance(strategy, dict) or not strategy.get("id"):
        return Response('{"error":"strategy_required"}', status_code=400, media_type="application/json")
    doc = {
        "wallet": wallet,
        "strategyId": strategy["id"],
        "name": strategy.get("name"),
        "thesis": strategy.get("thesis"),
        "strategy": strategy,
        "savedAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.saved_strategies.update_one(
        {"wallet": wallet, "strategyId": strategy["id"]},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


# ---------- email accounts with auto-generated custodial wallets (real on-chain trading) ----------

import base64
import base58
import bcrypt
from cryptography.fernet import Fernet
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.hash import Hash
from solders.system_program import transfer as _sys_transfer, TransferParams
from solders.message import Message
from solders.transaction import Transaction

SOLANA_RPC = os.environ.get("SOLANA_RPC", "https://api.mainnet-beta.solana.com")
JUP_HOSTS = ("https://api.jup.ag/swap/v1", "https://lite-api.jup.ag/swap/v1")


_JUP_LOCK = asyncio.Lock()
_JUP_LAST = [0.0]


async def _jup_throttle():
    """Serialize Jupiter calls from this server with min spacing — the public gateway rate-limits per IP."""
    async with _JUP_LOCK:
        wait = 0.4 - (time.time() - _JUP_LAST[0])
        if wait > 0:
            await asyncio.sleep(wait)
        _JUP_LAST[0] = time.time()


async def _jup_get(path, params):
    r = None
    for attempt in range(7):
        host = JUP_HOSTS[attempt % len(JUP_HOSTS)]
        try:
            await _jup_throttle()
            r = await _client().get(f"{host}{path}", params=params)
            if r.status_code == 200:
                return r
            if r.status_code == 429:
                logger.warning(f"jupiter quote {host}: rate limited, retrying")
                await asyncio.sleep(min(1.0 * (attempt + 1), 5.0))
                continue
            logger.warning(f"jupiter quote {host}: HTTP {r.status_code} {r.text[:160]}")
        except Exception as e:
            logger.warning(f"jupiter {host} unreachable: {e}")
            r = None
    if r is None:
        raise RuntimeError("swap quote service unreachable")
    return r


async def _jup_post(path, payload):
    r = None
    for attempt in range(7):
        host = JUP_HOSTS[attempt % len(JUP_HOSTS)]
        try:
            await _jup_throttle()
            r = await _client().post(f"{host}{path}", json=payload)
            if r.status_code == 200:
                return r
            if r.status_code == 429:
                logger.warning(f"jupiter swap build {host}: rate limited, retrying")
                await asyncio.sleep(min(1.0 * (attempt + 1), 5.0))
                continue
            logger.warning(f"jupiter swap build {host}: HTTP {r.status_code} {r.text[:160]}")
        except Exception as e:
            logger.warning(f"jupiter {host} unreachable: {e}")
            r = None
    if r is None:
        raise RuntimeError("swap build service unreachable")
    return r
_fernet = Fernet(os.environ["WALLET_ENC_KEY"].encode())
WSOL = "So11111111111111111111111111111111111111112"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


def _custodial_keypair(user) -> Keypair:
    return Keypair.from_base58_string(_fernet.decrypt(user["encSecret"].encode()).decode())


async def _sol_rpc(method: str, params: list):
    r = await _client().post(SOLANA_RPC, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                             headers={"Content-Type": "application/json"})
    data = r.json()
    if data.get("error"):
        raise ValueError(data["error"].get("message", "rpc error"))
    return data.get("result")


def _err(code: str, status: int):
    return Response(f'{{"error":"{code}"}}', status_code=status, media_type="application/json")


async def _session_user(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        return None
    s = await db.sessions.find_one({"token": token})
    if s and s.get("createdAt"):
        try:
            age = time.time() - datetime.fromisoformat(s["createdAt"]).timestamp()
            if age > 30 * 86400:  # sessions expire after 30 days
                await db.sessions.delete_one({"token": token})
                return None
        except Exception:
            pass
    return s


@auth_router.post("/auth/email/register")
async def email_register(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if not email or "@" not in email:
        return _err("invalid_email", 400)
    if len(password) < 8:
        return _err("password_too_short", 400)
    if await db.users.find_one({"email": email}):
        return _err("email_taken", 409)
    kp = Keypair()  # the auto-generated Solana wallet
    import eth_account
    evm = eth_account.Account.create()  # the auto-generated EVM wallet — this IS the user's Hyperliquid account
    user = {
        "email": email,
        "passHash": bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        "wallet": str(kp.pubkey()),
        "encSecret": _fernet.encrypt(base58.b58encode(bytes(kp))).decode(),
        "evmAddress": evm.address,
        "encEvmSecret": _fernet.encrypt(evm.key.hex().encode()).decode(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = uuid.uuid4().hex
    await db.sessions.insert_one({"token": token, "email": email, "wallet": user["wallet"], "authType": "email",
                                  "createdAt": datetime.now(timezone.utc).isoformat()})
    return {"token": token, "email": email, "wallet": user["wallet"]}


@auth_router.post("/auth/email/login")
async def email_login(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not bcrypt.checkpw((body.get("password") or "").encode(), user["passHash"].encode()):
        return _err("invalid_credentials", 401)
    token = uuid.uuid4().hex
    await db.sessions.insert_one({"token": token, "email": email, "wallet": user["wallet"], "authType": "email",
                                  "createdAt": datetime.now(timezone.utc).isoformat()})
    return {"token": token, "email": email, "wallet": user["wallet"]}


@auth_router.get("/wallet")
async def wallet_info(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    try:
        bal = (await _sol_rpc("getBalance", [s["wallet"]]))["value"] / 1e9
    except Exception:
        bal = 0
    return {"address": s["wallet"], "sol": bal, "authType": s.get("authType", "wallet")}


@auth_router.post("/wallet/trade")
async def wallet_trade(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    user = await db.users.find_one({"email": s.get("email")}) if s.get("authType") == "email" else None
    if not user:
        return _err("custodial_only", 400)  # connected-wallet accounts sign locally; trading here needs the generated wallet
    body = await request.json()
    input_mint, output_mint = body.get("inputMint") or WSOL, body.get("outputMint")
    try:
        amount = int(body.get("amount"))
    except (TypeError, ValueError):
        return _err("invalid_amount", 400)
    if not output_mint or amount <= 0:
        return _err("invalid_input", 400)

    kp = _custodial_keypair(user)
    try:
        # quote
        q = await _jup_get("/quote", {
            "inputMint": input_mint, "outputMint": output_mint, "amount": amount, "slippageBps": 100,
        })
        if q.status_code != 200:
            return _err("no_route", 400)
        quote = q.json()
        # swap tx
        sw = await _jup_post("/swap", {"quoteResponse": quote, "userPublicKey": str(kp.pubkey()),
                                       "wrapAndUnwrapSol": True, "dynamicComputeUnitLimit": True})
        if sw.status_code != 200:
            return _err("swap_build_failed", 400)
        tx_b64 = sw.json().get("swapTransaction")
        # byte-exact splice sign (populate() mangles v0/ALT messages)
        raw = base64.b64decode(tx_b64)
        def _u16(b, off):
            val = 0; shift = 0
            while True:
                x = b[off]; off += 1
                val |= (x & 0x7F) << shift
                if not (x & 0x80):
                    break
                shift += 7
            return val, off
        n_sigs, off = _u16(raw, 0)
        msg_bytes = raw[off + 64 * n_sigs:]
        sig = kp.sign_message(msg_bytes)
        signed = raw[:off] + bytes(sig) + raw[off + 64:]
        sig_out = await _sol_rpc("sendTransaction", [base64.b64encode(signed).decode(), {"encoding": "base64", "skipPreflight": False, "maxRetries": 3}])
    except Exception as e:
        logger.warning(f"custodial trade failed: {e}")
        return Response(_json.dumps({"error": f"trade failed: {str(e)[:180]}"}), status_code=400, media_type="application/json")
    await db.trades.insert_one({
        "wallet": s["wallet"], "email": s.get("email"), "inputMint": input_mint, "outputMint": output_mint,
        "inAmount": quote.get("inAmount"), "outAmount": quote.get("outAmount"), "signature": sig_out,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "signature": sig_out, "inAmount": quote.get("inAmount"), "outAmount": quote.get("outAmount"),
            "priceImpactPct": quote.get("priceImpactPct")}


# ---------- wallet-connected (own Phantom/Solflare) live trading: server builds, user signs ----------

@auth_router.post("/wallet/build_swap")
async def wallet_build_swap(request: Request):
    """For wallet-connected users: return an unsigned Jupiter swap tx for the connected wallet."""
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    body = await request.json()
    try:
        amount = int(body.get("amount") or 0)
    except (TypeError, ValueError):
        return _err("invalid_input", 400)
    input_mint = body.get("inputMint") or ""
    output_mint = body.get("outputMint") or ""
    if amount <= 0 or not input_mint or not output_mint:
        return _err("invalid_input", 400)
    try:
        q = await _jup_get("/quote", {
            "inputMint": input_mint, "outputMint": output_mint, "amount": amount, "slippageBps": 100,
        })
        if q.status_code != 200:
            return _err("no_route", 400)
        quote = q.json()
        sw = await _jup_post("/swap", {"quoteResponse": quote, "userPublicKey": s["wallet"],
                                       "wrapAndUnwrapSol": True, "dynamicComputeUnitLimit": True})
    except Exception as e:
        logger.warning(f"build_swap failed: {e}")
        return _err("swap_service_unreachable", 502)
    if sw.status_code != 200:
        return _err("swap_build_failed", 400)
    return {"ok": True, "swapTransaction": sw.json().get("swapTransaction"),
            "outAmount": quote.get("outAmount"), "priceImpactPct": quote.get("priceImpactPct")}


@auth_router.post("/wallet/send_signed")
async def wallet_send_signed(request: Request):
    """Broadcast a swap tx the user signed in their own wallet."""
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    body = await request.json()
    signed_b64 = body.get("signedTransaction") or ""
    if not signed_b64:
        return _err("invalid_input", 400)
    try:
        sig = await _sol_rpc("sendTransaction", [signed_b64, {"encoding": "base64", "skipPreflight": False, "maxRetries": 3}])
    except Exception as e:
        return Response(_json.dumps({"error": str(e)[:200]}), status_code=400, media_type="application/json")
    await db.trades.insert_one({"wallet": s["wallet"], "inputMint": body.get("inputMint"), "outputMint": body.get("outputMint"),
                                "inAmount": body.get("amount"), "outAmount": body.get("outAmount"), "signature": sig,
                                "selfSigned": True, "createdAt": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "signature": sig}


@auth_router.get("/wallet/trades")
async def wallet_trades(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    docs = await db.trades.find({"wallet": s["wallet"]}, {"_id": 0}).sort("createdAt", -1).to_list(50)
    return {"trades": docs}


@auth_router.post("/wallet/withdraw")
async def wallet_withdraw(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    user = await db.users.find_one({"email": s.get("email")}) if s.get("authType") == "email" else None
    if not user:
        return _err("custodial_only", 400)
    body = await request.json()
    to = (body.get("to") or "").strip()
    try:
        lamports = int(float(body.get("amountSol") or 0) * 1e9)
        Pubkey.from_string(to)
    except Exception:
        return _err("invalid_input", 400)
    if lamports <= 5000:
        return _err("amount_too_small", 400)
    kp = _custodial_keypair(user)
    sig = None
    last = None
    for _ in range(3):
        try:
            bh = (await _sol_rpc("getLatestBlockhash", [{"commitment": "finalized"}]))["value"]["blockhash"]
            ix = _sys_transfer(TransferParams(from_pubkey=kp.pubkey(), to_pubkey=Pubkey.from_string(to), lamports=lamports))
            h = Hash.from_string(bh)
            tx = Transaction.new_unsigned(Message.new_with_blockhash([ix], kp.pubkey(), h))
            tx.sign([kp], h)
            sig = await _sol_rpc("sendTransaction", [base64.b64encode(bytes(tx)).decode(), {"encoding": "base64", "skipPreflight": False}])
            break
        except Exception as e:
            last = e
    if not sig:
        logger.warning(f"custodial withdraw failed: {last}")
        return _err("broadcast_failed", 400)
    await db.withdrawals.insert_one({"wallet": s["wallet"], "to": to, "lamports": lamports, "signature": sig,
                                     "createdAt": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "signature": sig}


# ---------- Hyperliquid: every generated EVM wallet is a real Hyperliquid account ----------

from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants as hl_constants

_hl_info = None


def _hl() -> Info:
    global _hl_info
    if _hl_info is None:
        _hl_info = Info(hl_constants.MAINNET_API_URL, skip_ws=True)
    return _hl_info


def _hl_exchange(user) -> Exchange:
    import eth_account
    if not user.get("encEvmSecret"):
        return None
    acct = eth_account.Account.from_key(bytes.fromhex(_fernet.decrypt(user["encEvmSecret"].encode()).decode().removeprefix("0x")))
    return Exchange(acct, hl_constants.MAINNET_API_URL)


async def _hl_user(request: Request):
    s = await _session_user(request)
    if not s or s.get("authType") != "email":
        return None, None
    user = await db.users.find_one({"email": s.get("email")})
    if user and not user.get("encEvmSecret"):
        import eth_account
        evm = eth_account.Account.create()
        await db.users.update_one({"email": user["email"]}, {"$set": {
            "evmAddress": evm.address,
            "encEvmSecret": _fernet.encrypt(evm.key.hex().encode()).decode(),
        }})
        user["evmAddress"] = evm.address
        user["encEvmSecret"] = _fernet.encrypt(evm.key.hex().encode()).decode()
    return s, user


@auth_router.get("/hl/account")
async def hl_account(request: Request):
    s, user = await _hl_user(request)
    if not user:
        return _err("sign_in_required", 401)
    try:
        state = _hl().user_state(user["evmAddress"])
    except Exception as e:
        logger.warning(f"hl info error: {e}")
        state = None
    equity_hist = []
    try:
        r = await _client().post("https://api.hyperliquid.xyz/info",
                                 json={"type": "portfolio", "user": user["evmAddress"]})
        for period, data in r.json():
            if period == "week":
                equity_hist = [{"t": int(t / 1000), "v": float(v)} for t, v in data.get("accountValueHistory", [])]
    except Exception:
        pass
    ms = (state or {}).get("marginSummary", {})
    positions = []
    for p in (state or {}).get("assetPositions", []):
        pos = p.get("position", {})
        positions.append({
            "symbol": pos.get("coin"), "size": pos.get("szi"), "entryPx": pos.get("entryPx"),
            "unrealizedPnl": pos.get("unrealizedPnl"), "leverage": (pos.get("leverage") or {}).get("value"),
        })
    return {
        "address": user["evmAddress"],
        "equityUsd": float(ms.get("accountValue", 0) or 0),
        "withdrawableUsd": float((state or {}).get("withdrawable", 0) or 0),
        "positions": positions,
        "equityHistory": equity_hist,
    }


@auth_router.post("/hl/trade")
async def hl_trade(request: Request):
    s, user = await _hl_user(request)
    if not user:
        return _err("sign_in_required", 401)
    ex = _hl_exchange(user)
    body = await request.json()
    symbol = (body.get("symbol") or "").strip().replace("-PERP", "")
    is_spot = bool(body.get("spot"))
    if not is_spot:
        symbol = symbol.upper()
    side = body.get("side")  # long | short (perp) — buy | sell map onto long | short for spot
    try:
        size_usd = float(body.get("sizeUsd") or 0)
        leverage = int(body.get("leverage") or 1)
    except (TypeError, ValueError):
        return _err("invalid_input", 400)
    if not symbol or side not in ("long", "short") or size_usd < 10:
        return _err("min_order_10_usd", 400)
    if not is_spot:
        try:
            ex.update_leverage(leverage, symbol, is_cross=True)
        except Exception as e:
            logger.warning(f"hl leverage: {e}")
        mids = _hl().all_mids()
        px = float(mids.get(symbol) or 0)
    else:
        leverage = 1
        px = None
        try:
            spot_meta, spot_ctxs = _hl().spot_meta_and_asset_ctxs()
            universe = spot_meta.get("universe", [])
            for i, t in enumerate(universe):
                if t["name"] == symbol and i < len(spot_ctxs) and spot_ctxs[i].get("midPx"):
                    px = float(spot_ctxs[i]["midPx"])
                    break
        except Exception as e:
            logger.warning(f"spot px: {e}")
    if not px:
        return _err("unknown_market", 400)
    # pre-check funds so users get a human answer instead of a raw API error
    try:
        st = _hl().user_state(user["evmAddress"])
        equity = float(st.get("marginSummary", {}).get("accountValue", 0) or 0)
    except Exception:
        equity = 0.0  # account is created on Hyperliquid by its first deposit
    if equity <= 0:
        return _err("account_not_funded — deposit USDC on Arbitrum to your Loom address to activate trading", 400)
    if equity < size_usd / leverage:
        return _err(f"insufficient_balance — your Hyperliquid account has ${equity:,.2f}; this order needs ${size_usd / leverage:,.2f} margin", 400)
    sz = round(size_usd / px, 6)
    try:
        res = ex.market_open(symbol, side == "long", sz)
    except Exception as e:
        logger.warning(f"hl trade error: {e}")
        msg = str(e)
        if "does not exist" in msg:
            msg = "account_not_funded — deposit USDC on Arbitrum to your Loom address to activate trading"
        return Response(_json.dumps({"error": msg[:200]}), status_code=400, media_type="application/json")
    ok = res.get("status") == "ok"
    await db.hl_trades.insert_one({"email": user["email"], "symbol": symbol, "side": side, "sizeUsd": size_usd,
                                   "leverage": leverage, "sz": sz, "spot": is_spot, "response": res,
                                   "createdAt": datetime.now(timezone.utc).isoformat()})
    if not ok:
        return Response(_json.dumps({"error": str(res)[:200]}), status_code=400, media_type="application/json")
    return {"ok": True, "symbol": symbol, "side": side, "size": sz, "leverage": leverage, "spot": is_spot, "response": res}


@auth_router.post("/hl/close")
async def hl_close(request: Request):
    s, user = await _hl_user(request)
    if not user:
        return _err("sign_in_required", 401)
    body = await request.json()
    symbol = (body.get("symbol") or "").upper().replace("-PERP", "")
    if not symbol:
        return _err("invalid_input", 400)
    ex = _hl_exchange(user)
    try:
        res = ex.market_close(symbol)
    except Exception as e:
        return Response(_json.dumps({"error": str(e)[:200]}), status_code=400, media_type="application/json")
    return {"ok": res.get("status") == "ok", "response": res}


@auth_router.post("/hl/withdraw")
async def hl_withdraw(request: Request):
    """Gasless USDC transfer to any Hyperliquid account address."""
    s, user = await _hl_user(request)
    if not user:
        return _err("sign_in_required", 401)
    body = await request.json()
    dest = (body.get("destination") or "").strip()
    try:
        amount = float(body.get("amountUsd") or 0)
    except (TypeError, ValueError):
        return _err("invalid_input", 400)
    if not dest.startswith("0x") or len(dest) != 42 or amount < 1:
        return _err("invalid_input", 400)
    ex = _hl_exchange(user)
    try:
        res = ex.usd_transfer(amount, dest)
    except Exception as e:
        logger.warning(f"hl withdraw error: {e}")
        return Response(_json.dumps({"error": str(e)[:200]}), status_code=400, media_type="application/json")
    ok = res.get("status") == "ok"
    if ok:
        await db.hl_withdrawals.insert_one({"email": user["email"], "destination": dest, "amountUsd": amount,
                                            "createdAt": datetime.now(timezone.utc).isoformat()})
        return {"ok": True}
    return Response(_json.dumps({"error": str(res)[:200]}), status_code=400, media_type="application/json")


@auth_router.post("/hl/withdraw_bridge")
async def hl_withdraw_bridge(request: Request):
    """Withdraw USDC from Hyperliquid to the user's own address on the Arbitrum chain (~1 USDC HL fee)."""
    s, user = await _hl_user(request)
    if not user:
        return _err("sign_in_required", 401)
    body = await request.json()
    try:
        amount = float(body.get("amountUsd") or 0)
    except (TypeError, ValueError):
        return _err("invalid_input", 400)
    if amount < 2:
        return _err("min_withdraw_2_usd", 400)
    ex = _hl_exchange(user)
    try:
        res = ex.withdraw_from_bridge(amount, user["evmAddress"])
    except Exception as e:
        logger.warning(f"hl bridge withdraw error: {e}")
        return Response(_json.dumps({"error": str(e)[:200]}), status_code=400, media_type="application/json")
    ok = res.get("status") == "ok"
    if ok:
        await db.hl_withdrawals.insert_one({"email": user["email"], "kind": "bridge", "destination": user["evmAddress"],
                                            "amountUsd": amount, "createdAt": datetime.now(timezone.utc).isoformat()})
        return {"ok": True, "destination": user["evmAddress"]}
    return Response(_json.dumps({"error": str(res)[:200]}), status_code=400, media_type="application/json")


@auth_router.get("/history")
async def account_history(request: Request):
    """Unified activity feed: swaps, perp/spot orders, engine fills, withdrawals."""
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    items = []
    for t in await db.trades.find({"wallet": s["wallet"]}, {"_id": 0}).to_list(50):
        items.append({"type": "swap", "title": "Solana swap",
                      "detail": f"{t.get('inputMint', '')[:4]}… → {t.get('outputMint', '')[:4]}…",
                      "tx": t.get("signature"), "at": t.get("createdAt")})
    for t in await db.hl_trades.find({"email": s.get("email")}, {"_id": 0}).to_list(50):
        kind = "spot" if t.get("spot") else "perp"
        items.append({"type": kind, "title": f"{'Buy' if t.get('side') == 'long' else 'Sell'} {t.get('symbol')}",
                      "detail": f"${t.get('sizeUsd')} · {t.get('leverage', 1)}× · Hyperliquid {kind}",
                      "at": t.get("createdAt")})
    for p in await db.positions.find({"ownerKey": owner_key}, {"_id": 0}).to_list(100):
        items.append({"type": "engine", "title": f"{p.get('side')} {p.get('symbol')} ({p.get('mode')})",
                      "detail": (f"open ${p.get('sizeUsd')} @ {p.get('entryPx'):g}" if p.get("entryPx") else "open") +
                                (f" → closed @ {p.get('closePx'):g} · {p.get('closeReason')} · pnl ${p.get('pnlUsd'):+g}" if p.get("status") == "closed" and p.get("closePx") else " · open"),
                      "at": p.get("closedAt") or p.get("openedAt")})
    for w in await db.withdrawals.find({"wallet": s["wallet"]}, {"_id": 0}).to_list(50):
        items.append({"type": "withdraw", "title": "SOL withdrawal",
                      "detail": f"{w.get('lamports', 0) / 1e9:g} SOL → {w.get('to', '')[:6]}…",
                      "tx": w.get("signature"), "at": w.get("createdAt")})
    for w in await db.hl_withdrawals.find({"email": s.get("email")}, {"_id": 0}).to_list(50):
        items.append({"type": "withdraw", "title": "USDC withdrawal",
                      "detail": (f"${w.get('amountUsd')} → Arbitrum {w.get('destination', '')[:8]}…" if w.get("kind") == "bridge"
                                 else f"${w.get('amountUsd')} → HL {w.get('destination', '')[:8]}…"),
                      "at": w.get("createdAt")})
    items.sort(key=lambda x: x.get("at") or "", reverse=True)
    return {"items": items[:80]}


@auth_router.get("/hl/markets")
async def hl_markets():
    meta = _hl().meta()
    mids = _hl().all_mids()
    out = []
    for m in meta.get("universe", [])[:60]:
        name = m.get("name")
        if name in mids:
            out.append({"symbol": name, "price": float(mids[name]), "maxLeverage": m.get("maxLeverage"), "spot": False})
    try:
        spot_meta, spot_ctxs = _hl().spot_meta_and_asset_ctxs()
        universe = spot_meta.get("universe", [])
        tokens = spot_meta.get("tokens", [])
        def _label(t):
            if not t["name"].startswith("@"):
                return t["name"]
            try:
                base, quote = t.get("tokens", [None, None])
                return f"{tokens[base]['name']}/{tokens[quote]['name']}"
            except Exception:
                return t["name"]
        for i, t in enumerate(universe):
            if i < len(spot_ctxs):
                px = spot_ctxs[i].get("midPx")
                if px:
                    out.append({"symbol": t["name"], "label": _label(t), "price": float(px), "maxLeverage": 1, "spot": True})
    except Exception as e:
        logger.warning(f"spot meta: {e}")
    return {"markets": out}


# ---------- deployments: the 24/7 engine (paper / live / alerts) ----------

import asyncio
import engine


@auth_router.post("/deployments")
async def create_deployment(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    body = await request.json()
    mode = body.get("mode")
    if mode not in ("paper", "live", "alerts"):
        return _err("invalid_mode", 400)
    if mode == "live" and s.get("authType") != "email":
        return _err("live_needs_email_account", 400)
    owner_key = s.get("email") or s["wallet"]
    if await db.deployments.count_documents({"ownerKey": owner_key, "status": "active"}) >= 5:
        return _err("max_active_deployments", 400)
    dep = {
        "id": uuid.uuid4().hex[:12], "ownerKey": owner_key, "authType": s.get("authType", "wallet"),
        "mode": mode, "status": "active", "state": {}, "events": [],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    if body.get("kind") == "copy":
        target = (body.get("targetAddress") or "").strip()
        if not target.startswith("0x"):
            return _err("invalid_target", 400)
        dep.update({"kind": "copy", "targetAddress": target,
                    "sizeUsd": min(max(float(body.get("sizeUsd") or 100), 10), 10000),
                    "leverage": min(max(int(body.get("leverage") or 3), 1), 10),
                    "strategyName": f"Copy {target[:8]}…"})
    else:
        strategy = body.get("strategy")
        if not isinstance(strategy, dict) or not strategy.get("actions"):
            return _err("strategy_required", 400)
        # optional per-trade size override (USD) — applies to every open action sized in usd
        size_override = body.get("sizeUsd")
        if size_override is not None:
            try:
                size_override = min(max(float(size_override), 10), 10000)
            except (TypeError, ValueError):
                return _err("invalid_size", 400)
            for a in strategy.get("actions", []):
                if a.get("type") == "open" and (a.get("size") or {}).get("unit") == "usd":
                    a["size"]["value"] = size_override
        dep.update({"kind": "strategy", "strategy": strategy, "strategyName": strategy.get("name") or "Strategy"})
    await db.deployments.insert_one(dep)
    await engine._event(dep["id"], f"deployed in {mode} mode — engine is watching", "info")
    dep.pop("_id", None)
    return {"ok": True, "deployment": dep}


@auth_router.get("/deployments")
async def list_deployments(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    deps = await db.deployments.find({"ownerKey": owner_key}, {"_id": 0, "strategy": 0}).sort("createdAt", -1).to_list(50)
    return {"deployments": deps}


@auth_router.post("/deployments/{dep_id}/control")
async def control_deployment(dep_id: str, request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    body = await request.json()
    action = body.get("action")
    new = {"pause": "paused", "resume": "active", "stop": "stopped"}.get(action)
    if not new:
        return _err("invalid_action", 400)
    r = await db.deployments.update_one({"id": dep_id, "ownerKey": owner_key}, {"$set": {"status": new}})
    if not r.matched_count:
        return _err("not_found", 404)
    await engine._event(dep_id, f"deployment {new} by user", "info")
    return {"ok": True, "status": new}




@auth_router.get("/deployments/{dep_id}")
async def get_deployment(dep_id: str, request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    dep = await db.deployments.find_one({"id": dep_id, "ownerKey": owner_key}, {"_id": 0})
    if not dep:
        return _err("not_found", 404)
    return {"deployment": dep}


@auth_router.post("/deployments/{dep_id}/positions/{pos_id}/close")
async def close_deployment_position(dep_id: str, pos_id: str, request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    pos = await db.positions.find_one({"id": pos_id, "deploymentId": dep_id, "ownerKey": owner_key, "status": "open"})
    if not pos:
        return _err("not_found", 404)
    await engine._close_position(pos, "manual-close")
    return {"ok": True}


@auth_router.post("/account/stop-all")
async def stop_all_deployments(request: Request):
    """Kill switch: stop every active/paused deployment the user owns."""
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    r = await db.deployments.update_many(
        {"ownerKey": owner_key, "status": {"$in": ["active", "paused"]}},
        {"$set": {"status": "stopped"}})
    return {"ok": True, "stopped": r.modified_count}


@auth_router.delete("/deployments/{dep_id}")
async def delete_deployment(dep_id: str, request: Request):
    """Remove a deployment from the list. Running ones are stopped first. Positions/history are kept."""
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    dep = await db.deployments.find_one({"id": dep_id, "ownerKey": owner_key})
    if not dep:
        return _err("not_found", 404)
    if dep.get("status") in ("active", "paused"):
        await db.deployments.update_one({"id": dep_id}, {"$set": {"status": "stopped"}})
    await db.deployments.delete_one({"id": dep_id})
    return {"ok": True}


async def _ai_refine(strategy, instruction):
    """Refine a strategy spec — Loom AI first, relayed AI as backup. Returns (strategy, error)."""
    prompt = (f"Here is a strategy spec:\n\n{_json.dumps(strategy)}\n\n"
              f"Apply this change and return the full updated spec:\n\n{instruction}")
    try:
        got = await _local_ai_generate(prompt)
        if got:
            return got, None
    except Exception as e:
        logger.warning(f"local ai refine failed: {e}")
    payload = {"strategy": strategy, "instruction": instruction}
    try:
        async with _client().stream("POST", f"{UPSTREAM}/ai/refine/stream", json=payload) as r:
            if r.status_code != 200:
                raw = (await r.aread()).decode(errors="replace")[:300]
                try:
                    d = _json.loads(raw)
                    return None, d.get("error") or d.get("message") or f"refine failed ({r.status_code})"
                except Exception:
                    return None, f"refine failed ({r.status_code})"
            got, err, event = None, None, None
            async for line in r.aiter_lines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    try:
                        d = _json.loads(line[5:].strip())
                    except Exception:
                        continue
                    if event in ("result", "strategy") and isinstance(d, dict) and d.get("strategy"):
                        got = d["strategy"]
                    elif event == "error" and isinstance(d, dict):
                        err = d.get("error") or d.get("message")
            return got, err
    except Exception as e:
        logger.warning(f"ai refine failed: {e}")
        return None, "ai_refine_unreachable"


@auth_router.post("/deployments/{dep_id}/instruct")
async def instruct_deployment(dep_id: str, request: Request):
    """Apply a natural-language edit to a running deployment's strategy via the AI refiner."""
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    dep = await db.deployments.find_one({"id": dep_id, "ownerKey": owner_key})
    if not dep or dep.get("kind") != "strategy":
        return _err("not_found", 404)
    body = await request.json()
    instruction = (body.get("instruction") or "").strip()
    if not instruction:
        return _err("instruction_required", 400)
    new_strategy, err = await _ai_refine(dep.get("strategy") or {}, instruction)
    if not new_strategy:
        return _err(err or "refine_failed", 400)
    new_strategy = _sanitize_upstream(new_strategy)
    if not isinstance(new_strategy, dict) or not new_strategy.get("actions"):
        return _err("refine_invalid", 400)
    await db.deployments.update_one({"id": dep_id}, {"$set": {
        "strategy": new_strategy,
        "strategyName": new_strategy.get("name") or dep.get("strategyName"),
        "state": {},  # fresh trigger state for the edited rules
    }})
    await engine._event(dep_id, f"strategy updated: {instruction[:80]}", "info")
    return {"ok": True, "strategy": new_strategy}


# ---------- AI drafting (upstream relay first, local Claude fallback — drafting must always work) ----------

AI_SYSTEM = """You are Loom's strategy compiler. Turn a trading thesis into a machine-readable strategy spec.
Output ONLY valid JSON — no markdown fences, no commentary.

Schema (every field required unless noted):
{
 "schemaVersion": 1,
 "id": "short-kebab-id",
 "name": "Short name",
 "thesis": "one sentence restating the idea",
 "signals": [{"id": "eth_px", "kind": "price", "params": {"instrument": {"kind": "perp", "venue": "hyperliquid", "symbol": "ETH", "assetClass": "crypto"}}}],
 "triggers": [{"id": "go", "label": "when to fire", "when": {"op": "gt", "left": {"ref": "eth_px.price"}, "right": {"value": 2600}}, "cooldownMinutes": 60, "maxFires": 1}],
 "actions": [{"id": "long_eth", "on": ["go"], "type": "open",
   "instrument": {"kind": "perp", "venue": "hyperliquid", "symbol": "ETH", "assetClass": "crypto"},
   "side": "long", "size": {"unit": "usd", "value": 50}, "leverage": 2,
   "exits": {"takeProfit": {"positionPct": 50}, "stopLoss": {"positionPct": 20}}, "reentry": "never"}],
 "risk": {"maxPositionPct": 10, "maxTotalExposurePct": 50, "maxLeverage": 20, "maxDailyLossPct": 10, "defaultMaxSlippageBps": 100},
 "tags": ["perps"]
}

Rules:
- Operand refs: "<signalId>.<field>". Ops: and or gt gte lt lte eq crosses_above between abs div add mul.
- Signal kinds: price (fields price, change_24h_pct), funding (rate_1h_pct), liquidity (bid_depth_usd, ask_depth_usd, spread_bps), token_onchain (mint param; liquidity_usd, buys_1h, sells_1h, price_impact_buy_1000_pct), macro (source=fear_greed; field value), calendar (earnings_today), forecast (temp_f), sky (new_moon/full_moon hours, illumination_pct), space_weather (kp), sports (param team; win_pct), trader (param address; open_positions, fills_24h), position (open, unrealized_pnl_usd).
- Immediate-fire theses ("buy now", "open a long") use a trigger that is true now, e.g. {"op":"gt","left":{"ref":"px.price"},"right":{"value":0}}.
- If the thesis names an unsupported venue, use hyperliquid perps and note it in the thesis string. Cap leverage at 40. size default $50, leverage default 2. stopLoss required on every open action.
- For refine requests: return the FULL updated spec with the requested change applied."""


def _parse_ai_strategy(text):
    """Extract the strategy JSON from an LLM reply."""
    if not text:
        return None
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        d = _json.loads(text[start:end + 1])
    except Exception:
        return None
    if not isinstance(d, dict) or not d.get("signals") or not d.get("triggers") or not d.get("actions"):
        return None
    return d


async def _local_ai_generate(prompt):
    """Draft (or refine) a strategy spec with Claude via the platform LLM key."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
    chat = LlmChat(
        api_key=os.environ.get("EMERGENT_LLM_KEY"),
        session_id=f"draft-{uuid.uuid4().hex[:12]}",
        system_message=AI_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-5-5")
    buf = ""
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            buf += ev.content
        elif isinstance(ev, StreamDone):
            break
    return _parse_ai_strategy(buf)


def _sse(event, data):
    return f"event: {event}\ndata: {_json.dumps(data)}\n\n"


async def _collect_upstream_stream(path, payload):
    """Collect an upstream AI SSE stream. Returns (strategy, progress_msgs, failed)."""
    strategy, progress, failed = None, [], False
    try:
        async with _client().stream("POST", f"{UPSTREAM}{path}", json=payload) as r:
            if r.status_code != 200:
                return None, [], True
            event = None
            async for line in r.aiter_lines():
                if line.startswith("event:"):
                    event = line[6:].strip()
                elif line.startswith("data:"):
                    try:
                        d = _json.loads(line[5:].strip())
                    except Exception:
                        continue
                    if event == "progress" and isinstance(d, dict) and d.get("message"):
                        progress.append(str(d["message"])[:200])
                    elif event in ("result", "strategy") and isinstance(d, dict) and d.get("strategy"):
                        strategy = d["strategy"]
                    elif event == "error":
                        failed = True
    except Exception as e:
        logger.warning(f"upstream ai stream failed: {e}")
        failed = True
    return strategy, progress, failed


@api_router.post("/ai/generate/stream")
async def ai_generate_stream(request: Request):
    body = await request.json()
    thesis = (body.get("thesis") or "").strip()
    if not thesis:
        return _err("thesis_required", 400)

    async def stream():
        yield _sse("progress", {"message": "Reading your thesis"})
        # Loom's own AI first — always on, no shared quota
        try:
            strategy = await _local_ai_generate(f"Draft a strategy for this thesis:\n\n{thesis}")
        except Exception as e:
            logger.warning(f"local ai generate failed: {e}")
            strategy = None
        if strategy:
            yield _sse("progress", {"message": "Compiling rules"})
            yield _sse("result", {"strategy": _sanitize_upstream(strategy), "source": "loom"})
            return
        # backup: relayed market-data AI
        strategy, progress, failed = await _collect_upstream_stream("/ai/generate/stream", {"thesis": thesis})
        if strategy:
            for m in progress[:6]:
                yield _sse("progress", {"message": m})
            yield _sse("result", {"strategy": _sanitize_upstream(strategy), "source": "relay"})
            return
        yield _sse("error", {"error": "Loom's AI couldn't draft that one — try rephrasing the thesis"})

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api_router.post("/ai/refine/stream")
async def ai_refine_stream(request: Request):
    body = await request.json()
    strategy, instruction = body.get("strategy"), (body.get("instruction") or "").strip()
    if not isinstance(strategy, dict) or not instruction:
        return _err("strategy_and_instruction_required", 400)

    async def stream():
        yield _sse("progress", {"message": "Applying your change"})
        prompt = (f"Here is a strategy spec:\n\n{_json.dumps(strategy)}\n\n"
                  f"Apply this change and return the full updated spec:\n\n{instruction}")
        try:
            result = await _local_ai_generate(prompt)
        except Exception as e:
            logger.warning(f"local ai refine failed: {e}")
            result = None
        if result:
            yield _sse("result", {"strategy": _sanitize_upstream(result), "source": "loom"})
            return
        result, progress, failed = await _collect_upstream_stream("/ai/refine/stream",
                                                                  {"strategy": strategy, "instruction": instruction})
        if result:
            for m in progress[:6]:
                yield _sse("progress", {"message": m})
            yield _sse("result", {"strategy": _sanitize_upstream(result), "source": "relay"})
            return
        yield _sse("error", {"error": "Loom's AI couldn't apply that — try rephrasing"})

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api_router.post("/ai/generate")
async def ai_generate(request: Request):
    """Non-streaming draft — same relay-first, local-fallback behavior."""
    body = await request.json()
    thesis = (body.get("thesis") or "").strip()
    if not thesis:
        return _err("thesis_required", 400)
    try:
        strategy = await _local_ai_generate(f"Draft a strategy for this thesis:\n\n{thesis}")
    except Exception as e:
        logger.warning(f"local ai generate failed: {e}")
        strategy = None
    if strategy:
        return {"strategy": _sanitize_upstream(strategy), "source": "loom"}
    try:
        r = await _client().post(f"{UPSTREAM}/ai/generate", json={"thesis": thesis})
        if r.status_code == 200 and r.json().get("strategy"):
            return {"strategy": _sanitize_upstream(r.json()["strategy"]), "source": "relay"}
    except Exception as e:
        logger.warning(f"upstream ai generate failed: {e}")
    return _err("ai_draft_failed — try rephrasing the thesis", 400)


@auth_router.get("/paper/account")
async def paper_account(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    acct = await engine._paper_account(owner_key)
    equity = await engine._paper_equity(owner_key)
    positions = await db.positions.find({"ownerKey": owner_key, "mode": "paper", "status": "open"},
                                        {"_id": 0}).to_list(50)
    history = await db.positions.find({"ownerKey": owner_key, "mode": "paper", "status": "closed"},
                                      {"_id": 0}).sort("closedAt", -1).to_list(50)
    return {"balanceUsd": acct["balanceUsd"], "equityUsd": equity,
            "startUsd": engine.PAPER_START_USD, "positions": positions, "history": history}


@auth_router.get("/alerts/me")
async def my_alerts(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    alerts = await db.alerts.find({"ownerKey": owner_key}, {"_id": 0}).sort("createdAt", -1).to_list(50)
    unread = sum(1 for a in alerts if not a.get("read"))
    return {"alerts": alerts, "unread": unread}


@auth_router.post("/alerts/read")
async def mark_alerts_read(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    await db.alerts.update_many({"ownerKey": owner_key}, {"$set": {"read": True}})
    return {"ok": True}


# ---------- password reset (email code) ----------

import random
import emails


@auth_router.post("/auth/email/reset_request")
async def reset_request(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    user = await db.users.find_one({"email": email})
    if user:  # never leak whether the email exists
        code = f"{random.randint(0, 999999):06d}"
        await db.reset_codes.update_one(
            {"email": email},
            {"$set": {"email": email, "codeHash": bcrypt.hashpw(code.encode(), bcrypt.gensalt()).decode(),
                      "expiresAt": time.time() + 600, "attempts": 0}},
            upsert=True)
        await emails.send_reset_code(email, code)
    return {"ok": True}


@auth_router.post("/auth/email/reset_confirm")
async def reset_confirm(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    new_pw = body.get("newPassword") or ""
    if len(new_pw) < 8:
        return _err("password_too_short", 400)
    rec = await db.reset_codes.find_one({"email": email})
    if not rec or rec["expiresAt"] < time.time() or rec.get("attempts", 0) >= 5:
        return _err("invalid_code", 400)
    if not bcrypt.checkpw(code.encode(), rec["codeHash"].encode()):
        await db.reset_codes.update_one({"email": email}, {"$inc": {"attempts": 1}})
        return _err("invalid_code", 400)
    await db.users.update_one({"email": email},
                              {"$set": {"passHash": bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()}})
    await db.reset_codes.delete_one({"email": email})
    await db.sessions.delete_many({"email": email})  # old sessions die on password change
    return {"ok": True}


# ---------- practice account reset ----------

@auth_router.post("/paper/reset")
async def paper_reset(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    owner_key = s.get("email") or s["wallet"]
    await db.positions.update_many({"ownerKey": owner_key, "mode": "paper", "status": "open"},
                                   {"$set": {"status": "closed", "closeReason": "reset",
                                             "closedAt": datetime.now(timezone.utc).isoformat()}})
    await db.paper_accounts.update_one({"ownerKey": owner_key},
                                       {"$set": {"balanceUsd": engine.PAPER_START_USD}}, upsert=True)
    return {"ok": True, "balanceUsd": engine.PAPER_START_USD}


# ---------- Solana token holdings ----------

@auth_router.get("/wallet/holdings")
async def wallet_holdings(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    try:
        res = await _sol_rpc("getTokenAccountsByOwner", [
            s["wallet"], {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
            {"encoding": "jsonParsed"}])
    except Exception as e:
        logger.warning(f"holdings rpc: {e}")
        return {"holdings": []}
    out = []
    for acc in (res or {}).get("value", []):
        info = acc.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
        ta = info.get("tokenAmount", {})
        amt = float(ta.get("uiAmount") or 0)
        if amt > 0:
            out.append({"mint": info.get("mint"), "amount": amt, "symbol": None, "priceUsd": None, "valueUsd": None})
    if out:
        try:
            mints = ",".join(h["mint"] for h in out[:30])
            r = await _client().get(f"https://api.dexscreener.com/tokens/v1/solana/{mints}")
            if r.status_code == 200:
                bymint = {}
                for p in r.json():
                    a = p.get("baseToken", {}).get("address")
                    if a and a not in bymint:
                        bymint[a] = p
                for h in out:
                    p = bymint.get(h["mint"])
                    if p:
                        h["symbol"] = p.get("baseToken", {}).get("symbol")
                        h["priceUsd"] = float(p.get("priceUsd") or 0)
                        h["valueUsd"] = h["amount"] * h["priceUsd"]
        except Exception as e:
            logger.warning(f"holdings pricing: {e}")
    return {"holdings": out}


# ---------- limit orders (engine-watched) ----------

@auth_router.post("/hl/limit_order")
async def hl_limit_order(request: Request):
    s = await _session_user(request)
    if not s:
        return _err("sign_in_required", 401)
    body = await request.json()
    symbol = (body.get("symbol") or "").upper()
    side = body.get("side")
    direction = body.get("direction")  # above | below
    try:
        size_usd = float(body.get("sizeUsd") or 0)
        target = float(body.get("targetPrice") or 0)
        leverage = int(body.get("leverage") or 1)
    except (TypeError, ValueError):
        return _err("invalid_input", 400)
    if not symbol or side not in ("long", "short") or direction not in ("above", "below") or size_usd < 10 or target <= 0:
        return _err("invalid_input", 400)
    if body.get("mode", "live") == "live" and s.get("authType") != "email":
        return _err("live_needs_email_account", 400)
    owner_key = s.get("email") or s["wallet"]
    strategy = {
        "schemaVersion": 1, "id": f"limit-{uuid.uuid4().hex[:8]}",
        "name": f"Limit: {side} {symbol} when {'≥' if direction == 'above' else '≤'} {target:g}",
        "thesis": f"Limit {side} {symbol} at {target:g}",
        "signals": [{"id": "px", "kind": "price", "params": {"instrument": {"symbol": symbol}}}],
        "triggers": [{"id": "hit", "label": f"{symbol} {direction} {target:g}",
                      "when": {"op": "gte" if direction == "above" else "lte",
                               "left": {"ref": "px.price"}, "right": {"value": target}}}],
        "actions": [{"id": "open", "on": ["hit"], "type": "open",
                     "instrument": {"kind": "perp", "venue": "hyperliquid", "symbol": symbol},
                     "side": side, "size": {"unit": "usd", "value": size_usd}, "leverage": leverage,
                     "order": {"type": "market"}, "reentry": "never"}],
    }
    dep = {
        "id": uuid.uuid4().hex[:12], "ownerKey": owner_key, "authType": s.get("authType", "wallet"),
        "mode": body.get("mode", "live"), "status": "active", "state": {}, "events": [],
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "kind": "strategy", "strategy": strategy, "strategyName": strategy["name"], "once": True,
    }
    await db.deployments.insert_one(dep)
    await engine._event(dep["id"], f"limit order set — fires when {symbol} is {direction} {target:g}", "info")
    dep.pop("_id", None)
    return {"ok": True, "deployment": dep}


@app.get("/api/signals/hero")
async def hero_signals():
    """Live values for the landing hero weave — real market data, cached by the engine."""
    out = {"eth_change_1h": None, "doge_funding_1h_pct": None, "fear_greed": None, "btc_change_24h": None}
    try:
        m = engine._mkt
        if m.ts:
            out["eth_change_1h"] = await asyncio.to_thread(m.candles_change_pct, "ETH", "1h")
            doge = m.ctxs.get("DOGE", {})
            if doge.get("funding") is not None:
                out["doge_funding_1h_pct"] = float(doge["funding"]) * 100
            btc = m.ctxs.get("BTC", {})
            btc_px = m.mids.get("BTC")
            if btc.get("prevDayPx") and btc_px:
                out["btc_change_24h"] = (float(btc_px) - float(btc["prevDayPx"])) / float(btc["prevDayPx"]) * 100
            out["fear_greed"] = m.fear_greed
    except Exception as e:
        logger.warning(f"hero signals hl: {e}")
    return out


app.include_router(api_router)
app.include_router(auth_router)

engine.init(db, _hl, _hl_exchange)


@app.on_event("startup")
async def _start_engine():
    asyncio.create_task(engine.engine_loop())


app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    global _http
    if _http is not None:
        await _http.aclose()
