"""Tests for gap-closing features: password reset, paper reset, holdings, limit orders, sessions."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = f"gaps_{int(time.time())}@loom.test"
PASSWORD = "gapspass123"
_s = {}


def _tok():
    return {"Authorization": f"Bearer {_s['token']}"}


def test_setup():
    r = requests.post(f"{API}/auth/email/register", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    _s["token"] = r.json()["token"]


def test_reset_request_never_leaks():
    """Unknown emails get the same ok response — no account enumeration."""
    r1 = requests.post(f"{API}/auth/email/reset_request", json={"email": EMAIL}, timeout=20)
    r2 = requests.post(f"{API}/auth/email/reset_request", json={"email": "nobody@nowhere.test"}, timeout=20)
    assert r1.status_code == r2.status_code == 200
    assert r1.json() == r2.json() == {"ok": True}


def test_reset_confirm_bad_code():
    r = requests.post(f"{API}/auth/email/reset_confirm",
                      json={"email": EMAIL, "code": "999999", "newPassword": "newpass1234"}, timeout=20)
    assert r.status_code == 400 and "invalid_code" in r.text


def test_reset_confirm_short_password():
    r = requests.post(f"{API}/auth/email/reset_confirm",
                      json={"email": EMAIL, "code": "123456", "newPassword": "short"}, timeout=20)
    assert r.status_code == 400 and "password_too_short" in r.text


def test_paper_reset():
    requests.post(f"{API}/deployments", json={"kind": "copy", "mode": "paper",
                                              "targetAddress": "0x0000000000000000000000000000000000000001"}, headers=_tok(), timeout=20)
    r = requests.post(f"{API}/paper/reset", headers=_tok(), timeout=20)
    assert r.status_code == 200 and r.json()["balanceUsd"] == 10000.0
    acct = requests.get(f"{API}/paper/account", headers=_tok(), timeout=15).json()
    assert acct["balanceUsd"] == 10000.0 and acct["positions"] == []


def test_holdings_endpoint():
    r = requests.get(f"{API}/wallet/holdings", headers=_tok(), timeout=30)
    assert r.status_code == 200
    assert r.json() == {"holdings": []}  # fresh wallet holds nothing


def test_limit_order_validation():
    base = {"symbol": "ETH", "side": "long", "direction": "below", "targetPrice": 2000, "sizeUsd": 25, "mode": "paper"}
    for bad in [{"sizeUsd": 5}, {"direction": "sideways"}, {"side": "maybe"}, {"targetPrice": 0}]:
        payload = {**base, **bad}
        r = requests.post(f"{API}/hl/limit_order", json=payload, headers=_tok(), timeout=20)
        assert r.status_code == 400, payload


def test_limit_order_fires_and_stops():
    """A limit order with an already-true condition must fill (paper) and auto-stop."""
    r = requests.post(f"{API}/hl/limit_order",
                      json={"symbol": "ETH", "side": "long", "direction": "below", "targetPrice": 999999,
                            "sizeUsd": 25, "leverage": 2, "mode": "paper"},
                      headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text
    dep_id = r.json()["deployment"]["id"]
    deadline = time.time() + 90
    while time.time() < deadline:
        deps = requests.get(f"{API}/deployments", headers=_tok(), timeout=15).json()["deployments"]
        dep = [d for d in deps if d["id"] == dep_id][0]
        if dep["status"] == "stopped":
            msgs = [e["msg"] for e in dep.get("events", [])]
            assert any("paper long ETH" in m for m in msgs), msgs
            assert any("one-shot" in m for m in msgs), msgs
            return
        time.sleep(6)
    pytest.fail("limit order never fired")


def test_hl_account_has_equity_history():
    r = requests.get(f"{API}/hl/account", headers=_tok(), timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert "equityHistory" in d and isinstance(d["equityHistory"], list)


def test_history_endpoint_shape():
    r = requests.get(f"{API}/history", headers=_tok(), timeout=20)
    assert r.status_code == 200
    for item in r.json()["items"]:
        assert item["type"] in ("swap", "perp", "spot", "engine", "withdraw")
        assert item["title"] and item["at"]
