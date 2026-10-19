"""Backend tests for email/password auth + custodial Solana + EVM/Hyperliquid wallets."""
import os
import re
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

EVM_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
SOL_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")

# Fresh unique email per run so this suite is idempotent across retries
EMAIL = f"testagent_{int(time.time())}@loom.test"
PASSWORD = "agentpass123"

_state = {}


# --- email register ---
def test_register_short_password():
    r = requests.post(f"{API}/auth/email/register",
                      json={"email": f"short_{int(time.time())}@loom.test", "password": "short"}, timeout=20)
    assert r.status_code == 400
    assert "password_too_short" in r.text


def test_register_ok():
    r = requests.post(f"{API}/auth/email/register",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["email"] == EMAIL
    assert SOL_RE.match(data["wallet"]), data["wallet"]
    # security: no key material
    low = r.text.lower()
    for leak in ("encsecret", "encevmsecret", "passhash", "privatekey", "private_key", "secretkey"):
        assert leak not in low, f"leak in response: {leak}"
    _state["token"] = data["token"]
    _state["wallet"] = data["wallet"]


def test_register_duplicate():
    r = requests.post(f"{API}/auth/email/register",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 409
    assert "email_taken" in r.text


# --- email login ---
def test_login_bad_password():
    r = requests.post(f"{API}/auth/email/login",
                      json={"email": EMAIL, "password": "wrongwrong"}, timeout=20)
    assert r.status_code == 401
    assert "invalid_credentials" in r.text


def test_login_ok():
    r = requests.post(f"{API}/auth/email/login",
                      json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == EMAIL
    assert data["wallet"] == _state["wallet"]
    assert "token" in data


# --- /me/local ---
def _h():
    return {"Authorization": f"Bearer {_state['token']}"}


def test_me_local_unauth():
    r = requests.get(f"{API}/me/local", timeout=15)
    assert r.status_code == 401


def test_me_local_ok():
    r = requests.get(f"{API}/me/local", headers=_h(), timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == EMAIL
    assert data["wallet"] == _state["wallet"]
    assert data["authType"] == "email"


# --- /wallet (Solana) ---
def test_wallet_info():
    r = requests.get(f"{API}/wallet", headers=_h(), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["address"] == _state["wallet"]
    assert data["sol"] == 0 or isinstance(data["sol"], (int, float))
    # No key material
    assert "encSecret" not in r.text and "privateKey" not in r.text.lower()


# --- /hl/account (EVM) ---
def test_hl_account():
    r = requests.get(f"{API}/hl/account", headers=_h(), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert EVM_RE.match(data["address"]), data["address"]
    assert data["equityUsd"] == 0
    assert data["positions"] == []
    _state["evm"] = data["address"]
    # security
    assert "encEvmSecret" not in r.text and "privatekey" not in r.text.lower()


# --- /hl/markets ---
def test_hl_markets():
    r = requests.get(f"{API}/hl/markets", timeout=30)
    assert r.status_code == 200, r.text
    markets = r.json()["markets"]
    assert isinstance(markets, list) and len(markets) > 0
    syms = {m["symbol"] for m in markets}
    assert "BTC" in syms and "ETH" in syms
    btc = next(m for m in markets if m["symbol"] == "BTC")
    assert btc["price"] > 1000  # real price


# --- unfunded trade & withdraw: must be 4xx not 500 ---
def test_hl_trade_unfunded_clean_error():
    r = requests.post(f"{API}/hl/trade", headers=_h(),
                      json={"symbol": "BTC", "side": "long", "sizeUsd": 15, "leverage": 2}, timeout=45)
    assert r.status_code == 400, f"status={r.status_code} body={r.text[:300]}"
    assert "error" in r.json()


def test_hl_withdraw_unfunded_clean_error():
    r = requests.post(f"{API}/hl/withdraw", headers=_h(),
                      json={"destination": "0x" + "1" * 40, "amountUsd": 5}, timeout=30)
    assert r.status_code == 400, f"status={r.status_code} body={r.text[:300]}"


def test_wallet_trade_unfunded_clean_error():
    USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    r = requests.post(f"{API}/wallet/trade", headers=_h(),
                      json={"outputMint": USDC, "amount": 1000000}, timeout=45)
    assert r.status_code == 400, f"status={r.status_code} body={r.text[:300]}"


def test_wallet_withdraw_unfunded_clean_error():
    r = requests.post(f"{API}/wallet/withdraw", headers=_h(),
                      json={"to": "11111111111111111111111111111111", "amountSol": 0.001}, timeout=30)
    assert r.status_code == 400, f"status={r.status_code} body={r.text[:300]}"


# --- regression: wallet-signature auth challenge still works ---
def test_auth_challenge_regression():
    r = requests.post(f"{API}/auth/challenge",
                      json={"wallet": "3eh2VqePVP1NLHbMvjRfuVBV4EmikQi98WXNc7eMABJQ"}, timeout=15)
    assert r.status_code == 200
    assert "message" in r.json()


def test_relay_stats_regression():
    r = requests.get(f"{API}/relay/stats", timeout=30)
    assert r.status_code == 200


def test_relay_strategies_regression():
    r = requests.get(f"{API}/relay/strategies", timeout=30)
    assert r.status_code == 200
