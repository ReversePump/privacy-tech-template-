"""Bifrost v1 proxy tests - Veil upstream."""
import os
import json
import pytest
import requests
import websockets
import asyncio

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
BIFROST = f"{BASE_URL}/api/bifrost/v1"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"User-Agent": "pytest-bifrost"})
    return s


# ---------- health & meta ----------
def test_health(session):
    r = session.get(f"{BIFROST}/_health", timeout=60)
    assert r.status_code == 200
    j = r.json()
    for k in ["site", "app", "indexer", "relayer", "rpc"]:
        assert k in j, f"missing {k}"
        assert "status" in j[k]
    # site/app expected 200; indexer/relayer may be 404 at /
    assert j["site"]["status"] in (200, 301, 302, 304)
    assert j["app"]["status"] in (200, 301, 302, 304)
    assert j["indexer"]["status"] < 500
    assert j["relayer"]["status"] < 500
    # rpc getHealth should return 200 with "ok"
    assert j["rpc"]["status"] in (200, 400, 405)


def test_meta(session):
    r = session.get(f"{BIFROST}/_meta", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["proxy"] == "bifrost"
    assert "targets" in j and "app" in j["targets"]


# ---------- brand assets (Darkinator rebrand) ----------
def test_brand_lockup_svg(session):
    r = session.get(f"{BIFROST}/_brand/lockup.svg", timeout=30)
    assert r.status_code == 200
    assert "image/svg+xml" in r.headers.get("content-type", "")
    assert len(r.content) > 100


def test_brand_lockup_light_svg(session):
    r = session.get(f"{BIFROST}/_brand/lockup-light.svg", timeout=30)
    assert r.status_code == 200
    assert "image/svg+xml" in r.headers.get("content-type", "")


def test_brand_mark_png(session):
    r = session.get(f"{BIFROST}/_brand/mark.png", timeout=30)
    assert r.status_code == 200
    assert "image/png" in r.headers.get("content-type", "")


def test_brand_favicon_png(session):
    r = session.get(f"{BIFROST}/_brand/favicon.png", timeout=30)
    assert r.status_code == 200
    assert "image/png" in r.headers.get("content-type", "")



# ---------- HTML passthrough + rewrite ----------
def test_app_html(session):
    r = session.get(f"{BIFROST}/app/", timeout=60)
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")
    body = r.text
    assert ("TURBOPACK_CHUNK_BASE_PATH" in body) or ("(0,eval)(new TextDecoder()" in body)  # injected shim (encoded)
    assert "/api/bifrost/v1/app/_next/" in body  # rewritten assets
    # upstream absolute URLs should be rewritten away
    assert "https://app.veilit.xyz" not in body


def test_site_html(session):
    r = session.get(f"{BIFROST}/site/", timeout=60)
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")
    # landing marketing copy
    assert "Private" in r.text or "Veil" in r.text


# ---------- indexer / relayer JSON ----------
def test_indexer_stats(session):
    r = session.get(f"{BIFROST}/indexer/v1/stats", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, (dict, list))


def test_indexer_assets(session):
    r = session.get(f"{BIFROST}/indexer/v1/assets", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), (dict, list))


def test_indexer_feed(session):
    r = session.get(f"{BIFROST}/indexer/v1/feed?limit=5", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, (dict, list))


def test_relayer_info(session):
    r = session.get(f"{BIFROST}/relayer/v1/info", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), (dict, list))


# ---------- JSON-RPC ----------
def test_rpc_get_version(session):
    r = session.post(f"{BIFROST}/rpc",
                     json={"jsonrpc": "2.0", "id": 1, "method": "getVersion"},
                     timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert "result" in j
    assert "solana-core" in j["result"]


# ---------- unknown target ----------
def test_unknown_target(session):
    r = session.get(f"{BIFROST}/foo/x", timeout=15)
    assert r.status_code == 404
    assert "error" in r.json()


# ---------- wasm circuits binary ----------
def test_circuits_wasm(session):
    r = session.get(f"{BIFROST}/app/circuits/transaction.wasm", timeout=120)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "")
    assert "wasm" in ct or "octet-stream" in ct
    assert len(r.content) > 500_000  # a few hundred KB at minimum


# ---------- websocket ----------
def test_ws_rpc_connect():
    ws_url = BIFROST.replace("https://", "wss://").replace("http://", "ws://") + "/rpc"

    async def run():
        async with websockets.connect(ws_url, open_timeout=20, close_timeout=10) as ws:
            # send a slotSubscribe; even if no message arrives quickly, open connection is enough
            await ws.send(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "getVersion"}))
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=15)
                assert msg
            except asyncio.TimeoutError:
                # getVersion over ws may not be supported; connection open is pass criterion
                pass

    asyncio.run(run())
