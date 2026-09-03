import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import {
  Search, Star, ArrowUpRight, ArrowDownRight, ChevronLeft, X, Info, Bell,
  Flame, Clock, BarChart3, Wallet, GraduationCap, Compass, CircleAlert,
  ShieldAlert, Check, RefreshCw, Rocket, Sparkles, Users, ExternalLink,
} from "lucide-react";

/* ============================================================
   DESIGN TOKENS
   Ink-black terminal with layered panels. Green/red reserved
   strictly for market movement and P&L; amber is the only
   accent, used for navigation and primary actions.
============================================================ */
const C = {
  bg: "#08090B",
  panel: "#111318",
  panel2: "#181A20",
  panel3: "#20232B",
  border: "#282B33",
  borderSoft: "#1C1E24",
  borderStrong: "#363A44",
  text: "#F3F3F1",
  sub: "#94969F",
  faint: "#5C5E67",
  amber: "#F0A93E",
  amberDim: "#3A2E17",
  buy: "#3ECF7E",
  buyDim: "#15291F",
  sell: "#F5525B",
  sellDim: "#2E1518",
};

const MONO = "'JetBrains Mono', ui-monospace, monospace";
const SANS = "'Inter', system-ui, sans-serif";

const FONT_CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`;

// Shared style objects — previously these were repeated inline dozens of
// times, which is most of why the file had grown unmanageable.
const CARD = {
  background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`,
  border: `1px solid ${C.borderSoft}`,
  boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)",
  borderRadius: 14,
  overflow: "hidden",
};
const STAT = { ...CARD, borderRadius: 12, padding: "10px 12px" };
const LABEL = {
  fontSize: 11, fontWeight: 700, color: C.amber, margin: "4px 0 8px",
  textTransform: "uppercase", letterSpacing: 0.8,
};
const INPUT_WRAP = {
  display: "flex", alignItems: "center", background: C.panel,
  border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px",
};
const INPUT = {
  flex: 1, background: "transparent", border: "none", outline: "none",
  color: C.text, fontSize: 15, fontFamily: MONO, minWidth: 0,
};
const QUICK_BTN = {
  flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${C.border}`,
  background: C.panel2, color: C.text, fontWeight: 600, fontSize: 12.5,
  cursor: "pointer", fontFamily: MONO,
};
const ACTION_BTN = {
  width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
  color: "#08090B", fontWeight: 800, fontSize: 15, cursor: "pointer",
};

const SOL_FALLBACK_PRICE = 148.0;
const TEN_MIN_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const START_BALANCE_SOL = 100;

/* ============================================================
   FORMATTING
============================================================ */
function fmtUsd(n) {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(1) + "K";
  if (a > 0 && a < 0.01) return n.toFixed(6);
  if (a < 1) return n.toFixed(4);
  return n.toFixed(2);
}
function fmtPrice(n) {
  if (n == null || isNaN(n) || n === 0) return "0";
  if (n < 0.000001) return n.toExponential(2);
  if (n < 0.01) return n.toFixed(10).replace(/0+$/, "");
  if (n < 1) return n.toFixed(6);
  return n.toFixed(4);
}
function fmtSol(n) {
  if (n == null || isNaN(n)) return "—";
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}
function pct(n) {
  if (n == null || isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function timeAgo(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function shortAddr(a) {
  return a ? `${a.slice(0, 4)}...${a.slice(-4)}` : "—";
}

/* ============================================================
   DATA LAYER

   Three real sources, no fabrication anywhere:
     - DexScreener  : token discovery, prices, market data
     - GeckoTerminal: OHLCV candles (AMM pools only)
     - Solana RPC   : mint authority checks, wallet signatures

   Everything these can't provide is labelled unavailable in the
   UI rather than invented. See the notes on each function for
   the specific known gaps.
============================================================ */
const DS = "https://api.dexscreener.com";
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

function mapPair(p) {
  return {
    address: p.baseToken?.address,
    pairAddress: p.pairAddress,
    symbol: p.baseToken?.symbol,
    name: p.baseToken?.name,
    priceUsd: parseFloat(p.priceUsd) || 0,
    change5m: p.priceChange?.m5 ?? 0,
    change1h: p.priceChange?.h1 ?? 0,
    change6h: p.priceChange?.h6 ?? 0,
    change24h: p.priceChange?.h24 ?? 0,
    volume24h: p.volume?.h24 ?? 0,
    volume1h: p.volume?.h1 ?? 0,
    liquidity: p.liquidity?.usd ?? 0,
    marketCap: p.marketCap ?? p.fdv ?? 0,
    fdv: p.fdv ?? p.marketCap ?? 0,
    buys24h: p.txns?.h24?.buys ?? 0,
    sells24h: p.txns?.h24?.sells ?? 0,
    createdAt: p.pairCreatedAt ?? null,
    dexId: p.dexId ?? null,
    image: p.info?.imageUrl ?? null,
    website: p.info?.websites?.[0]?.url ?? null,
    socials: p.info?.socials ?? [],
    url: p.url,
    simulated: false,
  };
}

async function dsSearch(query) {
  const r = await fetch(`${DS}/latest/dex/search?q=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error("search failed");
  const d = await r.json();
  return (d.pairs || []).filter((p) => p.chainId === "solana" && p.baseToken?.symbol).map(mapPair);
}

// Token universe. An earlier version searched the literal text "pump",
// which mostly returned the $PUMP token itself. These boosted/profiled
// feeds are a real curated set of active tokens, and most carry icons.
async function fetchUniverse() {
  const [b, p] = await Promise.allSettled([
    fetch(`${DS}/token-boosts/top/v1`).then((r) => r.json()),
    fetch(`${DS}/token-profiles/latest/v1`).then((r) => r.json()),
  ]);
  const entries = [
    ...(b.status === "fulfilled" && Array.isArray(b.value) ? b.value : []),
    ...(p.status === "fulfilled" && Array.isArray(p.value) ? p.value : []),
  ].filter((e) => e.chainId === "solana" && e.tokenAddress);

  const icons = {};
  const addrs = [];
  const seen = new Set();
  for (const e of entries) {
    if (!seen.has(e.tokenAddress)) { seen.add(e.tokenAddress); addrs.push(e.tokenAddress); }
    if (e.icon && !icons[e.tokenAddress]) icons[e.tokenAddress] = e.icon;
  }
  if (!addrs.length) return [];

  const chunks = [];
  for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30));
  const res = await Promise.allSettled(
    chunks.map(async (ch) => {
      const r = await fetch(`${DS}/latest/dex/tokens/${ch.join(",")}`);
      if (!r.ok) throw new Error("tokens failed");
      return (await r.json()).pairs || [];
    })
  );
  return res
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .filter((p) => p.chainId === "solana" && p.baseToken?.symbol)
    .map((p) => {
      const m = mapPair(p);
      if (!m.image && icons[m.address]) m.image = icons[m.address];
      return m;
    });
}

// Candles. GeckoTerminal only indexes real AMM pools, so tokens still on
// a pump.fun bonding curve legitimately have no chart here — the UI says
// so rather than drawing something invented.
const TIMEFRAMES = [
  { id: "1m", label: "1m", path: "minute", aggregate: 1 },
  { id: "5m", label: "5m", path: "minute", aggregate: 5 },
  { id: "15m", label: "15m", path: "minute", aggregate: 15 },
  { id: "1h", label: "1H", path: "hour", aggregate: 1 },
  { id: "4h", label: "4H", path: "hour", aggregate: 4 },
  { id: "1d", label: "1D", path: "day", aggregate: 1 },
];

async function fetchCandles(pairAddress, tf) {
  const f = TIMEFRAMES.find((t) => t.id === tf) || TIMEFRAMES[1];
  const r = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/${f.path}?aggregate=${f.aggregate}&limit=120`
  );
  if (!r.ok) throw new Error("ohlcv failed");
  const list = (await r.json())?.data?.attributes?.ohlcv_list || [];
  if (!list.length) throw new Error("empty");
  return list
    .slice()
    .reverse()
    .map(([ts, open, high, low, close, volume]) => ({ t: ts * 1000, open, high, low, close, volume }));
}

// DexScreener's pairAddress and GeckoTerminal's pool address don't always
// match — especially for pump.fun bonding-curve pairs. When the direct
// lookup misses, ask GeckoTerminal which pools it has for this mint and
// use its own top pool address instead. GeckoTerminal indexes pump-fun as
// a DEX, so curve pools are chartable this way before migration.
const poolCache = new Map();

async function resolvePoolAddress(tokenAddress) {
  if (poolCache.has(tokenAddress)) return poolCache.get(tokenAddress);
  const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenAddress}/pools`);
  if (!r.ok) throw new Error("pool lookup failed");
  const pools = (await r.json())?.data || [];
  if (!pools.length) throw new Error("no pools");
  // Highest reserve first, so we chart the pool that actually has depth.
  const best = pools
    .slice()
    .sort((a, b) => (parseFloat(b.attributes?.reserve_in_usd) || 0) - (parseFloat(a.attributes?.reserve_in_usd) || 0))[0];
  const addr = (best.attributes?.address) || (best.id || "").replace(/^solana_/, "");
  if (!addr) throw new Error("no pool address");
  poolCache.set(tokenAddress, addr);
  return addr;
}

// Tries the fast path, then the resolved-pool path. Returns candles plus
// which route produced them, so the UI can be honest about the source.
async function loadCandles(token, tf) {
  if (token.pairAddress && !token.simulated) {
    try {
      return { candles: await fetchCandles(token.pairAddress, tf), via: "pair" };
    } catch { /* fall through to pool resolution */ }
  }
  if (token.address && !token.simulated) {
    const pool = await resolvePoolAddress(token.address);
    return { candles: await fetchCandles(pool, tf), via: "resolved" };
  }
  throw new Error("no chart route");
}

// Mint + freeze authority, straight from chain. These two are genuinely
// checkable; holder counts, sniper/insider/bundler percentages and wallet
// P&L are not available without a paid indexer, so they are not shown.
async function fetchMintSafety(mint) {
  const r = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [mint, { encoding: "jsonParsed" }] }),
  });
  if (!r.ok) throw new Error("rpc failed");
  const info = (await r.json())?.result?.value?.data?.parsed?.info;
  if (!info) throw new Error("no mint info");
  return {
    mintAuthority: info.mintAuthority || null,
    freezeAuthority: info.freezeAuthority || null,
    supply: info.supply,
    decimals: info.decimals,
  };
}

// Recent signatures for a tracked wallet. Real on-chain data, but note
// it does not decode which token was traded — that needs swap-instruction
// parsing, which is left for a future indexer rather than guessed at.
async function fetchWalletActivity(address, limit = 8) {
  const r = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit }] }),
  });
  if (!r.ok) throw new Error("rpc failed");
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || "rpc error");
  return j.result || [];
}

/* ------------------------------------------------------------
   Bonding curve. A pump.fun curve completes at ~85 SOL raised,
   so the USD graduation threshold moves with SOL's price rather
   than being a fixed dollar figure.
------------------------------------------------------------- */
const GRAD_SOL = 85;
const gradMcUsd = (solPrice) => GRAD_SOL * (solPrice || SOL_FALLBACK_PRICE);

function bondStage(t) {
  if (t.simulated) return t.stage;
  return t.dexId && t.dexId !== "pumpfun" ? "graduated" : "bonding";
}
function bondPct(t, solPrice) {
  if (t.simulated) return t.bondingPctVal ?? 0;
  if (t.dexId && t.dexId !== "pumpfun") return 100;
  return Math.min(100, Math.max(0, (t.marketCap / gradMcUsd(solPrice)) * 100));
}
// Fees are approximated from volume — exact cumulative curve fees are not
// exposed by the free API. Every place this is displayed says so.
function estFeesSol(t, solPrice) {
  if (t.simulated) return t.feesSol ?? 0;
  return ((t.volume24h || 0) * 0.01) / (solPrice || SOL_FALLBACK_PRICE);
}

/* ------------------------------------------------------------
   Offline fallback. Only used when the network is unreachable —
   the UI shows a SIMULATED badge whenever this is active so it
   is never mistaken for live market data.
------------------------------------------------------------- */
function seedSim() {
  const names = [
    ["SNAIL", "Turbo Snail"], ["FROG", "Based Frog"], ["MOON", "Moonshot Inu"],
    ["WOJAK", "Wojak Classic"], ["PEPE2", "Solana Pepe"], ["CHAD", "Chad Coin"],
    ["RUG", "Definitely Not A Rug"], ["DEGEN", "Degen Capital"], ["FLOKI", "Floki Sol"],
    ["NYAN", "Nyan Sol"], ["APU", "Apu Apustaja"], ["MEOW", "Meow Finance"],
  ];
  const threshold = gradMcUsd(SOL_FALLBACK_PRICE);
  return names.map(([sym, name], i) => {
    const group = i < 5 ? "new" : i < 8 ? "graduating" : "graduated";
    const stage = group === "graduated" ? "graduated" : "bonding";
    const bp = group === "new" ? Math.random() * 55 : group === "graduating" ? 80 + Math.random() * 20 : 100;
    const age = group === "new" ? Math.random() * TEN_MIN_MS
      : group === "graduating" ? Math.random() * ONE_HOUR_MS
      : Math.random() * 864e5 * 20;
    const vol = Math.random() * 4e6;
    const mc = stage === "bonding" ? (bp / 100) * threshold : Math.random() * 12e6 + 1e5;
    const buys = Math.floor(Math.random() * 900) + 20;
    return {
      address: "SIM" + uid() + i, pairAddress: "SIM" + uid(), symbol: sym, name, image: null,
      priceUsd: +(Math.random() * (i < 3 ? 2 : 0.05)).toFixed(8) || 0.0000123,
      change5m: (Math.random() - 0.5) * 6, change1h: (Math.random() - 0.5) * 20,
      change6h: (Math.random() - 0.5) * 40, change24h: (Math.random() - 0.45) * 80,
      volume24h: vol, volume1h: vol * 0.05,
      liquidity: Math.random() * 9e5 + 2e4, marketCap: mc, fdv: mc * 1.1,
      buys24h: buys, sells24h: Math.floor(buys * (0.3 + Math.random() * 0.5)),
      createdAt: Date.now() - age, stage, bondingPctVal: bp,
      feesSol: group === "new" ? Math.random() * 0.3 : group === "graduating" ? 0.5 + Math.random() * 2 : 1 + Math.random() * 7,
      socials: [], simulated: true,
    };
  });
}
function jitterSim(tokens) {
  return tokens.map((t) => {
    const p = Math.max(t.priceUsd * (1 + (Math.random() - 0.5) * 0.06), 1e-10);
    const d = ((p - t.priceUsd) / t.priceUsd) * 100;
    const bp = t.stage === "bonding" ? Math.min(100, Math.max(0, t.bondingPctVal + (Math.random() - 0.35) * 3)) : t.bondingPctVal;
    return {
      ...t, priceUsd: p,
      change5m: t.change5m + (Math.random() - 0.5) * 1,
      change1h: t.change1h + (Math.random() - 0.5) * 2,
      change24h: t.change24h + d,
      marketCap: t.marketCap * (1 + d / 100),
      bondingPctVal: bp, stage: bp >= 100 ? "graduated" : t.stage,
      buys24h: t.buys24h + Math.floor(Math.random() * 4),
      sells24h: t.sells24h + Math.floor(Math.random() * 3),
      feesSol: t.feesSol + Math.random() * 0.02,
    };
  });
}

