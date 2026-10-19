"""Backend tests for Weft relay API."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for local test run
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"


def test_health():
    r = requests.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json().get("ok") is True


@pytest.mark.parametrize("path", [
    "stats",
    "strategies",
    "traders",
    "leaderboard",
    "revenue",
    "rewards",
])
def test_relay_get_endpoints(path):
    r = requests.get(f"{API}/relay/{path}", timeout=45)
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
    # Should be JSON parseable
    data = r.json()
    assert data is not None


def test_relay_strategies_shape():
    r = requests.get(f"{API}/relay/strategies", timeout=30)
    assert r.status_code == 200
    data = r.json()
    # upstream returns list or dict with items
    items = data if isinstance(data, list) else data.get("items") or data.get("strategies") or []
    assert len(items) >= 1


def test_relay_ai_generate():
    payload = {"thesis": "Long SOL 3x with $50 if funding above 0.02% an hour. 15% stop."}
    r = requests.post(f"{API}/relay/ai/generate", json=payload, timeout=120)
    # 429 = upstream anon daily cap (expected without auth); 200 = success
    assert r.status_code in (200, 429), f"{r.status_code} {r.text[:300]}"
    data = r.json()
    assert isinstance(data, dict)
    if r.status_code == 200:
        keys = set(data.keys())
        assert keys & {"rules", "strategy", "watches", "when", "does", "id", "name"}, f"keys={keys}"


def test_relay_backtest_eth_long():
    r = requests.post(f"{API}/relay/backtest", json={"strategyId": "eth-long"}, timeout=60)
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    assert isinstance(data, dict)
    # Should contain equityCurve or stats
    assert "equityCurve" in data or "equity_curve" in data or "stats" in data, f"keys={list(data.keys())}"
