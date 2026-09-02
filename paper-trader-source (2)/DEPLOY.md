# Paper Trader — Deploy Instructions

This is a standalone build of your Solana paper-trading app. It runs as a
normal website, so it has none of the network restrictions Claude.ai's
artifact preview has — the live DexScreener/GeckoTerminal/Solana RPC calls
will actually work here.

## Fastest option — no account, no coding (2 minutes)

1. Unzip `paper-trader-dist.zip`.
2. Go to https://app.netlify.com/drop
3. Drag the unzipped `dist` folder onto the page.
4. You'll get a live URL immediately (something like `random-name.netlify.app`).

That's a real, working deployment. Good for testing right now.

## Permanent option — auto-redeploys when you make changes

This uses `paper-trader-source.zip` (the actual project, not just the build).

1. Unzip `paper-trader-source.zip`.
2. Create a free GitHub account if you don't have one, and push this folder
   as a new repository (GitHub's website has an "upload files" option if you
   don't want to use git directly).
3. Go to https://vercel.com (or https://netlify.com), sign up free, and
   choose "Import Project" / "New site from Git" and point it at that repo.
4. It auto-detects Vite, builds it, and gives you a live URL. Every time you
   push a change to GitHub, it redeploys automatically.
5. Both Vercel and Netlify let you attach a custom domain for free (you'd
   still need to buy the domain itself from a registrar).

## What changed for this version vs. the Claude.ai artifact

- **Data persistence**: your balance/holdings/trade history now save to this
  browser's `localStorage` instead of Claude's memory. It'll survive
  reloads on this device/browser, but won't follow you to a different one.
- **Live data**: DexScreener search, GeckoTerminal chart data, and the
  Solana RPC wallet lookups all call out directly from the visitor's
  browser — nothing routes through Claude, so there's no sandbox blocking
  it here.
- Everything else (UI, trading logic, Memescope filters, Learn tab, wallet
  tracker) is identical to what you've been looking at.

## Running it locally instead (if you have Node.js installed)

```
cd paper-trader-source
npm install
npm run dev
```

Opens at http://localhost:5173 with hot-reload while you edit.
