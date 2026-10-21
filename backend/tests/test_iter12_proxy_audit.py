"""Iteration 12 – Full proxy audit for Cadabra.
Verifies that every indexer/relayer endpoint via /api/bifrost/v1/* returns the same
status + JSON shape as upstream veilit.xyz, and that order creation (classic + near)
still works end to end. No funds move – only deposit address generation.
"""
import json
import os
import time
import uuid
import pytest
import requests

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        return ""
    return ""


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL required"

SOL = "So11111111111111111111111111111111111111112"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
EVM = "0x68b3a9f8940f418e8051ebb659e8ed278fea41f6"
SOLADDR = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9"


def _get(url, **kw):
    kw.setdefault("timeout", 30)
    return requests.get(url, **kw)


def _post(url, payload, **kw):
    kw.setdefault("timeout", 30)
    kw.setdefault("headers", {"Content-Type": "application/json"})
    return requests.post(url, data=json.dumps(payload), **kw)


# -------------------- Indexer proxy parity --------------------
INDEXER_PATHS = [
    "/v1/assets",
    "/v1/catalog",
    "/v1/health",
    "/v1/stats",
    "/v1/root",
    "/v1/feed?limit=7",
    "/v1/commitments?from=0&limit=5",
    "/v1/nullifiers",
    "/v1/referrals",
    "/v1/flows",
]


@pytest.mark.parametrize("path", INDEXER_PATHS)
def test_indexer_proxy_matches_upstream(path):
    up = _get(f"https://indexer.veilit.xyz{path}")
    pr = _get(f"{BASE}/api/bifrost/v1/indexer{path}")
    assert pr.status_code == up.status_code, f"status mismatch for {path}: proxy={pr.status_code} upstream={up.status_code}"
    assert pr.status_code == 200, f"{path} returned {pr.status_code}"
    assert "application/json" in pr.headers.get("content-type", "").lower(), f"{path} not JSON: {pr.text[:120]}"
    # structural parity (sizes/keys)
    uj, pj = up.json(), pr.json()
    if isinstance(uj, dict):
        assert set(uj.keys()) == set(pj.keys()), f"{path} key mismatch"
    elif isinstance(uj, list):
        assert len(uj) == len(pj), f"{path} length mismatch"


def test_indexer_logo_endpoint():
    r = _get(f"{BASE}/api/bifrost/v1/indexer/v1/logo/{SOL}")
    # upstream can return 200 (image) or 404 for unknown mint – both are acceptable passthroughs
    assert r.status_code in (200, 404)


# -------------------- Relayer proxy parity --------------------
RELAYER_PATHS = [
    "/v1/health",
    "/v1/info",
    "/v1/positions",
    f"/v1/fee?mint={SOL}&inputs=1",
    "/v1/bridge/routes",
    "/v1/flow/status",
]


@pytest.mark.parametrize("path", RELAYER_PATHS)
def test_relayer_proxy_matches_upstream(path):
    up = _get(f"https://relayer.veilit.xyz{path}")
    pr = _get(f"{BASE}/api/bifrost/v1/relayer{path}")
    assert pr.status_code == up.status_code, f"{path}: proxy={pr.status_code} up={up.status_code}"
    if pr.status_code == 200:
        assert "application/json" in pr.headers.get("content-type", "").lower()


def test_relayer_quote_single():
    r = _get(f"{BASE}/api/bifrost/v1/relayer/v1/quote?in={SOL}&out={USDC}&amount=100000000")
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    # Must look like a quote
    assert any(k in j for k in ("outAmount", "out", "amountOut", "quote", "price")), f"unexpected quote shape: {list(j.keys())}"


def test_relayer_quote_burst_sequential():
    """25 sequential quotes – all must be JSON (never HTML). 200 is expected but
    upstream Jupiter is a shared quota so occasional 503 JSON (proxy's gateway
    middleware response for upstream 429) is tolerated as long as the body is JSON."""
    html_leaks = []
    non200 = []
    for i in range(25):
        amt = 100000000 + i * 7919
        r = _get(f"{BASE}/api/bifrost/v1/relayer/v1/quote?in={SOL}&out={USDC}&amount={amt}", timeout=45)
        ct = r.headers.get("content-type", "").lower()
        body = r.text[:200]
        if "<html" in body.lower() or "application/json" not in ct:
            html_leaks.append((i, r.status_code, ct, body[:120]))
        if r.status_code != 200:
            non200.append((i, r.status_code))
        time.sleep(0.4)
    assert not html_leaks, f"HTML/non-JSON leaked through proxy: {html_leaks}"
    # Core requirement: at least 80% of requests should succeed. Upstream jupiter 429 is tolerated.
    ok = 25 - len(non200)
    assert ok >= 20, f"too many non-200: {non200}"


def _near_outage(r):
    t = (r.text or "").lower()
    return r.status_code in (400, 404, 422, 502, 503) and any(x in t for x in ("no privacy swap route", "not available", "no route", "quoting"))


