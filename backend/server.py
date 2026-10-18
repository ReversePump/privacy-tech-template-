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
import uuid
import json as _json
from datetime import datetime, timezone

PUMPPORTAL = "https://pumpportal.fun/api/trade-local"


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
    base = str(request.base_url).rstrip("/")
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
    base = str(request.base_url).rstrip("/")
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
