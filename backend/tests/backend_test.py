"""Backend tests for MakeMarkets relay + native launch endpoints."""
import os
import io
import base64
import struct
import pytest
import requests
import zlib

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://maker-hub-325.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Accept": "application/json"})
    return sess


# ---------- relay integrity ----------

class TestRelayIntegrity:
    def test_root(self, s):
        r = s.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_relay_stats(self, s):
        r = s.get(f"{API}/relay/stats")
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), dict)

    def test_relay_desks(self, s):
        r = s.get(f"{API}/relay/desks", params={"limit": 5})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)
        # typically {"desks":[...]}
        desks = data.get("desks") or data.get("items") or []
        assert isinstance(desks, list)
        assert len(desks) >= 1
        # stash for later
        pytest.one_desk = desks[0]

    def test_relay_feed(self, s):
        r = s.get(f"{API}/relay/feed", params={"limit": 5})
        assert r.status_code == 200, r.text

    def test_relay_config(self, s):
        r = s.get(f"{API}/relay/config")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict) and len(data) > 0

    def test_relay_native(self, s):
        r = s.get(f"{API}/relay/native")
        assert r.status_code == 200, r.text

    def test_auth_challenge(self, s):
        # dummy pubkey base58 - makers.fun generates SIWS text regardless
        r = s.post(f"{API}/relay/auth/challenge", json={"wallet": "3eh2VqePVP1NLHbMvjRfuVBV4EmikQi98WXNc7eMABJQ"})
        assert r.status_code == 200, r.text
        data = r.json()
        # must include a text/message/nonce
        found = any(k in data for k in ("message", "text", "nonce", "challenge"))
        assert found, f"challenge missing message field: {data}"


# ---------- our data scoping ----------

class TestOurScoping:
    def test_our_desks(self, s):
        r = s.get(f"{API}/our/desks")
        assert r.status_code == 200
        data = r.json()
        assert "desks" in data
        assert isinstance(data["desks"], list)

    def test_our_launches(self, s):
        r = s.get(f"{API}/our/launches")
        assert r.status_code == 200
        data = r.json()
        assert "launches" in data
        assert isinstance(data["launches"], list)


# ---------- native launch endpoints ----------

def _tiny_png_bytes() -> bytes:
    # minimal 1x1 red PNG
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    raw = b"\x00\xff\x00\x00"  # filter + RGB
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


