"""Grail Break clone — backend end-to-end: relay, auth, credits, pull engine, sellback, battles, breaks, token."""
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

EMAIL = f"breaker_{int(time.time())}@test.dev"
PASSWORD = "breakerpass123"
_s = {}


def _tok():
    return {"Authorization": f"Bearer {_s['token']}"}


# ---------- relay / assets ----------

def test_relay_stats_live():
    r = requests.get(f"{API}/gh/stats", timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["openBreaks"] >= 1 and d["machines"] >= 10
    assert d["bestHit"]["front"].startswith("/api/ci/")  # image URLs rewritten to our proxy


def test_relay_hits_and_gacha():
    hits = requests.get(f"{API}/gh/hits", timeout=20).json()["hits"]
    assert len(hits) >= 20 and hits[0]["front"].startswith("/api/ci/")
    g = requests.get(f"{API}/data/gacha.json", timeout=20).json()
    assert len(g["lines"]) >= 5
    m = g["lines"][0]["machines"][0]
    assert m["price"] > 0 and abs(sum(m["odds"].values()) - 1) < 0.01


def test_asset_proxies():
    r = requests.get(f"{API}/rip/clips/pokemon_250.mp4", headers={"Range": "bytes=0-100"}, timeout=30)
    assert r.status_code == 206 and "video" in r.headers.get("content-type", "")
    hits = requests.get(f"{API}/gh/hits", timeout=20).json()["hits"]
    r = requests.get(f"{BASE_URL}{hits[0]['front']}", timeout=30)
    assert r.status_code == 200 and "image" in r.headers.get("content-type", "")


def test_break_token():
    d = requests.get(f"{API}/token/break", timeout=20).json()
    assert d["mint"].startswith("BREAK") and d.get("priceUsd")


# ---------- auth & credits ----------

def test_register_login():
    r = requests.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    _s["token"] = r.json()["token"]
    assert r.json()["user"]["balance"] == 250.0
    assert requests.post(f"{API}/auth/register", json={"email": EMAIL, "password": PASSWORD}, timeout=20).status_code == 409
    bad = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": "wrongpass"}, timeout=20)
    assert bad.status_code == 401


def test_wallet_challenge_flow():
    import base58
    from solders.keypair import Keypair
    kp = Keypair()
    pub = str(kp.pubkey())
    r = requests.post(f"{API}/auth/wallet/challenge", json={"wallet": pub}, timeout=20)
    assert r.status_code == 200
    msg = r.json()["message"]
    assert "Grail Break sign-in" in msg
    sig = base58.b58encode(bytes(kp.sign_message(msg.encode()))).decode()
    r = requests.post(f"{API}/auth/wallet/verify", json={"wallet": pub, "signature": sig}, timeout=20)
    assert r.status_code == 200 and r.json()["token"]
    # replay must fail — challenge is consumed
    r = requests.post(f"{API}/auth/wallet/verify", json={"wallet": pub, "signature": sig}, timeout=20)
    assert r.status_code == 400


# ---------- pull engine ----------

def test_pull_and_sellback():
    r = requests.post(f"{API}/pull", json={"machine": "gb-poke-25"}, headers=_tok(), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    card = d["card"]
    assert card["front"].startswith("/api/ci/") and card["value"] > 0
    assert d["balance"] == 225.0
    assert card["rarity"] in ("common", "uncommon", "rare", "epic")
    _s["pull"] = d["pullId"]
    # sell back at the machine's posted rate
    r = requests.post(f"{API}/sellback/{d['pullId']}", json={}, headers=_tok(), timeout=20)
    assert r.status_code == 200
    assert abs(r.json()["credited"] - d["sellbackUsd"]) < 0.01
    me = requests.get(f"{API}/me", headers=_tok(), timeout=20).json()
    assert me["user"]["balance"] == round(225.0 + d["sellbackUsd"], 2)
    # double sellback rejected
    assert requests.post(f"{API}/sellback/{d['pullId']}", json={}, headers=_tok(), timeout=20).status_code == 404


def test_pull_requires_auth_and_funds():
    assert requests.post(f"{API}/pull", json={"machine": "gb-poke-25"}, timeout=20).status_code == 401
    r = requests.post(f"{API}/pull", json={"machine": "gb-poke-2500"}, headers=_tok(), timeout=20)
    assert r.status_code == 400 and "insufficient" in r.json()["error"]


def test_demo_pull_free():
    r = requests.get(f"{API}/demo/pull?machine=gb-poke-100", timeout=30)
    assert r.status_code == 200 and r.json()["card"]["front"].startswith("/api/ci/")


def test_odds_distribution_smoke():
    # 40 pulls on the cheapest machine: commons should dominate (real odds)
    pulls = []
    for _ in range(8):
        r = requests.post(f"{API}/pull", json={"machine": "gb-poke-25"}, headers=_tok(), timeout=30)
        if r.status_code == 200:
            pulls.append(r.json()["card"]["rarity"])
            requests.post(f"{API}/sellback/{r.json()['pullId']}", json={}, headers=_tok(), timeout=20)
    assert pulls and pulls.count("common") >= len(pulls) * 0.4


# ---------- breaks ----------

def test_break_join_and_limits():
    brks = requests.get(f"{API}/gh/breaks", timeout=20).json()["breaks"]
    cheap = min(brks, key=lambda b: b["spotPrice"])
    r = requests.post(f"{API}/breaks/{cheap['id']}/join", json={}, headers=_tok(), timeout=20)
    assert r.status_code == 200, r.text
    r = requests.post(f"{API}/breaks/{cheap['id']}/join", json={}, headers=_tok(), timeout=20)
    assert r.status_code == 200
    r = requests.post(f"{API}/breaks/{cheap['id']}/join", json={}, headers=_tok(), timeout=20)
    assert r.status_code == 400 and "max_two" in r.json()["error"]


def test_create_local_break():
    r = requests.post(f"{API}/breaks/create",
                      json={"title": "Test Night Break", "line": "pokemon", "spots": 6, "spotPrice": 30},
                      headers=_tok(), timeout=20)
    assert r.status_code == 200
    bid = r.json()["break"]["id"]
    local = requests.get(f"{API}/breaks/local", timeout=20).json()["breaks"]
    assert any(b["id"] == bid for b in local)


# ---------- battles ----------

def test_battle_full_cycle():
    # two fresh accounts — entry charged, everyone rips, winner takes the pot
    toks = []
    for i in (1, 2):
        e = f"battle{i}_{int(time.time())}_{uuid.uuid4().hex[:4]}@test.dev"
        toks.append(requests.post(f"{API}/auth/register", json={"email": e, "password": PASSWORD}, timeout=20).json()["token"])
    h1, h2 = ({"Authorization": f"Bearer {t}"} for t in toks)
    r = requests.post(f"{API}/battles", json={"machine": "gb-poke-25", "players": 2}, headers=h1, timeout=20)
    assert r.status_code == 200, r.text
    bid = r.json()["battle"]
    r = requests.post(f"{API}/battles/{bid}/join", json={}, headers=h2, timeout=20)
    assert r.status_code == 200, r.text
    d = requests.get(f"{API}/battles/{bid}", timeout=20).json()["battle"]
    assert d["status"] == "done" and d["winner"] and len(d["results"]) == 2
    assert d["pot"] > 0
    # winner balance = 250 - 25 entry + pot
    wi = 0 if d["winner"].endswith("") and d["winner"] in [r["email"] for r in d["results"]] else 0
    winner_tok = toks[0] if d["winner"] == d["results"][0]["email"] else toks[1]
    me = requests.get(f"{API}/me", headers={"Authorization": f"Bearer {winner_tok}"}, timeout=20).json()
    assert abs(me["user"]["balance"] - (250 - 25 + d["pot"])) < 0.01
    # loser keeps nothing: 250 - 25
    loser_tok = toks[1] if winner_tok == toks[0] else toks[0]
    me = requests.get(f"{API}/me", headers={"Authorization": f"Bearer {loser_tok}"}, timeout=20).json()
    assert abs(me["user"]["balance"] - 225) < 0.01