def test_relayer_bridge_quote_post_dryrun():
    r = _post(f"{BASE}/api/bifrost/v1/relayer/v1/bridge/quote", {
        "mint": SOL,
        "amount": "500000000",
        "destination": "nep141:eth.omft.near",
        "recipient": EVM,
        "dry": True,
    })
    if _near_outage(r):
        pytest.skip("NEAR Intents provider not quoting right now (upstream outage)")
    assert r.status_code == 200, r.text[:250]
    j = r.json()
    assert any(k in j for k in ("amountOut", "out", "outAmount", "quote")), f"bridge/quote shape: {list(j.keys())}"


def test_relayer_prepare_returns_lookup_tables():
    r = _post(f"{BASE}/api/bifrost/v1/relayer/v1/prepare", {"mint": SOL})
    assert r.status_code == 200, r.text[:250]
    j = r.json()
    assert "lookupTables" in j, f"prepare keys: {list(j.keys())}"
    assert isinstance(j["lookupTables"], list)


def test_relayer_relay_empty_body_is_json_400():
    r = _post(f"{BASE}/api/bifrost/v1/relayer/v1/relay", {})
    assert r.status_code in (400, 422), r.status_code
    assert "application/json" in r.headers.get("content-type", "").lower(), f"non-JSON error body: {r.text[:120]}"


# -------------------- No HTML leak / gateway middleware --------------------
def test_no_html_on_known_404():
    r = _get(f"{BASE}/api/bifrost/v1/indexer/v1/this-does-not-exist-xyz")
    assert "<html" not in r.text.lower()[:300], "HTML leaked through proxy"


# -------------------- DarkSwap – Private route order --------------------
def test_ds_private_route_full_order():
    # source tokens
    r = _get(f"{BASE}/api/ds/tokens?side=source")
    assert r.status_code == 200
    src = r.json()
    if isinstance(src, dict):
        src = src.get("tokens") or src.get("items") or []
    sol_tok = next((t for t in src if (t.get("ticker") or t.get("symbol") or "").upper() == "SOL"), None)
    assert sol_tok, "SOL not in source tokens"
    sol_id = sol_tok.get("id") or sol_tok.get("tokenId") or sol_tok.get("code")
    assert sol_id, f"source id missing: {sol_tok}"

    # dest tokens – USDC
    r = _get(f"{BASE}/api/ds/tokens?side=destination&term=USDC")
    assert r.status_code == 200
    dst = r.json()
    if isinstance(dst, dict):
        dst = dst.get("tokens") or dst.get("items") or []
    usdc_tok = next((t for t in dst if (t.get("ticker") or t.get("symbol") or "").upper() == "USDC"), None)
    assert usdc_tok, "USDC not in dest tokens"
    usdc_id = usdc_tok.get("id") or usdc_tok.get("tokenId") or usdc_tok.get("code")
    assert usdc_id

    # fresh unique amount
    amt = round(0.5 + (time.time() % 1) * 0.01, 6)
    q = _get(f"{BASE}/api/ds/quotes?amount={amt}&from={sol_id}&to={usdc_id}")
    assert q.status_code == 200, q.text[:200]
    qj = q.json()
    if isinstance(qj, dict) and "quotes" in qj:
        quotes = qj.get("quotes") or []
        assert quotes, f"no quotes returned: {qj}"
        qj = quotes[0]
    quote_id = qj.get("id") or qj.get("quoteId")
    assert quote_id, f"no quoteId in {list(qj.keys())}"

    o = _post(f"{BASE}/api/ds/orders", {"quoteId": quote_id, "addressTo": EVM})
    assert o.status_code == 200, o.text[:250]
    oj = o.json()
    assert any(k in oj for k in ("houdiniId", "id", "orderId")), f"order keys: {list(oj.keys())}"
    assert any(k in oj for k in ("depositAddress", "deposit", "address")), f"no deposit addr: {list(oj.keys())}"

    oid = oj.get("houdiniId") or oj.get("id") or oj.get("orderId")
    g = _get(f"{BASE}/api/ds/orders/{oid}")
    assert g.status_code == 200, g.text[:200]


# -------------------- NEAR intents – Privacy swap --------------------
def test_ds_near_privacy_swap_full_order():
    # 409 "minimum output changed" is upstream quote drift – retry up to 3 times with a fresh quote
    last_err = None
    for attempt in range(3):
        q = _post(f"{BASE}/api/ds/near/quote", {
            "from": "nep141:sol.omft.near",
            "to": "nep141:eth.omft.near",
            "amount": "5",
            "recipient": EVM,
            "refundTo": SOLADDR,
        })
        if _near_outage(q):
            pytest.skip("NEAR Intents provider not quoting right now (upstream outage)")
        assert q.status_code == 200, q.text[:250]
        qj = q.json()
        quote_id = qj.get("quoteId") or qj.get("id")
        assert quote_id, f"no quoteId in {list(qj.keys())}"

        req_id = str(uuid.uuid4())
        o = _post(f"{BASE}/api/ds/near/orders", {"quoteId": quote_id, "requestId": req_id})
        if o.status_code == 200:
            oj = o.json()
            assert any(k in oj for k in ("depositAddress", "deposit", "address")), f"near order keys: {list(oj.keys())}"
            g = _get(f"{BASE}/api/ds/near/orders/{req_id}")
            assert g.status_code == 200
            return
        last_err = (o.status_code, o.text[:200])
        time.sleep(0.3)
    pytest.fail(f"near order never 200 after 3 attempts: {last_err}")
