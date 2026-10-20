"""Loom core engine: runs deployments 24/7.

A deployment = a strategy (or copy target) + a mode:
  paper  -> trades a $10,000 pretend account at real prices
  live   -> trades the user's generated Hyperliquid account for real
  alerts -> pings the in-app alerts feed instead of trading

Tick loop (~25s): refresh market data -> evaluate triggers -> run actions ->
manage open positions (stop-loss / take-profit / trailing).
"""
import asyncio
import logging
import math
import time
import uuid
from datetime import datetime, timezone

import httpx

logger = logging.getLogger("engine")

_db = None
_hl_info = None
_hl_exchange_fn = None
_users_coll = None

PAPER_START_USD = 10_000.0
TICK_SECONDS = 25


def init(db, hl_info, hl_exchange_fn):
    global _db, _hl_info, _hl_exchange_fn, _users_coll
    _db = db
    _hl_info = hl_info
    _hl_exchange_fn = hl_exchange_fn
    _users_coll = db.users


def _now():
    return datetime.now(timezone.utc).isoformat()


# ---------------- market data ----------------

class MarketData:
    def __init__(self):
        self.mids = {}
        self.ctxs = {}
        self.fear_greed = None
        self.ts = 0

    async def refresh(self):
        try:
            self.mids = {k: float(v) for k, v in _hl_info().all_mids().items()}
            meta, ctxs = _hl_info().meta_and_asset_ctxs()
            universe = meta.get("universe", [])
            self.ctxs = {universe[i]["name"]: ctxs[i] for i in range(min(len(universe), len(ctxs)))}
        except Exception as e:
            logger.warning(f"market refresh failed: {e}")
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get("https://api.alternative.me/fng/?limit=1")
                self.fear_greed = float(r.json()["data"][0]["value"])
        except Exception:
            pass
        self.ts = time.time()

    def candles_change_pct(self, coin: str, interval: str):
        try:
            end = int(time.time() * 1000)
            span = {"5m": 30, "15m": 120, "1h": 180}[interval] * 60 * 1000
            snaps = _hl_info().candles_snapshot(coin, interval, end - span, end)
            if len(snaps) >= 2:
                a, b = float(snaps[-2]["c"]), float(snaps[-1]["c"])
                if a:
                    return (b - a) / a * 100
        except Exception:
            pass
        return None


_mkt = MarketData()


# ---------------- expression evaluation ----------------

def _eval(node, refval, cross_state):
    """Evaluate a trigger expression tree. cross_state persists prev values per node."""
    if not isinstance(node, dict):
        return None
    if "value" in node:
        return node["value"]
    if "ref" in node:
        return refval.get(node["ref"])
    op = node.get("op")
    args = node.get("args", [])
    if op in ("and", "or"):
        vals = [bool(_eval(a, refval, cross_state)) for a in args]
        return all(vals) if op == "and" else any(vals)
    if op == "not":
        return not bool(_eval(args[0], refval, cross_state)) if args else None
    left = _eval(node.get("left"), refval, cross_state)
    right = _eval(node.get("right"), refval, cross_state)
    if op == "is":
        if isinstance(right, str):
            return str(left).lower() == right.lower() if left is not None else None
        return left == right if left is not None else None
    if left is None or right is None:
        return None
    try:
        if op == "gt": return left > right
        if op == "gte": return left >= right
        if op == "lt": return left < right
        if op == "lte": return left <= right
        if op == "eq": return left == right
        if op == "add": return left + right
        if op == "mul": return left * right
        if op == "div": return left / right if right else None
        if op == "abs": return abs(left)
        if op == "between":
            lo, hi = (right if isinstance(right, list) else [right, right])
            return lo <= left <= hi
        if op in ("crosses_above", "crosses_below"):
            key = repr(sorted(node.items()))
            prev = cross_state.get(key)
            cross_state[key] = (left, right)
            if not prev:
                return False
            pl, pr = prev
            return (pl <= pr and left > right) if op == "crosses_above" else (pl >= pr and left < right)
    except TypeError:
        return None
    return None


# ---------------- signal resolution ----------------

