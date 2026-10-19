import os
import logging
import httpx
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import Response, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("server")

UPSTREAM = "https://weft-api-production.up.railway.app"

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
