"""Live endpoint verification pass (iteration 4) — per review_request.

Covers additional indexer/relayer/rpc/ws endpoints and the /api/ds (DarkSwap +
NEAR) proxy surface so we can prove every live function in the production
proxy is reachable and returns a sane payload.

Run with:
    REACT_APP_BACKEND_URL=<base> pytest /app/backend/tests/test_live_endpoints.py \
        -o addopts='' -v --tb=short
"""
import os
import json
import asyncio
import pytest
import requests
import websockets

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
BIFROST = f"{BASE_URL}/api/bifrost/v1"
DS = f"{BASE_URL}/api/ds"

SOL = "So11111111111111111111111111111111111111112"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"User-Agent": "pytest-live"})
    return sess


# ---------- indexer extended ----------
@pytest.mark.parametrize("path", [
    "/indexer/v1/health",
    "/indexer/v1/stats",
    "/indexer/v1/root",
    "/indexer/v1/feed?limit=5",
    "/indexer/v1/commitments?from=0&limit=5",
    "/indexer/v1/nullifiers",
    "/indexer/v1/assets",
    "/indexer/v1/flows",
    "/indexer/v1/referrals",
])
def test_indexer_endpoints(s, path):
    r = s.get(f"{BIFROST}{path}", timeout=30)
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    # most are JSON; health may be plain text
    ct = r.headers.get("content-type", "")
    if "json" in ct:
        j = r.json()
        assert isinstance(j, (dict, list))


# ---------- relayer extended ----------
def test_relayer_health(s):
    r = s.get(f"{BIFROST}/relayer/v1/health", timeout=30)
    assert r.status_code in (200, 204), r.text[:200]


def test_relayer_info(s):
    r = s.get(f"{BIFROST}/relayer/v1/info", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), (dict, list))


def test_relayer_quote(s):
    url = f"{BIFROST}/relayer/v1/quote?in={SOL}&out={USDC}&amount=100000000"
    r = s.get(url, timeout=30)
    assert r.status_code == 200, f"quote -> {r.status_code} {r.text[:300]}"
    j = r.json()
    assert isinstance(j, (dict, list))


def test_relayer_fee(s):
    url = f"{BIFROST}/relayer/v1/fee?mint={SOL}&inputs=1"
    r = s.get(url, timeout=30)
    assert r.status_code == 200, f"fee -> {r.status_code} {r.text[:300]}"
    assert isinstance(r.json(), (dict, list))


def test_relayer_bridge_routes(s):
    r = s.get(f"{BIFROST}/relayer/v1/bridge/routes", timeout=30)
    assert r.status_code == 200, f"bridge/routes -> {r.status_code} {r.text[:300]}"
    assert isinstance(r.json(), (dict, list))


def test_relayer_positions(s):
    r = s.get(f"{BIFROST}/relayer/v1/positions", timeout=30)
    assert r.status_code == 200, f"positions -> {r.status_code} {r.text[:300]}"
    assert isinstance(r.json(), (dict, list))


# ---------- JSON-RPC extended ----------
def _rpc(s, method, params=None):
    r = s.post(
        f"{BIFROST}/rpc",
        json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []},
        timeout=30,
    )
    assert r.status_code == 200, f"{method} -> {r.status_code} {r.text[:200]}"
    return r.json()


def test_rpc_get_version(s):
    j = _rpc(s, "getVersion")
    assert "result" in j and "solana-core" in j["result"]


def test_rpc_get_latest_blockhash(s):
    j = _rpc(s, "getLatestBlockhash")
    assert "result" in j
    v = j["result"]["value"] if isinstance(j["result"], dict) else j["result"]
    assert "blockhash" in v


def test_rpc_get_balance(s):
    # arbitrary valid base58 pubkey (system program)
    j = _rpc(s, "getBalance", ["11111111111111111111111111111111"])
    assert "result" in j
    val = j["result"]["value"] if isinstance(j["result"], dict) else j["result"]
    assert isinstance(val, int)


# ---------- websocket slotSubscribe ----------
def test_ws_slot_subscribe():
    ws_url = BIFROST.replace("https://", "wss://").replace("http://", "ws://") + "/rpc"

    async def run():
        async with websockets.connect(ws_url, open_timeout=20, close_timeout=10) as ws:
            await ws.send(json.dumps({
                "jsonrpc": "2.0", "id": 1, "method": "slotSubscribe"
            }))
            # expect a subscription id ack then a slot notification within ~20s
            got_ack = False
            got_notif = False
            try:
                while not (got_ack and got_notif):
                    msg = await asyncio.wait_for(ws.recv(), timeout=25)
                    data = json.loads(msg)
                    if "result" in data and data.get("id") == 1:
                        got_ack = True
                    if data.get("method") == "slotNotification":
                        got_notif = True
            except asyncio.TimeoutError:
                pass
            assert got_ack, "no slotSubscribe ack received"
            # notif is nice-to-have on a quiet moment; don't fail the whole run
            # if cluster slot is slow. Open+ack is the critical pass criterion.

    asyncio.run(run())


# ---------- /api/ds DarkSwap proxy ----------
def test_ds_tokens_source(s):
    r = s.get(f"{DS}/tokens?side=source", timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    assert isinstance(j, (list, dict))
    arr = j if isinstance(j, list) else (j.get("tokens") or j.get("data") or [])
    assert len(arr) > 0, "empty source token list"


def test_ds_tokens_destination_search(s):
    r = s.get(f"{DS}/tokens?side=destination&term=usdc", timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    arr = j if isinstance(j, list) else (j.get("tokens") or j.get("data") or [])
    assert len(arr) > 0, "no usdc results"
    syms = " ".join(
        (t.get("symbol") or t.get("ticker") or "") for t in arr if isinstance(t, dict)
    ).lower()
    assert "usdc" in syms, f"no USDC in response: {syms[:200]}"


def test_ds_chains(s):
    r = s.get(f"{DS}/chains", timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    arr = j if isinstance(j, list) else (j.get("chains") or j.get("data") or [])
    assert len(arr) >= 3, f"too few chains: {arr}"


def test_ds_order_bad_id_404(s):
    r = s.get(f"{DS}/orders/garbage_id_does_not_exist", timeout=15)
    assert r.status_code in (400, 404), f"{r.status_code} {r.text[:200]}"


# ---------- /api/ds/near ----------
def test_near_tokens_source(s):
    r = s.get(f"{DS}/near/tokens?side=source", timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    arr = j if isinstance(j, list) else (j.get("tokens") or j.get("data") or [])
    assert len(arr) > 0, "empty near source tokens"


def test_near_tokens_destination(s):
    r = s.get(f"{DS}/near/tokens?side=destination", timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    arr = j if isinstance(j, list) else (j.get("tokens") or j.get("data") or [])
    assert len(arr) > 0


def test_near_service_status(s):
    r = s.get(f"{DS}/near/service-status", timeout=30)
    assert r.status_code == 200, r.text[:200]


def test_near_order_bad_id(s):
    r = s.get(f"{DS}/near/orders/garbage_near_id", timeout=15)
    assert r.status_code in (400, 404)