async def _signal_fields(sig, owner_positions):
    kind = sig.get("kind")
    p = sig.get("params", {})
    inst = p.get("instrument", {})
    sym = (inst.get("symbol") or "").upper()
    if kind == "price":
        px = _mkt.mids.get(sym)
        ctx = _mkt.ctxs.get(sym, {})
        out = {"price": px}
        prev_day = ctx.get("prevDayPx")
        if px and prev_day:
            try:
                out["change_24h_pct"] = (px - float(prev_day)) / float(prev_day) * 100
            except Exception:
                pass
        c1 = _mkt.candles_change_pct(sym, "1h")
        c5 = _mkt.candles_change_pct(sym, "5m")
        if c1 is not None: out["change_1h_pct"] = c1
        if c5 is not None: out["change_5m_pct"] = c5
        return out
    if kind == "funding":
        ctx = _mkt.ctxs.get(sym, {})
        f = ctx.get("funding")
        if f is not None:
            f = float(f)
            return {"rate_1h_pct": f * 100, "rate_8h_pct": f * 8 * 100}
        return {}
    if kind == "macro" and p.get("series") == "FEAR_GREED":
        return {"value": _mkt.fear_greed} if _mkt.fear_greed is not None else {}
    if kind == "calendar" and p.get("at"):
        try:
            at = datetime.fromisoformat(p["at"].replace("Z", "+00:00"))
            return {"hours_until": (at - datetime.now(timezone.utc)).total_seconds() / 3600}
        except Exception:
            return {}
    if kind == "position":
        for pos in owner_positions:
            if pos.get("symbol", "").upper() == sym:
                return {"open": 1, "pnl_pct": pos.get("pnlPct", 0)}
        return {"open": 0, "pnl_pct": 0}
    if kind == "token_onchain" and p.get("mint"):
        d = await _dex_token(p["mint"])
        if d:
            h1 = (d.get("txns") or {}).get("h1") or {}
            buys, sells = h1.get("buys", 0), h1.get("sells", 0)
            chg = d.get("priceChange") or {}
            return {
                "price_usd": float(d.get("priceUsd") or 0) or None,
                "market_cap_usd": d.get("marketCap") or d.get("fdv"),
                "liquidity_usd": (d.get("liquidity") or {}).get("usd"),
                "volume_24h_usd": (d.get("volume") or {}).get("h24"),
                "buy_sell_ratio_1h": (buys / sells) if sells else (float(buys) if buys else None),
                "price_change_1h_pct": chg.get("h1"), "price_change_24h_pct": chg.get("h24"),
            }
        return {}
    if kind == "sports":
        return await _espn_team(p.get("league", "nba"), p.get("team", ""))
    if kind == "forecast" and p.get("source") == "weather":
        series = p.get("series", "")
        city = series.split(":", 1)[1] if ":" in series else ""
        return await _weather(city)
    if kind == "sky":
        # moon phase — pure astronomy, no network. Strategy refs: sky.new_moon / sky.full_moon (hours until)
        SYNODIC = 29.53058867
        epoch = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)  # known new moon
        age = ((datetime.now(timezone.utc) - epoch).total_seconds() / 86400) % SYNODIC
        illum = (1 - math.cos(2 * math.pi * age / SYNODIC)) / 2 * 100
        return {"age_days": round(age, 2), "illumination_pct": round(illum, 1),
                "new_moon": round((SYNODIC - age) * 24, 2),
                "full_moon": round(((SYNODIC / 2 - age) % SYNODIC) * 24, 2)}
    if kind == "space_weather":
        return await _noaa_kp()
    if kind in ("trader", "wallet") and (p.get("address") or "").startswith("0x"):
        return await _hl_user(p["address"], kind)
    if kind == "liquidity" and sym:
        return await _l2_depth(sym)
    # social (X), odds, post_match — no live source (X removed by design)
    return {}


# ---------------- external signal data (cached) ----------------

_cache = {}


async def _cached(key, ttl, fetch):
    ent = _cache.get(key)
    if ent and time.time() - ent[0] < ttl:
        return ent[1]
    val = await fetch()
    if val is not None:
        _cache[key] = (time.time(), val)
    return val


async def _dex_token(mint):
    async def go():
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"https://api.dexscreener.com/tokens/v1/solana/{mint}")
                arr = r.json()
                return arr[0] if arr else None
        except Exception:
            return None
    return await _cached(f"dex:{mint}", 60, go)


async def _noaa_kp():
    """Space weather: latest planetary K-index from NOAA (free, no key)."""
    async def go():
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json")
                rows = r.json()
                last = rows[-1]
                kp = last.get("Kp") if isinstance(last, dict) else last[1]
                return {"kp": float(kp)}
        except Exception:
            return None
    return await _cached("noaa_kp", 900, go) or {}


