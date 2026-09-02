# Project Notes — Solana Memecoin Paper Trader

Context for continuing this project in Claude Code. Read this before making
changes — it captures decisions and constraints from the conversation this
project came out of, not just what the code does.

## What this is
A beginner-focused, Axiom.trade-inspired iOS-style paper trading app for
Solana memecoins. Virtual balance (100 SOL start), real market data, no real
wallet/money ever. Built as a web app (React + Vite), not a native app —
that was an explicit scope decision (no Xcode/Swift access available).

## Screens
- **Discover** — search + Trending/New/Gainers/Losers/Volume/Watchlist tabs
- **Memescope** — New Pairs / Final Stretch / Bonded, matching Photon-style
  bonding-curve views (see Filters below for exact thresholds)
- **Wallets** — tracked-wallet list imported from the user's real Axiom
  wallet tracker export (103 wallets; one entry with a racial slur in its
  label was deliberately dropped)
- **Portfolio** — balance, holdings, PnL, win rate, trade history
- **Learn** — beginner glossary incl. trench-culture slang (bonding curve,
  dev wallet, sniper/bundler, insider activity, CTO, LP locked/burned,
  honeypot, bubble map, smart money, MC vs FDV, NGMI/WAGMI, etc.) +
  Beginner Mode toggle

## Memescope filter thresholds (source: user's real Axiom filter export)
- **Bonded tab**: market cap >= $10,000 AND lifetime fees >= 1 SOL — these
  two numbers came directly from the user's actual Axiom filters JSON, not
  a guess.
- **New Pairs tab**: age <= 10 minutes.
- **Final Stretch tab**: age <= 1 hour, market cap >= $10,000, fees >= 0.5
  SOL — these three were *my* reasonable approximation (user only gave
  exact numbers for the Bonded/migrated tab).
- **Graduation threshold**: live, not fixed. Formula is
  `85 SOL * current SOL/USD price` (pump.fun's bonding curve completes at
  ~85 SOL raised, historically ~$69K market cap — confirmed via research,
  moves with SOL price). Do not hardcode a flat dollar threshold again —
  that was an earlier mistake the user caught.

## Data sources and their real limitations
- **DexScreener public API** (`api.dexscreener.com`) — token search,
  prices, market cap, liquidity, volume. Free, no key. Known gap: `info`
  (which carries the token image) is only populated for a subset of pairs,
  especially fresh pump.fun bonding-curve tokens. Missing images are
  expected, not a bug — fallback is a letter avatar.
- **GeckoTerminal public API** (`api.geckoterminal.com`) — OHLCV chart data.
  Known gap: does **not** index pre-graduation pump.fun bonding-curve
  pools, only real AMM pools. So charts work for Bonded-tab tokens but will
  legitimately show "no data" for New/Final Stretch tokens. This is the
  single biggest unresolved gap in the app.
  - **Real fix, not yet built**: read pump.fun's bonding curve account
    directly via Solana's public RPC (`getAccountInfo` on the bonding
    curve PDA for a given mint). That's the actual source of truth every
    terminal (Photon, GMGN, Padre, Axiom) ultimately reads from. None of
    those platforms expose a public API — confirmed, don't retry that path.
    Needs the correct Anchor account layout for pump.fun's bonding curve
    struct (virtual/real SOL reserves, virtual/real token reserves,
    complete flag) — verify the layout carefully before decoding; getting
    the byte offsets wrong will silently produce garbage numbers.
- **Solana public RPC** (`api.mainnet-beta.solana.com`) — used for the
  Wallets tab, `getSignaturesForAddress` per wallet, on-demand (tap to
  load), not continuous polling of all 103 wallets (rate-limit risk).
  Currently shows recent tx signatures + timestamps only — does **not**
  decode which token was bought/sold or trade size. That's real future
  work (parsing swap instructions), scoped out deliberately, not an
  oversight.
- **Axiom itself** — no public API, no login integration. The token
  universe shown will never exactly match the user's real Axiom feed;
  that's a hard limit, not something to keep attempting.
- **Protocol include/exclude filtering** (from the user's Axiom filter
  export — pump/bonk/boop/etc. true, raydium/orca/meteora/pumpAmm false):
  **not implemented**, deliberately. For already-migrated tokens,
  DexScreener's `dexId` reflects the *current* trading venue, not the
  origin launchpad, so this can't be replicated without producing wrong
  results. Don't attempt a `dexId`-based hack for this again without a
  better data source.

## Environment history (why this is a standalone project now)
Originally built as a single-file Claude.ai artifact (React, rendered
inline in chat). That environment sandboxes outbound `fetch()` to
arbitrary domains — confirmed via the "LIVE vs SIMULATED" badge always
reading SIMULATED there, no matter what the code did. That's why this
became a real Vite project: a normal browser tab has no such restriction.

Consequence: swapped Claude-artifact-only `window.storage` for real
browser `localStorage` (see `usePortfolio` in `src/App.jsx`). Portfolio
state now persists per-browser/device, not tied to any Claude session.

## Explicit non-goals (already discussed, don't relitigate)
- Native iOS App Store app — out of scope (no Xcode access).
- Pixel-exact match to Axiom's real feed/account — impossible without
  Axiom's private API.
- Continuous background monitoring of all tracked wallets — deferred,
  real-time infra beyond what's built so far.
