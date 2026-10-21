"""Iteration 27: live relay (_live), live indexer stats/feed no-store, opaque _img keys, orderId rename, favicons."""
import os
import re
import time
import base64
import random
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
DS = f"{BASE_URL}/api/ds"
BF = f"{BASE_URL}/api/bifrost/v1"
EVM = "0x68b3a9f8940f418e8051ebb659e8ed278fea41f6"
BRANDS = re.compile(r"veil|darkswap|houdini|mayan|cadabra|darkinator|near intents|1click", re.I)


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"User-Agent": "pytest-iter27"})
    return x


def _retry(fn, n=3, wait=4):
    r = None
    for _ in range(n):
        r = fn()
        if r.status_code not in (429, 502, 503, 504):
            return r
        time.sleep(wait)
    return r


# ---- Live relay ----
def test_live_relay_increasing(s):
    a = s.get(f"{BF}/_live", timeout=20)
    assert a.status_code == 200
    j1 = a.json()
    print("LIVE1", j1, a.headers.get("cache-control"))
    assert j1["relay"] == "on" and j1["every_s"] == 3
    assert j1["age_s"] is not None and j1["age_s"] < 6
    time.sleep(5)
    j2 = s.get(f"{BF}/_live", timeout=20).json()
    print("LIVE2", j2)
    assert j2["ok"] > j1["ok"], (j1, j2)
    assert j2["errors"] <= max(5, j2["ok"] * 0.05), j2


# ---- Indexer live stats/feed ----
def test_indexer_stats_live(s):
    r = s.get(f"{BF}/indexer/v1/stats", timeout=20)
    assert r.status_code == 200
    print("STATS", r.text[:400], r.headers.get("cache-control"))
    assert "no-store" in r.headers.get("cache-control", "")
    j = r.json()
    txt = str(j).lower()
    assert "leaves" in txt or "leaf" in txt
    assert "nullifier" in txt
    assert "root" in txt


def test_indexer_feed_live(s):
    r = s.get(f"{BF}/indexer/v1/feed", params={"limit": 60}, timeout=20)
    assert r.status_code == 200
    print("FEED", r.text[:500], r.headers.get("cache-control"))
    j = r.json()
    items = j if isinstance(j, list) else (j.get("items") or j.get("feed") or j.get("events") or [])
    assert items, j
    first = items[0]
    sig = first.get("signature") or first.get("sig") or first.get("tx")
    assert sig and len(sig) > 60
    assert first.get("ts") or first.get("time") or first.get("blockTime")


# ---- Opaque image keys ----
@pytest.fixture(scope="module")
def ds_tokens(s):
    src = _retry(lambda: s.get(f"{DS}/tokens", params={"side": "source"}, timeout=40))
    assert src.status_code == 200
    dst = _retry(lambda: s.get(f"{DS}/tokens", params={"side": "destination", "term": "USDC"}, timeout=40))
    return src.json()["tokens"], dst.json()["tokens"]


def test_tokens_icons_opaque_and_load(s, ds_tokens):
    src, dst = ds_tokens
    icons = [t.get("icon") or t.get("logo") or "" for t in src + dst]
    icons = [i for i in icons if i]
    assert icons
    assert all("/api/bifrost/v1/_img?o=" in i for i in icons), [i for i in icons if "_img?o=" not in i][:3]
    for i in icons[:40]:
        k = i.split("o=", 1)[1]
        try:
            dec = base64.urlsafe_b64decode(k + "=" * (-len(k) % 4)).decode("utf-8", "ignore")
        except Exception:
            dec = ""
        assert "http" not in dec and "houdini" not in dec.lower()
    for i in random.sample(icons, min(5, len(icons))):
        u = i if i.startswith("http") else BASE_URL + i
        r = s.get(u, timeout=30)
        assert r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"), (u, r.status_code, r.headers.get("content-type"))


def test_ds_order_uses_orderId(s, ds_tokens):
    src, dst = ds_tokens
    sol = next(t for t in src if t["symbol"] == "SOL" and t["chain"] == "solana")
    usdc = next(t for t in dst if t["symbol"] == "USDC" and t["chain"] == "ethereum")
    amt = round(0.6 + random.random() * 0.6, 4)
    q = _retry(lambda: s.get(f"{DS}/quotes", params={"amount": amt, "from": sol["id"], "to": usdc["id"]}, timeout=60), n=3, wait=6)
    if q.status_code != 200:
        pytest.skip(f"quote upstream {q.status_code}")
    qs = q.json()["quotes"]
    print("QUOTE0", {k: v for k, v in qs[0].items()})
    qid = qs[0].get("quoteId") or qs[0].get("id")
    r = _retry(lambda: s.post(f"{DS}/orders", json={"quoteId": qid, "addressTo": EVM}, timeout=60), n=2, wait=8)
    if r.status_code in (429, 502, 503):
        pytest.skip(f"order upstream {r.status_code} {r.text[:200]}")
    assert r.status_code == 200, r.text[:300]
    print("ORDER", r.text[:600])
    assert '"houdiniId"' not in r.text
    assert "orderId" in r.json()
    assert not BRANDS.search(r.text)


@pytest.mark.parametrize("path", ["/favicon.ico", "/brand/favicon-32.png", "/api/bifrost/v1/app/icons/favicon-64.png"])
def test_favicon_ok(s, path):
    r = s.get(BASE_URL + path, timeout=30)
    assert r.status_code == 200 and r.headers.get("content-type", "").startswith("image/")
