"""Backend tests for the deployments engine (paper / live / alerts), paper account, alerts, copy mode."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = f"engine_{int(time.time())}@loom.test"
PASSWORD = "enginepass123"

# Always-true strategy: ETH price > 1 (fires on first engine tick)
STRATEGY = {
    "schemaVersion": 1, "id": f"test-{uuid.uuid4().hex[:8]}", "name": "Engine test",
    "thesis": "Long ETH when price above 1",
    "signals": [{"id": "px", "kind": "price", "params": {"instrument": {"symbol": "ETH"}}}],
    "triggers": [{"id": "entry", "label": "ETH above 1",
                  "when": {"op": "gt", "left": {"ref": "px.price"}, "right": {"value": 1}},
                  "cooldownMinutes": 60}],
    "actions": [{"id": "open", "on": ["entry"], "type": "open",
                 "instrument": {"kind": "perp", "venue": "hyperliquid", "symbol": "ETH"},
                 "side": "long", "size": {"unit": "usd", "value": 50}, "leverage": 2,
                 "order": {"type": "market"}, "exits": {"stopLoss": {"pct": 50}, "takeProfit": {"pct": 200}},
                 "reentry": "never"}],
}

_s = {}


def _tok():
    return {"Authorization": f"Bearer {_s['token']}"}


def test_setup_account():
    r = requests.post(f"{API}/auth/email/register", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    _s["token"] = r.json()["token"]


def test_deployments_require_auth():
    assert requests.get(f"{API}/deployments", timeout=15).status_code == 401
    assert requests.get(f"{API}/paper/account", timeout=15).status_code == 401
    assert requests.get(f"{API}/alerts/me", timeout=15).status_code == 401


def test_create_paper_deployment():
    r = requests.post(f"{API}/deployments", json={"mode": "paper", "strategy": STRATEGY}, headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text
    dep = r.json()["deployment"]
    _s["dep"] = dep["id"]
    assert dep["mode"] == "paper" and dep["status"] == "active"


def test_invalid_mode_rejected():
    r = requests.post(f"{API}/deployments", json={"mode": "yolo", "strategy": STRATEGY}, headers=_tok(), timeout=20)
    assert r.status_code == 400


def test_engine_fires_and_opens_paper_position():
    """Wait for a real engine tick (~25s): trigger must fire and open a paper ETH long."""
    deadline = time.time() + 90
    while time.time() < deadline:
        r = requests.get(f"{API}/paper/account", headers=_tok(), timeout=15)
        d = r.json()
        if d["positions"]:
            p = d["positions"][0]
            assert p["symbol"] == "ETH" and p["side"] == "long" and p["entryPx"] > 2000
            _s["pos"] = p["id"]
            return
        time.sleep(6)
    pytest.fail("engine never opened the paper position")


def test_deployment_event_log_shows_fill():
    r = requests.get(f"{API}/deployments", headers=_tok(), timeout=15)
    dep = [d for d in r.json()["deployments"] if d["id"] == _s["dep"]][0]
    msgs = [e["msg"] for e in dep.get("events", [])]
    assert any("paper long ETH" in m for m in msgs), msgs


def test_pause_resume_stop():
    assert requests.post(f"{API}/deployments/{_s['dep']}/control", json={"action": "pause"}, headers=_tok(), timeout=15).json()["status"] == "paused"
    assert requests.post(f"{API}/deployments/{_s['dep']}/control", json={"action": "resume"}, headers=_tok(), timeout=15).json()["status"] == "active"
    assert requests.post(f"{API}/deployments/{_s['dep']}/control", json={"action": "stop"}, headers=_tok(), timeout=15).json()["status"] == "stopped"


def test_control_not_found():
    r = requests.post(f"{API}/deployments/nope/control", json={"action": "stop"}, headers=_tok(), timeout=15)
    assert r.status_code == 404


def test_alerts_mode_creates_alert():
    s = dict(STRATEGY)
    s["id"] = f"test-{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/deployments", json={"mode": "alerts", "strategy": s}, headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text
    dep_id = r.json()["deployment"]["id"]
    deadline = time.time() + 90
    try:
        while time.time() < deadline:
            a = requests.get(f"{API}/alerts/me", headers=_tok(), timeout=15).json()
            if a["alerts"]:
                assert a["unread"] >= 1
                r2 = requests.post(f"{API}/alerts/read", headers=_tok(), timeout=15)
                assert r2.status_code == 200
                a2 = requests.get(f"{API}/alerts/me", headers=_tok(), timeout=15).json()
                assert a2["unread"] == 0
                return
            time.sleep(6)
        pytest.fail("no alert arrived from alerts-mode deployment")
    finally:
        requests.post(f"{API}/deployments/{dep_id}/control", json={"action": "stop"}, headers=_tok(), timeout=15)


def test_copy_deployment_validation():
    r = requests.post(f"{API}/deployments", json={"kind": "copy", "mode": "paper", "targetAddress": "not-an-address"}, headers=_tok(), timeout=20)
    assert r.status_code == 400
    r = requests.post(f"{API}/deployments",
                      json={"kind": "copy", "mode": "paper", "targetAddress": "0x0000000000000000000000000000000000000001", "sizeUsd": 100},
                      headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text
    dep_id = r.json()["deployment"]["id"]
    requests.post(f"{API}/deployments/{dep_id}/control", json={"action": "stop"}, headers=_tok(), timeout=15)


def test_live_mode_requires_email_account_note():
    """Live mode is allowed for email accounts; a live order with $0 balance must fail as a clean event, never a 500."""
    s = dict(STRATEGY)
    s["id"] = f"test-{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/deployments", json={"mode": "live", "strategy": s}, headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text  # email account -> allowed
    dep_id = r.json()["deployment"]["id"]
    deadline = time.time() + 90
    try:
        while time.time() < deadline:
            deps = requests.get(f"{API}/deployments", headers=_tok(), timeout=15).json()["deployments"]
            dep = [d for d in deps if d["id"] == dep_id][0]
            errs = [e for e in dep.get("events", []) if e["kind"] == "error"]
            if errs:
                msg = errs[0]["msg"]
                assert "reject" in msg or "fail" in msg or "not funded" in msg or "isn't funded" in msg
                assert "0x" not in msg or "isn't funded" in msg  # raw API wallet dumps must not surface
                return
            time.sleep(6)
        pytest.fail("live deployment with empty wallet produced no error event")
    finally:
        requests.post(f"{API}/deployments/{dep_id}/control", json={"action": "stop"}, headers=_tok(), timeout=15)
