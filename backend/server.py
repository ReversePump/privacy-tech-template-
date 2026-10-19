import os
import logging
import uuid
import json as _json
import time
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

UPSTREAM = "https://weft-api-production.up.railway.app"

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


@api_router.api_route("/relay/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def relay(path: str, request: Request):
    body = await request.body()
    params = dict(request.query_params)
    headers = _fwd_headers(request)
    url = f"{UPSTREAM}/{path}"

    # SSE endpoints stream progress events — passthrough without buffering
    if path.endswith("/stream"):
        async def gen():
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(None, connect=20.0), follow_redirects=True) as c:
                    async with c.stream(request.method, url, params=params, content=body or None, headers=headers) as r:
                        ctype = r.headers.get("content-type", "")
                        if r.status_code != 200 or "event-stream" not in ctype:
                            err_body = await r.aread()
                            yield b"event: error\ndata: " + err_body.replace(b"\n", b" ") + b"\n\n"
                            return
                        async for chunk in r.aiter_raw():
                            yield chunk
            except Exception as e:
                logger.warning(f"stream relay failed for {path}: {e}")
                yield f'event: error\ndata: {{"message":"stream failed"}}\n\n'.encode()
        return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})

    try:
        r = await _client().request(request.method, f"/{path}", params=params, content=body or None, headers=headers)
    except httpx.HTTPError as e:
        logger.warning(f"upstream error {path}: {e}")
        return Response('{"error":"upstream_unreachable"}', status_code=502, media_type="application/json")
    return Response(
        content=r.content,
        status_code=r.status_code,
        media_type=r.headers.get("content-type", "application/json"),
    )


app.include_router(api_router)

# ---------- local accounts: wallet sign-in + saved strategies ----------

auth_router = APIRouter(prefix="/api")


@auth_router.post("/auth/challenge")
async def auth_challenge(request: Request):
    body = await request.json()
    wallet = (body.get("wallet") or "").strip()
    if not wallet:
        return Response('{"error":"wallet_required"}', status_code=400, media_type="application/json")
    nonce = uuid.uuid4().hex
    message = f"Swift Fi sign-in\nwallet: {wallet}\nnonce: {nonce}"
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
    message = f"Swift Fi sign-in\nwallet: {wallet}\nnonce: {ch['nonce']}".encode()
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
JUP = "https://api.jup.ag/swap/v1"
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
        q = await _client().get(f"{JUP}/quote", params={
            "inputMint": input_mint, "outputMint": output_mint, "amount": amount, "slippageBps": 100,
        })
        if q.status_code != 200:
            return _err("no_route", 400)
        quote = q.json()
        # swap tx
        sw = await _client().post(f"{JUP}/swap", json={"quoteResponse": quote, "userPublicKey": str(kp.pubkey()),
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
    sz = round(size_usd / px, 6)
    try:
        res = ex.market_open(symbol, side == "long", sz)
    except Exception as e:
        logger.warning(f"hl trade error: {e}")
        return Response(_json.dumps({"error": str(e)[:200]}), status_code=400, media_type="application/json")
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
