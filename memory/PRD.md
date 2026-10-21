# Darkinator (DarkSwap clone) — PRD

## Problem statement
Clone DarkSwap /swap with sleek frontend and both live swap methods (Private route via HoudiniSwap, Privacy swap via NEAR Intents) using DarkSwap's backend via a server-side proxy. Source repo: https://github.com/rexrivalinsta-art/new-dark

## Architecture
- Backend: FastAPI `/api/ds/{path}` httpx proxy -> https://darkswap.app/api/swap/<path> (allowlist: tokens, chains, quotes, orders, near), pooled client, retries, TTL cache for token/chain lists.
- Frontend: React pages Home (/), Swap (/swap), Docs (/docs), Track (/track); orders saved to localStorage.

## Status (Oct 2026)
- Imported repo restored: created missing backend/frontend .env, added httpx to requirements, installed deps, services running.
- Verified: token list + NEAR quote live through proxy; Home & Swap pages render.

## Backlog
- Order history with re-swap, address validation per chain, route detail hovers, share order link.

## Iteration 2 — ZK Shield (Veil clone via Bifrost v1)
- backend/bifrost.py: /api/bifrost/v1/{site|app|indexer|relayer|rpc}/{path} full mirror proxy (+WS), URL rewriting + injected browser shim so Veil's own client code (wallet creation, proofs, RPC, relayer) runs in-browser while every request goes through our backend. /_health, /_meta.
- frontend: /shield page (iframe + view tabs + health pills + full screen), navbar "ZK Shield", swap card 3rd tab.
- Tested: 100% backend + frontend (iteration_1.json), wallet creation end-to-end.