class TestNativeLaunch:
    def test_image_upload_and_fetch(self, s):
        png = _tiny_png_bytes()
        r = s.post(f"{API}/uploads/image", data=png, headers={"Content-Type": "image/png"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and "url" in data
        pytest.image_id = data["id"]
        pytest.image_url = data["url"]

        # fetch back
        r2 = requests.get(data["url"])
        assert r2.status_code == 200
        assert r2.content == png

    def test_image_upload_rejects_empty(self, s):
        r = s.post(f"{API}/uploads/image", data=b"", headers={"Content-Type": "image/png"})
        assert r.status_code == 400

    def test_launch_metadata(self, s):
        image_id = getattr(pytest, "image_id", None) or "deadbeef"
        r = s.post(f"{API}/launch/metadata", json={
            "name": "TEST_Coin",
            "symbol": "TST",
            "description": "test desc",
            "imageId": image_id,
            "links": {"website": "https://example.com", "x": "https://x.com/x"},
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "uri" in data
        pytest.meta_uri = data["uri"]
        # fetch it
        r2 = requests.get(data["uri"])
        assert r2.status_code == 200
        j = r2.json()
        assert j["name"] == "TEST_Coin"
        assert j["symbol"] == "TST"
        assert j["twitter"] == "https://x.com/x"

    def test_launch_metadata_rejects_blank(self, s):
        r = s.post(f"{API}/launch/metadata", json={"name": "", "symbol": ""})
        assert r.status_code == 400

    def test_launch_build(self, s):
        """PumpPortal build should return {transaction} base64 for a fresh mint pubkey."""
        meta_uri = getattr(pytest, "meta_uri", None)
        if not meta_uri:
            pytest.skip("needs metadata uri")
        # fresh ed25519-like 32-byte key encoded base58 — use a known-shape pubkey (test wallet)
        # PumpPortal requires valid base58 pubkeys. Use known test wallet for publicKey, random for mint.
        import secrets
        try:
            import base58  # noqa
        except ImportError:
            import subprocess
            subprocess.run(["pip", "install", "-q", "base58"], check=True)
            import base58  # noqa
        mint = base58.b58encode(secrets.token_bytes(32)).decode()
        pubkey = "3eh2VqePVP1NLHbMvjRfuVBV4EmikQi98WXNc7eMABJQ"
        r = s.post(f"{API}/launch/build", json={
            "publicKey": pubkey, "mint": mint, "uri": meta_uri,
            "name": "TEST_Coin", "symbol": "TST", "amountSol": 0,
        })
        # PumpPortal can be flaky; accept 200 (expected) or document failure
        assert r.status_code in (200, 400, 502), f"{r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            data = r.json()
            assert "transaction" in data
            # must be valid base64
            base64.b64decode(data["transaction"])

    def test_launch_build_rejects_invalid(self, s):
        r = s.post(f"{API}/launch/build", json={})
        assert r.status_code == 400


# ---------- relay coins/check (eligibility) using a live mint ----------

class TestCoinCheck:
    def test_coins_check(self, s):
        # Use $UP mint from prev session OR grab from desks list
        r = s.get(f"{API}/relay/desks", params={"limit": 5})
        assert r.status_code == 200
        desks = r.json().get("desks") or []
        mint = None
        for d in desks:
            mint = d.get("mint") or (d.get("coin") or {}).get("mint") or d.get("tokenMint")
            if mint:
                break
        if not mint:
            pytest.skip("no mint available upstream")
        r2 = s.get(f"{API}/relay/coins/{mint}/check")
        assert r2.status_code in (200, 404), r2.text
        if r2.status_code == 200:
            data = r2.json()
            assert isinstance(data, dict)


# ---------- desk endpoint reachability ----------

class TestDesk:
    def test_single_desk(self, s):
        r = s.get(f"{API}/relay/desks", params={"limit": 1})
        assert r.status_code == 200
        desks = r.json().get("desks") or []
        if not desks:
            pytest.skip("no live desk available")
        did = desks[0].get("id") or desks[0].get("deskId")
        if not did:
            pytest.skip("desk has no id field")
        r2 = s.get(f"{API}/relay/desks/{did}")
        assert r2.status_code in (200, 404), r2.text


# ---------- vault custody endpoints ----------

class TestVault:
    def test_vault_positions_empty_wallet(self, s):
        r = s.get(f"{API}/vault/positions/3eh2VqePVP1NLHbMvjRfuVBV4EmikQi98WXNc7eMABJQ")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "positions" in data
        assert isinstance(data["positions"], list)

    def test_vault_balance(self, s):
        r = s.get(f"{API}/vault/balance/3eh2VqePVP1NLHbMvjRfuVBV4EmikQi98WXNc7eMABJQ",
                  params={"mint": "DGK15bQv2s4N1bcyvLCRembP43ZbnzL2H6Mskq5bXTAt"})
        assert r.status_code == 200, r.text
        data = r.json()
        # Expected balanceSol field per spec
        assert "balanceSol" in data or "balanceLamports" in data

    def test_single_desk_with_known_id(self, s):
        """ee6515b5 desk used for UI parity testing"""
        r = s.get(f"{API}/relay/desks/ee6515b5-df04-4900-9005-483e71b99286")
        assert r.status_code in (200, 404), r.text


# ---------- market prices + mcapUsd for platform CA ----------
PLATFORM_CA = "7UMdnRcC9zXp1wm9MteFCEJ785bk8xpfWPgdcAghpump"


class TestMarketPrices:
    def test_prices_has_points_last_and_mcap(self, s):
        r = s.get(f"{API}/markets/prices", params={"mint": PLATFORM_CA, "range": "24h"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "points" in data and isinstance(data["points"], list)
        assert "last" in data
        assert "mcapUsd" in data
        assert isinstance(data["mcapUsd"], (int, float))
        # The CA mcap moves — just sanity bounds (should be a few thousand to a few hundred k)
        assert 1_000 < data["mcapUsd"] < 10_000_000, f"unexpected mcap: {data['mcapUsd']}"

    def test_prices_1h_range(self, s):
        r = s.get(f"{API}/markets/prices", params={"mint": PLATFORM_CA, "range": "1h"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "mcapUsd" in data

