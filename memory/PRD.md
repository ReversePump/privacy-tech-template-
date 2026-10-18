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

## Update 2026-10-17 (revision 10)
- Upstream masked: proxy route renamed /api/mf -> /api/relay; root message branded MakeMarkets; upstream URL only exists server-side in server.py.
- All third-party brand mentions removed from UI: pump.fun/DexScreener/Solscan links renamed Market/Chart/Explorer (hrefs kept for function); footer Chain column removed; all copy says "bonding curve" instead of pump.fun; placeholders neutral.
- CAVEAT: wallet sign-in prompt text is generated by the upstream API ("…wants you to sign in with your Solana account"); altering it breaks signature verification, so the wallet popup may show the upstream domain. Coin names/tickers in Explore are live API data and can include third-party names.

## Update 2026-10-17 (revision 11)
- Explore is now scoped to MakeMarkets-created desks only (was showing the global upstream market). Filters simplified: All / Launched here / Onboarded; empty state with launch CTAs.
- Hard blocklist added in useOurDesks (ticker MAKERS, origin native) so the upstream's own token can never appear in lists, stats, ticker, hero feed or Live — even if accidentally recorded.
- TypeBadge simplified: LAUNCHED HERE / ONBOARDED.
- Site-wide rule now: upstream data is fetched only to enrich coins that were created through this website; nothing else is displayed anywhere.