async def _hl_user(addr, kind):
    """Public Hyperliquid account signals for a watched trader/wallet address."""
    async def go():
        try:
            st = _hl_info().user_state(addr)
        except Exception:
            return None
        mv = float(st.get("marginSummary", {}).get("accountValue", 0) or 0)
        positions = [ap for ap in st.get("assetPositions", [])
                     if float(ap.get("position", {}).get("szi", 0) or 0) != 0]
        out = {"account_value_usd": mv, "open_positions": len(positions)}
        if kind == "wallet":
            out["withdrawable_usd"] = float(st.get("withdrawable", 0) or 0)
        else:
            try:
                fills = _hl_info().user_fills(addr) or []
            except Exception:
                fills = []
            now_ms = time.time() * 1000
            out["fills_24h"] = sum(1 for f in fills if now_ms - f.get("time", 0) < 86_400_000)
            out["last_fill_minutes"] = (round((now_ms - max(f.get("time", 0) for f in fills)) / 60000, 1)
                                        if fills else None)
        return out
    return await _cached(f"hluser:{kind}:{addr}", 60, go) or {}


async def _l2_depth(sym):
    """Perp liquidity: order-book depth within 0.5% of mid, plus spread."""
    async def go():
        try:
            book = _hl_info().l2_snapshot(sym)
        except Exception:
            return None
        mid = _mkt.mids.get(sym)
        if not mid:
            return None
        levels = book.get("levels", [[], []])
        band = mid * 0.005

        def depth(side_levels, is_bid):
            total = 0.0
            for lv in side_levels:
                px_l, sz = float(lv["px"]), float(lv["sz"])
                if (mid - px_l <= band) if is_bid else (px_l - mid <= band):
                    total += px_l * sz
            return round(total, 0)

        bids, asks = levels[0], levels[1]
        out = {"bid_depth_usd": depth(bids, True), "ask_depth_usd": depth(asks, False)}
        if bids and asks:
            out["spread_bps"] = round((float(asks[0]["px"]) - float(bids[0]["px"])) / mid * 10000, 1)
        return out
    return await _cached(f"l2:{sym}", 60, go) or {}



_NBA = {"hawks": "atl", "celtics": "bos", "nets": "bkn", "hornets": "cha", "bulls": "chi",
        "cavaliers": "cle", "cavs": "cle", "mavericks": "dal", "mavs": "dal", "nuggets": "den",
        "pistons": "det", "warriors": "gs", "rockets": "hou", "pacers": "ind", "clippers": "lac",
        "lakers": "lal", "grizzlies": "mem", "heat": "mia", "bucks": "mil", "timberwolves": "min",
        "wolves": "min", "pelicans": "no", "knicks": "ny", "thunder": "okc", "magic": "orl",
        "76ers": "phi", "sixers": "phi", "suns": "phx", "trail blazers": "por", "blazers": "por",
        "kings": "sac", "spurs": "sa", "raptors": "tor", "jazz": "utah", "wizards": "wsh"}


async def _espn_team(league, team):
    slug = _NBA.get((team or "").strip().lower())
    if league != "nba" or not slug:
        return {}
    async def go():
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{slug}")
                stats = r.json()["team"]["record"]["items"][0]["stats"]
                d = {s["name"]: s["value"] for s in stats}
                return {"wins": d.get("wins"), "losses": d.get("losses"), "games_played": d.get("gamesPlayed")}
        except Exception:
            return None
    return await _cached(f"espn:{slug}", 300, go) or {}


async def _weather(city):
    if not city:
        return {}
    async def go():
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                g = await c.get(f"https://geocoding-api.open-meteo.com/v1/search?name={city}&count=1")
                res = g.json().get("results") or []
                if not res:
                    return None
                lat, lon = res[0]["latitude"], res[0]["longitude"]
                w = await c.get(f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
                                "&daily=temperature_2m_max&past_days=7&forecast_days=1")
                temps = w.json()["daily"]["temperature_2m_max"]
                if len(temps) >= 8:
                    return {"current": temps[-1], "change_7d": temps[-1] - temps[0]}
        except Exception:
            return None
        return None
    return await _cached(f"wx:{city.lower()}", 1800, go) or {}


# ---------------- engine ----------------

async def _event(dep_id, msg, kind="info"):
    await _db.deployments.update_one(
        {"id": dep_id},
        {"$push": {"events": {"$each": [{"at": _now(), "kind": kind, "msg": msg}], "$slice": -20}},
         "$set": {"lastEvent": msg, "lastEventAt": _now()}})


