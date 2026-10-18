from fastapi import FastAPI, APIRouter, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

UPSTREAM = "https://api.makers.fun"

app = FastAPI()
api_router = APIRouter(prefix="/api")

import httpx

http: httpx.AsyncClient | None = None

HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
    "accept-encoding",
}


def _client() -> httpx.AsyncClient:
    global http
    if http is None:
        http = httpx.AsyncClient(
            base_url=UPSTREAM,
            timeout=httpx.Timeout(45.0, connect=10.0),
            follow_redirects=False,
        )
    return http


@api_router.get("/")
async def root():
    return {"message": "MakeMarkets relay", "status": "ok"}


@api_router.get("/our/desks")
async def our_desks():
    """Desks that were launched or added through THIS site (recorded by the proxy)."""
    docs = await db.our_desks.find({}, {"_id": 0}).sort("createdAt", -1).to_list(500)
    return {"desks": docs}


# ---------- native launch support (direct pump.fun via PumpPortal, no engine auth) ----------

import base64
import time
import uuid
import json as _json
from datetime import datetime, timezone

PUMPPORTAL = "https://pumpportal.fun/api/trade-local"


def _public_base(request: Request) -> str:
    """Absolute public base URL — request.base_url is the pod-internal host behind the ingress."""
    host = request.headers.get("x-forwarded-host")
    if host:
        proto = request.headers.get("x-forwarded-proto", "https").split(",")[0].strip()
        return f"{proto}://{host.split(',')[0].strip()}"
    return str(request.base_url).rstrip("/")


