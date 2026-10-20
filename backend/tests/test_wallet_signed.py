"""Iter10: new wallet/build_swap + wallet/send_signed endpoints + branding audit + regression."""
import os
import time
import re
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return v.rstrip("/")


BASE = _load_backend_url()
assert BASE, "REACT_APP_BACKEND_URL must be set"

SOL = "So11111111111111111111111111111111111111112"
USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"


@pytest.fixture(scope="module")
def email_session():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/email/login",
               json={"email": "trader1@loom.test", "password": "testpass123"}, timeout=20)
    if r.status_code != 200:
        email = f"testagent_{int(time.time())}@loom.test"
        r = s.post(f"{BASE}/api/auth/email/register",
                   json={"email": email, "password": "agentpass123"}, timeout=20)
        assert r.status_code == 200, f"register failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token")
    assert tok, "no token in auth response"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# --- build_swap ---
def test_build_swap_unauthed():
    r = requests.post(f"{BASE}/api/wallet/build_swap",
                      json={"inputMint": SOL, "outputMint": USDC, "amount": 1000000}, timeout=20)
    assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"


def test_build_swap_invalid_inputs(email_session):
    for bad in [{}, {"inputMint": SOL, "outputMint": USDC, "amount": 0},
                {"inputMint": "", "outputMint": USDC, "amount": 1000000},
                {"inputMint": SOL, "outputMint": USDC, "amount": "junk"}]:
        r = email_session.post(f"{BASE}/api/wallet/build_swap", json=bad, timeout=20)
        assert r.status_code == 400, f"expected 400 for {bad}, got {r.status_code}"


def test_build_swap_success(email_session):
    r = email_session.post(f"{BASE}/api/wallet/build_swap",
                           json={"inputMint": SOL, "outputMint": USDC, "amount": 1_000_000}, timeout=30)
    assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert data.get("ok") is True
    assert isinstance(data.get("swapTransaction"), str) and len(data["swapTransaction"]) > 50
    assert data.get("outAmount")


# --- send_signed ---
def test_send_signed_unauthed():
    r = requests.post(f"{BASE}/api/wallet/send_signed",
                      json={"signedTransaction": "junk"}, timeout=20)
    assert r.status_code == 401


def test_send_signed_empty(email_session):
    r = email_session.post(f"{BASE}/api/wallet/send_signed", json={}, timeout=20)
    assert r.status_code == 400


def test_send_signed_garbage_returns_clean_400(email_session):
    r = email_session.post(f"{BASE}/api/wallet/send_signed",
                           json={"signedTransaction": "AAAAnot_a_real_tx_AAAA=="}, timeout=30)
    assert r.status_code == 400, f"got {r.status_code}: {r.text[:300]}"
    data = r.json()
    assert "error" in data and isinstance(data["error"], str)


# --- regression: unfunded custodial trade/withdraw/hl paths ---
def test_custodial_trade_unfunded_clean_400(email_session):
    r = email_session.post(f"{BASE}/api/wallet/trade",
                           json={"inputMint": SOL, "outputMint": USDC, "amount": 1_000_000}, timeout=40)
    assert r.status_code == 400, f"got {r.status_code}: {r.text[:300]}"
    err = r.json().get("error", "").lower()
    # must reach simulation stage, not fail at route/build
    assert ("debit" in err or "simulation" in err or "credit" in err), f"unexpected error stage: {err}"


def test_custodial_withdraw_unfunded_clean_400(email_session):
    r = email_session.post(f"{BASE}/api/wallet/withdraw",
                           json={"to": "11111111111111111111111111111112", "amountSol": 0.01}, timeout=40)
    assert r.status_code == 400
    assert "error" in r.json()


def test_hl_trade_unfunded_clean(email_session):
    r = email_session.post(f"{BASE}/api/hl/trade",
                           json={"coin": "ETH", "isBuy": True, "sz": 0.01}, timeout=40)
    assert r.status_code in (200, 400), f"got {r.status_code}: {r.text[:300]}"
    # must be clean (not 500)
    if r.status_code == 200:
        # Hyperliquid may return a response payload with error-ish fields
        assert isinstance(r.json(), dict)


def test_hl_withdraw_unfunded_clean(email_session):
    r = email_session.post(f"{BASE}/api/hl/withdraw",
                           json={"destination": "0x0000000000000000000000000000000000000001", "amount": 1}, timeout=40)
    assert r.status_code in (200, 400)


def test_hl_withdraw_bridge_unfunded_clean(email_session):
    r = email_session.post(f"{BASE}/api/hl/withdraw_bridge",
                           json={"destination": "0x0000000000000000000000000000000000000001", "amount": 1}, timeout=40)
    assert r.status_code in (200, 400)


# --- chain liveness ---
def test_wallet_live_balance(email_session):
    r = email_session.get(f"{BASE}/api/wallet", timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert "wallet" in data or "address" in data or "sol" in data or data.get("solBalance") is not None or "solLamports" in data


def test_hl_account_live(email_session):
    r = email_session.get(f"{BASE}/api/hl/account", timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


def test_signals_hero_live():
    r = requests.get(f"{BASE}/api/signals/hero", timeout=20)
    assert r.status_code == 200
    data = r.json()
    for k in ("eth_change_1h", "doge_funding_1h_pct", "fear_greed", "btc_change_24h"):
        assert k in data, f"missing hero metric {k}"
        assert data[k] is not None, f"metric {k} is null"


# --- branding audit ---
def test_treasury_not_in_env():
    with open("/app/backend/.env") as f:
        content = f.read()
    assert "TREASURY_ADDRESS" not in content
    assert "TREASURY_PRIVATE_KEY" not in content


def test_no_old_brand_in_key_material():
    """server.py should not use weft/makers/makemarkets as prefix in key/secret/session/token handling."""
    with open("/app/backend/server.py") as f:
        src = f.read()
    # Find any identifier containing weft/makers/makemarkets that is also related to
    # key/secret/session/token/privkey/wallet-encryption.
    pat = re.compile(r'(weft|makers|makemarkets)[_a-zA-Z]*(key|secret|session|token|privkey|private)',
                     re.IGNORECASE)
    bad = [m.group(0) for m in pat.finditer(src)]
    # Also reverse order
    pat2 = re.compile(r'(key|secret|session|token|privkey|private)[_a-zA-Z]*(weft|makers|makemarkets)',
                      re.IGNORECASE)
    bad += [m.group(0) for m in pat2.finditer(src)]
    assert not bad, f"found old-brand key/secret/session/token identifiers: {bad}"
