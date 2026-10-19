# Weft — Trade the thesis. (Project PRD)

## Product
Weft-style thesis-trading platform. Users write a market view in plain English; it becomes a
readable strategy that can be backtested and traded. The platform relays public market data from
the upstream Weft API and adds its own native accounts with auto-generated wallets and REAL trading.

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
- Account dashboard: SOL balance, HL equity, generated addresses (copyable), live HL markets.
- Solana swap panel (SOL → $WEFT/USDC/any mint) wired to real Jupiter execution path.
- Hyperliquid perps panel: market select w/ live prices, long/short, leverage, open + close.
- Withdrawals: SOL to any address; USDC via HL `usd_transfer` to any HL account.
- Session persistence across reload; sign-out; wrong-password/duplicate-email handling.
- No key material in any API response or localStorage (security-verified by test agent).
- Wallet-signature sign-in path retained for users with their own Phantom/Solflare.
- Tests: `/app/backend/tests/test_email_auth_wallets.py` (17) + `test_weft_relay.py` (16) — 33 pass.

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
