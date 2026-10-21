"""Iteration 10 leak audit + per-tab explainer backend tests.

Validates:
  (a) /api/bifrost/v1/app/ and /api/bifrost/v1/_brand/dk-swap.js leak hiding
  (b) /api/ds/tokens scrubbing + opaque image URLs
  (c) /api/bifrost/v1/indexer/v1/assets hides upstream mints
  (d) HTML title / brand strings
"""
import os
import re
import requests

def _load_base():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for ln in f:
                    if ln.startswith("REACT_APP_BACKEND_URL="):
                        v = ln.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL not set"
    return v.rstrip("/")

BASE = _load_base()

HIDDEN_MINTS = [
    "HgTGdc29D5bDMrDvsCLnorxz899VyDj7ZN7FPa6vpump",
    "7KEPApdbBMByrmqihz3bht2uMhFQcatjfSFQCKq66kH3",
]
# Case-insensitive substrings that MUST be absent
FORBIDDEN_CI = ["veilit", "darkswap", "houdini", "contractwolf"]


def _ci_count(hay: str, needle: str) -> int:
    return len(re.findall(re.escape(needle), hay, flags=re.IGNORECASE))


def test_app_html_no_leaks():
    r = requests.get(f"{BASE}/api/bifrost/v1/app/", timeout=30)
    assert r.status_code == 200, r.status_code
    body = r.text
    # Capitalized "Veil" must be absent in visible strings
    assert "Veil" not in body, f"Found 'Veil' {body.count('Veil')} times in /app HTML"
    for term in FORBIDDEN_CI:
        c = _ci_count(body, term)
        assert c == 0, f"Found '{term}' {c} times (case-insensitive) in /app HTML"
    # Title should be Cadabra App
    m = re.search(r"<title>([^<]+)</title>", body)
    assert m and "NullCash" in m.group(1), f"title: {m.group(1) if m else None}"
    # Jupiter should not be visible as a brand name in HTML head/body text
    # (allow references inside base64 blobs — just check the title/meta regions)
    head = body[: body.lower().find("</head>")] if "</head>" in body.lower() else body[:5000]
    assert "Jupiter" not in head, "Jupiter brand leak in head"


def test_dk_swap_js_no_leaks():
    r = requests.get(f"{BASE}/api/bifrost/v1/_brand/dk-swap.js", timeout=30)
    assert r.status_code == 200, r.status_code
    body = r.text
    assert "Veil" not in body, "Capital 'Veil' in dk-swap.js"
    for term in FORBIDDEN_CI:
        c = _ci_count(body, term)
        assert c == 0, f"'{term}' x{c} in dk-swap.js"


def test_ds_tokens_source_scrubbed():
    r = requests.get(f"{BASE}/api/ds/tokens?side=source", timeout=30)
    assert r.status_code == 200
    body = r.text
    assert "houdini" not in body.lower()
    assert "darkswap" not in body.lower()
    data = r.json()
    # icon URLs opaque
    tokens = data if isinstance(data, list) else data.get("tokens") or data.get("items") or []
    assert tokens, "no tokens returned"
    sample = [t for t in tokens[:20] if isinstance(t, dict)]
    icon_url = None
    for t in sample:
        for k in ("icon", "logo", "logoURI", "image"):
            if isinstance(t.get(k), str) and t[k].startswith("http"):
                icon_url = t[k]
                break
        if icon_url:
            break
    if icon_url:
        assert "/api/bifrost/v1/_img?k=" in icon_url, f"icon not opaque: {icon_url}"


def test_ds_tokens_destination_usdc_scrubbed():
    r = requests.get(f"{BASE}/api/ds/tokens?side=destination&term=usdc", timeout=30)
    assert r.status_code == 200
    body = r.text
    assert "houdini" not in body.lower()
    assert "darkswap" not in body.lower()


def test_opaque_image_endpoint_loads():
    # Grab a token with an icon then fetch it
    r = requests.get(f"{BASE}/api/ds/tokens?side=source", timeout=30)
    data = r.json()
    tokens = data if isinstance(data, list) else data.get("tokens") or data.get("items") or []
    url = None
    for t in tokens:
        if not isinstance(t, dict):
            continue
        for k in ("icon", "logo", "logoURI", "image"):
            v = t.get(k)
            if isinstance(v, str) and "/api/bifrost/v1/_img?k=" in v:
                url = v
                break
        if url:
            break
    if not url:
        import pytest
        pytest.skip("no opaque icon URL found in sample")
    # URL may be relative
    if url.startswith("/"):
        url = BASE + url
    ir = requests.get(url, timeout=30)
    assert ir.status_code == 200, ir.status_code
    assert ir.headers.get("content-type", "").startswith("image/"), ir.headers.get("content-type")


def test_indexer_assets_hides_upstream_mints():
    r = requests.get(f"{BASE}/api/bifrost/v1/indexer/v1/assets", timeout=30)
    assert r.status_code == 200, r.status_code
    body = r.text
    for mint in HIDDEN_MINTS:
        assert mint not in body, f"hidden mint {mint} leaked in indexer assets"
