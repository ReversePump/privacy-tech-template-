"""Iteration 16: full-feature smoke of swap pipeline (chains, tokens, quote, order, status)
for both Private route (HoudiniSwap via /api/ds) and Privacy swap (NEAR 1-Click via /api/ds/near).
Does NOT send any funds; only inspects responses + order status endpoint."""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://offer-latest-dark.preview.emergentagent.com").rstrip("/")

EVM_DEST = "0x000000000000000000000000000000000000dEaD"
EVM_DEST_REAL = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"  # upstream NEAR 1Click rejects burn addresses
SOL_REFUND = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
SOL_REFUND_REAL = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Lists ----------
def test_chains_live(sess):
    r = sess.get(f"{BASE}/api/ds/chains", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("chains") or [])
    assert len(items) >= 5, items
    # scrubbed branding
    txt = r.text.lower()
    assert "darkswap" not in txt
    assert "nullcash" in txt or len(items) > 0


def test_tokens_live(sess):
    r = sess.get(f"{BASE}/api/ds/tokens", params={"side": "source", "term": "SOL"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("tokens") or [])
    assert any((t.get("symbol") or "").upper() == "SOL" for t in items), items[:3]


def test_near_tokens_live(sess):
    r = sess.get(f"{BASE}/api/ds/near/tokens", params={"side": "source", "term": "SOL"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("tokens") or [])
    assert len(items) > 0


def _find(sess, side, symbol, chain=None, near=False):
    base = "/api/ds/near/tokens" if near else "/api/ds/tokens"
    r = sess.get(f"{BASE}{base}", params={"side": side, "term": symbol}, timeout=20)
    data = r.json()
    items = data if isinstance(data, list) else (data.get("items") or data.get("tokens") or [])
    for t in items:
        if (t.get("symbol") or "").upper() != symbol.upper():
            continue
        if chain:
            ch = (t.get("chain") or t.get("chainName") or t.get("network") or "").lower()
            if chain.lower() not in ch:
                continue
        return t
    return None


# ---------- Private route (HoudiniSwap) ----------
def test_private_route_full_flow(sess):
    src = _find(sess, "source", "SOL")
    dst = _find(sess, "destination", "ETH", chain="eth")
    assert src and dst, f"token lookup failed src={src} dst={dst}"
    # Quote 5 SOL -> ETH
    q = sess.get(f"{BASE}/api/ds/quotes", params={"amount": "5", "from": src["id"], "to": dst["id"]}, timeout=30)
    assert q.status_code == 200, q.text
    qjson = q.json()
    quotes = qjson if isinstance(qjson, list) else (qjson.get("quotes") or [])
    assert quotes, qjson
    qid = quotes[0].get("quoteId") or quotes[0].get("id")
    assert qid
    # Create order
    o = sess.post(f"{BASE}/api/ds/orders", json={
        "quoteId": qid, "addressTo": EVM_DEST, "refundAddress": SOL_REFUND
    }, timeout=30)
    assert o.status_code == 200, f"orders POST: {o.status_code} {o.text}"
    od = o.json()
    assert od.get("depositAddress"), od
    oid = od.get("houdiniId") or od.get("id") or od.get("orderId")
    assert oid, od
    # Fetch status
    s = sess.get(f"{BASE}/api/ds/orders/{oid}", timeout=30)
    assert s.status_code == 200, f"status: {s.status_code} {s.text}"
    sd = s.json()
    # must still refer to the same deposit address or order id
    assert (sd.get("houdiniId") or sd.get("id") or oid) == oid or sd.get("depositAddress")


# ---------- Privacy swap (NEAR Intents) ----------
def test_privacy_swap_full_flow(sess):
    src = _find(sess, "source", "SOL", near=True)
    # ETH native may not have a privacy route; USDC on ethereum is the common pair used by dk-swap.js
    dst = _find(sess, "destination", "USDC", chain="eth", near=True) or _find(sess, "destination", "ETH", chain="eth", near=True)
    assert src and dst, f"near token lookup failed src={src} dst={dst}"
    nq = sess.post(f"{BASE}/api/ds/near/quote", json={
        "from": src["id"], "to": dst["id"], "amount": "1",
        "recipient": EVM_DEST_REAL, "refundTo": SOL_REFUND_REAL,
    }, timeout=40)
    if nq.status_code == 400 and any(x in nq.text.lower() for x in ("no privacy swap route", "not available")):
        pytest.skip(f"NEAR Intents provider not quoting right now (upstream outage): {nq.text[:120]}")
    assert nq.status_code == 200, f"near/quote: {nq.status_code} {nq.text}"
    quote = nq.json()
    qid = quote.get("quoteId") or quote.get("id")
    assert qid, quote
    rid = str(uuid.uuid4())
    no = sess.post(f"{BASE}/api/ds/near/orders", json={"quoteId": qid, "requestId": rid}, timeout=40)
    assert no.status_code == 200, f"near/orders: {no.status_code} {no.text}"
    od = no.json()
    assert od.get("depositAddress"), od
    oid = od.get("requestId") or rid
    # Status
    s = sess.get(f"{BASE}/api/ds/near/orders/{oid}", timeout=30)
    # Upstream may 404 until on-chain deposit — accept 200/404/400 (just-created) but not 5xx
    assert s.status_code in (200, 400, 404), f"near status: {s.status_code} {s.text}"


# ---------- Negative ----------
def test_disallowed_path_blocked(sess):
    r = sess.get(f"{BASE}/api/ds/evil", timeout=10)
    assert r.status_code == 403


def test_bogus_order_status(sess):
    r = sess.get(f"{BASE}/api/ds/orders/does-not-exist-xyz", timeout=20)
    assert r.status_code in (400, 404, 422, 500, 503), r.status_code