@api_router.post("/uploads/image")
async def upload_image(request: Request):
    body = await request.body()
    if not body or len(body) > 2 * 1024 * 1024:
        return Response('{"error":"invalid_image"}', status_code=400, media_type="application/json")
    ctype = request.headers.get("content-type", "image/png")
    mid = uuid.uuid4().hex
    await db.media.insert_one({
        "_id": mid, "data": base64.b64encode(body).decode(), "contentType": ctype,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    base = _public_base(request)
    return {"id": mid, "url": f"{base}/api/media/{mid}"}


@api_router.get("/media/{mid}")
async def get_media(mid: str):
    doc = await db.media.find_one({"_id": mid})
    if not doc:
        return Response(status_code=404)
    return Response(
        content=base64.b64decode(doc["data"]),
        media_type=doc["contentType"],
        headers={"Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*"},
    )


@api_router.post("/launch/metadata")
async def launch_metadata(request: Request):
    body = await request.json()
    name = (body.get("name") or "").strip()[:64]
    symbol = (body.get("symbol") or "").strip()[:16]
    if not name or not symbol:
        return Response('{"error":"invalid_metadata"}', status_code=400, media_type="application/json")
    base = _public_base(request)
    links = body.get("links") or {}
    meta = {
        "name": name,
        "symbol": symbol,
        "description": (body.get("description") or "")[:1000],
        "image": f"{base}/api/media/{body.get('imageId')}",
        "showName": True,
        "createdOn": base,
    }
    if links.get("website"):
        meta["website"] = links["website"]
    if links.get("x"):
        meta["twitter"] = links["x"]
    if links.get("telegram"):
        meta["telegram"] = links["telegram"]
    mid = uuid.uuid4().hex
    await db.meta.insert_one({"_id": mid, "json": meta})
    return {"uri": f"{base}/api/meta/{mid}.json", "id": mid}


@api_router.get("/meta/{mid}.json")
async def get_meta(mid: str):
    doc = await db.meta.find_one({"_id": mid})
    if not doc:
        return Response(status_code=404)
    return Response(
        content=_json.dumps(doc["json"]),
        media_type="application/json",
        headers={"Cache-Control": "public, max-age=31536000, immutable", "Access-Control-Allow-Origin": "*"},
    )


@api_router.post("/launch/build")
async def launch_build(request: Request):
    """Build the unsigned pump.fun create transaction via PumpPortal (keyless)."""
    body = await request.json()
    payload = {
        "publicKey": body.get("publicKey"),
        "action": "create",
        "tokenMetadata": {
            "name": (body.get("name") or "").strip()[:64],
            "symbol": (body.get("symbol") or "").strip()[:16],
            "uri": body.get("uri"),
        },
        "mint": body.get("mint"),
        "denominatedInSol": "true",
        "amount": float(body.get("amountSol") or 0),
        "slippage": 10,
        "priorityFee": 0.0005,
        "pool": "pump",
    }
    if not payload["publicKey"] or not payload["mint"] or not payload["tokenMetadata"]["uri"]:
        return Response('{"error":"invalid_input"}', status_code=400, media_type="application/json")
    try:
        r = await _client().post(PUMPPORTAL, json=payload, headers={"Content-Type": "application/json"})
    except httpx.HTTPError as e:
        return Response(f'{{"error":"upstream_error","message":"{type(e).__name__}"}}', status_code=502, media_type="application/json")
    if r.status_code != 200:
        return Response(r.content, status_code=r.status_code, media_type="application/json")
    return {"transaction": base64.b64encode(r.content).decode()}


@api_router.post("/our/launches")
async def record_launch(request: Request):
    body = await request.json()
    if not body.get("mint"):
        return Response('{"error":"invalid_input"}', status_code=400, media_type="application/json")
    await db.our_launches.update_one(
        {"mint": body["mint"]},
        {"$set": {
            "mint": body["mint"], "name": body.get("name"), "ticker": body.get("ticker"),
            "imageUrl": body.get("imageUrl"), "creator": body.get("creator"),
            "signature": body.get("signature"),
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/our/launches")
async def list_launches():
    docs = await db.our_launches.find({}, {"_id": 0}).sort("createdAt", -1).to_list(200)
    return {"launches": docs}


# ---------- vault custody (used where engine sign-in is unavailable, e.g. mobile wallets) ----------

TREASURY_ADDRESS = os.environ.get("TREASURY_ADDRESS")
TREASURY_PRIVATE_KEY = os.environ.get("TREASURY_PRIVATE_KEY")
SOLANA_RPC = os.environ.get("SOLANA_RPC")
VAULT_FEE_PCT = 10


async def _sol_rpc(method: str, params: list):
    r = await _client().post(
        SOLANA_RPC,
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
        headers={"Content-Type": "application/json"},
    )
    data = r.json()
    if data.get("error"):
        raise ValueError(data["error"].get("message", "rpc error"))
    return data.get("result")


def _err(code: str, status: int):
    return Response(f'{{"error":"{code}"}}', status_code=status, media_type="application/json")


@api_router.get("/vault/info")
async def vault_info():
    return {"address": TREASURY_ADDRESS}


@api_router.post("/vault/deposit")
async def vault_deposit(request: Request):
    body = await request.json()
    wallet, mint, sig = body.get("wallet"), body.get("mint"), body.get("signature")
    try:
        amount_sol = float(body.get("amountSol") or 0)
    except (TypeError, ValueError):
        amount_sol = 0
    if not wallet or not sig or amount_sol <= 0:
        return _err("invalid_input", 400)
    if await db.vault_deposits.find_one({"_id": sig}):
        return _err("already_recorded", 409)
    try:
        tx = await _sol_rpc("getTransaction", [sig, {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0, "commitment": "confirmed"}])
    except Exception:
        tx = None
    if not tx or (tx.get("meta") or {}).get("err"):
        return _err("tx_not_confirmed", 400)
    keys_raw = tx["transaction"]["message"]["accountKeys"]
    keys = [(k["pubkey"] if isinstance(k, dict) else k) for k in keys_raw]
    signers = {k["pubkey"] for k in keys_raw if isinstance(k, dict) and k.get("signer")}
    if wallet not in (signers or set(keys[:1])):
        return _err("not_signed_by_wallet", 400)
    if TREASURY_ADDRESS not in keys:
        return _err("wrong_recipient", 400)
    i = keys.index(TREASURY_ADDRESS)
    meta = tx["meta"]
    gained = int(meta["postBalances"][i]) - int(meta["preBalances"][i])
    claimed = int(round(amount_sol * 1_000_000_000))
    if gained < int(claimed * 0.999):
        return _err("amount_mismatch", 400)
    try:
        await db.vault_deposits.insert_one({
            "_id": sig, "wallet": wallet, "mint": mint, "lamports": claimed,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        return _err("already_recorded", 409)
    return {"ok": True}


async def _vault_balance_lamports(wallet: str, mint: str | None) -> int:
    q = {"wallet": wallet}
    if mint:
        q["mint"] = mint
    deps = await db.vault_deposits.find(q, {"_id": 0, "lamports": 1}).to_list(1000)
    wds = await db.vault_withdrawals.find(q, {"_id": 0, "grossLamports": 1}).to_list(1000)
    dep = sum(int(d["lamports"]) for d in deps)
    wd = sum(int(w["grossLamports"]) for w in wds)
    return max(0, dep - wd)


@api_router.get("/vault/balance/{wallet}")
async def vault_balance(wallet: str, mint: str | None = None):
    bal = await _vault_balance_lamports(wallet, mint)
    return {"balanceSol": bal / 1_000_000_000}


@api_router.get("/vault/positions/{wallet}")
async def vault_positions(wallet: str):
    deps = await db.vault_deposits.find({"wallet": wallet}, {"_id": 0}).to_list(1000)
    wds = await db.vault_withdrawals.find({"wallet": wallet}, {"_id": 0}).to_list(1000)
    by_mint: dict[str, int] = {}
    for d in deps:
        m = d.get("mint") or ""
        by_mint[m] = by_mint.get(m, 0) + int(d["lamports"])
    for w in wds:
        m = w.get("mint") or ""
        by_mint[m] = by_mint.get(m, 0) - int(w["grossLamports"])
    mints = [m for m, v in by_mint.items() if v > 0 and m]
    launches = {}
    if mints:
        launches = {l["mint"]: l for l in await db.our_launches.find({"mint": {"$in": mints}}, {"_id": 0}).to_list(200)}
    return {"positions": [
        {
            "mint": m,
            "balanceSol": by_mint[m] / 1_000_000_000,
            "name": (launches.get(m) or {}).get("name"),
            "ticker": (launches.get(m) or {}).get("ticker"),
            "imageUrl": (launches.get(m) or {}).get("imageUrl"),
        }
        for m in mints
    ]}


@api_router.post("/vault/withdraw")
async def vault_withdraw(request: Request):
    from solders.keypair import Keypair as _Kp
    from solders.pubkey import Pubkey as _Pk
    from solders.signature import Signature as _Sig
    from solders.hash import Hash as _Hash
    from solders.system_program import transfer as _transfer, TransferParams as _TP
    from solders.message import Message as _Msg
    from solders.transaction import Transaction as _Tx

    body = await request.json()
    wallet, mint, ts, sig_b58 = body.get("wallet"), body.get("mint"), body.get("ts"), body.get("signature")
    if not wallet or not sig_b58 or not ts:
        return _err("invalid_input", 400)
    try:
        if abs(int(time.time() * 1000) - int(ts)) > 10 * 60 * 1000:
            return _err("stale_request", 400)
    except (TypeError, ValueError):
        return _err("invalid_input", 400)
    message = f"MakeMarkets vault withdrawal\nwallet: {wallet}\nmint: {mint or ''}\nts: {ts}".encode()
    try:
        verified = _Sig.from_string(sig_b58).verify(_Pk.from_string(wallet), message)
    except Exception:
        verified = False
    if not verified:
        return _err("bad_signature", 401)

    bal = await _vault_balance_lamports(wallet, mint)
    if bal <= 5000:
        return _err("nothing_to_withdraw", 400)
    payout = int(bal * (100 - VAULT_FEE_PCT) / 100)

    kp = _Kp.from_base58_string(TREASURY_PRIVATE_KEY)
    bh = (await _sol_rpc("getLatestBlockhash", [{"commitment": "confirmed"}]))["value"]["blockhash"]
    ix = _transfer(_TP(from_pubkey=kp.pubkey(), to_pubkey=_Pk.from_string(wallet), lamports=payout))
    msg = _Msg.new_with_blockhash([ix], kp.pubkey(), _Hash.from_string(bh))
    tx = _Tx.new_unsigned(msg)
    tx.sign([kp], _Hash.from_string(bh))
    try:
        sig = await _sol_rpc("sendTransaction", [base64.b64encode(bytes(tx)).decode(), {"encoding": "base64", "skipPreflight": False}])
    except Exception as e:
        logger.warning(f"vault withdraw broadcast failed: {e}")
        return _err("broadcast_failed", 400)

    await db.vault_withdrawals.insert_one({
        "wallet": wallet, "mint": mint, "grossLamports": bal, "payoutLamports": payout,
        "signature": sig, "createdAt": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "signature": sig, "sentSol": payout / 1_000_000_000}


async def _record_our_desk(desk_id: str, origin: str):
    try:
        from datetime import datetime, timezone
        await db.our_desks.update_one(
            {"deskId": desk_id},
            {"$set": {"deskId": desk_id, "origin": origin, "createdAt": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"failed to record desk {desk_id}: {e}")


@api_router.api_route("/relay/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    body = await request.body()
    headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP and k.lower() not in ("origin", "referer")
    }
    headers["origin"] = "https://makers.fun"
    headers["referer"] = "https://makers.fun/"
    try:
        r = await _client().request(
            request.method,
            f"/{path}",
            params=[(k, v) for k, v in request.query_params.multi_items()],
            content=body if body else None,
            headers=headers,
        )
    except httpx.HTTPError as e:
        return Response(
            content=f'{{"error":"upstream_error","message":"{type(e).__name__}"}}',
            status_code=502,
            media_type="application/json",
        )

    resp = Response(content=r.content, status_code=r.status_code)
    for k, v in r.headers.multi_items():
        lk = k.lower()
        if lk in HOP_BY_HOP or lk in ("set-cookie", "content-encoding"):
            continue
        resp.headers.append(k, v)
    for sc in r.headers.get_list("set-cookie"):
        parts = [p for p in sc.split(";") if not p.strip().lower().startswith("domain=")]
        resp.headers.append("set-cookie", ";".join(parts))

    # Record desks created through this site (launch submit = actually on chain; desk create = maker added)
    if request.method == "POST" and 200 <= r.status_code < 300:
        try:
            import re as _re, json as _json
            if _re.fullmatch(r"launches/[^/]+/submit", path):
                await _record_our_desk(path.split("/")[1], "launch")
            elif path == "desks":
                data = _json.loads(r.content.decode("utf-8", "ignore"))
                desk = data.get("desk") if isinstance(data, dict) else None
                desk = desk if isinstance(desk, dict) else data
                did = desk.get("id") if isinstance(desk, dict) else None
                if did:
                    await _record_our_desk(did, "mm")
        except Exception as e:
            logger.warning(f"desk recording failed: {e}")

    return resp


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
    if http is not None:
        await http.aclose()