async def _notify(dep, message):
    """In-app alert + email push (email accounts only, max 1 email per deployment per 10 min)."""
    await _db.alerts.insert_one({"ownerKey": dep["ownerKey"], "deploymentId": dep["id"], "read": False,
                                 "message": message, "createdAt": _now()})
    if dep.get("authType") == "email" and "@" in str(dep.get("ownerKey", "")):
        last = (dep.get("state") or {}).get("lastEmailAt", 0)
        if time.time() - last > 600:
            try:
                import emails
                eid = await emails.send_strategy_alert(dep["ownerKey"], message)
                if eid:
                    await _db.deployments.update_one({"id": dep["id"]}, {"$set": {"state.lastEmailAt": time.time()}})
            except Exception as e:
                logger.warning(f"alert email failed: {e}")


async def _get_owner_user(dep):
    if dep.get("authType") == "email":
        return await _users_coll.find_one({"email": dep["ownerKey"]})
    return None


async def _owner_positions(dep):
    """Positions this engine manages for the deployment owner (paper or live view)."""
    docs = await _db.positions.find({"ownerKey": dep["ownerKey"], "status": "open"}).to_list(50)
    out = []
    for d in docs:
        px = _mkt.mids.get(d["symbol"].upper())
        pnl_pct = None
        if px and d.get("entryPx"):
            diff = (px - d["entryPx"]) / d["entryPx"] * 100
            pnl_pct = diff if d["side"] == "long" else -diff
        out.append({"symbol": d["symbol"], "pnlPct": pnl_pct or 0, "id": d["id"]})
    return out


async def _paper_account(owner_key):
    acct = await _db.paper_accounts.find_one({"ownerKey": owner_key})
    if not acct:
        acct = {"ownerKey": owner_key, "balanceUsd": PAPER_START_USD, "createdAt": _now()}
        await _db.paper_accounts.insert_one(acct)
    return acct


async def _paper_equity(owner_key):
    acct = await _paper_account(owner_key)
    eq = acct["balanceUsd"]
    for p in await _owner_positions({"ownerKey": owner_key}):
        d = await _db.positions.find_one({"id": p["id"]})
        if d and d.get("entryPx"):
            px = _mkt.mids.get(d["symbol"].upper())
            if px:
                diff = (px - d["entryPx"]) / d["entryPx"]
                eq += diff * d["sizeUsd"] * d.get("leverage", 1) * (1 if d["side"] == "long" else -1)
    return eq


async def _open_position(dep, action):
    mode = dep["mode"]
    inst = action.get("instrument", {})
    sym = (inst.get("symbol") or "").upper()
    side = action.get("side", "long")
    lev = int(action.get("leverage") or 1)
    px = _mkt.mids.get(sym)
    if not px:
        await _event(dep["id"], f"no live price for {sym} — skipped", "error")
        return
    size = action.get("size", {})
    if size.get("unit") == "pct_equity":
        if mode == "paper":
            equity = await _paper_equity(dep["ownerKey"])
        else:
            equity = dep.get("_liveEquity", 0) or 0
        size_usd = equity * float(size.get("value", 100)) / 100
    else:
        size_usd = float(size.get("value") or 50)
    if size_usd < 10:
        size_usd = 10.0
    exits = action.get("exits", {}) or {}
    sl = exits.get("stopLoss") or {}
    tp = exits.get("takeProfit") or {}
    tr = exits.get("trailingStop") or {}
    # strategies express exits as price-move pct OR position-notional pct (positionPct / leverage = price pct)
    def _exit_pct(d):
        if d.get("pct"):
            return float(d["pct"])
        if d.get("positionPct"):
            return float(d["positionPct"]) / max(lev, 1)
        return None
    pos = {
        "id": uuid.uuid4().hex[:12], "deploymentId": dep["id"], "ownerKey": dep["ownerKey"],
        "mode": mode, "venue": "hyperliquid", "symbol": sym, "side": side,
        "sizeUsd": round(size_usd, 2), "leverage": lev, "entryPx": px,
        "slPct": _exit_pct(sl), "tpPct": _exit_pct(tp),
        "trailPct": exits.get("trailingStopPct") or _exit_pct(tr), "peakPx": px,
        "status": "open", "openedAt": _now(),
    }
    if mode == "paper":
        acct = await _paper_account(dep["ownerKey"])
        if acct["balanceUsd"] < size_usd / lev:
            await _event(dep["id"], f"paper account too small for ${size_usd:.0f} {side} {sym}", "error")
            return
        await _db.positions.insert_one(pos)
        await _event(dep["id"], f"paper {side} {sym} ${size_usd:.0f} @ {px:g} ({lev}x)", "fill")
    elif mode == "live":
        user = await _get_owner_user(dep)
        if not user or not user.get("encEvmSecret"):
            await _event(dep["id"], "live mode needs an email account wallet", "error")
            return
        try:
            ex = _hl_exchange_fn(user)
            try:
                ex.update_leverage(lev, sym, is_cross=True)
            except Exception:
                pass
            res = ex.market_open(sym, side == "long", round(size_usd / px, 6))
            if res.get("status") != "ok":
                await _event(dep["id"], f"live order rejected: {str(res)[:140]}", "error")
                return
            pos["hlOrder"] = res
            await _db.positions.insert_one(pos)
            await _event(dep["id"], f"LIVE {side} {sym} ${size_usd:.0f} @ {px:g} ({lev}x)", "fill")
        except Exception as e:
            await _event(dep["id"], f"live order failed: {str(e)[:140]}", "error")
    else:  # alerts
        await _notify(dep, f"Trigger fired: {side} {sym} @ {px:g} — strategy “{dep.get('strategyName', '')}”")
        await _event(dep["id"], f"alert sent: {side} {sym} @ {px:g}", "alert")


