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
    return {"message": "makers.fun proxy relay", "upstream": UPSTREAM}


@api_router.api_route("/mf/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
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
