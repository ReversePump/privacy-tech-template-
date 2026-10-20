# PRD — Grail Break (card-breaks platform)

## Original problem statement
Build a 1:1, fully functional clone of the public site https://grailbreak.cards/ using only public
site data, assets and behavior. Replace the previous (now deleted) trading app entirely: no Loom,
Weft, MakeMarkets, Hyperliquid, Jupiter, token or trading code anywhere. All pages and interactions
of the reference site must work: lobby, gacha pack pulls with the card-rip reveal animation, breaks,
hall of hits, how-it-works, battle slabs, live, graildex, break builder, and account/dashboard after
sign-in. No mocks where public upstream data exists.

## Architecture
- React CRA frontend (`/app/frontend`) on :3000, FastAPI backend (`/app/backend/server.py`) on :8001,
  MongoDB via MONGO_URL/DB_NAME. All backend routes under `/api`.
- Backend relays the reference site's PUBLIC read-only API (`/api/gh/*`) and public assets:
  `/api/ci/*` (card AVIFs), `/api/img/*` (pack art/brand), `/api/rip/*` (rip-stage clips + SFX,
  Range-aware streaming). On-demand open-codec transcode: `.webm` (VP9/Opus) and `.ogg` (Vorbis)
  variants cached in /tmp/rip_transcode_cache (imageio-ffmpeg).
- Local platform layer in Mongo (`gb_users`, `gb_sessions`, `gb_pulls`, `gb_battles`): email+password
  accounts (bcrypt), wallet challenge/signature sign-in (solders Signature.verify), local credit
  balances ($250 start), gacha pulls resolved against live machine odds, sell-back at machine rate,
  battle create/join/rip/settle.
- Frontend: `AuthContext`, `lib/api.js` client, components `TopNav`, `MobileTabs`, `Rails`,
  `AuthModal`, `RipStage`; pages Lobby, Gacha, Breaks, Hits, How, Battle, Live, Graildex,
  BuildBreak, Me. The reference site's own reveal engine runs verbatim (`public/vendor/rip.js` +
  `rip.css`), portaled to document.body, with codec fallback (webm/ogg) for browsers lacking
  H.264/MP3.

## Implemented (verified)
- Lobby, Gacha, Breaks, Hall of Hits, How, Battle Slabs, Live, Graildex, Build a break, Me — all
  render with live public data (machines, odds, breaks, seats, hits feed, stats).
- Gacha pull end-to-end: real card resolved from live machine (e.g. Wigglytuff PSA 10, $65 RARE),
  full rip animation video plays (verified: readyState 4, playing), reveal overlay with card art,
  year/grade/rarity, value, Sell back / Keep it; balance debits/credits correctly.
- Auth: email register/sign-in/sign-out; wallet challenge-verify tested server-side.
- Backend test suite: 13 passed (`backend/tests/test_grailbreak.py`).
- Mobile parity with reference: collapsed top bar, 2-col machine grid, fixed bottom tab bar
  (Lobby · Breaks · Gacha · Build a break · More).
- Full legacy wipe: zero Loom/Weft/MakeMarkets/Hyperliquid/Jupiter references in code or content.

## Boundaries (intentional, lawful)
- Upstream-gated writes (real money purchases, shipping, withdrawals on the reference site) are NOT
  cloned — the local platform uses local test credits instead. Public read data is live.
- Test/preview browsers without H.264/MP3 codecs get transcoded VP9/Vorbis variants automatically.

## Backlog
- P0: none known — see latest test report in /app/test_reports/.
- P1: richer break-detail live seat claiming UX; stream embedding when reference exposes public stream URLs.
- P2: PWA manifest/icons; skeleton loaders on slow upstream fetches.