async def _close_position(pos, reason):
    px = _mkt.mids.get(pos["symbol"].upper())
    if not px:
        return
    diff = (px - pos["entryPx"]) / pos["entryPx"]
    pnl = diff * pos["sizeUsd"] * pos.get("leverage", 1) * (1 if pos["side"] == "long" else -1)
    if pos["mode"] == "live":
        user = await _users_coll.find_one({"email": pos["ownerKey"]})
        if user and user.get("encEvmSecret"):
            try:
                _hl_exchange_fn(user).market_close(pos["symbol"])
            except Exception as e:
                logger.warning(f"live close failed {pos['id']}: {e}")
                return
    elif pos["mode"] == "paper":
        await _db.paper_accounts.update_one({"ownerKey": pos["ownerKey"]}, {"$inc": {"balanceUsd": pnl}})
    await _db.positions.update_one({"id": pos["id"]}, {"$set": {
        "status": "closed", "closePx": px, "pnlUsd": round(pnl, 2), "closedAt": _now(), "closeReason": reason}})
    await _event(pos["deploymentId"], f"closed {pos['side']} {pos['symbol']} @ {px:g} ({reason}) pnl ${pnl:+.2f}", "fill")


async def _manage_positions():
    for pos in await _db.positions.find({"status": "open"}).to_list(200):
        px = _mkt.mids.get(pos["symbol"].upper())
        if not px or not pos.get("entryPx"):
            continue
        is_long = pos["side"] == "long"
        gain = (px - pos["entryPx"]) / pos["entryPx"] * 100 * (1 if is_long else -1)
        peak = pos.get("peakPx", pos["entryPx"])
        if (is_long and px > peak) or (not is_long and px < peak):
            await _db.positions.update_one({"id": pos["id"]}, {"$set": {"peakPx": px}})
            peak = px
        trail_gain = (peak - pos["entryPx"]) / pos["entryPx"] * 100 * (1 if is_long else -1)
        if pos.get("slPct") and gain <= -pos["slPct"]:
            await _close_position(pos, "stop-loss")
        elif pos.get("tpPct") and gain >= pos["tpPct"]:
            await _close_position(pos, "take-profit")
        elif pos.get("trailPct") and trail_gain > 0:
            give = (peak - px) / peak * 100 if is_long else (px - peak) / peak * 100
            if give >= pos["trailPct"]:
                await _close_position(pos, "trailing-stop")


