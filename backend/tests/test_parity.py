"""Parity tests: stop-all kill switch, single-position close, instruct endpoint, new signal kinds."""
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

EMAIL = f"parity_{int(time.time())}@loom.test"
PASSWORD = "paritypass123"

STRATEGY = {
    "schemaVersion": 1, "id": f"parity-{uuid.uuid4().hex[:8]}", "name": "Parity test",
    "thesis": "Long ETH when price above 1",
    "signals": [{"id": "px", "kind": "price", "params": {"instrument": {"symbol": "ETH"}}}],
    "triggers": [{"id": "entry", "when": {"op": "gt", "left": {"ref": "px.price"}, "right": {"value": 1}},
                  "cooldownMinutes": 60}],
    "actions": [{"id": "open", "on": ["entry"], "type": "open",
                 "instrument": {"kind": "perp", "venue": "hyperliquid", "symbol": "ETH"},
                 "side": "long", "size": {"unit": "usd", "value": 50}, "leverage": 2,
                 "exits": {"stopLoss": {"positionPct": 20}, "takeProfit": {"positionPct": 50}},
                 "reentry": "never"}],
}

_s = {}


def _tok():
    return {"Authorization": f"Bearer {_s['token']}"}


def test_setup_account():
    r = requests.post(f"{API}/auth/email/register", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    _s["token"] = r.json()["token"]


def test_new_endpoints_require_auth():
    assert requests.post(f"{API}/account/stop-all", json={}, timeout=15).status_code == 401
    assert requests.post(f"{API}/deployments/x/positions/y/close", json={}, timeout=15).status_code == 401
    assert requests.post(f"{API}/deployments/x/instruct", json={"instruction": "t"}, timeout=15).status_code == 401
    assert requests.get(f"{API}/deployments/x", timeout=15).status_code == 401


def test_deploy_and_get_single():
    r = requests.post(f"{API}/deployments", json={"mode": "paper", "strategy": STRATEGY}, headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text
    _s["dep"] = r.json()["deployment"]["id"]
    r = requests.get(f"{API}/deployments/{_s['dep']}", headers=_tok(), timeout=15)
    assert r.status_code == 200 and r.json()["deployment"]["id"] == _s["dep"]
    assert requests.get(f"{API}/deployments/nope", headers=_tok(), timeout=15).status_code == 404


def test_instruct_validation():
    r = requests.post(f"{API}/deployments/{_s['dep']}/instruct", json={}, headers=_tok(), timeout=15)
    assert r.status_code == 400 and r.json()["error"] == "instruction_required"
    # success path depends on the upstream AI quota; a 400 with a message is acceptable offline behavior
    r = requests.post(f"{API}/deployments/{_s['dep']}/instruct",
                      json={"instruction": "use $100 instead of $50"}, headers=_tok(), timeout=120)
    assert r.status_code in (200, 400), r.text
    if r.status_code == 200:
        assert r.json()["strategy"]["actions"]


def test_position_close_endpoint():
    # wait for the engine to open a paper position (always-true trigger, 25s tick)
    pos = None
    for _ in range(8):
        r = requests.get(f"{API}/paper/account", headers=_tok(), timeout=15)
        positions = r.json().get("positions", [])
        if positions:
            pos = positions[0]
            break
        time.sleep(10)
    assert pos, "engine did not open a paper position within 80s"
    # positionPct exits must be mapped: 20% sl / 2x leverage = 10% price move
    assert pos["slPct"] == pytest.approx(10.0), pos
    assert pos["tpPct"] == pytest.approx(25.0), pos
    r = requests.post(f"{API}/deployments/{_s['dep']}/positions/{pos['id']}/close", json={}, headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text
    r = requests.get(f"{API}/paper/account", headers=_tok(), timeout=15)
    assert not r.json().get("positions"), "position still open after close"
    assert any(h.get("closeReason") == "manual-close" for h in r.json().get("history", []))


def test_stop_all():
    requests.post(f"{API}/deployments", json={"mode": "alerts", "strategy": STRATEGY}, headers=_tok(), timeout=20)
    r = requests.post(f"{API}/account/stop-all", json={}, headers=_tok(), timeout=20)
    assert r.status_code == 200 and r.json()["stopped"] >= 2
    r = requests.get(f"{API}/deployments", headers=_tok(), timeout=15)
    assert all(d["status"] == "stopped" for d in r.json()["deployments"])


def test_sky_moon_signal():
    import sys
    sys.path.insert(0, "/app/backend")
    import asyncio
    import engine
    out = asyncio.run(engine._signal_fields({"kind": "sky", "params": {}}, []))
    assert 0 <= out["age_days"] < 30
    assert 0 <= out["illumination_pct"] <= 100
    assert 0 < out["new_moon"] <= 29.6 * 24
    assert 0 < out["full_moon"] <= 29.6 * 24


def test_space_weather_signal_live():
    import sys
    sys.path.insert(0, "/app/backend")
    import asyncio
    import engine
    out = asyncio.run(engine._signal_fields({"kind": "space_weather", "params": {}}, []))
    assert out, "NOAA Kp feed returned nothing"
    assert 0 <= out["kp"] <= 9
