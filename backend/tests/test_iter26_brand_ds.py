"""Iteration 26: favicons/manifest branding + /api/ds no-wallet swap flows (DS + NEAR) + brand leak audit."""
import os
import io
import re
import time
import uuid
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DS = f"{BASE_URL}/api/ds"
EVM = "0x68b3a9f8940f418e8051ebb659e8ed278fea41f6"
SOLREF = "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9"
BRANDS = re.compile(r"veil|darkswap|dark swap|houdini|mayan|cadabra|darkinator|near intents|1click|contractwolf|jupiter", re.I)


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"User-Agent": "pytest-iter26"})
    return x


def _retry(fn, n=3, wait=4):
    r = None
    for _ in range(n):
        r = fn()
        if r.status_code not in (429, 502, 503, 504):
            return r
        time.sleep(wait)
    return r


# ---- Favicons / manifest ----
@pytest.mark.parametrize("path", ["/favicon.ico", "/brand/favicon-32.png", "/brand/favicon-192.png",
                                  "/brand/favicon-180.png", "/api/bifrost/v1/app/icons/favicon-64.png",
                                  "/api/bifrost/v1/app/icons/apple-touch-icon.png"])
def test_icon_is_nullcash(s, path):
    from PIL import Image
    r = s.get(BASE_URL + path, timeout=30)
    assert r.status_code == 200
    im = Image.open(io.BytesIO(r.content)).convert("RGBA")
    w, h = im.size
    px = im.getpixel((w // 2, h // 2))   # solid black centre
    corner = im.getpixel((1, 1))
    assert px[0] < 60 and px[1] < 60 and px[2] < 60, f"centre not black {px}"
    # no purple (ghost icon) pixels
    purple = sum(1 for p in im.getdata() if p[3] > 128 and p[2] > 150 and p[0] > 90 and p[1] < 90)
    assert purple < 5, f"purple pixels {purple}, corner {corner}"


def test_manifest(s):
    r = s.get(f"{BASE_URL}/api/bifrost/v1/app/manifest.webmanifest", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["name"] == "NullCash · Private money on Solana"
    assert j["short_name"] == "NullCash"
    assert all(i["src"].startswith("/api/bifrost/v1/_brand/") for i in j["icons"])
    for i in j["icons"]:
        assert s.get(BASE_URL + i["src"], timeout=30).status_code == 200


# ---- DS (no-wallet private route) ----
@pytest.fixture(scope="module")
def ds_tokens(s):
    src = _retry(lambda: s.get(f"{DS}/tokens", params={"side": "source"}, timeout=40)).json()["tokens"]
    dst = _retry(lambda: s.get(f"{DS}/tokens", params={"side": "destination", "term": "USDC"}, timeout=40)).json()["tokens"]
    sol = next(t for t in src if t["symbol"] == "SOL" and t["chain"] == "solana")
    usdc = next(t for t in dst if t["symbol"] == "USDC" and t["chain"] == "ethereum")
    return sol, usdc, src + dst


def test_ds_tokens_no_brand(ds_tokens):
    sol, usdc, allt = ds_tokens
    # 'Jupiter' allowed here: it is the real token name of JLP (Jupiter Perpetuals LP), not app branding
    nb = re.compile(BRANDS.pattern.replace("|jupiter", ""), re.I)
    for t in allt:
        assert not nb.search(f"{t.get('name')} {t.get('symbol')} {t.get('chainName')}"), t


@pytest.fixture(scope="module")
def ds_quote(s, ds_tokens):
    sol, usdc, _ = ds_tokens
    amt = round(0.3 + random.random() * 0.5, 4)
    r = _retry(lambda: s.get(f"{DS}/quotes", params={"amount": amt, "from": sol["id"], "to": usdc["id"]}, timeout=60), n=3, wait=6)
    if r.status_code != 200:
        pytest.skip(f"upstream quotes {r.status_code} {r.text[:200]}")
    return r.json()


def test_ds_quotes(ds_quote):
    qs = ds_quote.get("quotes")
    assert isinstance(qs, list) and qs, ds_quote
    print("DS QUOTE SAMPLE:", {k: v for k, v in qs[0].items() if k != "id"})
    assert not BRANDS.search(str(ds_quote)), "brand leak in quotes JSON"


def test_ds_order_create_and_status(s, ds_quote):
    q = ds_quote["quotes"][0]
    qid = q.get("quoteId") or q.get("id")
    r = _retry(lambda: s.post(f"{DS}/orders", json={"quoteId": qid, "addressTo": EVM}, timeout=60), n=2, wait=8)
    if r.status_code in (429, 502):
        pytest.skip(f"upstream flaky {r.status_code} {r.text[:200]}")
    assert r.status_code == 200, r.text[:300]
    o = r.json()
    print("DS ORDER:", o)
    # NOTE: response key 'houdiniId' is an upstream field name (not displayed); check values only
    assert not BRANDS.search(str(list(o.values())))
    oid = o.get("id") or o.get("houdiniId") or o.get("orderId")
    dep = o.get("depositAddress") or o.get("senderAddress")
    assert oid and dep
    g = _retry(lambda: s.get(f"{DS}/orders/{oid}", timeout=40))
    assert g.status_code == 200, g.text[:200]
    print("DS STATUS:", g.json())
    assert not BRANDS.search(str(g.json()))


# ---- NEAR side (privacy swap) ----
def test_near_tokens(s):
    r = _retry(lambda: s.get(f"{DS}/near/tokens", params={"side": "source"}, timeout=40))
    assert r.status_code == 200
    toks = r.json()["tokens"]
    assert any(t["id"] == "nep141:sol.omft.near" for t in toks)
    assert not BRANDS.search(str(toks))


def test_near_quote_order_status(s):
    amt = str(round(0.05 + random.random() * 0.3, 5))
    r = _retry(lambda: s.post(f"{DS}/near/quote", json={"from": "nep141:sol.omft.near", "to": "nep141:eth.omft.near",
                                                       "amount": amt, "recipient": EVM, "refundTo": SOLREF}, timeout=60), n=3, wait=6)
    if r.status_code in (429, 502):
        pytest.skip(f"near quote upstream {r.status_code} {r.text[:200]}")
    assert r.status_code == 200, r.text[:300]
    q = r.json()
    print("NEAR QUOTE:", q)
    assert not BRANDS.search(str(q))
    assert q.get("quoteId") and q.get("amountOut")
    rid = str(uuid.uuid4())
    o = _retry(lambda: s.post(f"{DS}/near/orders", json={"quoteId": q["quoteId"], "requestId": rid}, timeout=60), n=2, wait=8)
    if o.status_code in (429, 502, 503):
        pytest.skip(f"near order upstream {o.status_code} {o.text[:200]}")
    assert o.status_code == 200, o.text[:300]
    oj = o.json()
    print("NEAR ORDER:", oj)
    assert oj.get("depositAddress")
    g = _retry(lambda: s.get(f"{DS}/near/orders/{rid}", timeout=40))
    assert g.status_code == 200, g.text[:200]
    print("NEAR STATUS:", g.json())
    assert not BRANDS.search(str(g.json()))
