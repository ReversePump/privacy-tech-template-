"""Iteration 28: API page removal (302 -> /docs), hidden api links, live relay regression, no hardcoded host."""
import os
import re
import glob
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
BF = f"{BASE_URL}/api/bifrost/v1"
BRANDS = re.compile(r"veil|darkswap|houdini|mayan|cadabra|darkinator", re.I)


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    x.headers.update({"User-Agent": "pytest-iter28"})
    return x


# ---- API page removed: backend redirect ----
@pytest.mark.parametrize("p", ["app/api", "app/api/"])
def test_backend_api_page_302(s, p):
    r = s.get(f"{BF}/{p}", allow_redirects=False, timeout=20)
    print(p, r.status_code, r.headers.get("location"))
    assert r.status_code in (301, 302, 307, 308)
    assert r.headers.get("location", "").rstrip("/").endswith("/docs")


# ---- Mirror /app shell: api links hidden via CSS, redirect shim present ----
def test_app_shell_hides_api_links(s):
    r = s.get(f"{BF}/app", timeout=30)
    assert r.status_code == 200
    import base64
    m = re.search(r"atob\('([A-Za-z0-9+/=]+)'\)", r.text)
    assert m, "encoded shim missing"
    t = base64.b64decode(m.group(1)).decode("utf-8", "ignore")
    assert 'a[href$=\\"/v1/app/api\\"]' in t or 'a[href$="/v1/app/api"]' in t
    assert "/app/api" in t


# ---- React SPA served for /app/api (redirect happens client-side) ----
def test_frontend_app_api_serves_spa(s):
    r = s.get(f"{BASE_URL}/app/api", timeout=20)
    assert r.status_code == 200
    assert "<div id=\"root\"" in r.text


# ---- Live relay regression ----
def test_live_ok_increases(s):
    j1 = s.get(f"{BF}/_live", timeout=20).json()
    time.sleep(5)
    j2 = s.get(f"{BF}/_live", timeout=20).json()
    print(j1, j2)
    assert j1["relay"] == "on"
    assert j2["ok"] > j1["ok"]


# ---- Favicon still NullCash ----
def test_favicon(s):
    r = s.get(f"{BASE_URL}/favicon.ico", timeout=20)
    assert r.status_code == 200


# ---- Custom-domain readiness: no hardcoded preview host ----
def test_no_hardcoded_preview_host():
    files = []
    for pat in ["/app/frontend/src/**/*", "/app/frontend/public/**/*", "/app/backend/*.py", "/app/backend/brand/*"]:
        files += [f for f in glob.glob(pat, recursive=True) if os.path.isfile(f)]
    hits = []
    for f in files:
        try:
            txt = open(f, encoding="utf-8", errors="ignore").read()
        except Exception:
            continue
        if re.search(r"preview\.emergentagent\.com|emergent\.host|1423583d-a7a6", txt):
            hits.append(f)
    assert not hits, hits
