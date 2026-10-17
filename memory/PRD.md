# PRD — makers.fun clone (EmpireX-themed)

## Original request
Clone https://makers.fun/ 1:1 with full backend via proxy of their API (api.makers.fun), real on-chain function, real Phantom/Solana wallet connect. Revision: theme/layout like https://empirex.io/ (dark cinematic navy + mint), different page arrangement, SAME proxy (do not break). Launch wizard: SOL-with-own-maker ONLY (no $MAKERS pairing / half-burn options).

## Architecture
- Backend: FastAPI transparent relay `/api/mf/{path}` -> `https://api.makers.fun/{path}` (all methods, body, query, Authorization Bearer passthrough, Set-Cookie domain rewrite, content-encoding stripped). /app/backend/server.py
- Frontend: React CRA + craco (solana polyfills), @solana/wallet-adapter (Wallet Standard discovery), web3.js v1, recharts, sonner.
- Auth: POST /auth/challenge -> signMessage (bs58) -> POST /auth/verify -> Bearer token in localStorage "makers:session".
- Launch flow: POST /images -> POST /launches -> POST /launches/{deskId}/prepare -> sign VersionedTransaction -> POST /launches/{deskId}/submit {signedTransaction base64}; separate treasury funding transfer if terms.fundInLaunch === false.

## Implemented (2026-10-17)
- Pages: Home (hero + live activity + stats + money flow + presets + CTA), Explore (filters/sort/search table), Live (stats + feed filters, 10s poll), Token $MAKERS (stats + chart + rewards), Burn (burns/coins/buybacks), Crown (board + burn form), Docs, Desk detail (stats/chart/wallets/settings/trades/owner actions), Dashboard (my makers + settings editor), Launch wizard (6 steps, SOL-only), Any coin /mm (check + create desk).
- Theme: EmpireX dark (#07111f, mint #8AF5D0, Outfit + Playfair italic + JetBrains Mono, pill buttons, glass cards).
- Verified via curl: all 10+ GET endpoints relay 200 with real data. Verified via screenshots: home/explore/launch/live/token/burn/crown/mm/desk render with live data.

## Not verified (needs real browser wallet)
- Wallet sign-in, launch sign+submit, crown burn, owner pause/resume/withdraw, settings PATCH.
- /mm create-desk signing submit path is best-effort (upstream shape not fully discoverable).

## Backlog
- P1: Verify launch/sign-in with a funded test wallet; fix payload drift if API rejects.
- P1: Desk settings approval flow (POST /desks/{id}/approvals) UI.
- P2: Pagination via `next` cursor on explore; trades `before` cursor.
- P2: Strategy leaderboard page, share card.

## Update 2026-10-17 (revision 2)
- /mm rewritten to match real upstream flow: checkCoin -> createDesk(mint, settingsDiff) -> deposit SOL via wallet transfer to desk treasury. Preset picker added; ?mint= deep link supported.
- Launch verified SOL-only (pairing/half-burn removed everywhere). Payload matches upstream: name/ticker/description/imageUrl/links/initialBuySol/fundSol/settings diff (defaults incl. rewardsToMmPct, payoutMinSol).
- Removed ALL static $MAKERS references: nav item + /token page + route deleted, home/docs/footer/burn/crown/explore copy neutralized ("the platform token"); token tickers shown only as live API data.
- Verified: proxy returns 401 "Wallet login required" for /launches and /desks without auth (correct); checkCoin ok:true with market data; launch wizard validation + summary rail; mm UI check flow end-to-end.

## Update 2026-10-17 (revision 3)
- Settings UX redesigned to avoid looking like a direct copy: new SettingsEditor component (src/components/SettingsEditor.jsx) groups the same API keys under our own labels/groups (Dip buying / Taking profit / Protection / Rhythm & size / Wallets & capital / Your payouts) with sliders, toggles, off/set pills.
- Dashboard settings editor rebuilt on it (PATCH /desks/{id}/settings unchanged, only changed keys sent).
- Desk page read-only settings now a grouped chip summary (SettingsSummary).
- Launch wizard strategy step uses the same editor with core keys.
- Verified via browser automation: launch wizard image upload + 3-step navigation + strategy editor render; desk page grouped summary with live values.

## Update 2026-10-17 (revision 4)
- Burn and Crown removed entirely: nav tabs, routes (redirect home), pages deleted, footer links, explore crown banner.
- Live page stats reworked to launch-focused: Makers running / Coins launched (origin launch+native) / Makers added (origin mm+external) / Trading wallets / Volume / Trades 24h. Rewards/P&L/payout stats removed. Feed unchanged (fully live via proxy).

## Update 2026-10-17 (revision 5)
- Live page is now scoped to OUR platform only: proxy records deskIds in Mongo (db.our_desks) on POST /desks success (origin=mm) and POST /launches/{id}/submit success (origin=launch). New endpoint GET /api/our/desks.
- Live stats + feed filter to recorded desks only; stats enriched via per-desk detail fetch (pagination-safe). Empty state until first real launch through this clone.
- Home ticker/hero feed remain global (landing showcase). Explore remains the global market browser.

## Update 2026-10-17 (revision 6)
- Scoped ALL live displays site-wide to this platform's coins: new shared hook src/lib/useOurDesks.js (polls /api/our/desks every 30s, enriches per-desk).
- Ticker: filtered to our desks, hidden when none. Home hero activity: filtered, "waiting for first coin" empty state with CTA. Home stats strip: computed from our desks (running/wallets/volume/claimed/realized/paid/trades24h), labeled "Coins launched or added through this site". Home Live makers grid: ours-only with empty-state CTA.
- Live.jsx refactored onto the shared hook.
- Verified via screenshots: home shows zeros + empty states, no proxy-global data anywhere on landing/live.

## Update 2026-10-17 (revision 7)
- Typography switched to angular/blocky: Archivo Black (display accents), Chakra Petch (UI/body), Space Mono (mono/data). Removed Outfit/Playfair/JetBrains everywhere (incl. wallet modal reskin, toaster, chart tooltip).

## Update 2026-10-17 (revision 8)
- Squared all interactive shapes (rounded-full -> rounded-[3px]) across pages/components + wallet adapter buttons, matching the angular type system.

## Update 2026-10-17 (revision 9)
- Rebrand: project is MakeMarkets (logo, footer, page title/meta). "Market maker" terminology kept everywhere (it IS the product).
- Copy paraphrased site-wide (no makers.fun sentences): hero "your coin, with a market maker built in.", money-flow cards (vault/wallets/market), temperament section, CTA, Explore ("Every maker. Every market."), Live ("Every fill, as it settles."), Docs fully rewritten (6 sections, own voice).
- Launch wizard steps renamed: Identity / Opening buy / Maker fuel / Temperament / Your payouts / Review & launch; summary rail "What your wallet approves".
- Header layout: primary nav (Explore, Live, Docs) + search + Onboard (outline) + Launch (white) + Connect (mint) action cluster. Mobile keeps all links.