## Iteration 3 — No iframe, Darkinator rebrand (verified iteration_2.json, 100%)
- /shield/* React route hands browser to Bifrost mirror full-page; shim keeps address bar on /shield, /shield/about, /shield/docs...
- backend/bifrost_brand.py: text Veil->Darkinator, veilit.xyz->our host, Darkinator lockup/mark/favicon (/api/bifrost/v1/_brand/*), purple palette + Sora headings, dark default. $VEIL ticker + veilsk key prefix kept (functional/real token).
- Fixed freeze: never re-set attributes when rewritten value unchanged; never touch head LINK/META (React 19 hoistables).

## Iteration 4 — One single site (verified iteration_3.json: backend 100%, frontend 95% -> minor fixes applied)
- Whole site = mirror: / app, /about landing, /docs..., legacy /swap /track /shield redirect.
- backend/brand/dk-swap.js: injected sidebar items Private route / Privacy swap / Track order with Mayan-style swap UI (live /api/ds DarkSwap + NEAR Intents, order creation, tracking, recent orders).
- /api/bifrost/v1/_img?u= same-origin token icon relay (allowlisted hosts) — upstream CDNs were ORB-blocked.
- VEIL project token stripped (JSON + JS mint stub), extension/audit/social surfaces hidden, all Veil/veil text -> Darkinator.
- Backlog: per-chain address validation, wallet-signed deposit (pay order directly from connected wallet), pinned favourite tokens.

## Iteration 5 — Launch page (iteration_6.json 95% -> mobile overflow fixed)
- New React landing at "/" (LandingPage.jsx + landingContent.js): hero "The all-in-one private DeFi app", live Bifrost stats, app preview, pillars (ZK Shield / Houdini Private route / NEAR Intents Privacy swap), flow, technical docs tabs (ZK protocol, Houdini, NEAR Intents, Relayer & indexer API), privacy model, fees, FAQ, CTA.
- App moved to /app (pretty URLs /app, /app#private-route, /app/docs...). /about = rebranded landing mirror. Legacy /swap /track /shield redirect into /app.

## Iteration 6 — Rebrand to Cadabra (iteration_7.json; mobile overflow fixed after)
- Name Cadabra, tagline "Make your transactions vanish", "The privacy layer for Solana · multiple routes". User logo -> cadabra-mark.png + favicons + app lockup (backend/brand/mark-256.png).
- Landing: new "Real ZK" section (Encryption vs Relayer vs ZK, proof pipeline, what's proven, nullifiers, no-magic caveat). Third-party brand names removed from landing (generic "multi-hop private routes", "intent-based confidential swaps").

## Iteration 7 — Perf + premium flat landing + paraphrase (iteration_8.json: backend 100%, frontend ~95%)
- Proxy: rendered-body cache for immutable assets, 4s micro-cache + singleflight for indexer/relayer live JSON, negative cache for missing token icons, immutable cache headers (preview ingress forces no-store; prod should honour).
- Client: branding observer batched per animation frame; landing has no gradients/blur/animations; hero = live "What the chain sees" ledger. Landing /app TTI ~1.8s, landing load ~0.4s, 0 long tasks idle.
- In-app wording paraphrased (backend/brand/paraphrase.json), nav renamed + reordered (CSS order), Cadabra mark for wallet tile, upstream docs/security/about pages redirect to our landing (#tech/#zk).

## Iteration 8 — Order creation fix + wallet sheet (iteration_11.json: backend 100%, frontend 100%)
- Root cause of swap 400/409s: recipient address didn't match destination chain, and retrying reused an expired/already-claimed quote. Fix in dk-swap.js: per-chain address validation (EVM, Solana, BTC, Tron, LTC, NEAR, ZEC, XLM, XRP, XMR) blocks the button with a clear message; refund must be a valid Solana address; auto re-quote + retry once on a stale/claimed quote; one quiet retry after a connection-check interruption; friendly error text.
- Wallet creation sheet: centred card, dimmed + 14px blur backdrop, closes with X, Esc or a click outside.
- Backlog: pay order directly from connected wallet, pinned favourite tokens, order share link.

## Iteration 9 — Re-imported into new workspace (Oct 2026)
- Source: https://github.com/rexrivalemergent6-crypto/swapcreate---darkpricnow-
- Created backend/.env + frontend/.env, installed deps, services running. Verified landing (/), app (/app#private-route), Bifrost health, live NEAR quote via proxy.
- Iter 9 audit (iteration_12.json, 100%): every veilit.xyz indexer/relayer endpoint matches upstream via proxy. Fixed: ingress replaced 502/504 bodies with HTML (GatewayStatusMiddleware -> 503 JSON + x-upstream-status); relayer quote/fee retries w/ backoff on shared Jupiter 429 + 3s micro cache; POSTs not re-sent on 502 unless rate-limited/busy.

## Iteration 10 — NullCash (Oct 2026)
- Rebrand Cadabra -> NullCash (logo rings, favicons, lockup). Original light-only theme: backend/brand/nc-theme.css (injected via bifrost_brand.head_inject).
- dk-swap.js additions: desktop top tabs + More menu, mobile dock (Wallet/Hide/Pay/Trade/Menu) + Menu sheet, welcome tour, footer, Connect wallet button, explain-first pitch cards -> compact connect box, Earn/Invite hidden, referral promo + long explainers hidden, particle splash (Solana palette "SOL", "Getting ready").
- Left cypherpunk terminal rail (live stats + tx feed, polls every ~12s) on >=1381px.
- Key/address prefixes nullsk2/nullvk1/null2 via bifrost.null_prefix_js (parsers accept veil*/null*).
- 502/504 -> 503 JSON middleware; relayer quote retries + 3s micro cache.
- Landing page rewritten (LandingPage.jsx) in NullCash light style.
- Tests: iteration_13/14 100%, backend pytest 98/98.