/* ------------------------------------------------------------
   Tracked wallets, imported from the user's own tracker export.
   One entry whose label contained a slur was dropped.
------------------------------------------------------------- */
const TRACKED_WALLETS = [
  { a: "EhQ7iJNjXFiajR5zwJmXoKo5faQc2X2JHtFx7zWJKTaV", n: "Tjr", e: "🍤" },
  { a: "7eNRALuXYUJkUWTvRj5tcB7tcT43kmT5SNdkfy9fKTto", n: "Pow", e: "👾" },
  { a: "XbmPkA847Jwyk7VcfHMhdaytDsEJDzskyRPtVyNsJ9R", n: "wance", e: "🤚" },
  { a: "EdDCRfDDeiiDXdntrP59abH4DXHFNU48zpMPYisDMjA7", n: "Kol2", e: "🤪" },
  { a: "GjBpzS6iTwib6n99G4cM5Gyy987hBYaeJog4QPLpump", n: "1mil", e: "🍏" },
  { a: "9h5tJhr9epXFtuyhUpYTiw7UxHK47MSdm96ni56jBkFa", n: "Kreo", e: "😀" },
  { a: "Am3MbnSczRa5JF9ct9uf1WBHKFLTLw4rJncW96hpXVeb", n: "Gcard kol", e: "👩‍🍳" },
  { a: "HDixbrzwwLXczhDBk1JVrurPQsuLE8FUKnW2pucSXN3o", n: "Poorgoat", e: "🤥" },
  { a: "BTeqNydtKyDaSxQNRm8ByaUDPK3cpQ1FsXMtaF1Hfaom", n: "finn", e: "🤍" },
  { a: "DfMxre4cKmvogbLrPigxmibVTTQDuzjdXojWzjCXXhzj", n: "Euris", e: "🚐" },
  { a: "G3g1CKqKWSVEVURZDNMazDBv7YAhMNTjhJBVRTiKZygk", n: "Insider", e: "🍞" },
  { a: "DuQabFqdC9eeBULVa7TTdZYxe8vK8ct5DZr4Xcf7docy", n: "Orangie", e: "🧡" },
  { a: "6mWEJG9LoRdto8TwTdZxmnJpkXpTsEerizcGiCNZvzXd", n: "Slingoor", e: "🪼" },
  { a: "9iaawVBEsFG35PSwd4PahwT8fYNQe9XYuRdWm872dUqY", n: "Meechie", e: "🐸" },
  { a: "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk", n: "Jijo", e: "🐲" },
  { a: "FhXPTxUkD6d3NUGTeg4T8DWUCPEwi9vJVjdsewFSM7S4", n: "all k", e: "🎆" },
  { a: "4UQquyqW9oNjZLkfjWHr2GX7JBsmUedbxLDQofD8AJdW", n: "sniper1", e: "🍇" },
  { a: "2RcJ5KV2DVN5AMEstXhFLqGBgZYrGNhTadD8aNbAD2Ht", n: "ds top", e: "🦄" },
  { a: "8deJ9xeUvXSJwicYptA9mHsU2rN2pDx37KWzkDkEXhU6", n: "cooker", e: "🍪" },
  { a: "5gf3jWJHPpteHxrmEnZxduRCmYUo3ptrZXKx3ZVUvxY1", n: "Neek", e: "🎙️" },
  { a: "BtMBMPkoNbnLF9Xn552guQq528KKXcsNBNNBre3oaQtr", n: "Letterbomb", e: "🏦" },
  { a: "2WN4rnEmB9c9ouC7VTb4CBXbyiY7qTMcvWUxKKQ2D47T", n: "Shah", e: "👽️" },
  { a: "EuKB2sw5iQx3BFSsHCQFMzUp4K8A77P67JdcMUgoYWqr", n: "Romano", e: "⚽️" },
  { a: "8zFZHuSRuDpuAR7J6FzwyF3vKNx4CVW3DFHJerQhc7Zd", n: "Pow", e: "👾" },
  { a: "42cfcPtPRHN6YQkWMzFhD9N67XWNZnAARYdMoR7RjsLX", n: "Tom", e: "🍼" },
  { a: "ApRnQN2HkbCn7W2WWiT2FEKvuKJp9LugRyAE1a9Hdz1", n: "Ghost", e: "👻" },
  { a: "5B52w1ZW9tuwUduueP5J7HXz5AcGfruGoX6YoAudvyxG", n: "Yenni", e: "🩷" },
  { a: "DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm", n: "Gake", e: "🛀" },
  { a: "6rg1yPP7DA9ufQW2rMAGFwmuayDkGFWoMuoDgGEca7on", n: "Kilo", e: "🔑" },
  { a: "G3K9kWBDUmtnxypFZSzZDdMS9d8GWnZUrbsvobSJkwVG", n: "Titcoin", e: "🍑" },
  { a: "6LChaYRYtEYjLEHhzo4HdEmgNwu2aia8CM8VhR9wn6n7", n: "600k", e: "😱" },
  { a: "PG1NhXkpwq39ezqU6RyPGwtJ7QdSKrVrK42RQXpfXu2", n: "btc coin", e: "🍌" },
  { a: "8oXT1nktwiyW81vHR42eVBW4735jrcY9F7yc5PSn1EQe", n: "smokez", e: "💨" },
  { a: "DndEBCsskgrCT6a2r4LtAhPjxoWW5H4CJGEGPi3A6zas", n: "Neet insider", e: "🎤" },
  { a: "sAdNbe1cKNMDqDsa4npB3TfL62T14uAo2MsUQfLvzLT", n: "Ethan prosper", e: "📙" },
  { a: "FXeUHfpHMipdUbkfLB7RCmT99eQYz51Bx6X18EvMSgz6", n: "Neek insider", e: "🧤" },
  { a: "7WpUUSnZ9BkfLv5XJ2CHVU4uuPrnxC9tH5tDP8gbSxRF", n: "Insider neek", e: "🤞" },
  { a: "7cQjAvzJsmdePPMk8TiW8hYHHhCfdNtEaaNK3o46YP12", n: "Chill guy", e: "🐻" },
  { a: "JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN", n: "ratwizzard", e: "☢️" },
  { a: "53reuzhbpcFzEh89aQPSuiaL5m97Vxo9i3tdFQzR3cak", n: "New insider", e: "🐝" },
  { a: "DkWzWsQT9ZThfkFfdZqzNT59dZMiJXp81oob8QBG9UcT", n: "Duve side", e: "💙" },
  { a: "VJSDW6S74YXR4rRR9P4xwhMvLZJQMhrUb8XMFirUsy1", n: "Insider", e: "🏅" },
  { a: "5B79fMkcFeRTiwm7ehsZsFiKsC7m7n1Bgv9yLxPp9q2X", n: "Red", e: "🚩" },
  { a: "5R4RJojpoKNwBcJNgVYGtwXdmhyEHWXGDBQqUnSpLfcW", n: "Andy", e: "🐳" },
  { a: "7aRJ1fB2VrUTZAtsn9kNfgfDwY6QHoXUe936SDhfq1on", n: "B calls", e: "💤" },
  { a: "7xwDKXNG9dxMsBSCmiAThp7PyDaUXbm23irLr7iPeh7w", n: "Shah", e: "👽" },
  { a: "86AEJExyjeNNgcp7GrAvCXTDicf5aGWgoERbXFiG1EdD", n: "P", e: "🟨" },
  { a: "DKgvpfttzmJqZXdavDwTxwSVkajibjzJnN2FA99dyciK", n: "Rowdy", e: "🧚" },
  { a: "HaZg1RrXtQatSYEK9SgQob6cWVJDoV8ZUFzSYeYg73WJ", n: "Yenni side", e: "🩷" },
  { a: "EqymVP8KbeByHFiMWb1hfikoSHKxLrz6AsdWH4L17Jp5", n: "Yenni side 2", e: "🩷" },
  { a: "4sAUSQFdvWRBxR8UoLBYbw8CcXuwXWxnN8pXa4mtm5nU", n: "scharo", e: "🥬" },
  { a: "As7HjL7dzzvbRbaD3WCun47robib2kmAKRXMvjHkSMB5", n: "otta", e: "📘" },
  { a: "9fnyojTv8GYHWr4Vaj4tvVL82scPPYYkW1CAXAbfUsdj", n: "Tjr", e: "🔐" },
  { a: "215nhcAHjQQGgwpQSJQ7zR26etbjjtVdW74NLzwEgQjP", n: "Kol100k", e: "🌍️" },
  { a: "8yAFAyZcS7Ko6xjMt2FuD3fNkMWEUVMuVMeUCXjDF4ed", n: "Bebe top", e: "🦜" },
  { a: "E7gozEiAPNhpJsdS52amhhN2XCAqLZa7WPrhyR6C8o4S", n: "Evening", e: "🌑" },
  { a: "H84Wda2aSgKV1daCVV9ozWrSurjVnoSLY5GAymYArGPg", n: "Erm", e: "📪" },
  { a: "DYmsQudNqJyyDvq86XmzAvrU9T7xwfQEwh6gPQw9TPNF", n: "unprofitable", e: "⚰️" },
  { a: "BVTQcUKyNf79L67EQEXRBSXNZcPrfKy7s6sh8G14tcDY", n: "Green", e: "📈" },
  { a: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f", n: "Cupsey", e: "🥤" },
  { a: "4z53TPYhTZRQZxGyEzSNopgsfpEhYWaxTcyneLELkgkU", n: "nova side", e: "🍄" },
  { a: "CNudZYFgpbT26fidsiNrWfHeGTBMMeVWqruZXsEkcUPc", n: "Temu Gake", e: "🛀" },
  { a: "BqeeFXA8hvvpz2xn5hfnc6oki5oBLhwworLt5341RVXP", n: "wallstreet bets", e: "🎖️" },
  { a: "525LueqAyZJueCoiisfWy6nyh4MTvmF4X9jSqi6efXJT", n: "Joji", e: "🐶" },
  { a: "Gqn915c6cPdmmmGz8w11DxbTixA9LzoP1GSyS3wjKs8Y", n: "Marcel side", e: "🍍" },
  { a: "FixmSpsBa7ew26gWdiqpoMAgKRFgbSXFbGAgfMZw67X", n: "Marcell side 2", e: "🍍" },
  { a: "GZ1yiJKTq8Mc6RiY2WQrzph8wJcizSLGgyhr4RSgnuUo", n: "Nova", e: "🍄" },
  { a: "7BNaxx6KdUYrjACNQZ9He26NBFoFxujQMAfNLnArLGH5", n: "1.6mil", e: "🐐" },
  { a: "8fsKLLtvKNanL4ginCaiRS6UfeemY11rSf8U8fN1dJw4", n: "Stig", e: "🐣" },
  { a: "EeaFMwTmez3owRFwvHoMV8nbnw9tg5f2fC9ypnbE5bpT", n: "Lol", e: "🫶" },
  { a: "EwDxFbpLu8aUQ1fAvB9mCfyNfj565pdoVpZRmK843hzn", n: "Clive", e: "🦹" },
  { a: "4Be9CvxqHW6BYiRAxW9Q3xu1ycTMWaL5z8NX4HR3ha7t", n: "Mitch", e: "🍀" },
  { a: "BCrTEXmWutwPz8qv6w1S5gDbaLnSLpXKM5kSGVWyyfxu", n: "Remus", e: "🦧" },
  { a: "8rvAsDKeAcEjEkiZMug9k8v1y8mW6gQQiMobd89Uy7qR", n: "casino", e: "🐿️" },
  { a: "GP25SFBKRQJM7tYHn7JkZ4m9eE8SFXzfSNwyWtUBeLjp", n: "Scharo side", e: "🥬" },
  { a: "ASVzakePP6GNg9r95d4LPZHJDMXun6L6E4um4pu5ybJk", n: "Whale", e: "🐋" },
  { a: "5Mk8MG41VqYMwNrnSsWPN11XCwXuwRVWfDP3Xh1n4ppf", n: "Scharo side", e: "🥬" },
  { a: "BAr5csYtpWoNpwhUjixX7ZPHXkUciFZzjBp9uNxZXJPh", n: "Jack", e: "🧿" },
  { a: "4hwPamSooBr5JhxHdcEC21HoxN5HUwYR2hGucLPyZAi8", n: "Big dog", e: "🦄" },
  { a: "Hw5UKBU5k3YudnGwaykj5E8cYUidNMPuEewRRar5Xoc7", n: "Trenchman", e: "🐦‍⬛" },
  { a: "6DtEedWf9Wk5hA7Xth82Eq441yf5DA4aGLqaQAVfDokm", n: "Alon", e: "🍏" },
  { a: "9KDK3rj1HLXRoqYdPyzo2j8CcfKmYyfgaNh4TDwjzKsV", n: "fartcoin", e: "🪠" },
  { a: "5aLY85pyxiuX3fd4RgM3Yc1e3MAL6b7UgaZz6MS3JUfG", n: "Insider yzy", e: "🔲" },
  { a: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o", n: "Cented7", e: "🎃" },
  { a: "suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK", n: "Cupsy", e: "🥤" },
  { a: "AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm", n: "ansem", e: "🤖" },
  { a: "CAPn1yH4oSywsxGU456jfgTrSSUidf9jgeAnHceNUJdw", n: "Cap", e: "🧢" },
  { a: "H6KiqN3wwirFumem4ZqxbF3hhHNTjpyps3q7TTLX3n33", n: "Maybe ansem", e: "🪖" },
  { a: "GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52", n: "Ansem", e: "🤖" },
  { a: "5YRgrP3mjGzrzirYYN5HAQH19cTYREYwGxW6XRJQUzij", n: "Slingor", e: "🪼" },
  { a: "J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa", n: "Pain", e: "🐈‍⬛" },
  { a: "5ZuV8eqkvzYFVEKbLvGBdexL2tFv7E5BCd2HZpjqbdg", n: "Doji", e: "💘" },
  { a: "EeHJn4X6FUGEbcjJE5ysB8usN8C7AY75Ej8TrvfgPRrZ", n: "Nova side", e: "🍄‍🟫" },
  { a: "6HJetMbdHBuk3mLUainxAPpBpWzDgYbHGTS2TqDAUSX2", n: "LJC", e: "🌭" },
  { a: "ETBLU79gqbs7kKFjzyYtoc4GaBbojC3Tazkfg3pqaCnY", n: "Nova side 2", e: "🍄‍🟫" },
  { a: "oGXp2vgfV7h1jMm4A9kUfhWSFA9QiP1JNcwpFw5PnEe", n: "King culture", e: "👑" },
  { a: "6qudAN2kV8mtCcYJxb5QQ6Vr15itdHHdeVbYm99NKMhy", n: "Detective", e: "🕵️" },
  { a: "n62QUDHwXWCnZyArC9KsP3PqeBzf7WwAMqRLtwUgR7z", n: "cented side", e: "🎃" },
  { a: "gdst9FrdLzAqYv5obFbyit2VWPJL4fs9bXiZDGjbWtF", n: "all k side", e: "🎆" },
  { a: "6TbDFs2dkHETrRWVbheiC11bwg7EWLDgszsCADF1ML1b", n: "insider 2", e: "🧑‍🚒" },
  { a: "BCnqsPEtA1TkgednYEebRpkmwFRJDCjMQcKZMMtEdArc", n: "Kreo", e: "🤩" },
  { a: "97K6nsFhBWDKwQf6heDDhDtsCRC4779LPHSFZkc2zqK4", n: "Nikolai", e: "🤎" },
  { a: "9tY7u1HgEt2RDcxym3RJ9sfvT3aZStiiUwXd44X9RUr8", n: "Soldegen", e: "🟪" },
];

/* ============================================================
   PERSISTED PAPER-TRADING STATE
   Saved to this browser's localStorage. Survives reloads on this
   device; it does not follow you to another browser, since there
   is no account backend.
============================================================ */
const DEFAULT_STATE = {
  balance: START_BALANCE_SOL,
  holdings: {},      // address -> { symbol, name, address, amount, avgEntry, tpPct, slPct, openedAt }
  trades: [],        // { id, type, symbol, address, solAmount, priceUsd, tokenAmount, realizedUsd?, time, auto?, viaLimit? }
  orders: [],        // { id, type, address, symbol, targetPrice, solAmount|pct, status, createdAt }
  notifications: [], // { id, message, time, read }
  watchlist: [],
  beginnerMode: true,
  realizedPnl: 0,
  onboarded: false,
};

function usePortfolio() {
  const [state, setState] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("papertrader-v2");
      setState(raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE);
    } catch {
      setState(DEFAULT_STATE);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !state) return;
    const t = setTimeout(() => {
      try { localStorage.setItem("papertrader-v2", JSON.stringify(state)); } catch { /* quota */ }
    }, 250);
    return () => clearTimeout(t);
  }, [state, ready]);

  return [state, setState, ready];
}

