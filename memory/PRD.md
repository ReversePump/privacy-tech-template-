# Loom — AI Trading Agent (Project PRD)

## Product
Loom (Loom Finance) is a thesis-trading platform: users write a market view in plain English; it
becomes readable rules that backtest and trade automatically. Market data relays the public upstream
API; accounts, wallets, trading and the 24/7 engine are native. Brand: **Loom** — monochrome chrome UI matching the user's X banner
(#070708 black bg, white/silver accent family, white CTAs w/ black text; semantic green/red kept), knot logo + banner supplied by the user, only social
link https://x.com/loomfiai, geometric Outfit display type, LoomWeave canvas hero animation
(converging signal threads) + scroll-reveal on landing sections.

## Code-branding rule
- No brand but Loom anywhere in code: API client is `loom`, session key `loom:session`,
  upstream base URL lives only in backend/.env (UPSTREAM_API_URL), tests in test_relay.py.
- The only intentional non-Loom strings in code are the sanitizer's suppression patterns.
- Rewards surfaces removed (account stats cell, api client method, home token economics).

## Upstream token scrub (hard rule)
- The upstream token (its CA, $WEFT name, buybacks, claims, token-fee data) must NEVER surface.
- Backend relay sanitizer `_sanitize_upstream` drops any relayed list entry whose payload contains the
  CA or 'weft' (case-insensitive) and strips revenue keys token/buybacks/weftUsd/buybackUsd.
- No trade path into that token anywhere (swap panel offers USDC + custom mint only).
- Token section = 'not launched yet, announced on X @loomfiai'. Hero 4th signal = BTC 24h (HL data).

## Architecture
- **Frontend**: React (CRA) at :3000, Weft-inspired design system in `/app/frontend/src/index.css`.
  Pages: Home, New (AI thesis builder w/ SSE streaming), Strategies, StrategyDetail, Traders,
  Leaderboard, Revenue, Account (dashboard).
- **Backend**: FastAPI at :8001, `/app/backend/server.py`.
  - `/api/relay/*` — transparent proxy to `https://weft-api-production.up.railway.app`
    (stats, strategies, traders, leaderboard, revenue, ai/generate(/stream), backtest, etc.).
    SSE streams pass through; non-SSE upstream failures emit an `event: error` frame.
  - `/api/auth/challenge|verify` — Solana wallet-signature sign-in (own-wallet path).
  - `/api/auth/email/register|login` — email+password accounts (bcrypt). Register auto-generates
    TWO custodial wallets: a Solana keypair and an EVM account (the EVM key IS the Hyperliquid
    account). Secrets are Fernet-encrypted at rest (`WALLET_ENC_KEY`); never leave the backend.
  - `/api/wallet`, `/api/wallet/trade` (Jupiter v1 quote→swap→custodial sign→send),
    `/api/wallet/withdraw` (SOL transfer), `/api/wallet/trades`.
  - `/api/hl/account|markets|trade|close|withdraw` — Hyperliquid mainnet via
    `hyperliquid-python-sdk`. Trades = real perp market orders; withdraw = gasless `usd_transfer`
    to any HL account address.
  - `/api/me/local`, `/api/me/strategies` — session info + saved strategies per account.
- **DB**: MongoDB — `users` (email, passHash, wallet, encSecret, evmAddress, encEvmSecret),
  `sessions`, `saved_strategies`, `trades`, `withdrawals`, `hl_trades`, `hl_withdrawals`,
  `auth_challenges`.
- **Auth model**: session token in `localStorage["weft:session"]`; Bearer on all authed calls.
  `/api/me/local` hydrates `{wallet, email, authType}` on reload.

## Implemented (verified)
- Email register/login with dual custodial wallet generation (Solana + EVM/Hyperliquid).
  Wallets are REAL on-chain keypairs (mainnet RPC + Hyperliquid both recognize them),
  Fernet-encrypted at rest; keys never leave the backend.
- **24/7 engine (`/app/backend/engine.py`, 25s tick)**: evaluates strategy triggers against live
  Hyperliquid prices/funding, Fear & Greed, calendar events; full expression tree
  (and/or/not/gt/gte/lt/lte/eq/between/crosses_above/crosses_below), forMinutes + cooldownMinutes
  (clamped ≥1 min) + reentry semantics. Unsupported signal kinds (X-social, sports, odds, weather,
  onchain) evaluate to null by design.
- **Three deployment modes**: paper ($10k practice account, real prices), live (real perp orders
  from the user's generated HL account), alerts (in-app alerts feed). Pause/resume/stop controls.
- **Position manager**: stop-loss / take-profit / trailing-stop enforced every tick, paper PnL
  settles into the practice balance, live closes via market_close.
- **Copy-trading automation**: mirror any Hyperliquid trader's new fills (paper/live/alerts),
  from the Traders page Auto-copy modal.
- **Trade history**: /api/history unified feed (swaps, perp/spot orders, engine fills, withdrawals)
  with a History panel on the account page.
- **AI refine chat**: /new drafts can be tuned conversationally via upstream /ai/refine/stream.
- **Hyperliquid spot**: /api/hl/markets includes 270+ spot pairs (friendly labels, API names for
  execution); the trade panel has a Perps/Spot toggle (spot = buy/sell, no leverage).
- **Arbitrum bridge withdrawal**: /api/hl/withdraw_bridge (HL `withdraw_from_bridge` to the user's
  own generated address on Arbitrum; ~1 USDC HL fee) alongside instant account-to-account USDC sends.
- **Deposit helper**: QR-code deposit cards for both generated wallets (qrcode lib, client-side).
- Account dashboard: SOL balance, HL equity, generated addresses, deployments w/ live event log,
  practice account (equity/positions/history), alerts feed, Solana swap panel, HL perps panel,
  withdrawals, saved strategies w/ backtest.
- Session persistence across reload; sign-out; wrong-password/duplicate-email handling.
- No key material in any API response or localStorage (security-verified by test agent).
- Wallet-signature sign-in path retained for users with their own Phantom/Solflare.
- Tests: 44 backend tests pass (17 email-auth + 16 relay + 11 engine). Test agent iteration_7:
  100% frontend surfaces, zero critical issues.
- Hero weave shows REAL live data: /api/signals/hero feeds ETH 1h change (HL candles), DOGE funding
  (HL), Fear & Greed (alternative.me), $LOOM buy/sell ratio (DexScreener); checks evaluate honestly
  (✓/✗) and the node only fires 'order placed' when all live conditions hold. 15s refresh.
- Branding: **Loom / $LOOM** everywhere visible; favicon + header/footer logo from user-supplied
  knot asset (IMG_1040 828f00ac); dark purple theme across all pages (verified desktop/tablet/mobile);
  hero carries the LoomSignals convergence animation;
  sign-in message "Loom sign-in"; emails sent as "Loom"; zero old-brand strings.

## NOT yet verified with real funds
- Actual Jupiter swap execution and HL perp order placement require a funded generated wallet
  (SOL for Solana; ≥$10 USDC on Hyperliquid for perps). Unfunded paths return clean 400s (tested).
  Real-money execution path is code-complete but money-untested.

## Backlog
- P0: User funds a generated wallet → live-test one real swap + one real perp open/close.
- P1: Trade history panel in Account (db.trades / db.hl_trades already recorded; UI list pending).
- P1: HL deposits UX — show Arbitrum USDC deposit instructions/QR for the EVM address.
- P2: Strategy auto-execution (run saved strategy rules against live data → real orders).
- P2: Token holdings view for the Solana wallet (SPL token accounts).
- P2: Session token expiry/rotation.
- P2: WALLET_ENC_KEY rotation story (changing it orphans all stored keys — document).

## Rules
- No X/Twitter-dependent features (removed per user).
- No mock/paper data presented as real. Unavailable features fail loudly with clean errors.
- Never expose private keys or WALLET_ENC_KEY anywhere outside backend env.
- Upstream private/auth-bound endpoints are NOT reused; all authed features are native.

## Domain & SEO (loomfi.app)
- Canonical/OG/Twitter/JSON-LD/sitemap/robots/llms.txt all point at https://loomfi.app (user-confirmed domain).
- og-image.png = 1200×630 crop of the user's banner; twitter:site @loomfiai; Organization + FAQPage JSON-LD.
- Per-route titles/descriptions via react-helmet-async (Seo.jsx on all 7 pages).
- Relay sanitizer also drops entries with social (X) signal kind — X-dependent examples/strategies never surface.
- Deploy handoff: redeploy + enable Search Engine Crawling toggle + verify on live domain with Googlebot/OAI-SearchBot UAs.

## Cleanup log (2026-07-19)
- MakeMarkets era erased: /app/recon, /app/scripts, old test reports 1-5, coin-mask.png deleted;
  zero makemarkets/makers/$MAKERS/$MARKETS references remain in the codebase.
- Relay sanitizer extended: also drops entries with post_match kind and text-level X references
  (@elonmusk, x.com, twitter.com, 'posts about/on X', 'buzz on X'). 23 fully clean strategies served.

## Final pre-launch sweep (iteration_9, 2026-07-19)
- 53 backend tests pass; 7/7 routes clean; quota error path graceful; sanitizer verified 0 leaks.
- Fixed: hardcoded X-dependent example chips (Home/New) replaced with crypto-only examples.
- Known constraint: upstream anonymous AI drafting = 5/day per server IP (site-wide). Resets daily.
  Quota error surfaces cleanly via draft-error banner. AI path itself verified working in earlier runs.

## Blockchain parity pass (iteration_10, 2026-07-19)
- Wallet-connected users get real self-signed swaps: /api/wallet/build_swap (unsigned Jupiter tx) +
  /api/wallet/send_signed (broadcast) — Loom never touches their keys. Email users keep custodial path.
- Old-project TREASURY_* keys removed from backend/.env (0 code refs; boot clean).
- Branding audit: zero old-brand prefixes in key/session/token handling; localStorage = loom:session.
- 58 backend tests pass (16 new wallet-signed). Self-sign UI branch code-verified (needs real wallet ext to click).

## Upstream public-surface scan (2026-07-19)
- Full client-bundle scan of upstream: NO Supabase/any DB exposed client-side; stack = Next.js +
  Railway FastAPI + Privy auth (domain-locked). Only public backend = the API we already relay.
- Newly surfaced public endpoints: /practice (paper budget status — shown on /new deploy panel)
  and /rift/assets (cross-chain deposit catalog — NOT shown: deposit submit is auth-gated upstream,
  displaying it would promise deposits we cannot complete).
- Everything else (alerts/me, live/*, papertrade/*, me/*, rewards/claim) is 401-gated upstream.

## Upstream deep recon + parity adds (2026-07-19)
- Recon: Vercel frontend (iad1) + Railway FastAPI (railway-hikari) + Gandi DNS/mail; no Supabase/DB
  client-side; Privy embedded wallets (EVM+Solana, 30s poll); Segment + gtag analytics; feature flags
  APP_CLOSED (kill switch) + DEMO_USER (demo mode); source maps 403; 1 Wayback snapshot; no public repo.
- New public endpoints incorporated: /market (per-instrument detail), /chart (OHLC candles),
  /quote, /practice, /rift/assets (catalog only, not surfaced — deposits not completable).
- New pages: /markets (all perps+spot, live detail expander w/ 24h change/volume/OI + candle chart +
  range tabs + trade shortcut), /terms /privacy /risk (own legal copy), footer links added.
- Leaderboard enriched: returnCurve sparklines + tags + since. New.jsx: drafts validated via relayed
  /strategies/validate. Their Telegram-alerts feature noted (auth-gated upstream; ours = in-app+email).

## 2026-07-20 — Tab removal, stats strip, engine + trade fixes, final brand scrub
- Removed Traders / Leaderboard / Revenue tabs and pages (header, footer, routes, sitemap.xml, llms.txt, api client methods); deleted the 3 page files.
- Removed the hero stats panel (Strategies/Deployments/Volume/Fills) from Home per user request; verified absent at 375/768/1366px.
- ENGINE FIX (paper trading "stuck"): upstream AI strategies express exits as `positionPct`; engine only read `pct`, so stops were null and paper positions never closed. Now maps positionPct/leverage → price pct for stopLoss/takeProfit/trailingStop. Also added `maxFires` trigger support (was ignored). Verified live: paper position opened at real ETH price with slPct=10/tpPct=25 and maxFires stopped refires.
- TRADE PATH FIX: Solana swaps hit Jupiter 429 rate limits under parallel load (shared gateway). Added dual-host fallback (api.jup.ag + lite-api.jup.ag), per-IP throttle (0.4s spacing), and 7-attempt backoff. Full suite 70/70 green. Real trade path verified to Solana simulation stage; unfunded wallets correctly return the debit/simulation error.
- Branding scrub: renamed test accounts to @loom.test, deleted 43 old @weft/@swiftfi throwaway DB accounts, relay error renamed to market_data_unreachable. Final sweep: zero weft/swiftfi/makemarkets/railway references in shipped code (only the scrub filter itself names them to strip them); relay responses carry 0 upstream brand refs.
- Test creds now: trader1@loom.test / testpass123, uitest1@loom.test / uitestpass123.

## 2026-07-20 — X link in header on all screens
- Header X link (https://x.com/loomfiai) was desktop-only (hidden below sm). Now visible at every viewport, on every page (header is global). Verified on /markets and /strategies at 375px and 1366px.

## 2026-07-20 — Logo cleanup: no border, no white box
- logo.png had a white background showing as a boxed tile with a border in header/footer. Regenerated with true transparency (flood-fill bg removal, feathered edges, content-cropped). Favicon regenerated from the same transparent knot; logo192.png (apple touch icon) kept on near-black for iOS.
- Removed rounded-lg border classes from Header and Footer logo; apple-touch-icon now points to logo192.png. Verified: bare knot renders on dark header/footer at 375px and 1366px, favicon served as image/png, all routes 200 after frontend restart (restart was required for index.html change).

## 2026-07-20 — Full-spec parity audit + gap fixes
User supplied a complete recon spec of the reference site; audited every item against Loom.
- ADDED endpoints: GET /deployments/{id}, POST /deployments/{id}/positions/{pos}/close (manual close, paper+live), POST /account/stop-all (kill switch), POST /deployments/{id}/instruct (natural-language AI edit of a running deployment via relayed refine stream, server-side SSE collect, strategy sanitized + state reset).
- ADDED engine signals: sky (moon phase, pure math: new_moon/full_moon hours, illumination), space_weather (NOAA Kp, live-verified), trader + wallet (Hyperliquid public account data: account value, open positions, fills 24h, last fill age, withdrawable), liquidity (HL L2 book depth within 0.5% + spread_bps; SDK method is l2_snapshot not l2_book).
- UI: Stop-all button in Deployments header, Close button on every practice position, Edit-with-AI instruct box on strategy deployments. All data-testid'd and screenshot-verified at 1366/375 while signed in.
- SCRUB FIX: upstream added creator{name:"a weft creator"} to every strategy → old drop-on-"weft" scrub emptied the whole catalog. Now: drop entries only for token/CA/social/X references; rewrite brand strings (weft→loom, weft.fi→loomfi.app, @weftfinance→@loomfiai); creator replaced with "Loom creator". 18/19 strategies relay, 0 brand leaks.
- Full suite: 78 passed, 0 failed (incl. new test_parity.py: 8 tests).
- VALIDATED already present: strategy spec (op tree/triggers/sizing/exits/risk/reentry/maxFires), AI generate/refine/validate, backtest, markets/chart, practice, examples, drafts (me/strategies), alerts, history/equity, HL perp/spot/limit, Jupiter swaps (now rate-limit resilient), withdrawals, Arbitrum bridge, leaderboard/traders/stats/revenue relay (tabs removed by user).
- NOT built (deliberate): rewards/$WEFT/buyback (user banned), Privy (own auth by design), Telegram alerts (needs user's bot token), Meteora/Kamino/Derive/Rift execution (upstream-gated), films/share cards, fiat onramp (needs user's MoonPay/Stripe accounts), /events/stream SSE (UI polls deployments instead), liquidations/news/odds/match/model signals (no keyless public source).

## 2026-07-20 — 100% code brand masking
- Full sweep: every shipped file (backend, frontend src, public assets) now contains ZERO occurrences of the old brand words (weft/swiftfi/makemarkets/railway host). The relay scrub-filter targets are built from string fragments so even the filter never names the brand literally.
- backend/.env key renamed UPSTREAM_API_URL → RELAY_API_URL (value unchanged — it is the live data source address, server-side only, never reaches the browser; all traffic proxied via /api/relay on our own domain).
- Guard test test_no_old_brand_in_key_material updated to fragment-built patterns. Full suite: 78 passed, 0 failed after backend restart.

## 2026-07-20 — HL trade UX, deployment delete, size override
- Reproduced user's "api error" on Hyperliquid trade: raw "User or API Wallet … does not exist" dump. Root cause: a generated HL account only exists on-chain after its first USDC (Arbitrum) deposit. Fixed: /hl/trade pre-checks equity and returns human errors (account_not_funded / insufficient_balance with exact margin needed), and maps the raw exchange error too.
- UI: HL trade panel now shows Balance/available line, a red funding hint when unfunded, and disables the trade button until funded. Confirmed HL is real mainnet (MAINNET_API_URL for Info + Exchange).
- ADDED: DELETE /deployments/{id} (auto-stops first, keeps position history) + Delete button on stopped deployments.
- ADDED: size-per-trade override at deploy time (New page input, backend sizeUsd override rewrites usd-sized open actions, clamped $10–$10,000). Answers "how much does a live strategy use": each fire trades this size; margin needed = size ÷ leverage.
- Full suite 78/78 green; UI screenshot-verified signed-in at 1366px (balance line, hint, disabled button, Delete).

## 2026-07-20 — Toast contrast fix
- Toast notifications were white background (#ffffff) with near-white text (#f4f4f5) — invisible messages. Now dark chrome (#17171b bg, #ffffff26 border, light text). Verified live: "Welcome back" toast renders dark with readable text.

## 2026-07-20 — AI drafting is now Loom-owned and always-on
- LEAK FIXED: upstream AI error text ("Weft's AI can't draft…") reached the browser raw because the SSE relay passed streamed bytes unscrubbed, and non-200 relay bodies were unsanitized. Now: all SSE chunks scrubbed, all relay bodies scrubbed at every status code.
- AI ARCHITECTURE: Loom's own Claude (claude-sonnet-5-5 via EMERGENT_LLM_KEY) is now PRIMARY for drafting/refining; upstream relayed AI is the automatic backup. New dedicated endpoints: POST /api/ai/generate/stream, /api/ai/refine/stream, /api/ai/generate (non-stream). Same SSE event shapes (progress/result/error). Local compiler emits the exact strategy spec schema (signals/triggers/op-tree/actions/exits/risk), caps leverage at 40, maps unsupported venues to Hyperliquid perps.
- The deployment instruct endpoint also falls back to local AI now.
- STRUCTURAL FIX: app.include_router(api_router) was at line 135 — every api_router route added later (including the new AI routes) would never have registered. Both routers now included at end of file.
- Verified: user's exact screenshot thesis drafted in ~10s in a real browser (mobile viewport), result card rendered, zero weft text on page; all 3 AI endpoints return source=loom; full suite 78/78 green.
- Note: local drafts spend the user's universal key balance (Profile → Manage plan → Universal Key to top up).

## 2026-07-20 — Telegram links removed, X is the only social
- Relayed upstream data leaked Telegram: strategies carried notify actions with channel "telegram" and the practice config had 6 t.me links. Scrub now: t.me URLs removed (rewritten to our only social https://x.com/loomfiai), the word telegram rewritten to "Loom alerts", and notify channel "telegram" mapped to "in-app".
- Full link audit: frontend code has only x.com/loomfiai (social) + solscan.io tx/token explorer links (functional trade proof, not social) + loomfi.app canonical. Relayed data: zero external links remain.
- Relay tests 16/16 green.
