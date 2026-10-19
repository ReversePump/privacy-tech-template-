import os
import logging
import uuid
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
    message = f"Weft sign-in\nwallet: {wallet}\nnonce: {nonce}"
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
    message = f"Weft sign-in\nwallet: {wallet}\nnonce: {ch['nonce']}".encode()
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
    wallet = await _session_wallet(request)
    if not wallet:
        return Response('{"error":"sign_in_required"}', status_code=401, media_type="application/json")
    count = await db.saved_strategies.count_documents({"wallet": wallet})
    return {"wallet": wallet, "savedStrategies": count}


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


app.include_router(auth_router)

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
