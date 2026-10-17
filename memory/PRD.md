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