function useIsDesktop() {
  const [d, setD] = useState(() => typeof window !== "undefined" && window.innerWidth >= 900);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const h = (e) => setD(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return d;
}

// Brief green/red highlight when a number changes, so live updates are
// visible without having to watch the digits.
function useFlash(value) {
  const prev = useRef(value);
  const timer = useRef(null);
  const [dir, setDir] = useState(null);
  useEffect(() => {
    if (prev.current != null && value !== prev.current) {
      setDir(value > prev.current ? "up" : "down");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setDir(null), 700);
    }
    prev.current = value;
    return () => clearTimeout(timer.current);
  }, [value]);
  return dir;
}

/* ============================================================
   UI PRIMITIVES
============================================================ */
function Pill({ positive, children, size = 12 }) {
  return (
    <span style={{
      fontFamily: MONO, fontSize: size, fontWeight: 600,
      color: positive ? C.buy : C.sell, background: positive ? C.buyDim : C.sellDim,
      borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function Tooltip({ term, def, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ borderBottom: `1px dashed ${C.faint}`, cursor: "help" }}
      >{children}</span>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", bottom: "130%", left: 0, zIndex: 400, width: 230,
            background: C.panel3, border: `1px solid ${C.borderStrong}`, borderRadius: 10,
            padding: 10, fontSize: 12, lineHeight: 1.5, color: C.text,
            boxShadow: "0 10px 28px rgba(0,0,0,.6)", fontWeight: 400, textTransform: "none", letterSpacing: 0,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: C.amber }}>{term}</div>
          {def}
        </div>
      )}
    </span>
  );
}

function Avatar({ t, size = 36, radius = 10 }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [t?.image]);
  const show = t?.image && !broken;
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: C.panel2,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.34, color: C.amber, flexShrink: 0,
      border: `1px solid ${C.border}`, overflow: "hidden",
    }}>
      {show
        ? <img src={t.image} onError={() => setBroken(true)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : (t?.symbol || "?").slice(0, 2)}
    </div>
  );
}

function LiveBadge({ dataMode }) {
  const live = dataMode === "live";
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
      background: live ? C.buyDim : C.amberDim, color: live ? C.buy : C.amber,
      display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", animation: "pulseDot 1.6s ease-in-out infinite" }} />
      {live ? "LIVE" : "SIMULATED"}
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 24px", color: C.sub }}>
      <Icon size={26} style={{ opacity: 0.45, marginBottom: 10 }} />
      <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

// Compact market-cap trend built from values polled during this session.
// Nothing is back-filled — it starts empty and fills in as prices update.
function Sparkline({ data, width = 50, height = 20 }) {
  if (!data || data.length < 3) return <div style={{ width, height }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={width} height={height} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={up ? C.buy : C.sell} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 500,
      background: toast.tone === "sell" ? C.sell : toast.tone === "amber" ? C.amber : C.buy,
      color: "#08090B", fontWeight: 700, fontSize: 13, padding: "10px 16px",
      borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.5)", maxWidth: 340, textAlign: "center",
    }}>{toast.msg}</div>
  );
}

function SectionLabel({ children, tip }) {
  return (
    <div style={LABEL}>
      {tip ? <Tooltip term={typeof children === "string" ? children : ""} def={tip}>{children}</Tooltip> : children}
    </div>
  );
}

function NotificationBell({ portfolio, setPortfolio }) {
  const [open, setOpen] = useState(false);
  const unread = portfolio.notifications.filter((n) => !n.read).length;
  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => {
          setOpen((o) => !o);
          if (!open && unread) setPortfolio((p) => ({ ...p, notifications: p.notifications.map((n) => ({ ...n, read: true })) }));
        }}
        style={{ cursor: "pointer", position: "relative", display: "flex", alignItems: "center" }}
      >
        <Bell size={18} color={open ? C.amber : C.sub} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -5, background: C.sell, color: "#fff",
            fontSize: 9, fontWeight: 700, borderRadius: 99, minWidth: 15, height: 15,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
          }}>{unread > 9 ? "9+" : unread}</span>
        )}
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "140%", right: 0, width: 290, maxHeight: 360, overflowY: "auto",
          background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: "0 14px 34px rgba(0,0,0,.6)", zIndex: 400,
        }}>
          <div style={{ padding: "10px 14px", ...LABEL, margin: 0, borderBottom: `1px solid ${C.borderSoft}` }}>Notifications</div>
          {portfolio.notifications.length === 0 ? (
            <div style={{ padding: "22px 16px", textAlign: "center", fontSize: 12.5, color: C.faint }}>
              Nothing yet. Filled limit orders and auto-sells appear here.
            </div>
          ) : portfolio.notifications.slice(0, 30).map((n) => (
            <div key={n.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.borderSoft}`, fontSize: 12.5 }}>
              <div style={{ lineHeight: 1.45 }}>{n.message}</div>
              <div style={{ color: C.faint, fontSize: 10.5, marginTop: 3, fontFamily: MONO }}>{timeAgo(n.time)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TOKEN ROW
============================================================ */
function TokenRow({ t, onOpen, onToggleWatch, watched, bonding, spark }) {
  const up = (t.change24h ?? 0) >= 0;
  const hasBond = bonding != null;
  const graduated = bonding >= 100;
  const flash = useFlash(t.marketCap);
  const buys = t.buys24h || 0, sells = t.sells24h || 0, tx = buys + sells;

  return (
    <div
      onClick={() => onOpen(t)}
      style={{ display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px", borderBottom: `1px solid ${C.borderSoft}`, cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar t={t} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{t.symbol}</span>
            <span style={{ color: C.sub, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
            {t.createdAt && <span style={{ fontSize: 10, color: C.faint, fontFamily: MONO, flexShrink: 0 }}>· {timeAgo(t.createdAt)}</span>}
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 2, fontFamily: MONO, fontSize: 11, color: C.faint }}>
            <span>${fmtPrice(t.priceUsd)}</span>
            <span>Liq {fmtUsd(t.liquidity)}</span>
            <span>Vol {fmtUsd(t.volume24h)}</span>
            {tx > 0 && <span>{fmtUsd(tx)}tx</span>}
          </div>
        </div>
        <Sparkline data={spark} />
        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 62 }}>
          <div style={{
            fontFamily: MONO, fontWeight: 700, fontSize: 14, borderRadius: 6, padding: "1px 4px",
            background: flash === "up" ? C.buyDim : flash === "down" ? C.sellDim : "transparent",
            transition: "background .5s",
          }}>{fmtUsd(t.marketCap)}</div>
          <Pill positive={up}>{pct(t.change24h)}</Pill>
        </div>
        <Star
          size={15}
          onClick={(e) => { e.stopPropagation(); onToggleWatch(t); }}
          style={{ flexShrink: 0, color: watched ? C.amber : C.faint, fill: watched ? C.amber : "none" }}
        />
      </div>

      {hasBond && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 46 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 99, background: C.panel2, overflow: "hidden" }}>
            <div style={{ width: `${Math.min(100, bonding)}%`, height: "100%", background: graduated ? C.buy : C.amber, transition: "width .3s" }} />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: graduated ? C.buy : C.amber, fontFamily: MONO, flexShrink: 0 }}>
            {graduated ? "BONDED" : `${bonding.toFixed(0)}%`}
          </span>
        </div>
      )}
      {!hasBond && tx > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 46 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 99, background: C.sellDim, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${(buys / tx) * 100}%`, background: C.buy, height: "100%" }} />
          </div>
          <span style={{ fontSize: 10, fontFamily: MONO, flexShrink: 0, color: C.faint }}>
            <span style={{ color: C.buy }}>{buys}</span>/<span style={{ color: C.sell }}>{sells}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   PRICE CHART
   Real OHLC candles with a volume strip and selectable
   timeframes. Uses recharts with a custom candle shape so the
   same code renders identically everywhere this app runs.
============================================================ */
function Candle(props) {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;
  if (high === low || !isFinite(height) || height <= 0) return null;
  const color = close >= open ? C.buy : C.sell;
  const r = height / (high - low);
  const oY = y + (high - open) * r;
  const cY = y + (high - close) * r;
  const bodyY = Math.min(oY, cY);
  const bodyH = Math.max(Math.abs(cY - oY), 1.5);
  const bodyW = Math.max(width * 0.62, 2);
  const cx = x + width / 2;
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x + (width - bodyW) / 2} y={bodyY} width={bodyW} height={bodyH} fill={color} />
    </g>
  );
}
function VolBar(props) {
  const { x, y, width, height, payload } = props;
  if (!isFinite(height) || height <= 0) return null;
  const color = payload.close >= payload.open ? C.buy : C.sell;
  const w = Math.max(width * 0.62, 2);
  return <rect x={x + (width - w) / 2} y={y} width={w} height={height} fill={color} opacity={0.28} />;
}