async def _tick_deployment(dep):
    st = dep.get("strategy") or {}
    triggers = {t["id"]: t for t in st.get("triggers", [])}
    if not triggers:
        return
    owner_positions = await _owner_positions(dep)
    refval = {}
    for sig in st.get("signals", []):
        for field, val in (await _signal_fields(sig, owner_positions)).items():
            refval[f"{sig['id']}.{field}"] = val
    state = dep.get("state", {})
    cross_state = state.get("cross", {})
    now = time.time()

    for action in st.get("actions", []):
        if action.get("reentry") == "never" and action["id"] in state.get("firedActions", []):
            continue
        for trig_id in action.get("on", []):
            trig = triggers.get(trig_id)
            if not trig:
                continue
            tstate = state.get("triggers", {}).get(trig_id, {})
            cooldown = max(trig.get("cooldownMinutes") or 0, 1) * 60  # min 1 min — no alert/fill spam
            if tstate.get("lastFiredAt") and now - tstate["lastFiredAt"] < cooldown:
                continue
            max_fires = trig.get("maxFires")
            if max_fires and tstate.get("fires", 0) >= max_fires:
                continue
            cond = _eval(trig.get("when"), refval, cross_state)
            for_min = (trig.get("forMinutes") or 0) * 60
            fired = False
            if cond:
                first = tstate.get("firstTrueAt") or now
                if now - first >= for_min:
                    fired = True
                else:
                    tstate["firstTrueAt"] = first
            else:
                tstate.pop("firstTrueAt", None)
            if fired:
                tstate["lastFiredAt"] = now
                tstate["fires"] = tstate.get("fires", 0) + 1
                tstate.pop("firstTrueAt", None)
                state.setdefault("firedActions", []).append(action["id"]) if action.get("reentry") == "never" else None
                if action.get("type") == "open":
                    await _open_position(dep, action)
                elif action.get("type") == "close":
                    for p in await _owner_positions(dep):
                        d = await _db.positions.find_one({"id": p["id"]})
                        if d:
                            await _close_position(d, "strategy-close")
                elif action.get("type") == "notify":
                    msg = f"{trig.get('label', trig_id)} fired — strategy “{dep.get('strategyName', '')}”"
                    await _notify(dep, msg)
                    await _event(dep["id"], msg, "alert")
                if dep.get("once"):
                    await _db.deployments.update_one({"id": dep["id"]}, {"$set": {"status": "stopped"}})
                    await _event(dep["id"], "one-shot order complete — stopped", "info")
                    return
            state.setdefault("triggers", {})[trig_id] = tstate
    state["cross"] = cross_state
    state["lastTickAt"] = _now()
    await _db.deployments.update_one({"id": dep["id"]}, {"$set": {"state": state}})


async def _tick_copy(dep):
    target = dep.get("targetAddress")
    if not target:
        return
    try:
        fills = _hl_info().user_fills(target)
    except Exception as e:
        logger.warning(f"copy fills failed {target[:10]}: {e}")
        return
    if not fills:
        return
    state = dep.get("state", {})
    last_tid = state.get("lastTid")
    if last_tid is None:  # first run: start from now, don't mirror history
        state["lastTid"] = max(f.get("tid", 0) for f in fills)
        await _db.deployments.update_one({"id": dep["id"]}, {"$set": {"state": state}})
        await _event(dep["id"], f"watching {target[:8]}… — will mirror new fills", "info")
        return
    new_fills = [f for f in fills if f.get("tid", 0) > last_tid]
    if not new_fills:
        return
    state["lastTid"] = max(f.get("tid", 0) for f in fills)
    await _db.deployments.update_one({"id": dep["id"]}, {"$set": {"state": state}})
    for f in sorted(new_fills, key=lambda x: x.get("tid", 0)):
        sym, side = f.get("coin", "").upper(), ("long" if f.get("side") in ("B", "A") else "long")
        side = "long" if f.get("side") == "B" else "short"
        if f.get("dir") and "Close" in f["dir"]:
            for p in await _owner_positions(dep):
                if p["symbol"] == sym:
                    d = await _db.positions.find_one({"id": p["id"]})
                    if d:
                        await _close_position(d, "copy-close")
            continue
        action = {"instrument": {"symbol": sym}, "side": side, "leverage": dep.get("leverage", 3),
                  "size": {"unit": "usd", "value": dep.get("sizeUsd", 100)},
                  "exits": {"stopLoss": {"pct": 15}}}
        await _open_position(dep, action)


async def engine_tick():
    await _mkt.refresh()
    await _manage_positions()
    deps = await _db.deployments.find({"status": "active"}).to_list(200)
    for dep in deps:
        try:
            if dep.get("kind") == "copy":
                await _tick_copy(dep)
            else:
                await _tick_deployment(dep)
        except Exception as e:
            logger.warning(f"deployment {dep.get('id')} tick failed: {e}")


async def engine_loop():
    logger.info("engine started")
    while True:
        try:
            await engine_tick()
        except Exception as e:
            logger.warning(f"engine tick failed: {e}")
        await asyncio.sleep(TICK_SECONDS)
