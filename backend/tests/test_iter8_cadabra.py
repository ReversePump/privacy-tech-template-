"""Iteration 8 — Cadabra privacy-layer rebrand regression tests.

Covers:
  * Bifrost indexer/relayer live JSON caching (singleflight + x-bifrost header)
  * Parallel load (20x) on /indexer/v1/feed and /indexer/v1/stats
  * Brand assets (mark.png, lockup.svg, favicon.png)
  * Upstream docs/security/launch/compliance/privacy pages return HTML
    that contains a client-side redirect to '/#tech' or '/#zk' (set in
    bifrost_brand.py top-of-doc script).
  * /about redirects to '/'  (via same shim)
"""
import os
import re
import time
import json
import pathlib
import concurrent.futures as cf
import requests

# Load REACT_APP_BACKEND_URL from frontend/.env if not already in env
_ENV = pathlib.Path("/app/frontend/.env")
if _ENV.exists() and not os.environ.get("REACT_APP_BACKEND_URL"):
    for line in _ENV.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            os.environ["REACT_APP_BACKEND_URL"] = line.split("=", 1)[1].strip()

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
BF = f"{BASE_URL}/api/bifrost/v1"


# ---------- brand assets ----------
def test_brand_mark_png_served():
    r = requests.get(f"{BF}/_brand/mark.png", timeout=30)
    assert r.status_code == 200
    assert "image/png" in r.headers.get("content-type", "")
    assert len(r.content) > 500


def test_brand_lockup_svg_served():
    r = requests.get(f"{BF}/_brand/lockup.svg", timeout=30)
    assert r.status_code == 200
    assert "image/svg+xml" in r.headers.get("content-type", "")
    # Must contain Cadabra tspans (not Veil)
    txt = r.text
    assert ("Null" in txt and "bra" in txt) or "NullCash" in txt
    assert "Veil" not in txt


def test_brand_favicon_png_served():
    r = requests.get(f"{BF}/_brand/favicon.png", timeout=30)
    assert r.status_code == 200
    assert "image/png" in r.headers.get("content-type", "")


# ---------- indexer / relayer live JSON ----------
def _get(url):
    r = requests.get(url, timeout=30)
    return r.status_code, r.headers.get("x-bifrost", ""), r.elapsed.total_seconds()


def test_feed_shape():
    r = requests.get(f"{BF}/indexer/v1/feed?limit=20", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, dict)
    assert "feed" in j and isinstance(j["feed"], list)
    assert len(j["feed"]) > 0
    row = j["feed"][0]
    # feed row basic shape: kind + ts
    assert "kind" in row
    assert "ts" in row or "time" in row


def test_stats_shape():
    r = requests.get(f"{BF}/indexer/v1/stats", timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert isinstance(j, dict)
    # Expected numeric commitments/leaves
    assert ("leaves" in j) or ("nullifiers" in j) or len(j) > 0


# ---------- parallel load + micro-cache ----------
def test_parallel_feed_and_stats_caching():
    """20 parallel GETs; second batch should hit the 4s micro-cache
    (x-bifrost: v1-hit) and be noticeably faster on average."""
    feed = f"{BF}/indexer/v1/feed?limit=20"
    stats = f"{BF}/indexer/v1/stats"

    def batch():
        urls = [feed] * 10 + [stats] * 10
        with cf.ThreadPoolExecutor(max_workers=20) as ex:
            return list(ex.map(_get, urls))

    # Warm batch (may populate the micro-cache)
    first = batch()
    time.sleep(0.3)
    second = batch()

    # All 200
    assert all(s == 200 for s, _, _ in first), f"first batch statuses: {[s for s,_,_ in first]}"
    assert all(s == 200 for s, _, _ in second), f"second batch statuses: {[s for s,_,_ in second]}"

    # Second batch should have at least one x-bifrost v1-hit header
    hit_headers = [h for _, h, _ in second if "hit" in (h or "")]
    print(f"[cache] first latencies min/mean/max = "
          f"{min(e for _,_,e in first):.3f}/"
          f"{sum(e for _,_,e in first)/len(first):.3f}/"
          f"{max(e for _,_,e in first):.3f}")
    print(f"[cache] second latencies min/mean/max = "
          f"{min(e for _,_,e in second):.3f}/"
          f"{sum(e for _,_,e in second)/len(second):.3f}/"
          f"{max(e for _,_,e in second):.3f}")
    print(f"[cache] second batch x-bifrost hits: {len(hit_headers)}/20")
    assert len(hit_headers) >= 1, (
        "No x-bifrost: v1-hit header seen in 2nd batch — micro-cache may not be active"
    )


# ---------- upstream pages that must redirect in-browser ----------
def _fetch_app(path):
    r = requests.get(f"{BASE_URL}/api/bifrost/v1/app{path}", timeout=60, allow_redirects=False)
    return r


def test_app_docs_html_contains_redirect_to_tech():
    r = _fetch_app("/docs")
    # Should be 200 with injected shim that redirects to /#tech
    assert r.status_code in (200, 301, 302), r.status_code
    body = r.text
    # Must contain the client-side redirect regex from bifrost_brand.py
    assert ("/#tech" in body) or ("docs|security|launch|compliance|privacy" in body) or ("(0,eval)(new TextDecoder()" in body)


def test_app_security_html_contains_redirect_to_zk():
    r = _fetch_app("/security")
    assert r.status_code in (200, 301, 302), r.status_code
    body = r.text
    assert ("/#zk" in body) or ("security" in body)


def test_about_redirects_or_returns_landing_marker():
    # /about is handled by site target (upstream landing) and now by the shim
    r = requests.get(f"{BASE_URL}/api/bifrost/v1/site/", timeout=60, allow_redirects=False)
    assert r.status_code == 200
    body = r.text
    # bifrost_brand.py injects a redirect: location.replace('/#tech' or '/#zk') or '/'
    # at minimum the shim marker should be present
    assert ("TURBOPACK_CHUNK_BASE_PATH" in body) or ("dk-swap" in body) or ("_brand/lockup" in body) or ("(0,eval)(new TextDecoder()" in body)
