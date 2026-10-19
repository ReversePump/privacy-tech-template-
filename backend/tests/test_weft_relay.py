"""Backend tests for relay API + wallet auth."""
import json
import os
import pytest
import requests

from solders.keypair import Keypair

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"


# ---------- health & relay regression ----------
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
    data = r.json()
    assert data is not None


def test_relay_strategies_shape():
    r = requests.get(f"{API}/relay/strategies", timeout=30)
    assert r.status_code == 200
    data = r.json()
    items = data if isinstance(data, list) else data.get("items") or data.get("strategies") or []
    assert len(items) >= 1


def test_relay_ai_generate():
    payload = {"thesis": "Long SOL 3x with $50 if funding above 0.02% an hour. 15% stop."}
    r = requests.post(f"{API}/relay/ai/generate", json=payload, timeout=120)
    assert r.status_code in (200, 429), f"{r.status_code} {r.text[:300]}"
    data = r.json()
    assert isinstance(data, dict)
    if r.status_code == 200:
        keys = set(data.keys())
        assert keys & {"rules", "strategy", "watches", "when", "does", "id", "name"}, f"keys={keys}"


def test_relay_backtest_eth_long():
    r = requests.post(f"{API}/relay/backtest", json={"strategyId": "eth-long"}, timeout=60)
    if r.status_code == 429:  # upstream anonymous daily quota
        pytest.skip("upstream rate limit")
    assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
    data = r.json()
    assert isinstance(data, dict)
    assert "equityCurve" in data or "equity_curve" in data or "stats" in data


# ---------- auth: challenge / verify / sessions ----------
def _test_keypair() -> Keypair:
    # fresh keypair per test — a fixed wallet races when xdist runs tests in parallel
    return Keypair()


def test_auth_challenge_shape():
    kp = _test_keypair()
    wallet = str(kp.pubkey())
    r = requests.post(f"{API}/auth/challenge", json={"wallet": wallet}, timeout=15)
    assert r.status_code == 200, r.text
    msg = r.json().get("message", "")
    assert msg.startswith("Loom sign-in\n"), msg
    assert f"wallet: {wallet}" in msg
    assert "nonce: " in msg


def test_auth_challenge_requires_wallet():
    r = requests.post(f"{API}/auth/challenge", json={}, timeout=15)
    assert r.status_code == 400


def test_auth_verify_bad_signature():
    kp = _test_keypair()
    wallet = str(kp.pubkey())
    # Request a challenge first
    requests.post(f"{API}/auth/challenge", json={"wallet": wallet}, timeout=15)
    # Submit a wrong signature (sign unrelated bytes)
    bad_sig = str(kp.sign_message(b"not the challenge"))
    r = requests.post(f"{API}/auth/verify", json={"wallet": wallet, "signature": bad_sig}, timeout=15)
    assert r.status_code == 401, r.text
    assert "bad_signature" in r.text


def test_auth_verify_replay_after_consumption():
    kp = _test_keypair()
    wallet = str(kp.pubkey())
    # Fresh challenge
    ch = requests.post(f"{API}/auth/challenge", json={"wallet": wallet}, timeout=15).json()
    message = ch["message"].encode()
    sig = str(kp.sign_message(message))
    # First verify should succeed
    r1 = requests.post(f"{API}/auth/verify", json={"wallet": wallet, "signature": sig}, timeout=15)
    assert r1.status_code == 200, r1.text
    data = r1.json()
    assert "token" in data and data["wallet"] == wallet
    # Replay same signature → challenge is consumed → 400 no_challenge
    r2 = requests.post(f"{API}/auth/verify", json={"wallet": wallet, "signature": sig}, timeout=15)
    assert r2.status_code == 400, r2.text
    assert "no_challenge" in r2.text


def test_me_strategies_requires_auth():
    r = requests.get(f"{API}/me/strategies", timeout=15)
    assert r.status_code == 401
    assert "sign_in_required" in r.text


def test_me_strategies_with_token():
    kp = _test_keypair()
    wallet = str(kp.pubkey())
    ch = requests.post(f"{API}/auth/challenge", json={"wallet": wallet}, timeout=15).json()
    sig = str(kp.sign_message(ch["message"].encode()))
    tok = requests.post(f"{API}/auth/verify", json={"wallet": wallet, "signature": sig}, timeout=15).json()["token"]
    r = requests.get(f"{API}/me/strategies", headers={"Authorization": f"Bearer {tok}"}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "strategies" in data and isinstance(data["strategies"], list)
