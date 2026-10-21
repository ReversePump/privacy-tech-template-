"""Iteration 9 — verify the perf fixes: small WebP token logos + fast-path redirects (server HTML contains the inline script)."""
import os
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None


BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _load_frontend_env() or '').rstrip('/')
assert BASE_URL, "REACT_APP_BACKEND_URL missing"


class TestLogoDownscale:
    """Upstream token logos must be downscaled to <=96px WebP and small."""

    def test_logo_is_small_webp(self):
        mint = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump"
        r = requests.get(f"{BASE_URL}/api/bifrost/v1/indexer/v1/logo/{mint}", timeout=30)
        assert r.status_code == 200, f"expected 200 got {r.status_code}"
        ct = r.headers.get("content-type", "")
        assert "image/webp" in ct, f"expected image/webp, got {ct}"
        size = len(r.content)
        assert size < 20_000, f"logo too large: {size} bytes (expected <20KB)"
        # WebP magic bytes RIFF....WEBP
        assert r.content[:4] == b"RIFF" and r.content[8:12] == b"WEBP"

    def test_logo_cached_on_second_fetch(self):
        mint = "9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump"
        url = f"{BASE_URL}/api/bifrost/v1/indexer/v1/logo/{mint}"
        r1 = requests.get(url, timeout=30)
        r2 = requests.get(url, timeout=30)
        assert r1.status_code == 200 and r2.status_code == 200
        # Both responses must be the same (cached) small WebP
        assert len(r1.content) == len(r2.content)


class TestFastPathInlineScript:
    """Landing HTML must contain the inline fast-path redirect script so that /app, /swap, /track, /about redirect BEFORE React boots."""

    def test_index_contains_fast_path(self):
        r = requests.get(f"{BASE_URL}/", timeout=30)
        assert r.status_code == 200
        html = r.text
        assert "/api/bifrost/v1/" in html, "fast-path backend prefix missing"
        # Check for the redirect targets
        assert "'/swap'" in html or '"/swap"' in html
        assert "/track" in html
        assert "/about" in html


class TestAppMirror:
    """The /api/bifrost/v1/app/ shim must return 200 HTML (reveal content at DOMContentLoaded)."""

    def test_app_shim_loads(self):
        r = requests.get(f"{BASE_URL}/api/bifrost/v1/app/", timeout=30)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "")