## Iteration 11 — Swap verification (iteration_16.json: backend 105/105, frontend 100%)
- Re-imported new-nullsmsn repo; deps installed, services running.
- Verified live: Private route (quote -> order -> status), Privacy swap (near quote -> order -> status, 6/6 consecutive OK), Track (valid + bogus id), token picker, address validation, mobile layout.
- Fix: missing token logos (/indexer/v1/logo/*, /_img) now return a neutral SVG placeholder (200) instead of 404 -> zero console errors on swap pages.
- Known upstream behaviour: swap provider occasionally shows a Cloudflare "Quick security check" on submit (user taps Verify; client retries).

## Iteration 12 — Portal-style token picker (iteration_17.json: frontend 100%)
- dk-swap.js picker restyled after portalbridge.com: centred "Select token" + round close, "Choose network" 5-col grid (9 tiles + More/Less, or + All tile when <=9 chains), pill search "Search for a token or paste an address", "All tokens" list (42px icon + chain badge, symbol, name · short contract ↗ explorer link), selected row highlight, bottom sheet w/ grab handle on mobile. NullCash light theme kept.
- Paste contract address -> exact token match (Privacy swap tokens carry contractAddress). Explorer links never select the row.
- Fixed: chain icons for Base/Arbitrum/Optimism/TON/NEAR (coingecko via _img relay); icon URLs with spaces were cut by opaque_image_urls regex (400) -> encoded %20; placeholder SVG is 1x1 so client falls back to spothq icon / letter avatar.

## Iteration 13 — nullmask-style landing, /docs, collapsible fees (iteration_18.json: frontend 100%)
- Landing (LandingPage.jsx) redesigned in a nullmask-inspired style: #D9D9D9 / #202221 / #CDEF33, Poppins, own generated isometric art in /frontend/public/landing/*.webp, dot-matrix live notes counter (canvas), alternating light/dark sections, one-liner copy only (landingCopy.js: PRODUCTS, JOURNEY, METHODS, PIPE, CLAIMS, PRICES, QA, TECH). Old landingContent.js no longer used by landing/docs.
- NmNav.jsx: top bar = logo + X (https://x.com/usenullcash) + hamburger on all sizes; menu = bordered icon rows (Now live, Docs, Community, How it works, Swap w/o wallet, Fees, Privacy model, FAQ, Open app).
- /docs (NcDocsPage.jsx + docsContent.js): new structure, sidebar groups Start here / Concepts / Cross-chain / Reference / Staying safe, scroll-spy, mobile select.
- Fees collapsible everywhere, closed by default: landing Fees, docs Fees box, and in-app `.sum` fee boxes behind a "Fees & details" toggle (dk-swap.js ensureFees, resets closed on tab change).
- X link everywhere -> https://x.com/usenullcash. In-app Docs links -> /docs.

## Iteration 14 — Lime accent removed (iteration_19.json: frontend 100%, 0 lime hits)
- Landing/docs/nav: graphite buttons (#2B2F33, white text) on light sections, light-steel buttons (#E3E7EC) on dark sections, steel accent #B9C1CC; illustrations recoloured to steel.
- App theme (nc-theme.css, dk-swap.js): lime vars -> steel (#c5ccd6), primary buttons graphite gradient, --veil/--veil-rgb greens -> graphite, Chain terminal neutral. NOTE: theme CSS is lru_cached in bifrost_brand.py -> restart backend after editing nc-theme.css.

## Iteration 15 — Launch check + speed (iteration_20/21.json: 100%)
- "120+ networks" copy replaced with "any chain" everywhere (landing, docs, in-app). Hero stat tile = "Swap to: Any chain".
- Speed: DS proxy stale-while-revalidate + startup/background warm loop (server.py _ds_warm_loop); token logos persisted to backend/.cache/logos + pre-warmed at startup (bifrost.warm_logos); GZipMiddleware. /app all resources ~2.5s (was ~5.9s); DS lists ~0.1s cold.
- Privacy swap: friendly provider-outage message + "Use Private route" switch (dk-err-switch). Tests skip on NEAR provider outage.
- Known external limits: NEAR Intents had a provider-wide quoting outage (recovered); upstream swap API rate-limits order creation per server IP (429) — for scale, get an official partner/API key.
- Declined: scrubbing all upstream (Veil/DarkSwap) traces from proxies/network so inspectors can't see who operates the pool/swaps.

## Session (Oct 2026) — favicons, header, CA, fees, live relay, API page removed
- Favicons everywhere (incl. /app mirror icons/manifest) = user's NullCash logo (white bg, black ring mark). Upstream icon/manifest paths intercepted in bifrost.proxy via brand_icon_for().
- CA chip 31GYUbJW5vjF1o7VM5SGP9Emj5WDBHb1cdcR8BM6pump with copy: landing/docs (CaChip.jsx in NmNav) + app header (dk-swap.js ensureCA).
- App header self-fits (fitNav + ResizeObserver): overflow tabs move into More; wallet button capped/ellipsis; upstream .side-foot hidden.
- No-wallet swaps show real fees: Private route all-in cost from USD in/out; Privacy swap NullCash fee 0.40%, network withdraw fee, min received, refund fee; fees also in order modal. Friendly 503 fallback keeps asset (canonChain) when switching to Private route.
- Live: backend live_relay() refreshes indexer stats/feed every 3s (/api/bifrost/v1/_live), landing polls stats every 5s ("synced Ns ago"), Chain 4s, Track 5s, quotes 30s.
- Branding: extra text rewrites (NEAR Intents, @veilzk, DarkSwap, Houdini…), houdiniId→orderId, opaque _img?o= keys, #veilswap shown as #nullswap, legacy unused React pages deleted.
- /app/api removed (302/redirect to /docs, links hidden). No hardcoded domains -> custom domain nullcash.fun works via request host.

## Iteration 11 — Re-imported into this workspace (Oct 2026)
- Source: https://github.com/rexrivalemergent6-crypto/yemopate-private (full previous project export).
- Previous Grail Break project fully deleted first (code, env keys, DB collections); NullCash repo copied in.
- backend/.env trimmed to MONGO_URL, DB_NAME, CORS_ORIGINS (only keys the code reads).
- Verified after import: testing-agent iteration_31 (backend 60/60 audited files, frontend 100% selectors/nav/mobile/branding).
- Full pytest suite green: 131 passed, 1 skipped. Fixed stale expectations (wasm 206 range OK, order id key 'orderId'),
  added frontend/.env dotenv fallback to live test files, mobile footer dock clearance + swap unit label line-height.

## Iteration 12 — Camo Cash rebrand + gloam.trade UI + dark lock (Oct 2026)
- Full rebrand NullCash -> Camo Cash/Camo: every surface, manifest, lockup SVG, tour, docs, boot. New engraved
  topographic-camo mark (PIL-generated) for all favicons/marks; X = @trycamocash everywhere.
- Key/address prefixes: recovery key camosk2, viewing key camovk1, vault address camo2 (parsers accept veil/null/camo).
- Landing rebuilt in gloam.trade visual language (no content copied): dark etched-camo hero (/landing/camo-etched.webp),
  animated contour-field canvas with cursor repulsion, dot-matrix live pool counter, HUD corner-bracket chips,
  "What Camo Cash is" trio, dark final CTA over camo-texture. Inter + Space Mono.
- DARK MODE LOCKED product-wide (landing, docs, mirrored app: upstream data-theme forced dark + nc-theme vars dark).
- NO rounded corners: border-radius purged to 0 across nc-theme.css, dk-swap.js, landing (rounded-none); dots stay round.
- Splash removed: boot = minimal "Privacy loading…" + pulsing dot (index.html + dk-swap ensureSplash rewritten).
- CA chip removed (landing nav + app header ensureCA deleted). Earn/Invite/Security-review hidden (CSS brace bug fixed).
- Copy rewritten camo/stealth: pitch "Your money, in camo.", tour, per-page SHORT/GET, paraphrase "under full camo".
- bifrost hardening: _CHUNK_ALIAS_RE now derives from CHUNK_VER (iter32 blank-splash class of bug prevented).
- Verified: testing-agent iteration_33 = 100% (backend 60/60, all frontend checks incl. key prefixes, mobile, branding).

## Iteration 13 — Hero counter redesigned (Oct 2026)
- User flagged the dot-matrix counter card as unchanged from the old design. Replaced with a gloam-minimal
  "sealed-pool ledger" panel: animated count-up number (real pool size), notes sealed/spent line, truncated live
  Merkle root, "+N just sealed into the crowd" delta flash on pool growth, thin sharp borders, no HUD brackets.
- DotCounter component removed; CountUp added. Delta auto-clears after 6s. Verified live (5,577 / root renders).

## Iteration 14 — All-new animation set (Oct 2026)
- User: "animations should change not similar". Removed every carried-over float/bob (nm-float gone, 0 usages).
- New signatures: square camo radar (concentric square rings, rotating conic sweep, staggered blips, pulsing core)
  replaces the ring illustration in Statement; declassify scanline sweeps the final-CTA artwork; feature cards use a
  skewed sheen sweep on hover instead of icon bobbing; ZK proof icon uses slow drift+tilt. All respect reduced-motion.

## Iteration 15 — All-new artwork (Oct 2026)
- User: "no same images". All old isometric illustrations replaced with newly AI-generated (Gemini image gen via
  Emergent key) fine-line copperplate etchings in camo-contour style: key, coin seal, bolt, splitting route, vault,
  proof document, closed-eye final art. Forced grayscale + autocontrast, webp. Unused ring_portal/hero_vault deleted.
  Feature cards render them as dark art plates; final CTA eye plate framed with 1px border + scanline sweep.

## Iteration 16 — Art blends into UI (Oct 2026)
- All 7 etched artworks re-encoded: luminance-keyed alpha (black bg -> transparent), so line art sits directly on
  card/section surfaces with no plate seams. Final CTA eye floats on the camo texture; plate border removed.

## Iteration 17 — Chain dashboard, connect sheet, Alpenglow, masking (Oct 2026)
- Chain page: terminal look removed; professional pool-ledger dashboard (title, stat cards, table headers,
  type chips, Alpenglow chip -> /docs#alpenglow). Chain pinned as last tab (desktop order + mobile dock slot 5).
- Connect sheet: recommended card = "Camo Wallet / Native ZK vault · Groth16-protected Solana wallet"; other
  wallets collapsed under "Other wallets · not ZK-native" dropdown; white-on-white contrast fixed; header Connect
  button now white with dark text/glyph; password hint = "Minimum 10 characters."; helper paragraph trimmed.
- Alpenglow: researched (SIMD-0326, Votor, ~150ms finality, epoch 1064); docs page added (/docs#alpenglow) with
  links; home intro + hero kicker + "What Camo Cash is" subline mention it; header tagline on landing + app
  (top-right, hidden <=1180px).
- Masking: all upstream socials removed (t.me, discord, github/veil, veilit.xyz hidden); any x/twitter link that
  is not @trycamocash is rewritten to it; served app HTML has zero external links except font CDNs.
- Backend suite green: 131 passed, 1 skipped.

## Iteration 18 — Wallet sheet defect fix pass (Oct 2026, verified iteration_37.json: frontend 100%)
- Root cause of iter34 crashes: injected JS physically MOVED React-owned .wopt nodes into the dropdown,
  corrupting React reconciliation (appendChild contains-parent / insertBefore NotFoundError on unmount).
  Fix: originals stay in place (inline display:none, re-asserted per tick, scoped to exclude .wext clones and
  anything inside .wgroup); dropdown shows non-destructive clones with forwarded clicks. Zero page errors.
- External wallets (Phantom/Solflare/Backpack) now render visibly inside "Other wallets · not ZK-native".
- Create sheet copy finalized: label "PASSWORD FOR THIS DEVICE — MINIMUM 10 CHARACTERS" (always visible),
  helper exactly "Unlocks on this device only. Your recovery key restores everything." (helper is split
  across 3 text nodes upstream; standalone 'browser' node mapped to empty via paraphrase.json).
- Create button contrast fixed (.lw-onb .btn-primary scoped white/dark). Alpenglow tagline hides when a
  wallet is connected (no header overlap). Tagline badge moved to fixed body-level element (not in header).
- Full flow verified: create vault (10+ char pw) -> recovery key camosk2… -> Open Camo Cash -> dashboard
  ("Camo Cash Wallet · …") -> Receive shows camo2 address + QR. No console page errors.
- Backend suite: 131 passed, 1 skipped (test_iter16 order-drift 409 = known upstream quote flake, passes solo).

## Iteration 19 — Real-data audit + tagline (Oct 2026)
- Health endpoint fixed: indexer/relayer were pinged at `/` (legit 404); now ping `/v1/health` — all five
  upstream services report honest 200s (indexer slot+leaves, relayer {"ok":true}).
- RISK finding (deposit/withdraw same-signer) investigated against live indexer feed (100 latest items):
  46 deposits from 14 unique accounts, 51 withdrawals to 12 unique accounts, ZERO overlap. Withdrawals are
  signed by relayer-side accounts (repeated operator accounts, e.g. 6Lp1…), deposits by users (inherent —
  a deposit must be authorized by the depositor's own wallet). The audit's flagged pair does not reproduce
  in current data (8,409 USDC shield from AUqd…dWa4 vs 8,384 USDC exit to 6Lp1…Rmij — different accounts).
- Relayer proven live through our proxy: GET /api/bifrost/v1/relayer/v1/fee?mint=So111…&amount=10000000
  returns real quote (fee 2086956 lamports, feeAccount 5BfTBW…, inputs:2). Relayer feePayer 7BXoKHgE…
  from /v1/info. All app relayer traffic is rewritten through the proxy (rewrite_text maps every upstream
  host incl. relayer.veilit.xyz in JS/HTML/JSON).
- No mocks found: landing hero stats poll indexer /v1/stats every 5s; Chain dashboard renders live merkle
  root / sealed notes / nullifiers / feed from the same indexer via proxy.
- Header tagline changed to "First Alpenglow finality ZK shielded" (landing TopNav + app header badge).

## Iteration 20 — $CAMO CA in headers (Oct 2026)
- CA chip added to landing header (TopNav.jsx CaChip, also inside mobile drawer) and app header badge
  (camo-app.js ensureTagline): "$CAMO CA · 9DMUQb…pump", click copies full mint
  9DMUQbHWth5TtdSPZ1pRPsLTxsfYfM97n7K6x1MLpump and flashes "CA copied". data-testids: nav-ca,
  nav-ca-drawer, app-ca. Chip hides with the tagline when a wallet is connected.
- No other brand token surfaced: upstream project token mint stays stubbed/hidden (PROJECT_TOKEN_STUB,
  HIDDEN_MINTS); served app HTML scan shows zero upstream mint/symbol leaks. Other tokens appear only
  inside swap token selectors, which is required functionality.

## Iteration 21 — CA chip at top of every page incl. mobile (Oct 2026)
- Landing/docs (TopNav): CaChip now visible at all widths (was md+ only); compact on mobile, no wrap.
- App mirror: tagline badge restructured — CA chip stays visible on all widths; only the tagline text hides
  <=1180px. fixTaglineOverlap now repositions the badge dynamically (right = wallet button width + 34) and
  only hides the tagline span when connected, so the CA chip is always on top. Chip text shortens to
  "9DMUQb…pump" below 640px. fitNavNow accounts for badge width so nav tabs never slide under it.
- Mobile app header compacting: brand clipped to 112px, connect button slimmed, badge font 9px —
  verified geometry: brand(124) < chip(147..232) < connect(252), no overlap at 375px.
