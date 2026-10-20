import os
import logging
import uuid
import json as _json
import random
import re
import time
import asyncio
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("server")

ORIGIN = os.environ.get("CARDS_ORIGIN_URL")  # public card-breaks data source, env-configured

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
mongo = AsyncIOMotorClient(MONGO_URL)
db = mongo[DB_NAME]

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
api_router = APIRouter(prefix="/api")

_http = httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=15.0), follow_redirects=True)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _err(msg, status=400):
    return Response(_json.dumps({"error": msg}), status_code=status, media_type="application/json")


# ---------- asset & data proxy (public origin) ----------

_cache = {}


async def _cached_get(url, ttl):
    ent = _cache.get(url)
    if ent and time.time() - ent[0] < ttl:
        return ent[1]
    r = await _http.get(url)
    if r.status_code == 200:
        _cache[url] = (time.time(), r.json())
        return _cache[url][1]
    return ent[1] if ent else None


@api_router.get("/gh/{path:path}")
async def gh_proxy(path: str, request: Request):
    """Read-only relay of the public breaks data API. Card/pack image URLs rewritten to our proxy."""
    url = f"{ORIGIN}/api/gh/{path}"
    if request.url.query:
        url += "?" + request.url.query
    r = await _http.get(url)
    body = r.content
    if "json" in r.headers.get("content-type", ""):
        body = (r.text
                .replace(f"{ORIGIN}/ci/", "/api/ci/")
                .replace(f"{ORIGIN}/img/", "/api/img/")
                .encode())
    return Response(body, status_code=r.status_code, media_type="application/json")


@api_router.get("/data/{path:path}")
async def data_proxy(path: str):
    r = await _http.get(f"{ORIGIN}/data/{path}")
    body = r.content
    if "json" in r.headers.get("content-type", ""):
        body = (r.text
                .replace(f"{ORIGIN}/ci/", "/api/ci/")
                .replace(f"{ORIGIN}/img/", "/api/img/")
                .encode())
    return Response(body, status_code=r.status_code, media_type="application/json")


RIP_CACHE = Path("/tmp/rip_transcode_cache")
RIP_CACHE.mkdir(exist_ok=True)


def _ffmpeg_bin():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


async def _transcode_rip(src_path, src_ext, out_ext, ff_args, media_type):
    """Transcode a rip asset to an open codec (browsers without H.264/AAC support). Cached on disk."""
    out = RIP_CACHE / (src_path.replace("/", "_") + "." + out_ext)
    if not out.exists():
        ff = _ffmpeg_bin()
        if not ff:
            return _err("transcoder unavailable", 502)
        r = await _http.get(f"{ORIGIN}/rip/{src_path}.{src_ext}")
        if r.status_code != 200:
            return Response(status_code=r.status_code)
        tmp_in = RIP_CACHE / (out.name + ".in." + src_ext)
        tmp_in.write_bytes(r.content)
        proc = await asyncio.create_subprocess_exec(ff, "-y", "-i", str(tmp_in), *ff_args, str(out))
        await proc.wait()
        try:
            tmp_in.unlink()
        except OSError:
            pass
    if not out.exists():
        return _err("transcode failed", 502)
    return FileResponse(out, media_type=media_type, headers={"Cache-Control": "public, max-age=86400"})


@api_router.get("/rip/{path:path}")
async def rip_proxy(path: str, request: Request):
    """Rip-stage clips and SFX — streamed, Range-aware so video scrubbing works.
    .webm/.ogg variants are transcoded on demand for browsers without H.264/MP3 support."""
    if path.endswith(".webm") and path.startswith("clips/"):
        return await _transcode_rip(path[:-5], "mp4", "webm",
                                    ["-c:v", "libvpx-vp9", "-crf", "40", "-b:v", "0",
                                     "-deadline", "realtime", "-cpu-used", "6",
                                     "-c:a", "libopus", "-b:a", "96k"],
                                    "video/webm")
    if path.endswith(".ogg") and path.startswith("sfx/"):
        return await _transcode_rip(path[:-4], "mp3", "ogg",
                                    ["-c:a", "libvorbis", "-q:a", "4"], "audio/ogg")
    url = f"{ORIGIN}/rip/{path}"
    if request.url.query:
        url += "?" + request.url.query
    headers = {}
    if request.headers.get("range"):
        headers["range"] = request.headers["range"]
    req = _http.build_request("GET", url, headers=headers)
    r = await _http.send(req, stream=True)
    out_headers = {"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400"}
    for h in ("content-length", "content-range"):
        if r.headers.get(h):
            out_headers[h.title()] = r.headers[h]
    return StreamingResponse(r.aiter_raw(), status_code=r.status_code,
                             media_type=r.headers.get("content-type", "application/octet-stream"),
                             headers=out_headers)