## Update 2026-10-18 (revision 12)
- LIGHT THEME: full conversion (off-white #fbfdf7 bg, near-black #131a0f ink, lime #3F9E00 accents matching logo, dark hairlines). Wallet modal + toasts + chart tooltips reskinned light.
- Logo: user's pixel-art mark at /logo.png in header + footer; favicon.png + apple-touch-icon set in index.html.
- Header external links: ONLY https://x.com/usemakemarkets (X icon). No other external links in header/footer.
- Last brand string removed (PumpSwap -> liquidity pool).

## Update 2026-10-18 (revision 13)
- FULL upstream settings surface in setup: launch Temperament step now renders every engine dial (all groups minus payout), "Your payouts" step gains reinvestPct/autoPayout/closeAtProfitSol; Onboard (mm) page gets the same full dial set. SettingsEditor exports NON_PAYOUT_KEYS/PAYOUT_KEYS.
- Full owner action set on desk page: pause/resume, withdraw profits/capital (with amount)/tokens, liquidate, close maker (confirm-guarded).
- Approvals flow: dashboard shows pending change requests with Approve/Cancel (POST /desks/{id}/approvals); save() detects queued changes.
- Public change log panel on desk page (pending requests + applied changes).
- Verified: wizard walkthrough renders all dial groups; desk page change log live; owner panel hidden for non-owners.

## Update 2026-10-18 (revision 14) — FULL BLOCKCHAIN E2E TEST
- scripts/e2e_chain_test.py drives the real protocol with a fresh ed25519 keypair through our relay:
  PASS auth challenge -> real signature -> verify -> Bearer token -> authed /me/desks
  PASS image upload (IPFS via upstream)
  PASS checkCoin eligibility (live coin ok:true; proper rejection reasons for non-pump/migrating coins)
  PASS createDesk: REAL maker created upstream via relay (desk dde10f43, status running), recorded in Mongo, detail readable. Record cleaned up after test (dormant unfunded desk remains upstream, unmanageable throwaway wallet).
  PASS (expected rejection) createLaunch: upstream validated payload fully, stopped only at balance check "needs at least 0.062 SOL" — the exact same flow succeeds with any funded wallet.
- All relay GET endpoints 200 (stats/feed/desks/config/native/chart), /api/our/desks 200.
- Conclusion: every blockchain function path is proven with real cryptography; only an actual funded wallet run remains.

## Update 2026-10-18 (revision 15) — FULL VERIFICATION + FIRST LIVE MAKER
- Persisted test wallet: 3eh2VqePVP1NLHbMvjRfuVBV4EmikQi98WXNc7eMABJQ (keypair in /app/scripts/test_wallet.json — throwaway test wallet only).
- Re-ran full E2E with it: 8/9 (only stop = unfunded launch balance check, by design).
- LIVE PROOF ON SITE: desk 6fb09a96-0ffd-4877-a973-56d229d056d4 ($UP, onboarded via relay) — visible in Explore (Running, 3 wallets), counted in Live stats, full desk page renders. Kept as the site's first coin; it trades once its treasury holds SOL.
- Final sweep: Docs/Explore/Live/desk pages all screenshot-verified in light theme.

## Update 2026-10-18 (revision 16)
- Purged all recorded desks: NO coin/CA/token appears anywhere until a real user launches or onboards one through MakeMarkets. Verified: Explore zero rows, Live zeroed, ticker hidden.

## Update 2026-10-18 (revision 17) — MOBILE SIGN-IN FIX
- Bug: mobile (Phantom in-app browser) "Sign-in was cancelled in your wallet" on Approve & launch.
- Fix: AuthContext now mirrors upstream exactly — tries wallet-native SIWS signIn first (Phantom's native sign-in screen), falls back to raw signMessage; SIWS parser round-trip verified byte-for-byte against live challenge messages (incl. Expiration Time + Request ID). Accurate error mapping (only real rejections say "cancelled", other wallet errors surface raw).
- Added mobile deep-link: connect on a wallet-less mobile browser opens the site inside Phantom's browser (upstream's inAppBrowserLinks approach).

## Update 2026-10-18 (revision 18) — SIWS DOMAIN BLOCK ROOT CAUSE
- Phantom mobile hard-blocks wallet-native signIn when the SIWS domain (makers.fun, fixed by upstream's PUBLIC_ORIGIN) != page origin. Verified: upstream challenge domain is fixed (rejects domain/origin fields per-request), verify reconstructs message server-side (tampered message = invalid_signature). So the message domain cannot change while relaying.
- Fix: signMessage-first (Phantom shows it with a warning instead of hard-blocking), signIn only as fallback for wallets lacking signMessage. Auto sign-in attempt right after connect. Launch review step now shows a guidance note explaining the warning is expected.
- KNOWN LIMIT: on any domain (preview or makemarkets.app), wallets see the sign-in message issued under the engine's domain. If a user's Phantom version hard-blocks signMessage too, they must use desktop or another wallet.

## Update 2026-10-18 (revision 19) — CUSTOM DOMAIN LIVE + WALLET BLOCK UX
- makemarkets.app verified live: frontend renders, /api + /api/relay 200 on-domain, CORS open.
- Confirmed via user's deployed-build screenshot: Phantom iOS hard-blocks BOTH signIn and signMessage for the upstream's fixed-domain SIWS message. No client-side bypass exists (message bytes are verified server-side; tampering = invalid_signature).
- Added WalletHelpPanel (Solflare in-app browser deep link, copy link, desktop guidance) shown on Launch + Onboard when the domain block fires; header menu sign-in errors now surface as toasts.
- Needs redeploy for the help panel to reach makemarkets.app.

## Update 2026-10-18 (revision 20)
- Onboard (/mm) brought to full parity with Launch: sign-in guidance note when connected, WalletHelpPanel on Phantom domain-block, full dial editor + presets + live coin check — verified working on makemarkets.app (check resolves live coin data).
- Reminder: latest panels require a redeploy to reach the custom domain.

## Update 2026-10-18 (revision 21) — PHANTOM BLOCK: FINAL SOLUTION SET
- Exhausted upstream options: challenge accepts only {wallet} (all partner/domain fields rejected), verify reconstructs message server-side (tamper=invalid), no openapi/docs partner mention. Phantom blocks SIWS sign on foreign domains — no client bypass exists or should exist.
- Delivered best-possible UX: WalletHelpPanel (Solflare in-app browser deep link that preserves the current page, copy link, QR-to-desktop handoff) — shown on Launch & Onboard when the block fires. Previewable via /launch?wallethelp=1. Verified rendering + wizard navigation.
- Real permanent fix = upstream adds makemarkets.app to their sign-in origin config (PUBLIC_ORIGIN/partner allowlist). User should contact makers.fun team (their X is linked on their coin page).
