"""Iteration 12 - upstream security verification handling.

Covers:
- server._is_challenge unit (HTML/cf-mitigated vs JSON)
- /api/ds/* list endpoints return 200 JSON (not HTML)
- /api/bifrost/v1/{indexer/v1/stats,_health} return 200 JSON
"""
import os
import sys
import json
import httpx
import pytest
import requests

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL required"


# ---- Unit: _is_challenge ----
def test_is_challenge_html():
    from server import _is_challenge
    r = httpx.Response(403, headers={"content-type": "text/html"}, content=b"<html>busy</html>")
    assert _is_challenge(r) is True


def test_is_challenge_cf_mitigated():
    from server import _is_challenge
    r = httpx.Response(200, headers={"content-type": "application/json", "cf-mitigated": "challenge"}, content=b"{}")
    assert _is_challenge(r) is True


def test_is_challenge_json_false():
    from server import _is_challenge
    r = httpx.Response(200, headers={"content-type": "application/json"}, content=b'{"ok":true}')
    assert _is_challenge(r) is False


def test_is_challenge_html_body_sniff():
    from server import _is_challenge
    # even with missing content-type, leading '<' flags html
    r = httpx.Response(200, headers={}, content=b"<!DOCTYPE html>")
    assert _is_challenge(r) is True


# ---- Live endpoints: JSON only, never HTML ----
def _assert_json(resp, allow_503=False):
    ct = resp.headers.get("content-type", "")
    assert "application/json" in ct, f"non-json ct={ct} body[:120]={resp.content[:120]!r}"
    if resp.status_code == 503 and allow_503:
        d = resp.json()
        assert d.get("busy") is True
        return
    assert resp.status_code == 200, f"status={resp.status_code} body={resp.text[:200]}"
    # must be valid JSON
    resp.json()


def test_ds_chains_json():
    r = requests.get(f"{BASE_URL}/api/ds/chains", timeout=30)
    _assert_json(r, allow_503=True)


def test_ds_near_tokens_json():
    r = requests.get(f"{BASE_URL}/api/ds/near/tokens?side=source", timeout=30)
    _assert_json(r, allow_503=True)


def test_bifrost_indexer_stats_json():
    r = requests.get(f"{BASE_URL}/api/bifrost/v1/indexer/v1/stats", timeout=30)
    _assert_json(r, allow_503=True)


def test_bifrost_health_json():
    r = requests.get(f"{BASE_URL}/api/bifrost/v1/_health", timeout=30)
    assert r.status_code == 200
    assert "application/json" in r.headers.get("content-type", "")
    d = r.json()
    for k in ("site", "app", "indexer", "relayer", "rpc"):
        assert k in d


# ---- Tunnel: GET /api/ds/_post/* path exists & accepts base64 body ----
def test_ds_post_tunnel_exists():
    import base64
    body = json.dumps({"amount": "0.01", "from": "sol:native", "to": "eth:usdc"}).encode()
    b = base64.urlsafe_b64encode(body).decode().rstrip("=")
    r = requests.get(f"{BASE_URL}/api/ds/_post/quotes?b={b}", timeout=30)
    # whatever upstream decides, our proxy must respond JSON, never HTML
    assert "application/json" in r.headers.get("content-type", ""), r.text[:200]