@api_router.get("/ci/{path:path}")
async def ci_proxy(path: str):
    r = await _http.get(f"{ORIGIN}/ci/{path}")
    return Response(r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type", "image/avif"),
                    headers={"Cache-Control": "public, max-age=86400"})


@api_router.get("/img/{path:path}")
async def img_proxy(path: str):
    r = await _http.get(f"{ORIGIN}/img/{path}")
    return Response(r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type", "image/png"),
                    headers={"Cache-Control": "public, max-age=3600"})


# ---------- local accounts & credits ----------

START_CREDITS = 250.0

auth_router = APIRouter(prefix="/api")


async def _session_user(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        return None
    s = await db.gb_sessions.find_one({"token": token})
    if not s:
        return None
    return await db.gb_users.find_one({"email": s["email"]})


def _pub_user(u):
    return {"email": u["email"], "name": u["email"].split("@")[0],
            "balance": round(u.get("balance", 0), 2), "createdAt": u.get("createdAt")}


@auth_router.post("/auth/register")
async def register(request: Request):
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""
    if not re.match(r"[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return _err("invalid_email")
    if len(password) < 8:
        return _err("password_too_short")
    if await db.gb_users.find_one({"email": email}):
        return _err("email_taken", 409)
    import hashlib
    user = {"email": email, "passHash": hashlib.sha256(password.encode()).hexdigest(),
            "balance": START_CREDITS, "createdAt": _now()}
    await db.gb_users.insert_one(user)
    token = uuid.uuid4().hex
    await db.gb_sessions.insert_one({"token": token, "email": email, "createdAt": _now()})
    return {"token": token, "user": _pub_user(user)}


@auth_router.post("/auth/login")
async def login(request: Request):
    import hashlib
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    u = await db.gb_users.find_one({"email": email})
    if not u or u["passHash"] != hashlib.sha256((body.get("password") or "").encode()).hexdigest():
        return _err("invalid_credentials", 401)
    token = uuid.uuid4().hex
    await db.gb_sessions.insert_one({"token": token, "email": email, "createdAt": _now()})
    return {"token": token, "user": _pub_user(u)}


@auth_router.get("/me")
async def me(request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    seats = await db.gb_seats.count_documents({"email": u["email"]})
    pulls = await db.gb_pulls.count_documents({"email": u["email"]})
    return {"user": _pub_user(u), "seats": seats, "pulls": pulls,
            "startCredits": START_CREDITS}


@auth_router.post("/me/topup")
async def topup(request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    await db.gb_users.update_one({"email": u["email"]}, {"$inc": {"balance": START_CREDITS}})
    return {"ok": True, "balance": round(u.get("balance", 0) + START_CREDITS, 2)}


# ---------- gacha pull engine (real odds, real card pool) ----------

RARITY_ORDER = ["common", "uncommon", "rare", "epic"]

_card_pool = {"at": 0.0, "hits": []}


async def _get_card_pool():
    """Real pulled cards from the public hits feed — the outcome pool. Refreshed every 5 min."""
    if time.time() - _card_pool["at"] < 300 and _card_pool["hits"]:
        return _card_pool["hits"]
    hits = []
    for url in (f"{ORIGIN}/api/gh/hits", f"{ORIGIN}/api/gh/hall?limit=400"):
        try:
            d = await _cached_get(url, 120)
            if not d:
                continue
            items = d.get("hits") or d.get("entries") or []
            for h in items:
                card = h.get("card") if isinstance(h.get("card"), dict) else h
                if card.get("front") and card.get("value"):
                    front = card["front"].replace(f"{ORIGIN}/ci/", "/api/ci/")
                    back = (card.get("back") or "").replace(f"{ORIGIN}/ci/", "/api/ci/") or None
                    hits.append({
                        "front": front, "back": back,
                        "name": card.get("name"), "full": card.get("full"),
                        "value": float(card["value"]), "rarity": (card.get("rarity") or "common").lower(),
                        "year": card.get("year"), "grader": card.get("grader"),
                        "grade": card.get("grade"), "set": card.get("set"),
                        "code": card.get("code") or "",
                    })
        except Exception as e:
            logger.warning(f"card pool: {e}")
    # dedupe by front image
    seen, pool = set(), []
    for c in hits:
        if c["front"] in seen:
            continue
        seen.add(c["front"])
        pool.append(c)
    if pool:
        _card_pool.update({"at": time.time(), "hits": pool})
    return _card_pool["hits"]


def _line_prefix(machine, line_id):
    """Card code prefix for a machine's line: pokemon_25 → pokemon, sports_500 → sports."""
    twin = machine.get("twin") or ""
    m = re.match(r"([a-z]+)_", twin)
    if m:
        return m.group(1)
    return {"onepiece": "onepiece", "dragonball": "dragonball", "riftbound": "riftbound",
            "watches": "ewatch", "anime": "pokemon"}.get(line_id, line_id)


def _roll_rarity(odds):
    r = random.random()
    acc = 0.0
    for tier in reversed(RARITY_ORDER):  # epic last in dict order — accumulate from rarest
        p = odds.get(tier, 0)
        if r >= 1 - acc - p:
            return tier
        acc += p
    # fallback: explicit walk in order
    acc = 0.0
    for tier in RARITY_ORDER:
        acc += odds.get(tier, 0)
        if r < acc:
            return tier
    return "common"


async def _pick_card(machine, line_id):
    """Roll rarity on the machine's real odds, then draw a real card whose value sits in the tier's range."""
    odds = machine.get("odds") or {}
    tiers = machine.get("tiers") or {}
    rarity = _roll_rarity(odds)
    tr = tiers.get(rarity) or {}
    lo, hi = float(tr.get("start", 0)), float(tr.get("end", 1e9))
    pool = await _get_card_pool()
    prefix = _line_prefix(machine, line_id)
    line_pool = [c for c in pool if c["code"].startswith(prefix)] or pool
    picks = [c for c in line_pool if lo <= c["value"] <= hi]
    if not picks:  # widen: same rarity anywhere, then any card in range
        picks = [c for c in line_pool if c["rarity"] == rarity] or [c for c in pool if lo <= c["value"] <= hi] or pool
    card = dict(random.choice(picks)) if picks else None
    if card:
        card["rarity"] = rarity  # the roll decides the tier — the light never fakes
    return card, rarity


@auth_router.post("/pull")
async def pull(request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    body = await request.json()
    machine_id = body.get("machine")
    gacha = await _cached_get(f"{ORIGIN}/data/gacha.json", 300)
    machine, line_id = None, None
    for line in (gacha or {}).get("lines", []):
        for m in line.get("machines", []):
            if m["id"] == machine_id and m.get("live", True):
                machine, line_id = m, line["id"]
                break
    if not machine:
        return _err("unknown_machine", 404)
    price = float(machine["price"])
    if u.get("balance", 0) < price:
        return _err(f"insufficient_credits — this pack costs ${price:.0f}, your balance is ${u.get('balance', 0):.2f}", 400)
    card, rarity = await _pick_card(machine, line_id)
    if not card:
        return _err("no_cards_available", 503)
    pid = uuid.uuid4().hex[:16]
    doc = {"id": pid, "email": u["email"], "machine": machine_id, "machineName": machine["name"],
           "line": line_id, "price": price, "card": card, "rarity": rarity,
           "buybackPct": float(machine.get("buyback", 85)), "status": "kept", "at": _now()}
    await db.gb_pulls.insert_one(doc)
    await db.gb_users.update_one({"email": u["email"]}, {"$inc": {"balance": -price}})
    card = dict(card)
    card["machine"] = machine["name"]
    return {"ok": True, "pullId": pid, "card": card, "balance": round(u.get("balance", 0) - price, 2),
            "sellbackUsd": round(price * doc["buybackPct"] / 100, 2)}


@auth_router.post("/sellback/{pull_id}")
async def sellback(pull_id: str, request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    p = await db.gb_pulls.find_one({"id": pull_id, "email": u["email"], "status": "kept"})
    if not p:
        return _err("not_found", 404)
    amount = round(p["price"] * p["buybackPct"] / 100, 2)
    await db.gb_pulls.update_one({"id": pull_id}, {"$set": {"status": "sold_back", "soldAt": _now(), "soldFor": amount}})
    await db.gb_users.update_one({"email": u["email"]}, {"$inc": {"balance": amount}})
    return {"ok": True, "credited": amount}


@auth_router.get("/collection")
async def collection(request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    pulls = await db.gb_pulls.find({"email": u["email"]}, {"_id": 0}).sort("at", -1).to_list(200)
    kept = [p for p in pulls if p["status"] == "kept"]
    return {"pulls": pulls, "keptValue": round(sum(p["card"]["value"] for p in kept), 2),
            "kept": len(kept), "total": len(pulls)}


# ---------- breaks: seats with credits ----------

@auth_router.post("/breaks/{break_id}/join")
async def join_break(break_id: str, request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    d = await _cached_get(f"{ORIGIN}/api/gh/breaks", 60)
    brk = next((b for b in (d or {}).get("breaks", []) if b["id"] == break_id), None)
    if not brk:
        return _err("unknown_break", 404)
    price = float(brk["spotPrice"])
    mine = await db.gb_seats.count_documents({"email": u["email"], "breakId": break_id})
    if mine >= 2:
        return _err("max_two_seats_per_break", 400)
    if u.get("balance", 0) < price:
        return _err(f"insufficient_credits — a seat costs ${price:.0f}, your balance is ${u.get('balance', 0):.2f}", 400)
    await db.gb_seats.insert_one({"email": u["email"], "breakId": break_id, "title": brk["title"],
                                  "price": price, "at": _now()})
    await db.gb_users.update_one({"email": u["email"]}, {"$inc": {"balance": -price}})
    return {"ok": True, "break": brk["title"], "seatPrice": price}


@auth_router.get("/me/seats")
async def my_seats(request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    seats = await db.gb_seats.find({"email": u["email"]}, {"_id": 0}).sort("at", -1).to_list(50)
    return {"seats": seats}


# ---------- battle slabs (local, credits) ----------

@auth_router.post("/battles")
async def create_battle(request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    body = await request.json()
    machine_id, players = body.get("machine"), min(max(int(body.get("players") or 2), 2), 20)
    gacha = await _cached_get(f"{ORIGIN}/data/gacha.json", 300)
    machine, line_id = None, None
    for line in (gacha or {}).get("lines", []):
        for m in line.get("machines", []):
            if m["id"] == machine_id and m.get("live", True):
                machine, line_id = m, line["id"]
    if not machine:
        return _err("unknown_machine", 404)
    price = float(machine["price"])
    if u.get("balance", 0) < price:
        return _err(f"insufficient_credits — entry is ${price:.0f}", 400)
    bid = uuid.uuid4().hex[:8]
    await db.gb_battles.insert_one({"id": bid, "machine": machine_id, "machineName": machine["name"],
                                    "line": line_id, "price": price, "players": players,
                                    "entries": [{"email": u["email"], "at": _now()}],
                                    "status": "open", "createdAt": _now(), "by": u["email"]})
    await db.gb_users.update_one({"email": u["email"]}, {"$inc": {"balance": -price}})
    return {"ok": True, "battle": bid}


@auth_router.post("/battles/{bid}/join")
async def join_battle(bid: str, request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    b = await db.gb_battles.find_one({"id": bid, "status": "open"})
    if not b:
        return _err("not_found_or_started", 404)
    if any(e["email"] == u["email"] for e in b["entries"]):
        return _err("already_in", 400)
    if u.get("balance", 0) < b["price"]:
        return _err(f"insufficient_credits — entry is ${b['price']:.0f}", 400)
    await db.gb_battles.update_one({"id": bid}, {"$push": {"entries": {"email": u["email"], "at": _now()}}})
    await db.gb_users.update_one({"email": u["email"]}, {"$inc": {"balance": -b["price"]}})
    b = await db.gb_battles.find_one({"id": bid})
    if len(b["entries"]) >= b["players"]:
        await _run_battle(b)
    return {"ok": True, "entries": len(b["entries"]), "players": b["players"]}


async def _run_battle(b):
    """Everyone rips the same machine; best slab takes the pot (sum of all values)."""
    gacha = await _cached_get(f"{ORIGIN}/data/gacha.json", 300)
    machine = None
    for line in gacha.get("lines", []):
        for m in line.get("machines", []):
            if m["id"] == b["machine"]:
                machine = m
    results = []
    for e in b["entries"]:
        card, rarity = await _pick_card(machine, b["line"])
        results.append({"email": e["email"], "card": card, "rarity": rarity})
    winner = max(results, key=lambda r: r["card"]["value"] if r["card"] else 0)
    pot = round(sum(r["card"]["value"] for r in results if r["card"]), 2)
    await db.gb_battles.update_one({"id": b["id"]}, {"$set": {
        "status": "done", "results": results, "winner": winner["email"], "pot": pot, "finishedAt": _now()}})
    await db.gb_users.update_one({"email": winner["email"]}, {"$inc": {"balance": pot}})


@auth_router.get("/battles")
async def list_battles(request: Request):
    u = await _session_user(request)
    q = {"status": "open"}
    out = await db.gb_battles.find(q, {"_id": 0}).sort("createdAt", -1).to_list(20)
    mine = []
    if u:
        mine = await db.gb_battles.find({"entries.email": u["email"]}, {"_id": 0}).sort("createdAt", -1).to_list(20)
    return {"open": out, "mine": mine}


@auth_router.get("/battles/{bid}")
async def get_battle(bid: str):
    b = await db.gb_battles.find_one({"id": bid}, {"_id": 0})
    if not b:
        return _err("not_found", 404)
    return {"battle": b}


# ---------- $BREAK token + Solana wallet auth ----------

BREAK_MINT = "BREAKLm9nsBW8M5ZTk52EUpwSC5cdCepdjUMSPnCxTgd"
_break_price_cache = {"at": 0.0, "data": None}


@api_router.get("/demo/pull")
async def demo_pull(machine: str = "gb-poke-25"):
    """Free demo pull — a real card from the machine's real odds. No account, no credits, nothing kept."""
    gacha = await _cached_get(f"{ORIGIN}/data/gacha.json", 300)
    for line in (gacha or {}).get("lines", []):
        for m in line.get("machines", []):
            if m["id"] == machine:
                card, rarity = await _pick_card(m, line["id"])
                if not card:
                    return _err("no_cards_available", 503)
                return {"card": card, "rarity": rarity, "machine": m["name"], "price": m["price"]}
    return _err("unknown_machine", 404)


@api_router.get("/token/break")
async def break_token():
    """Live $BREAK market data (DexScreener). Cached 60s."""
    now = time.time()
    if _break_price_cache["data"] and now - _break_price_cache["at"] < 60:
        return _break_price_cache["data"]
    out = {"mint": BREAK_MINT, "symbol": "BREAK"}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(f"https://api.dexscreener.com/latest/dex/tokens/{BREAK_MINT}")
            pairs = r.json().get("pairs") or []
        if pairs:
            p = max(pairs, key=lambda x: (x.get("liquidity") or {}).get("usd") or 0)
            out.update({
                "priceUsd": float(p["priceUsd"]) if p.get("priceUsd") else None,
                "change24hPct": (p.get("priceChange") or {}).get("h24"),
                "volume24hUsd": (p.get("volume") or {}).get("h24"),
                "liquidityUsd": (p.get("liquidity") or {}).get("usd"),
                "marketCapUsd": p.get("marketCap"), "pairUrl": p.get("url"),
            })
    except Exception as e:
        logger.warning(f"break token: {e}")
    _break_price_cache.update({"at": now, "data": out})
    return out


@auth_router.post("/auth/wallet/challenge")
async def wallet_challenge(request: Request):
    body = await request.json()
    wallet = (body.get("wallet") or "").strip()
    if not re.match(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$", wallet):
        return _err("invalid_wallet", 400)
    nonce = uuid.uuid4().hex[:12]
    msg = f"Grail Break sign-in\nwallet: {wallet}\nnonce: {nonce}"
    await db.gb_challenges.update_one({"wallet": wallet},
                                      {"$set": {"msg": msg, "at": time.time()}}, upsert=True)
    return {"message": msg}


@auth_router.post("/auth/wallet/verify")
async def wallet_verify(request: Request):
    body = await request.json()
    wallet, sig = body.get("wallet", ""), body.get("signature", "")
    ch = await db.gb_challenges.find_one({"wallet": wallet})
    if not ch or time.time() - ch["at"] > 600:
        return _err("challenge_expired", 400)
    try:
        import base58 as _b58
        from solders.pubkey import Pubkey
        from solders.signature import Signature
        ok = Signature.from_bytes(_b58.b58decode(sig)).verify(Pubkey.from_string(wallet), ch["msg"].encode())
        if not ok:
            return _err("bad_signature", 401)
    except Exception:
        return _err("bad_signature", 401)
    await db.gb_challenges.delete_one({"wallet": wallet})
    email = f"wallet:{wallet}"
    u = await db.gb_users.find_one({"email": email})
    if not u:
        u = {"email": email, "wallet": wallet, "balance": START_CREDITS, "createdAt": _now()}
        await db.gb_users.insert_one(u)
    token = uuid.uuid4().hex
    await db.gb_sessions.insert_one({"token": token, "email": email, "createdAt": _now()})
    return {"token": token, "user": {**_pub_user(u), "wallet": wallet}}


@api_router.get("/wallet/{addr}/break")
async def wallet_break_balance(addr: str):
    """$BREAK balance of a Solana wallet (public RPC)."""
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post("https://api.mainnet-beta.solana.com", json={
                "jsonrpc": "2.0", "id": 1, "method": "getTokenAccountsByOwner",
                "params": [addr, {"mint": BREAK_MINT}, {"encoding": "jsonParsed"}]})
            accs = r.json().get("result", {}).get("value", [])
        bal = sum(float(a["account"]["data"]["parsed"]["info"]["tokenAmount"]["uiAmount"] or 0) for a in accs)
        return {"balance": bal}
    except Exception as e:
        logger.warning(f"break balance: {e}")
        return {"balance": None}


# ---------- local breaks (build a break) ----------

@auth_router.post("/breaks/create")
async def create_break(request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    body = await request.json()
    title = (body.get("title") or "").strip()[:60]
    line = (body.get("line") or "pokemon").strip()
    spots = min(max(int(body.get("spots") or 10), 2), 40)
    spot_price = min(max(float(body.get("spotPrice") or 25), 5), 5000)
    if not title:
        return _err("title_required", 400)
    bid = "GB-" + uuid.uuid4().hex[:6].upper()
    doc = {"id": bid, "title": title, "line": line, "spots": spots, "spotPrice": spot_price,
           "cost": round(spots * spot_price, 2), "seatsTaken": 0, "local": True,
           "host": {"name": u["email"].split("@")[0], "type": "community"},
           "createdAt": _now(), "by": u["email"], "status": "open"}
    await db.gb_breaks.insert_one(doc)
    return {"ok": True, "break": {k: v for k, v in doc.items() if k != "_id"}}


@api_router.get("/breaks/local")
async def local_breaks():
    docs = await db.gb_breaks.find({"status": "open"}, {"_id": 0}).sort("createdAt", -1).to_list(50)
    return {"breaks": docs}


@auth_router.delete("/breaks/local/{bid}")
async def delete_local_break(bid: str, request: Request):
    u = await _session_user(request)
    if not u:
        return _err("sign_in_required", 401)
    r = await db.gb_breaks.delete_one({"id": bid, "by": u["email"]})
    if not r.deleted_count:
        return _err("not_found", 404)
    await db.gb_seats.delete_many({"breakId": bid})
    return {"ok": True}


app.include_router(api_router)
app.include_router(auth_router)


@app.get("/api/health")
def health():
    return {"ok": True, "ts": int(time.time() * 1000)}