function PriceChart({ token, simulated, height = 300, livePrice }) {
  const [tf, setTf] = useState("5m");
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading");
  const [via, setVia] = useState(null);
  const [hover, setHover] = useState(null);
  // Candles assembled from live polling, used only when nothing is indexed.
  const liveRef = useRef([]);

  useEffect(() => { liveRef.current = []; }, [token?.address]);

  // Build session candles from the polled price so a brand-new token still
  // charts. This is real observed price, but only from when you opened it.
  useEffect(() => {
    if (!livePrice || status === "ok") return;
    const bucketMs = 15000;
    const now = Date.now();
    const bucket = Math.floor(now / bucketMs) * bucketMs;
    const arr = liveRef.current;
    const last = arr[arr.length - 1];
    if (last && last.t === bucket) {
      last.high = Math.max(last.high, livePrice);
      last.low = Math.min(last.low, livePrice);
      last.close = livePrice;
    } else {
      arr.push({ t: bucket, open: last ? last.close : livePrice, high: livePrice, low: livePrice, close: livePrice, volume: 0 });
      if (arr.length > 120) arr.shift();
    }
    if (arr.length >= 2 && status === "live") setData([...arr]);
    else if (arr.length >= 2 && status === "empty") { setStatus("live"); setData([...arr]); }
  }, [livePrice, status]);

  useEffect(() => {
    if (simulated || !token) { setStatus("empty"); return; }
    let dead = false;
    async function load() {
      try {
        const { candles, via: route } = await loadCandles(token, tf);
        if (!dead) { setData(candles); setVia(route); setStatus("ok"); }
      } catch {
        if (!dead) setStatus((s) => (s === "ok" ? "ok" : liveRef.current.length >= 2 ? "live" : "empty"));
      }
    }
    setStatus("loading");
    load();
    const iv = setInterval(load, 20000);
    return () => { dead = true; clearInterval(iv); };
  }, [token?.address, token?.pairAddress, simulated, tf]);

  const shown = hover || (data && data[data.length - 1]);
  const showChart = (status === "ok" || status === "live") && data && data.length >= 2;

  return (
    <div style={{ ...CARD, padding: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 10px", borderBottom: `1px solid ${C.borderSoft}`, flexWrap: "wrap" }}>
        {TIMEFRAMES.map((f) => (
          <button
            key={f.id}
            onClick={() => setTf(f.id)}
            disabled={status === "live"}
            style={{
              padding: "4px 9px", borderRadius: 7, fontSize: 11, fontWeight: 600,
              cursor: status === "live" ? "not-allowed" : "pointer",
              border: `1px solid ${tf === f.id ? C.amber : "transparent"}`,
              background: tf === f.id ? C.amberDim : "transparent",
              color: tf === f.id ? C.amber : C.faint, fontFamily: MONO,
              opacity: status === "live" ? 0.4 : 1,
            }}
          >{f.label}</button>
        ))}
        {shown && showChart && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, fontFamily: MONO, fontSize: 10.5, color: C.faint, flexWrap: "wrap" }}>
            <span>O <span style={{ color: C.text }}>{fmtPrice(shown.open)}</span></span>
            <span>H <span style={{ color: C.buy }}>{fmtPrice(shown.high)}</span></span>
            <span>L <span style={{ color: C.sell }}>{fmtPrice(shown.low)}</span></span>
            <span>C <span style={{ color: C.text }}>{fmtPrice(shown.close)}</span></span>
          </div>
        )}
      </div>

      {status === "live" && (
        <div style={{ padding: "5px 10px", background: C.amberDim, color: C.amber, fontSize: 10.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
          <CircleAlert size={11} />
          Live session chart — no indexed history for this pair yet, so this builds from prices observed since you opened it.
        </div>
      )}

      <div style={{ height, position: "relative" }}>
        {showChart ? (
          <>
            <ResponsiveContainer width="100%" height={status === "live" ? "100%" : "78%"}>
              <ComposedChart
                data={data}
                margin={{ top: 10, right: 8, bottom: 0, left: 8 }}
                onMouseMove={(s) => s?.activePayload?.[0] && setHover(s.activePayload[0].payload)}
                onMouseLeave={() => setHover(null)}
              >
                <XAxis dataKey="t" hide />
                <YAxis domain={["auto", "auto"]} hide />
                <Bar dataKey={(d) => [d.low, d.high]} shape={<Candle />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
            {status !== "live" && (
              <ResponsiveContainer width="100%" height="22%">
                <ComposedChart data={data} margin={{ top: 0, right: 8, bottom: 4, left: 8 }}>
                  <XAxis dataKey="t" hide />
                  <YAxis domain={[0, "auto"]} hide />
                  <Bar dataKey="volume" shape={<VolBar />} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: C.faint, fontSize: 12.5, gap: 8, textAlign: "center", padding: "0 24px" }}>
            {status === "loading" ? (
              <><RefreshCw size={16} className="spin" />Loading candles...</>
            ) : simulated ? (
              <><BarChart3 size={22} />Offline mode — no real chart data</>
            ) : (
              <><RefreshCw size={16} className="spin" />Waiting for price data to chart this pair...</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   DISCOVER
============================================================ */
const SORTS = [
  { id: "trending", label: "Trending" },
  { id: "new", label: "New" },
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "volume", label: "Volume" },
  { id: "mcap", label: "Mcap" },
  { id: "liquidity", label: "Liquidity" },
  { id: "watchlist", label: "Watchlist" },
];
const LIQ_FILTERS = [
  { label: "All", min: 0 }, { label: "$5K+", min: 5e3 },
  { label: "$25K+", min: 25e3 }, { label: "$100K+", min: 1e5 },
];

function sortTokens(list, sort, watchlist) {
  const a = [...list];
  switch (sort) {
    case "new": return a.sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
    case "gainers": return a.sort((x, y) => (y.change24h ?? 0) - (x.change24h ?? 0));
    case "losers": return a.sort((x, y) => (x.change24h ?? 0) - (y.change24h ?? 0));
    case "volume": return a.sort((x, y) => (y.volume24h ?? 0) - (x.volume24h ?? 0));
    case "mcap": return a.sort((x, y) => (y.marketCap ?? 0) - (x.marketCap ?? 0));
    case "liquidity": return a.sort((x, y) => (y.liquidity ?? 0) - (x.liquidity ?? 0));
    case "watchlist": return a.filter((t) => watchlist.includes(t.address));
    default:
      return a.sort((x, y) => (y.volume24h ?? 0) * (1 + (y.change24h ?? 0) / 100) - (x.volume24h ?? 0) * (1 + (x.change24h ?? 0) / 100));
  }
}

function Chips({ items, active, onPick, small }) {
  return (
    <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
      {items.map((it) => {
        const on = active === it.id || active === it.min;
        return (
          <button
            key={it.label}
            onClick={() => onPick(it.id ?? it.min)}
            style={{
              flexShrink: 0, fontSize: small ? 11 : 12.5, fontWeight: 600,
              padding: small ? "5px 10px" : "7px 13px", borderRadius: 20,
              border: `1px solid ${on ? (small ? C.borderStrong : C.amber) : small ? C.borderSoft : C.border}`,
              background: on ? (small ? C.panel3 : C.amberDim) : "transparent",
              color: on ? (small ? C.text : C.amber) : C.faint, cursor: "pointer",
            }}
          >{it.label}</button>
        );
      })}
    </div>
  );
}

function MarketStrip({ tokens, solPrice, dataMode }) {
  const vol = tokens.reduce((s, t) => s + (t.volume24h || 0), 0);
  const gainers = tokens.filter((t) => (t.change24h ?? 0) > 0).length;
  return (
    <div style={{ display: "flex", gap: 14, fontFamily: MONO, fontSize: 11, color: C.faint, flexWrap: "wrap", alignItems: "center" }}>
      <span>SOL <span style={{ color: C.text, fontWeight: 600 }}>${solPrice.toFixed(2)}</span></span>
      <span>{tokens.length} tokens</span>
      <span>{fmtUsd(vol)} vol</span>
      {tokens.length > 0 && (
        <span><span style={{ color: C.buy }}>{gainers}</span>/<span style={{ color: C.sell }}>{tokens.length - gainers}</span></span>
      )}
      <LiveBadge dataMode={dataMode} />
    </div>
  );
}

function DiscoverScreen({ tokens, loading, dataMode, onOpen, watchlist, onToggleWatch, query, setQuery, solPrice, history }) {
  const [sort, setSort] = useState("trending");
  const [minLiq, setMinLiq] = useState(0);

  const list = useMemo(() => {
    let l = tokens.filter((t) => t.liquidity >= minLiq);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return l.filter((t) =>
        t.symbol?.toLowerCase().includes(q) ||
        t.name?.toLowerCase().includes(q) ||
        t.address?.toLowerCase() === q
      );
    }
    return sortTokens(l, sort, watchlist);
  }, [tokens, minLiq, query, sort, watchlist]);

  return (
    <div style={{ padding: "14px 12px 16px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, marginBottom: 8 }}>Discover</div>
      <div style={{ marginBottom: 12 }}><MarketStrip tokens={tokens} solPrice={solPrice} dataMode={dataMode} /></div>

      <div style={{ ...INPUT_WRAP, gap: 8, marginBottom: 10 }}>
        <Search size={15} color={C.faint} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, ticker, or contract address"
          style={{ ...INPUT, fontFamily: SANS, fontSize: 14 }}
        />
        {query && <X size={15} color={C.faint} style={{ cursor: "pointer" }} onClick={() => setQuery("")} />}
      </div>

      {!query.trim() && (
        <>
          <div style={{ marginBottom: 8 }}><Chips items={SORTS} active={sort} onPick={setSort} /></div>
          <div style={{ marginBottom: 12 }}><Chips items={LIQ_FILTERS} active={minLiq} onPick={setMinLiq} small /></div>
        </>
      )}

      <div style={CARD}>
        {loading && tokens.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: 14, borderBottom: `1px solid ${C.borderSoft}` }}>
              <div style={{ height: 13, width: "40%", background: C.panel2, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 10, width: "62%", background: C.panel2, borderRadius: 6 }} />
            </div>
          ))
        ) : list.length === 0 ? (
          <EmptyState
            icon={sort === "watchlist" ? Star : Search}
            title={sort === "watchlist" ? "Watchlist is empty" : "No tokens match"}
            sub={sort === "watchlist" ? "Tap the star on any token to track it here." : "Try a different search or lower the liquidity filter."}
          />
        ) : (
          list.map((t) => (
            <TokenRow
              key={t.address} t={t} onOpen={onOpen} onToggleWatch={onToggleWatch}
              watched={watchlist.includes(t.address)} spark={history[t.address]}
            />
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MEMESCOPE
   Bonding-curve lifecycle view. Thresholds on the Bonded tab
   ($10K market cap, 1 SOL fees) come from the user's own filter
   export; the graduation target is computed live from SOL price.
============================================================ */
const SCOPE_TABS = [
  { id: "new", label: "New Pairs", icon: Sparkles },
  { id: "graduating", label: "Final Stretch", icon: Rocket },
  { id: "graduated", label: "Bonded", icon: Check },
];

function MemescopeScreen({ tokens, dataMode, onOpen, watchlist, onToggleWatch, solPrice, history }) {
  const [tab, setTab] = useState("new");
  const now = Date.now();

  const list = useMemo(() => {
    const meta = tokens.map((t) => ({
      ...t,
      _bond: bondPct(t, solPrice),
      _stage: bondStage(t),
      _age: t.createdAt ? now - t.createdAt : null,
      _fees: estFeesSol(t, solPrice),
    }));
    if (tab === "new") {
      return meta.filter((t) => t._stage !== "graduated" && t._age != null && t._age <= TEN_MIN_MS)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    if (tab === "graduating") {
      return meta.filter((t) => t._stage !== "graduated" && t.marketCap >= 1e4 && t._age != null && t._age <= ONE_HOUR_MS && t._fees >= 0.5)
        .sort((a, b) => b._bond - a._bond);
    }
    return meta.filter((t) => t._stage === "graduated" && t.marketCap >= 1e4 && t._fees >= 1)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [tokens, tab, solPrice, now]);

  const threshold = gradMcUsd(solPrice);
  const blurb = {
    new: "Bonding-curve pairs created in the last 10 minutes.",
    graduating: `Under 1h old, $10K+ mcap, 0.5+ SOL fees — approaching ${fmtUsd(threshold)} to migrate.`,
    graduated: "Migrated to an AMM — $10K+ mcap, 1+ SOL lifetime fees.",
  }[tab];

  return (
    <div style={{ padding: "14px 12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>Memescope</div>
        <LiveBadge dataMode={dataMode} />
      </div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 4, lineHeight: 1.5 }}>{blurb}</div>
      {tab !== "new" && dataMode === "live" && (
        <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 10 }}>
          Fees estimated from 24h volume — exact curve fees aren't exposed by the public API.
        </div>
      )}

      <div style={{ display: "flex", gap: 6, margin: "10px 0 12px" }}>
        {SCOPE_TABS.map((s) => {
          const Icon = s.icon, on = tab === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                fontSize: 11.5, fontWeight: 600, padding: "8px 4px", borderRadius: 11,
                border: `1px solid ${on ? C.amber : C.border}`, background: on ? C.amberDim : "transparent",
                color: on ? C.amber : C.sub, cursor: "pointer",
              }}
            ><Icon size={13} />{s.label}</button>
          );
        })}
      </div>

      <div style={CARD}>
        {list.length === 0 ? (
          <EmptyState icon={Rocket} title="Nothing matches right now" sub="These lists are time-sensitive — they refill as new pairs launch and bond." />
        ) : list.map((t) => (
          <TokenRow
            key={t.address} t={t} onOpen={onOpen} onToggleWatch={onToggleWatch}
            watched={watchlist.includes(t.address)} bonding={t._bond} spark={history[t.address]}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   CONTRACT SAFETY
   Mint and freeze authority read live from chain. These two are
   genuinely verifiable. Holder counts, sniper/insider/bundler
   percentages and wallet P&L need a paid indexer, so they are
   listed as unavailable rather than invented.
============================================================ */
function SafetyPanel({ tokenAddress, simulated }) {
  const [s, setS] = useState({ status: "loading", data: null });

  useEffect(() => {
    if (simulated || !tokenAddress) { setS({ status: "na", data: null }); return; }
    let dead = false;
    setS({ status: "loading", data: null });
    (async () => {
      try {
        const d = await fetchMintSafety(tokenAddress);
        if (!dead) setS({ status: "ok", data: d });
      } catch {
        if (!dead) setS({ status: "err", data: null });
      }
    })();
    return () => { dead = true; };
  }, [tokenAddress, simulated]);

  const Row = ({ label, revoked, tip }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Tooltip term={label} def={tip}><span style={{ fontSize: 12.5, color: C.sub }}>{label}</span></Tooltip>
      <span style={{ fontSize: 12, fontWeight: 700, color: revoked ? C.buy : C.sell, display: "flex", alignItems: "center", gap: 4 }}>
        {revoked ? <Check size={13} /> : <CircleAlert size={13} />}{revoked ? "Revoked" : "Active"}
      </span>
    </div>
  );

  return (
    <div style={{ ...CARD, padding: 14 }}>
      <SectionLabel>Contract Safety</SectionLabel>
      {s.status === "loading" && <div style={{ fontSize: 12, color: C.faint }}>Reading mint account on-chain...</div>}
      {s.status === "na" && <div style={{ fontSize: 12, color: C.faint }}>Not applicable in offline mode.</div>}
      {s.status === "err" && <div style={{ fontSize: 12, color: C.faint }}>Couldn't reach Solana RPC to verify this contract.</div>}
      {s.status === "ok" && (
        <>
          <Row label="Mint Authority" revoked={!s.data.mintAuthority}
            tip="Whether the creator can still mint new supply out of thin air. Revoked is safer — supply can't be inflated after the fact." />
          <Row label="Freeze Authority" revoked={!s.data.freezeAuthority}
            tip="Whether the creator can freeze wallets and block them from selling. Revoked is safer — nobody can be locked in." />
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 1.5, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 8 }}>
            Holder distribution, sniper and bundler analysis need a paid chain indexer — not shown rather than guessed.
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   TOKEN TERMINAL
============================================================ */
function TokenScreen({ token, portfolio, setPortfolio, onBack, watched, onToggleWatch, solPrice, isDesktop, notify }) {
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [sellPct, setSellPct] = useState(null);
  const [tab, setTab] = useState("overview");
  const [tpInput, setTpInput] = useState("");
  const [slInput, setSlInput] = useState("");
  const [copied, setCopied] = useState(false);

  const holding = portfolio.holdings[token.address];
  const beginner = portfolio.beginnerMode;
  const price = token.priceUsd;
  const mcFlash = useFlash(token.marketCap);

  const posAmount = holding?.amount || 0;
  const posValue = posAmount * price;
  const posCost = posAmount * (holding?.avgEntry || 0);
  const upnl = posValue - posCost;
  const upnlPct = posCost > 0 ? (upnl / posCost) * 100 : 0;

  useEffect(() => {
    setTpInput(holding?.tpPct != null ? String(holding.tpPct) : "");
    setSlInput(holding?.slPct != null ? String(holding.slPct) : "");
    setSellPct(null);
    setAmount("");
    setLimitPrice("");
    setTab("overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.address]);

  // Slippage/price impact estimate. Derived from trade size against pool
  // liquidity — an approximation of the real constant-product formula,
  // labelled as an estimate in the UI.
  const tradeUsd = (parseFloat(amount) || 0) * solPrice;
  const impactPct = token.liquidity > 0 ? Math.min(99, (tradeUsd / token.liquidity) * 100) : null;

  function executeBuy() {
    const sol = parseFloat(amount);
    if (!sol || sol <= 0 || sol > portfolio.balance) return;
    const usd = sol * solPrice;
    const qty = usd / price;
    setPortfolio((p) => {
      const h = p.holdings[token.address];
      const newAmt = (h?.amount || 0) + qty;
      const newCost = (h ? h.amount * h.avgEntry : 0) + usd;
      return {
        ...p,
        balance: +(p.balance - sol).toFixed(6),
        holdings: {
          ...p.holdings,
          [token.address]: {
            symbol: token.symbol, name: token.name, address: token.address,
            amount: newAmt, avgEntry: newCost / newAmt,
            tpPct: h?.tpPct ?? null, slPct: h?.slPct ?? null,
            openedAt: h?.openedAt ?? Date.now(),
          },
        },
        trades: [{ id: uid(), type: "buy", symbol: token.symbol, address: token.address, solAmount: sol, priceUsd: price, tokenAmount: qty, time: Date.now() }, ...p.trades],
      };
    });
    notify(`Bought ${fmtUsd(qty)} ${token.symbol} for ${fmtSol(sol)} SOL`, "buy");
    setAmount("");
  }

  function executeSell(percent) {
    if (!holding || holding.amount <= 0) return;
    const qty = holding.amount * (percent / 100);
    const usd = qty * price;
    const sol = usd / solPrice;
    const realized = usd - qty * holding.avgEntry;
    setPortfolio((p) => {
      const h = p.holdings[token.address];
      const rest = h.amount - qty;
      const holdings = { ...p.holdings };
      if (rest <= 1e-6) delete holdings[token.address];
      else holdings[token.address] = { ...h, amount: rest };
      return {
        ...p,
        balance: +(p.balance + sol).toFixed(6),
        holdings,
        realizedPnl: p.realizedPnl + realized,
        trades: [{ id: uid(), type: "sell", symbol: token.symbol, address: token.address, solAmount: sol, priceUsd: price, tokenAmount: qty, realizedUsd: realized, time: Date.now() }, ...p.trades],
      };
    });
    notify(`Sold ${percent}% for ${fmtSol(sol)} SOL (${realized >= 0 ? "+" : ""}$${realized.toFixed(2)})`, realized >= 0 ? "buy" : "sell");
    setSellPct(null);
  }

  function placeLimit() {
    const target = parseFloat(limitPrice);
    if (!target || target <= 0) return;
    if (side === "buy") {
      const sol = parseFloat(amount);
      if (!sol || sol <= 0 || sol > portfolio.balance) return;
      setPortfolio((p) => ({
        ...p,
        orders: [{ id: uid(), type: "buy", address: token.address, symbol: token.symbol, name: token.name, targetPrice: target, solAmount: sol, status: "pending", createdAt: Date.now() }, ...p.orders],
      }));
      notify(`Limit buy queued: ${token.symbol} at $${fmtPrice(target)}`, "amber");
      setAmount("");
    } else {
      if (!holding || !sellPct) return;
      setPortfolio((p) => ({
        ...p,
        orders: [{ id: uid(), type: "sell", address: token.address, symbol: token.symbol, name: token.name, targetPrice: target, pct: sellPct, status: "pending", createdAt: Date.now() }, ...p.orders],
      }));
      notify(`Limit sell queued: ${sellPct}% of ${token.symbol} at $${fmtPrice(target)}`, "amber");
      setSellPct(null);
    }
    setLimitPrice("");
  }

  function saveAuto() {
    const tp = tpInput === "" ? null : Math.abs(parseFloat(tpInput)) || null;
    const sl = slInput === "" ? null : Math.abs(parseFloat(slInput)) || null;
    setPortfolio((p) => {
      const h = p.holdings[token.address];
      if (!h) return p;
      return { ...p, holdings: { ...p.holdings, [token.address]: { ...h, tpPct: tp, slPct: sl } } };
    });
    notify(tp || sl ? `Auto-sell set${tp ? ` +${tp}% TP` : ""}${sl ? ` -${sl}% SL` : ""}` : "Auto-sell cleared", "amber");
  }

  function copyAddr() {
    try {
      navigator.clipboard?.writeText(token.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  const canBuy = amount && parseFloat(amount) > 0 && parseFloat(amount) <= portfolio.balance;
  const limitOk = limitPrice && parseFloat(limitPrice) > 0;
  const openOrders = portfolio.orders.filter((o) => o.status === "pending" && o.address === token.address);

  /* ---------- left column ---------- */
  const info = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <ChevronLeft size={22} onClick={onBack} style={{ cursor: "pointer", flexShrink: 0 }} />
        <Avatar t={token} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{token.symbol}</span>
            <span style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{token.name}</span>
          </div>
          <div
            onClick={copyAddr}
            style={{ fontSize: 10.5, color: C.faint, fontFamily: MONO, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            {shortAddr(token.address)} {copied ? <Check size={10} color={C.buy} /> : <span style={{ opacity: 0.6 }}>copy</span>}
          </div>
        </div>
        <Star size={19} onClick={() => onToggleWatch(token)} style={{ cursor: "pointer", flexShrink: 0, color: watched ? C.amber : C.faint, fill: watched ? C.amber : "none" }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontFamily: MONO, fontSize: 32, fontWeight: 700, letterSpacing: -0.5,
          display: "inline-block", borderRadius: 8, padding: "1px 6px", marginLeft: -6,
          background: mcFlash === "up" ? C.buyDim : mcFlash === "down" ? C.sellDim : "transparent",
          transition: "background .5s",
        }}>{fmtUsd(token.marketCap)}</div>
        <div style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>
          <Tooltip term="Market Cap" def="Price times circulating supply — the market's current valuation of the whole token. Low caps move far faster in both directions.">Market Cap</Tooltip>
          <span style={{ marginLeft: 8, fontFamily: MONO }}>${fmtPrice(price)}</span>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
          <Pill positive={(token.change5m ?? 0) >= 0} size={11}>5m {pct(token.change5m)}</Pill>
          <Pill positive={(token.change1h ?? 0) >= 0} size={11}>1h {pct(token.change1h)}</Pill>
          <Pill positive={(token.change6h ?? 0) >= 0} size={11}>6h {pct(token.change6h)}</Pill>
          <Pill positive={(token.change24h ?? 0) >= 0} size={11}>24h {pct(token.change24h)}</Pill>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <PriceChart token={token} simulated={token.simulated} livePrice={price} height={isDesktop ? 340 : 260} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {[["overview", "Overview"], ["stats", "Market Stats"], ["safety", "Safety"], ["info", "Token Info"]].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              flexShrink: 0, fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 18,
              border: `1px solid ${tab === id ? C.amber : C.border}`,
              background: tab === id ? C.amberDim : "transparent",
              color: tab === id ? C.amber : C.sub, cursor: "pointer",
            }}
          >{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
            {[
              ["Liquidity", fmtUsd(token.liquidity), "Money in the trading pool. Thin liquidity means violent price swings and hard exits."],
              ["24h Volume", fmtUsd(token.volume24h), "Total traded over 24h. High volume against a small market cap signals real activity."],
              ["FDV", fmtUsd(token.fdv), "Fully diluted valuation — price times total eventual supply, vs market cap which counts only circulating supply."],
              ["Age", token.createdAt ? timeAgo(token.createdAt) : "—", "How long this pair has been trading."],
              ["24h Txns", fmtUsd((token.buys24h || 0) + (token.sells24h || 0)), "Buy plus sell transactions over 24h."],
              ["1h Volume", fmtUsd(token.volume1h), "Traded in the last hour — a faster read on whether interest is building or fading."],
            ].map(([label, val, tip]) => (
              <div key={label} style={STAT}>
                <div style={{ fontSize: 10.5, color: C.faint }}><Tooltip term={label} def={tip}>{label}</Tooltip></div>
                <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13, marginTop: 2 }}>{val}</div>
              </div>
            ))}
          </div>

          {(token.buys24h || token.sells24h) > 0 && (
            <div style={{ ...CARD, padding: 14, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.faint, marginBottom: 8 }}>
                <Tooltip term="Buy/Sell Pressure" def="Split of buy vs sell transactions over 24h. More buys doesn't guarantee the price rises, but it reads sentiment.">Buy/Sell Pressure 24h</Tooltip>
                <span style={{ fontFamily: MONO }}>
                  <span style={{ color: C.buy }}>{token.buys24h}</span> / <span style={{ color: C.sell }}>{token.sells24h}</span>
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 99, background: C.sellDim, overflow: "hidden", display: "flex" }}>
                <div style={{ width: `${((token.buys24h || 0) / Math.max(1, (token.buys24h || 0) + (token.sells24h || 0))) * 100}%`, background: C.buy, transition: "width .4s" }} />
              </div>
            </div>
          )}

          {beginner && (
            <div style={{ display: "flex", gap: 8, background: C.amberDim, border: `1px solid ${C.amber}33`, borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <ShieldAlert size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                Memecoins swing hard and often go to zero. Decide your exit before you buy — you can set an automatic take-profit and stop-loss below once you hold a position.
              </div>
            </div>
          )}
        </>
      )}

      {tab === "stats" && (
        <div style={{ ...CARD, padding: 14, marginBottom: 12 }}>
          {[
            ["Market Cap", fmtUsd(token.marketCap)],
            ["Fully Diluted Valuation", fmtUsd(token.fdv)],
            ["Liquidity", fmtUsd(token.liquidity)],
            ["Volume 24h", fmtUsd(token.volume24h)],
            ["Volume 1h", fmtUsd(token.volume1h)],
            ["Buys 24h", String(token.buys24h ?? "—")],
            ["Sells 24h", String(token.sells24h ?? "—")],
            ["Price", "$" + fmtPrice(price)],
            ["Pair Age", token.createdAt ? timeAgo(token.createdAt) : "—"],
            ["DEX", token.dexId || "—"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.borderSoft}`, fontSize: 12.5 }}>
              <span style={{ color: C.sub }}>{k}</span>
              <span style={{ fontFamily: MONO, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 10, lineHeight: 1.5 }}>
            Holder count and wallet-level trade history aren't in the free data set and are omitted rather than estimated.
          </div>
        </div>
      )}

      {tab === "safety" && <div style={{ marginBottom: 12 }}><SafetyPanel tokenAddress={token.address} simulated={token.simulated} /></div>}

      {tab === "info" && (
        <div style={{ ...CARD, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 4 }}>Contract address</div>
          <div onClick={copyAddr} style={{ fontFamily: MONO, fontSize: 11.5, wordBreak: "break-all", cursor: "pointer", marginBottom: 12, lineHeight: 1.5 }}>
            {token.address} <span style={{ color: copied ? C.buy : C.faint }}>{copied ? "copied" : "(tap to copy)"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {token.url && (
              <a href={token.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.amber, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                DexScreener <ExternalLink size={11} />
              </a>
            )}
            {token.website && (
              <a href={token.website} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.amber, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                Website <ExternalLink size={11} />
              </a>
            )}
            {(token.socials || []).slice(0, 3).map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.amber, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, textTransform: "capitalize" }}>
                {s.type || s.platform || "link"} <ExternalLink size={11} />
              </a>
            ))}
          </div>
        </div>
      )}
    </>
  );

  /* ---------- trade panel ---------- */
  const tradePanel = (
    <>
      {posAmount > 0 && (
        <div style={{ ...CARD, padding: 14, marginBottom: 10 }}>
          <SectionLabel>Your Position</SectionLabel>
          {[
            ["Value", `$${posValue.toFixed(2)}`, null],
            ["Avg entry", `$${fmtPrice(holding.avgEntry)}`, null],
            ["Held", holding.openedAt ? timeAgo(holding.openedAt) : "—", null],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}>
              <span style={{ color: C.sub }}>{k}</span>
              <span style={{ fontFamily: MONO, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Tooltip term="Unrealized P&L" def="Profit or loss on paper — what you'd bank if you sold right now. It isn't locked in until you actually sell.">
              <span style={{ fontSize: 12.5, color: C.sub }}>Unrealized P&L</span>
            </Tooltip>
            <Pill positive={upnl >= 0}>{upnl >= 0 ? "+" : ""}${upnl.toFixed(2)} ({pct(upnlPct)})</Pill>
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderSoft}` }}>
            <Tooltip term="Take-Profit / Stop-Loss" def="Set targets once and the app sells the whole position automatically when either is hit — even if you're looking at something else.">
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>Auto-sell (TP / SL)</div>
            </Tooltip>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 9px" }}>
                <span style={{ color: C.buy, fontSize: 12, marginRight: 4 }}>+</span>
                <input value={tpInput} onChange={(e) => setTpInput(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="TP %" style={{ ...INPUT, fontSize: 12.5 }} />
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 9px" }}>
                <span style={{ color: C.sell, fontSize: 12, marginRight: 4 }}>−</span>
                <input value={slInput} onChange={(e) => setSlInput(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="SL %" style={{ ...INPUT, fontSize: 12.5 }} />
              </div>
              <button onClick={saveAuto} style={{ padding: "0 13px", borderRadius: 9, border: "none", background: C.amber, color: "#08090B", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Set</button>
            </div>
            {(holding.tpPct || holding.slPct) && (
              <div style={{ fontSize: 11, color: C.faint, marginTop: 7, fontFamily: MONO }}>
                Armed: {holding.tpPct ? <span style={{ color: C.buy }}>+{holding.tpPct}% TP</span> : null}
                {holding.tpPct && holding.slPct ? " · " : ""}
                {holding.slPct ? <span style={{ color: C.sell }}>−{holding.slPct}% SL</span> : null}
              </div>
            )}
          </div>
        </div>
      )}

      {openOrders.length > 0 && (
        <div style={{ ...CARD, padding: 12, marginBottom: 10 }}>
          <SectionLabel>Open Orders</SectionLabel>
          {openOrders.map((o) => (
            <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: o.type === "buy" ? C.buy : C.sell, fontWeight: 600, textTransform: "capitalize" }}>{o.type}</span>
              <span style={{ fontFamily: MONO, color: C.sub }}>
                @ ${fmtPrice(o.targetPrice)} · {o.type === "buy" ? `${fmtSol(o.solAmount)} SOL` : `${o.pct}%`}
              </span>
              <X size={14} color={C.faint} style={{ cursor: "pointer" }}
                onClick={() => setPortfolio((p) => ({ ...p, orders: p.orders.map((x) => (x.id === o.id ? { ...x, status: "cancelled" } : x)) }))} />
            </div>
          ))}
        </div>
      )}

      <div style={{ ...CARD, padding: 14 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button onClick={() => setSide("buy")}
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13.5, cursor: "pointer", background: side === "buy" ? C.buy : C.panel2, color: side === "buy" ? "#08090B" : C.sub }}>Buy</button>
          <button onClick={() => setSide("sell")} disabled={!holding}
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13.5, cursor: holding ? "pointer" : "not-allowed", background: side === "sell" ? C.sell : C.panel2, color: side === "sell" ? "#08090B" : C.sub, opacity: holding ? 1 : 0.5 }}>Sell</button>
        </div>

        <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
          {["market", "limit"].map((t) => (
            <button key={t} onClick={() => setOrderType(t)}
              style={{
                flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                border: `1px solid ${orderType === t ? C.borderStrong : C.borderSoft}`,
                background: orderType === t ? C.panel3 : "transparent", color: orderType === t ? C.text : C.faint,
              }}>{t}</button>
          ))}
        </div>

        {beginner && (
          <div style={{ fontSize: 11, color: C.faint, marginBottom: 10, lineHeight: 1.5 }}>
            {orderType === "market"
              ? "Market order — fills immediately at the current price."
              : "Limit order — waits and fills only if the price reaches your trigger."}
          </div>
        )}

        {orderType === "limit" && (
          <div style={{ ...INPUT_WRAP, marginBottom: 8 }}>
            <span style={{ color: C.faint, fontSize: 12, marginRight: 6, flexShrink: 0 }}>Trigger $</span>
            <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={fmtPrice(price)} style={{ ...INPUT, fontSize: 14 }} />
          </div>
        )}

        {side === "buy" ? (
          <>
            <div style={{ ...INPUT_WRAP, marginBottom: 8 }}>
              <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.0" style={{ ...INPUT, fontSize: 17 }} />
              <span style={{ color: C.sub, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>SOL</span>
            </div>
            <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
              {[0.1, 0.5, 1, 2, 5].map((v) => (
                <button key={v} onClick={() => setAmount(String(v))} style={QUICK_BTN}>{v}</button>
              ))}
              <button onClick={() => setAmount(portfolio.balance.toFixed(4))} style={QUICK_BTN}>MAX</button>
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 10, fontFamily: MONO, lineHeight: 1.6 }}>
              <div>Balance {fmtSol(portfolio.balance)} SOL · ≈ {amount ? fmtUsd(((parseFloat(amount) || 0) * solPrice) / price) : "0"} {token.symbol}</div>
              {impactPct != null && tradeUsd > 0 && (
                <div style={{ color: impactPct > 3 ? C.sell : C.faint }}>
                  <Tooltip term="Price Impact" def="How much your own order moves the price against you. Anything above a few percent means the pool is too thin for this trade size.">est. impact</Tooltip>
                  {" "}{impactPct.toFixed(2)}%
                </div>
              )}
            </div>
            <button
              onClick={orderType === "market" ? executeBuy : placeLimit}
              disabled={!canBuy || (orderType === "limit" && !limitOk)}
              style={{ ...ACTION_BTN, background: orderType === "market" ? C.buy : C.amber, opacity: (!canBuy || (orderType === "limit" && !limitOk)) ? 0.4 : 1 }}
            >
              {orderType === "market" ? `BUY ${token.symbol}` : `PLACE LIMIT BUY`}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
              {[25, 50, 75, 100].map((v) => (
                <button key={v} onClick={() => setSellPct(v)}
                  style={{ ...QUICK_BTN, background: sellPct === v ? C.sellDim : C.panel2, borderColor: sellPct === v ? C.sell : C.border, color: sellPct === v ? C.sell : C.sub }}>{v}%</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginBottom: 10, fontFamily: MONO }}>
              {holding ? `Position ${fmtUsd(holding.amount)} ${token.symbol} · $${posValue.toFixed(2)}` : "No position"}
              {sellPct && holding ? ` · selling ≈ $${(posValue * sellPct / 100).toFixed(2)}` : ""}
            </div>
            <button
              onClick={() => (orderType === "market" ? executeSell(sellPct) : placeLimit())}
              disabled={!sellPct || !holding || (orderType === "limit" && !limitOk)}
              style={{ ...ACTION_BTN, background: orderType === "market" ? C.sell : C.amber, opacity: (!sellPct || !holding || (orderType === "limit" && !limitOk)) ? 0.4 : 1 }}
            >
              {orderType === "market" ? `SELL ${sellPct || ""}${sellPct ? "% " : ""}${token.symbol}` : "PLACE LIMIT SELL"}
            </button>
          </>
        )}

        <div style={{ fontSize: 10, color: C.faint, textAlign: "center", marginTop: 10 }}>
          Simulated order · virtual SOL · no blockchain transaction
        </div>
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <div style={{ display: "flex", gap: 18, alignItems: "flex-start", padding: "14px 4px 20px" }}>
        <div style={{ flex: "1 1 0%", minWidth: 0 }}>{info}</div>
        <div style={{ flex: "0 0 330px", position: "sticky", top: 14 }}>{tradePanel}</div>
      </div>
    );
  }
  return (
    <div style={{ padding: "14px 12px 100px" }}>
      {info}
      {tradePanel}
    </div>
  );
}

/* ============================================================
   PORTFOLIO
============================================================ */
function PortfolioScreen({ portfolio, setPortfolio, tokenMap, solPrice, onOpenToken }) {
  const [tab, setTab] = useState("overview");

  const rows = Object.values(portfolio.holdings).map((h) => {
    const live = tokenMap[h.address];
    const price = live?.priceUsd ?? h.avgEntry;
    const value = h.amount * price;
    const cost = h.amount * h.avgEntry;
    return { ...h, price, value, upnl: value - cost, upnlPct: cost > 0 ? ((value - cost) / cost) * 100 : 0, live };
  });

  const posValue = rows.reduce((s, r) => s + r.value, 0);
  const totalValue = portfolio.balance * solPrice + posValue;
  const startValue = START_BALANCE_SOL * solPrice;
  const totalReturn = ((totalValue - startValue) / startValue) * 100;
  const unrealized = rows.reduce((s, r) => s + r.upnl, 0);

  const closed = portfolio.trades.filter((t) => t.type === "sell");
  const wins = closed.filter((t) => (t.realizedUsd || 0) > 0).length;
  const winRate = closed.length ? (wins / closed.length) * 100 : null;
  const best = closed.reduce((b, t) => (!b || (t.realizedUsd || 0) > (b.realizedUsd || 0) ? t : b), null);
  const worst = closed.reduce((w, t) => (!w || (t.realizedUsd || 0) < (w.realizedUsd || 0) ? t : w), null);
  const avgPnl = closed.length ? closed.reduce((s, t) => s + (t.realizedUsd || 0), 0) / closed.length : null;

  const pending = portfolio.orders.filter((o) => o.status === "pending");
  const past = portfolio.orders.filter((o) => o.status !== "pending").slice(0, 20);

  const TABS = [
    ["overview", "Overview"],
    ["positions", `Positions${rows.length ? ` ${rows.length}` : ""}`],
    ["orders", `Orders${pending.length ? ` ${pending.length}` : ""}`],
    ["history", "History"],
  ];

  return (
    <div style={{ padding: "14px 12px 16px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, marginBottom: 12 }}>Portfolio</div>

      <div style={{ ...CARD, borderRadius: 18, padding: 18, marginBottom: 12 }}>
        <div style={{ fontSize: 11.5, color: C.faint }}>Total value</div>
        <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, letterSpacing: -0.5, margin: "3px 0 6px" }}>
          ${totalValue.toFixed(2)}
        </div>
        <Pill positive={totalReturn >= 0}>{pct(totalReturn)} all-time</Pill>
        <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}` }}>
          {[
            ["Cash", `${fmtSol(portfolio.balance)} SOL`, C.text],
            ["Realized", `${portfolio.realizedPnl >= 0 ? "+" : ""}$${portfolio.realizedPnl.toFixed(2)}`, portfolio.realizedPnl >= 0 ? C.buy : C.sell],
            ["Win rate", winRate == null ? "—" : `${winRate.toFixed(0)}%`, C.text],
          ].map(([k, v, color]) => (
            <div key={k} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, color: C.faint }}>{k}</div>
              <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 14, color }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 20,
              border: `1px solid ${tab === id ? C.amber : C.border}`,
              background: tab === id ? C.amberDim : "transparent",
              color: tab === id ? C.amber : C.sub, cursor: "pointer",
            }}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Unrealized P&L", `${unrealized >= 0 ? "+" : ""}$${unrealized.toFixed(2)}`, unrealized >= 0, "Profit or loss on positions you still hold — not locked in until you sell."],
            ["Realized P&L", `${portfolio.realizedPnl >= 0 ? "+" : ""}$${portfolio.realizedPnl.toFixed(2)}`, portfolio.realizedPnl >= 0, "Profit or loss you've actually banked by selling."],
            ["Total Trades", String(portfolio.trades.length), null, null],
            ["Avg P&L / Trade", avgPnl == null ? "—" : `${avgPnl >= 0 ? "+" : ""}$${avgPnl.toFixed(2)}`, avgPnl == null ? null : avgPnl >= 0, null],
            ["Best Trade", best ? `+$${(best.realizedUsd || 0).toFixed(2)}` : "—", best ? true : null, null],
            ["Worst Trade", worst ? `${(worst.realizedUsd || 0) >= 0 ? "+" : ""}$${(worst.realizedUsd || 0).toFixed(2)}` : "—", worst ? (worst.realizedUsd || 0) >= 0 : null, null],
          ].map(([label, val, positive, tip]) => (
            <div key={label} style={STAT}>
              <div style={{ fontSize: 10.5, color: C.faint }}>{tip ? <Tooltip term={label} def={tip}>{label}</Tooltip> : label}</div>
              <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 14, marginTop: 2, color: positive == null ? C.text : positive ? C.buy : C.sell }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "positions" && (
        <div style={CARD}>
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} title="No open positions" sub="Buy a token from Discover and it'll appear here." />
          ) : rows.map((r) => (
            <div key={r.address} onClick={() => r.live && onOpenToken(r.live)}
              style={{ display: "flex", alignItems: "center", padding: "12px", borderBottom: `1px solid ${C.borderSoft}`, cursor: r.live ? "pointer" : "default" }}>
              <Avatar t={r.live || r} size={32} />
              <div style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.symbol}</div>
                <div style={{ fontSize: 11, color: C.faint, fontFamily: MONO }}>
                  {fmtUsd(r.amount)} @ ${fmtPrice(r.avgEntry)}
                  {(r.tpPct || r.slPct) && (
                    <span> · {r.tpPct ? <span style={{ color: C.buy }}>+{r.tpPct}%</span> : null}{r.tpPct && r.slPct ? "/" : ""}{r.slPct ? <span style={{ color: C.sell }}>−{r.slPct}%</span> : null}</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: 13 }}>${r.value.toFixed(2)}</div>
                <Pill positive={r.upnl >= 0}>{r.upnl >= 0 ? "+" : ""}${r.upnl.toFixed(2)}</Pill>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "orders" && (
        <div style={CARD}>
          {pending.length === 0 && past.length === 0 ? (
            <EmptyState icon={Clock} title="No orders" sub="Place a limit order from any token page." />
          ) : (
            <>
              {pending.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", padding: "12px", borderBottom: `1px solid ${C.borderSoft}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>
                      <span style={{ color: o.type === "buy" ? C.buy : C.sell, textTransform: "capitalize" }}>{o.type}</span> {o.symbol}
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, fontFamily: MONO }}>
                      trigger ${fmtPrice(o.targetPrice)} · {o.type === "buy" ? `${fmtSol(o.solAmount)} SOL` : `${o.pct}%`}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberDim, borderRadius: 6, padding: "3px 7px", marginRight: 10 }}>PENDING</span>
                  <X size={15} color={C.faint} style={{ cursor: "pointer" }}
                    onClick={() => setPortfolio((p) => ({ ...p, orders: p.orders.map((x) => (x.id === o.id ? { ...x, status: "cancelled" } : x)) }))} />
                </div>
              ))}
              {past.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", padding: "12px", borderBottom: `1px solid ${C.borderSoft}`, opacity: 0.55 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{o.type === "buy" ? "Buy" : "Sell"} {o.symbol}</div>
                    <div style={{ fontSize: 10.5, color: C.faint, fontFamily: MONO }}>trigger ${fmtPrice(o.targetPrice)}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, textTransform: "uppercase" }}>{o.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "history" && (
        <div style={CARD}>
          {portfolio.trades.length === 0 ? (
            <EmptyState icon={Clock} title="No trades yet" sub="Every buy and sell is logged here." />
          ) : portfolio.trades.slice(0, 60).map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", padding: "11px 12px", borderBottom: `1px solid ${C.borderSoft}` }}>
              <Avatar t={tokenMap[t.address] || { symbol: t.symbol }} size={26} radius={7} />
              {t.type === "buy"
                ? <ArrowUpRight size={13} color={C.buy} style={{ marginLeft: 6, flexShrink: 0 }} />
                : <ArrowDownRight size={13} color={C.sell} style={{ marginLeft: 6, flexShrink: 0 }} />}
              <div style={{ flex: 1, marginLeft: 9, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  {t.type === "buy" ? "Bought" : "Sold"} {t.symbol}
                  {t.auto && <span style={{ fontSize: 9, fontWeight: 700, color: t.auto === "tp" ? C.buy : C.sell, background: t.auto === "tp" ? C.buyDim : C.sellDim, borderRadius: 5, padding: "2px 5px" }}>AUTO {t.auto.toUpperCase()}</span>}
                  {t.viaLimit && <span style={{ fontSize: 9, fontWeight: 700, color: C.amber, background: C.amberDim, borderRadius: 5, padding: "2px 5px" }}>LIMIT</span>}
                </div>
                <div style={{ fontSize: 10.5, color: C.faint }}>{new Date(t.time).toLocaleString()}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: MONO, fontSize: 12.5 }}>{fmtSol(t.solAmount)} SOL</div>
                {t.type === "sell" && (
                  <div style={{ fontSize: 10.5, color: (t.realizedUsd || 0) >= 0 ? C.buy : C.sell }}>
                    {(t.realizedUsd || 0) >= 0 ? "+" : ""}${(t.realizedUsd || 0).toFixed(2)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   WALLETS
   Imported from the user's own tracker export. Tapping one pulls
   live signatures from Solana RPC. It does not decode which token
   was traded — that needs swap-instruction parsing, so it isn't
   claimed here.
============================================================ */
function WalletRow({ w }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState({ status: "idle", data: [] });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && s.status === "idle") {
      setS({ status: "loading", data: [] });
      try {
        setS({ status: "ok", data: await fetchWalletActivity(w.a, 8) });
      } catch {
        setS({ status: "err", data: [] });
      }
    }
  }

  return (
    <div style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <div onClick={toggle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", cursor: "pointer" }}>
        <span style={{ fontSize: 17, width: 26, textAlign: "center", flexShrink: 0 }}>{w.e}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{w.n}</div>
          <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{shortAddr(w.a)}</div>
        </div>
        <ChevronLeft size={14} color={C.faint} style={{ transform: open ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
      </div>
      {open && (
        <div style={{ padding: "0 12px 12px" }}>
          {s.status === "loading" && <div style={{ fontSize: 11.5, color: C.faint }}>Reading chain...</div>}
          {s.status === "err" && <div style={{ fontSize: 11.5, color: C.sell }}>Couldn't reach Solana RPC.</div>}
          {s.status === "ok" && s.data.length === 0 && <div style={{ fontSize: 11.5, color: C.faint }}>No recent activity.</div>}
          {s.status === "ok" && s.data.map((sig) => (
            <a key={sig.signature} href={`https://solscan.io/tx/${sig.signature}`} target="_blank" rel="noreferrer"
              style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 11.5, textDecoration: "none", borderTop: `1px solid ${C.borderSoft}` }}>
              <span style={{ fontFamily: MONO, color: C.sub, display: "flex", alignItems: "center", gap: 4 }}>
                {sig.signature.slice(0, 10)}… <ExternalLink size={10} color={C.faint} />
              </span>
              <span style={{ color: sig.err ? C.sell : C.faint }}>{sig.blockTime ? timeAgo(sig.blockTime * 1000) : "—"}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function WalletsScreen() {
  const [q, setQ] = useState("");
  const list = q.trim() ? TRACKED_WALLETS.filter((w) => w.n.toLowerCase().includes(q.trim().toLowerCase())) : TRACKED_WALLETS;
  return (
    <div style={{ padding: "14px 12px 16px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, marginBottom: 4 }}>Wallets</div>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, lineHeight: 1.5 }}>
        {TRACKED_WALLETS.length} tracked wallets. Tap one to pull its recent on-chain transactions live — real signatures and timestamps, though which token was traded isn't decoded yet.
      </div>
      <div style={{ ...INPUT_WRAP, gap: 8, marginBottom: 12 }}>
        <Search size={15} color={C.faint} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search wallets..." style={{ ...INPUT, fontFamily: SANS, fontSize: 14 }} />
      </div>
      <div style={CARD}>
        {list.length === 0 ? <EmptyState icon={Users} title="No wallets found" sub="Try a different name." /> : list.map((w) => <WalletRow key={w.a} w={w} />)}
      </div>
    </div>
  );
}

/* ============================================================
   LEARN
============================================================ */
const LESSONS = [
  ["Market Cap", "Price times circulating supply — the market's valuation of the whole token. A $50K coin can 10x far more easily than a $50M one, and collapse just as fast."],
  ["Liquidity", "Money sitting in the trading pool. Low liquidity means big swings on small trades, and difficulty selling without crashing the price yourself."],
  ["Volume", "How much traded in a period. High volume against a small market cap usually means genuine activity rather than a dead chart."],
  ["Slippage", "The gap between the price you expected and what you actually got, because your own trade moved the market."],
  ["Price Impact", "How far your specific order pushes the price against you. Above a few percent means the pool is too thin for your size."],
  ["Volatility", "How violently price swings. For memecoins, 50%+ moves within minutes are normal, not exceptional."],
  ["Market Order", "Buys or sells immediately at whatever the current price is. Fast, but you take whatever price you get."],
  ["Limit Order", "Waits and only fills if price reaches your chosen trigger. Better control, but it may never fill."],
  ["Unrealized P&L", "Profit or loss on paper for positions you still hold. It isn't real until you sell."],
  ["Realized P&L", "Profit or loss you've actually locked in by selling. This is the number that counts."],
  ["FDV", "Fully diluted valuation — price times total eventual supply. A token can look cheap by market cap but expensive by FDV if lots of supply hasn't unlocked."],
  ["Taking Profits", "Selling some or all of a winner to bank gains instead of hoping forever. A common approach: sell enough to recover your original stake, let the rest run."],
  ["Cutting Losses", "Deliberately selling a loser before it gets worse. Deciding your exit before you buy makes this far easier to actually do."],
  ["Risk Management", "Rules set in advance — like how much of your balance goes into any single token — so one bad trade can't wipe you out."],
  ["FOMO", "Fear of missing out. Buying because something is already pumping is the single most common way beginners buy the top."],
  ["Bonding Curve", "The pricing mechanism new pump.fun-style tokens trade on before reaching an exchange. Price rises automatically as people buy, until the curve fills."],
  ["Bonded / Migration", "When a token completes its curve and moves to a permanent AMM pool. After that, normal supply and demand set the price."],
  ["Trenches", "Slang for the fast, brutal world of brand-new low-cap launches. 'Trenchers' are the traders who live there."],
  ["Ape / Aping In", "Buying fast with little research because something looks like it's moving. The opposite of a planned entry."],
  ["Diamond / Paper Hands", "Holding through volatility versus selling at the first dip. Neither is automatically right — it depends why you bought."],
  ["Dev Wallet", "The token creator's wallet. A dev dumping a large chunk of supply is among the strongest warning signs there is."],
  ["Sniper / Bundler", "Bots or coordinated wallets buying in the first seconds after launch, locking in cheap positions before the public can react."],
  ["Insider Activity", "Wallets connected to the team trading in ways outsiders can't see coming — a coordinated exit right after you buy is the classic pattern."],
  ["CTO", "Community takeover — the original dev abandons the token and holders keep it alive with new marketing and direction. Can go either way."],
  ["LP Locked / Burned", "Whether the liquidity pool can be withdrawn. Unlocked liquidity is a major rug-pull risk."],
  ["Mint Authority", "Whether the creator can still print new supply. Revoked is safer — supply can't be inflated after you buy."],
  ["Freeze Authority", "Whether the creator can freeze wallets and block selling. Revoked is safer — you can't be locked in."],
  ["Honeypot", "A token built so you can buy but never sell. Always a scam, never a design accident."],
  ["Rug Pull", "Creators drain liquidity or dump their holdings, collapsing the price on purpose. Thin liquidity and concentrated supply are the red flags."],
  ["Bubble Map", "A visual of how supply is spread across wallets. Big clusters linked to the dev usually mean dangerous concentration."],
  ["Smart Money", "Wallets with a track record of profitable early entries. A useful signal, a bad thing to follow blindly."],
];

function LearnScreen({ beginnerMode, setBeginnerMode }) {
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState("");
  const list = q.trim() ? LESSONS.filter(([t, d]) => (t + d).toLowerCase().includes(q.trim().toLowerCase())) : LESSONS;
  return (
    <div style={{ padding: "14px 12px 16px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3, marginBottom: 4 }}>Learn</div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 14 }}>Plain-language definitions, before you risk anything real.</div>

      <div style={{ ...CARD, display: "flex", alignItems: "center", justifyContent: "space-between", padding: 14, marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Beginner Mode</div>
          <div style={{ fontSize: 11.5, color: C.sub, marginTop: 2 }}>Extra context and warnings while trading</div>
        </div>
        <div onClick={() => setBeginnerMode(!beginnerMode)}
          style={{ width: 44, height: 26, borderRadius: 99, background: beginnerMode ? C.amber : C.panel3, position: "relative", cursor: "pointer", border: `1px solid ${C.border}`, flexShrink: 0, transition: "background .15s" }}>
          <div style={{ width: 20, height: 20, borderRadius: 99, background: "#08090B", position: "absolute", top: 2, left: beginnerMode ? 21 : 2, transition: "left .15s" }} />
        </div>
      </div>

      <div style={{ ...INPUT_WRAP, gap: 8, marginBottom: 12 }}>
        <Search size={15} color={C.faint} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms..." style={{ ...INPUT, fontFamily: SANS, fontSize: 14 }} />
      </div>

      <div style={CARD}>
        {list.map(([term, def], i) => (
          <div key={term} style={{ borderBottom: i < list.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
            <div onClick={() => setOpen(open === term ? null : term)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", cursor: "pointer" }}>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{term}</span>
              <Info size={14} color={open === term ? C.amber : C.faint} />
            </div>
            {open === term && <div style={{ padding: "0 14px 13px", fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>{def}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   FIRST-RUN
============================================================ */
function Onboarding({ onDone }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,11,.92)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ ...CARD, borderRadius: 18, padding: 22, maxWidth: 380, width: "100%" }}>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>
          <span style={{ color: C.amber }}>●</span> Paper Trader
        </div>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 16 }}>
          Practice trading Solana memecoins using live market data and completely virtual money.
        </div>
        {[
          ["You start with 100 virtual SOL", "No deposits, no wallet connection, no real funds — ever."],
          ["Prices and charts are real", "Live market data, so gains and losses behave like the real thing."],
          ["Find a token, then buy and sell", "Browse Discover or Memescope, open a token, and place a simulated order."],
          ["Track everything in Portfolio", "Positions, P&L, win rate and full trade history."],
        ].map(([h, s], i) => (
          <div key={h} style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 20, height: 20, borderRadius: 99, background: C.amberDim, color: C.amber, fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{h}</div>
              <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>{s}</div>
            </div>
          </div>
        ))}
        <button onClick={onDone} style={{ ...ACTION_BTN, background: C.amber, marginTop: 6 }}>Start paper trading</button>
      </div>
    </div>
  );
}

/* ============================================================
   WATCHLIST TICKER
============================================================ */
function Ticker({ watchlist, tokenMap, onOpen }) {
  const items = watchlist.map((a) => tokenMap[a]).filter(Boolean);
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", padding: "8px 12px", borderBottom: `1px solid ${C.borderSoft}`, background: C.panel }}>
      {items.map((t) => (
        <div key={t.address} onClick={() => onOpen(t)}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flexShrink: 0, fontFamily: MONO, fontSize: 11.5 }}>
          <span style={{ fontWeight: 700 }}>{t.symbol}</span>
          <span style={{ color: (t.change24h ?? 0) >= 0 ? C.buy : C.sell }}>{pct(t.change24h)}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   APP ROOT
============================================================ */
const NAV = [
  { id: "discover", label: "Discover", icon: Compass },
  { id: "memescope", label: "Memescope", icon: Flame },
  { id: "wallets", label: "Wallets", icon: Users },
  { id: "portfolio", label: "Portfolio", icon: Wallet },
  { id: "learn", label: "Learn", icon: GraduationCap },
];

export default function App() {
  const [tab, setTab] = useState("discover");
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataMode, setDataMode] = useState("live");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [solPrice, setSolPrice] = useState(SOL_FALLBACK_PRICE);
  const [history, setHistory] = useState({});
  const [toast, setToast] = useState(null);
  const [portfolio, setPortfolio, ready] = usePortfolio();
  const isDesktop = useIsDesktop();
  const toastTimer = useRef(null);

  const tokenMap = useMemo(() => Object.fromEntries(tokens.map((t) => [t.address, t])), [tokens]);

  const notify = useCallback((msg, tone = "buy") => {
    setToast({ msg, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [solRes, uniRes] = await Promise.allSettled([dsSearch("SOL USDC"), fetchUniverse()]);
      const sol = solRes.status === "fulfilled" ? solRes.value.find((p) => p.symbol === "SOL") : null;
      let uni = uniRes.status === "fulfilled" ? uniRes.value : [];
      uni = uni.filter((t) => t.symbol !== "SOL" && t.liquidity > 500);

      if (uni.length >= 5) {
        // Dedupe by mint address, not ticker — different mints reuse tickers.
        const byAddr = {};
        for (const t of uni) {
          if (!byAddr[t.address] || t.liquidity > byAddr[t.address].liquidity) byAddr[t.address] = t;
        }
        setTokens(Object.values(byAddr).slice(0, 60));
        setDataMode("live");
        if (sol?.priceUsd) setSolPrice(sol.priceUsd);
      } else {
        throw new Error("insufficient results");
      }
    } catch {
      // Network unreachable — fall back to offline mode, clearly badged.
      setTokens((prev) => (prev.length && prev[0].simulated ? jitterSim(prev) : seedSim()));
      setDataMode("simulated");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (dataMode === "live") loadData();
      else setTokens((prev) => (prev.length ? jitterSim(prev) : prev));
    }, dataMode === "live" ? 10000 : 2500);
    return () => clearInterval(iv);
  }, [dataMode, loadData]);

  // Rolling market-cap trail for the row sparklines.
  useEffect(() => {
    if (!tokens.length) return;
    setHistory((prev) => {
      const next = { ...prev };
      for (const t of tokens) next[t.address] = [...(next[t.address] || []).slice(-19), t.marketCap];
      return next;
    });
  }, [tokens]);

  // Keep an open token page in sync with fresh prices.
  useEffect(() => {
    if (selected && tokenMap[selected.address]) setSelected(tokenMap[selected.address]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  // Take-profit / stop-loss engine — closes positions that cross their
  // target on any price refresh, whether or not you're watching them.
  useEffect(() => {
    if (!ready || !portfolio) return;
    const hits = [];
    for (const [address, h] of Object.entries(portfolio.holdings)) {
      if (!h.tpPct && !h.slPct) continue;
      const live = tokenMap[address];
      if (!live?.priceUsd || !h.avgEntry) continue;
      const p = ((live.priceUsd - h.avgEntry) / h.avgEntry) * 100;
      if (h.tpPct && p >= h.tpPct) hits.push({ address, reason: "tp", price: live.priceUsd });
      else if (h.slPct && p <= -h.slPct) hits.push({ address, reason: "sl", price: live.priceUsd });
    }
    if (!hits.length) return;
    setPortfolio((prev) => {
      const holdings = { ...prev.holdings };
      const trades = [], notes = [];
      let solDelta = 0, realizedDelta = 0;
      for (const { address, reason, price } of hits) {
        const h = holdings[address];
        if (!h) continue;
        const usd = h.amount * price;
        const sol = usd / solPrice;
        const realized = usd - h.amount * h.avgEntry;
        solDelta += sol;
        realizedDelta += realized;
        delete holdings[address];
        trades.push({ id: uid(), type: "sell", symbol: h.symbol, address, solAmount: sol, priceUsd: price, tokenAmount: h.amount, realizedUsd: realized, time: Date.now(), auto: reason });
        notes.push({ id: uid(), message: `${reason === "tp" ? "Take-profit" : "Stop-loss"} hit — ${h.symbol} sold at $${fmtPrice(price)} (${realized >= 0 ? "+" : ""}$${realized.toFixed(2)})`, time: Date.now(), read: false });
      }
      if (!trades.length) return prev;
      return {
        ...prev, holdings,
        balance: +(prev.balance + solDelta).toFixed(6),
        realizedPnl: prev.realizedPnl + realizedDelta,
        trades: [...trades, ...prev.trades],
        notifications: [...notes, ...prev.notifications],
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  // Limit-order engine — a buy fills when price falls to its trigger, a
  // sell fills when price rises to it. Same accounting as a manual trade.
  useEffect(() => {
    if (!ready || !portfolio?.orders?.some((o) => o.status === "pending")) return;
    setPortfolio((prev) => {
      let balance = prev.balance, realizedPnl = prev.realizedPnl;
      const holdings = { ...prev.holdings };
      let trades = prev.trades, notes = prev.notifications;
      let changed = false;

      const orders = prev.orders.map((o) => {
        if (o.status !== "pending") return o;
        const live = tokenMap[o.address];
        if (!live?.priceUsd) return o;
        const price = live.priceUsd;

        if (o.type === "buy" && price <= o.targetPrice) {
          if (o.solAmount > balance) return o;
          const usd = o.solAmount * solPrice;
          const qty = usd / price;
          const h = holdings[o.address];
          const amount = (h?.amount || 0) + qty;
          const cost = (h ? h.amount * h.avgEntry : 0) + usd;
          holdings[o.address] = {
            symbol: o.symbol, name: o.name, address: o.address, amount, avgEntry: cost / amount,
            tpPct: h?.tpPct ?? null, slPct: h?.slPct ?? null, openedAt: h?.openedAt ?? Date.now(),
          };
          balance = +(balance - o.solAmount).toFixed(6);
          trades = [{ id: uid(), type: "buy", symbol: o.symbol, address: o.address, solAmount: o.solAmount, priceUsd: price, tokenAmount: qty, time: Date.now(), viaLimit: true }, ...trades];
          notes = [{ id: uid(), message: `Limit buy filled — ${o.symbol} at $${fmtPrice(price)}`, time: Date.now(), read: false }, ...notes];
          changed = true;
          return { ...o, status: "filled", filledAt: Date.now() };
        }

        if (o.type === "sell" && price >= o.targetPrice) {
          const h = holdings[o.address];
          if (!h || h.amount <= 0) { changed = true; return { ...o, status: "cancelled" }; }
          const qty = h.amount * (o.pct / 100);
          const usd = qty * price;
          const sol = usd / solPrice;
          const realized = usd - qty * h.avgEntry;
          const rest = h.amount - qty;
          if (rest <= 1e-6) delete holdings[o.address];
          else holdings[o.address] = { ...h, amount: rest };
          balance = +(balance + sol).toFixed(6);
          realizedPnl += realized;
          trades = [{ id: uid(), type: "sell", symbol: o.symbol, address: o.address, solAmount: sol, priceUsd: price, tokenAmount: qty, realizedUsd: realized, time: Date.now(), viaLimit: true }, ...trades];
          notes = [{ id: uid(), message: `Limit sell filled — ${o.symbol} at $${fmtPrice(price)} (${realized >= 0 ? "+" : ""}$${realized.toFixed(2)})`, time: Date.now(), read: false }, ...notes];
          changed = true;
          return { ...o, status: "filled", filledAt: Date.now() };
        }
        return o;
      });

      if (!changed) return prev;
      return { ...prev, balance, holdings, trades, orders, realizedPnl, notifications: notes };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  const toggleWatch = useCallback((t) => {
    setPortfolio((p) => ({
      ...p,
      watchlist: p.watchlist.includes(t.address) ? p.watchlist.filter((a) => a !== t.address) : [...p.watchlist, t.address],
    }));
  }, [setPortfolio]);

  if (!ready || !portfolio) {
    return <div style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, color: C.sub, fontFamily: SANS }}>Loading…</div>;
  }

  const posValue = Object.values(portfolio.holdings).reduce((s, h) => s + h.amount * (tokenMap[h.address]?.priceUsd ?? h.avgEntry), 0);
  const totalValue = portfolio.balance * solPrice + posValue;

  const screens = (
    <>
      {tab === "discover" && (
        <DiscoverScreen
          tokens={tokens} loading={loading} dataMode={dataMode} onOpen={setSelected}
          watchlist={portfolio.watchlist} onToggleWatch={toggleWatch}
          query={query} setQuery={setQuery} solPrice={solPrice} history={history}
        />
      )}
      {tab === "memescope" && (
        <MemescopeScreen
          tokens={tokens} dataMode={dataMode} onOpen={setSelected}
          watchlist={portfolio.watchlist} onToggleWatch={toggleWatch}
          solPrice={solPrice} history={history}
        />
      )}
      {tab === "wallets" && <WalletsScreen />}
      {tab === "portfolio" && (
        <PortfolioScreen portfolio={portfolio} setPortfolio={setPortfolio} tokenMap={tokenMap} solPrice={solPrice} onOpenToken={setSelected} />
      )}
      {tab === "learn" && (
        <LearnScreen beginnerMode={portfolio.beginnerMode} setBeginnerMode={(v) => setPortfolio((p) => ({ ...p, beginnerMode: v }))} />
      )}
    </>
  );

  const tokenView = selected && (
    <TokenScreen
      token={selected} portfolio={portfolio} setPortfolio={setPortfolio}
      onBack={() => setSelected(null)} watched={portfolio.watchlist.includes(selected.address)}
      onToggleWatch={toggleWatch} solPrice={solPrice} isDesktop={isDesktop} notify={notify}
    />
  );

  return (
    <div style={{
      background: `radial-gradient(ellipse 900px 500px at 50% -10%, ${C.panel3}55, ${C.bg} 60%)`,
      minHeight: "100vh", color: C.text, fontFamily: SANS,
      paddingLeft: isDesktop ? 210 : 0,
    }}>
      <style>{FONT_CSS}{`
        *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
        body{margin:0}
        input::placeholder{color:${C.faint}}
        button{font-family:inherit}
        ::-webkit-scrollbar{width:8px;height:8px}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:8px}
        ::-webkit-scrollbar-track{background:transparent}
        @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.35}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{animation:spin 1s linear infinite}
      `}</style>

      {!portfolio.onboarded && <Onboarding onDone={() => setPortfolio((p) => ({ ...p, onboarded: true }))} />}
      <Toast toast={toast} />

      {isDesktop ? (
        <>
          <div style={{
            position: "fixed", top: 0, left: 0, bottom: 0, width: 210, zIndex: 100,
            display: "flex", flexDirection: "column", gap: 3,
            background: C.panel, borderRight: `1px solid ${C.border}`, padding: "18px 11px",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 14px" }}>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.3 }}>
                <span style={{ color: C.amber }}>●</span> Paper Trader
              </div>
              <NotificationBell portfolio={portfolio} setPortfolio={setPortfolio} />
            </div>
            <div style={{ padding: "0 8px 14px", borderBottom: `1px solid ${C.borderSoft}`, marginBottom: 8 }}>
              <div style={{ fontSize: 9.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 }}>Paper balance</div>
              <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 15 }}>{fmtSol(portfolio.balance)} SOL</div>
              <div style={{ fontSize: 10.5, marginTop: 2, fontFamily: MONO, color: C.faint }}>
                ${totalValue.toFixed(2)} total ·{" "}
                <span style={{ color: portfolio.realizedPnl >= 0 ? C.buy : C.sell }}>
                  {portfolio.realizedPnl >= 0 ? "+" : ""}${portfolio.realizedPnl.toFixed(2)}
                </span>
              </div>
            </div>
            {NAV.map((n) => {
              const Icon = n.icon, on = tab === n.id;
              return (
                <div key={n.id} onClick={() => { setTab(n.id); setSelected(null); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 9,
                    cursor: "pointer", background: on ? C.amberDim : "transparent",
                    color: on ? C.amber : C.sub, fontWeight: 600, fontSize: 13.5,
                    boxShadow: on ? `inset 3px 0 0 ${C.amber}` : "none", transition: "background .15s",
                  }}>
                  <Icon size={17} />{n.label}
                </div>
              );
            })}
            <div style={{ marginTop: "auto", fontSize: 9.5, color: C.faint, padding: "10px 8px 0", lineHeight: 1.5, borderTop: `1px solid ${C.borderSoft}` }}>
              Paper trading only. Virtual funds, live prices, no real transactions.
            </div>
          </div>

          <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 14px" }}>
            <Ticker watchlist={portfolio.watchlist} tokenMap={tokenMap} onOpen={setSelected} />
            {selected ? tokenView : screens}
          </div>
        </>
      ) : (
        <div style={{ maxWidth: 520, margin: "0 auto", paddingBottom: 68 }}>
          {!selected && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 12px 0" }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  <span style={{ color: C.amber }}>●</span> Paper Trader
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: C.sub }}>{fmtSol(portfolio.balance)} SOL</span>
                  <NotificationBell portfolio={portfolio} setPortfolio={setPortfolio} />
                </div>
              </div>
              <Ticker watchlist={portfolio.watchlist} tokenMap={tokenMap} onOpen={setSelected} />
            </>
          )}
          {selected ? tokenView : screens}

          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 520, margin: "0 auto", zIndex: 100,
            display: "flex", background: C.panel, borderTop: `1px solid ${C.border}`, padding: "7px 0 9px",
          }}>
            {NAV.map((n) => {
              const Icon = n.icon, on = tab === n.id && !selected;
              return (
                <div key={n.id} onClick={() => { setTab(n.id); setSelected(null); }}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
                  <Icon size={19} color={on ? C.amber : C.faint} />
                  <span style={{ fontSize: 9.5, fontWeight: 600, color: on ? C.amber : C.faint }}>{n.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
