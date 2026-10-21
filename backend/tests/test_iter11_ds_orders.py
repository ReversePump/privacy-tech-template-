"""Iteration 11: Verify /api/ds order creation for Private route + Privacy swap flows."""
import os
import time
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://offer-latest-dark.preview.emergentagent.com").rstrip("/")

# Fixed test addresses
EVM_DEST = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
SOL_REFUND = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _find_token(sess, side, chain=None, symbol=None, near=False):
    base = "/api/ds/near/tokens" if near else "/api/ds/tokens"
    params = {"side": side}
    if symbol:
        params["term"] = symbol
    r = sess.get(f"{BASE}{base}", params=params, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else data.get("items") or data.get("tokens") or []
    for t in items:
        sym = (t.get("symbol") or "").upper()
        ch = (t.get("chain") or t.get("chainName") or "").lower()
        if symbol and sym != symbol.upper():
            continue
        if chain and chain.lower() not in ch:
            continue
        return t
    return None


# ---------- Private route (non-near) ----------
def test_private_route_order_created(sess):
    src = _find_token(sess, "source", symbol="SOL")
    dst = _find_token(sess, "destination", chain="ethereum", symbol="USDC")
    assert src and dst, f"token lookup failed src={src} dst={dst}"
    q = sess.get(f"{BASE}/api/ds/quotes", params={"amount": "0.5", "from": src["id"], "to": dst["id"]}, timeout=30)
    assert q.status_code == 200, q.text
    quotes = q.json()
    if isinstance(quotes, dict):
        quotes = quotes.get("quotes") or []
    assert isinstance(quotes, list) and len(quotes) > 0, quotes
    qid = quotes[0]["quoteId"]
    # Create order via POST /api/ds/orders
    o = sess.post(f"{BASE}/api/ds/orders", json={"quoteId": qid, "addressTo": EVM_DEST}, timeout=30)
    assert o.status_code == 200, f"orders returned {o.status_code}: {o.text}"
    data = o.json()
    assert data.get("depositAddress"), data
    # order id key is 'houdiniId' upstream
    assert data.get("houdiniId") or data.get("id"), data


# ---------- Privacy swap (near / 1Click) ----------
def _near_outage(r):
    t = (r.text or "").lower()
    return r.status_code in (400, 404, 422, 502, 503) and any(x in t for x in ("no privacy swap route", "not available", "no route", "quoting"))


def test_privacy_swap_order_created(sess):
    src = _find_token(sess, "source", symbol="SOL", near=True)
    dst = _find_token(sess, "destination", chain="eth", symbol="USDC", near=True)
    assert src and dst
    nq = sess.post(f"{BASE}/api/ds/near/quote", json={
        "from": src["id"], "to": dst["id"], "amount": "0.5",
        "recipient": EVM_DEST, "refundTo": SOL_REFUND
    }, timeout=40)
    if _near_outage(nq):
        pytest.skip("NEAR Intents provider not quoting right now (upstream outage)")
    assert nq.status_code == 200, f"near/quote: {nq.status_code} {nq.text}"
    quote = nq.json()
    qid = quote.get("quoteId")
    assert qid, quote
    rid = str(uuid.uuid4())
    no = sess.post(f"{BASE}/api/ds/near/orders", json={"quoteId": qid, "requestId": rid}, timeout=40)
    assert no.status_code == 200, f"near/orders: {no.status_code} {no.text}"
    od = no.json()
    assert od.get("depositAddress"), od
