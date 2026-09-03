import { useState, useEffect, useRef, useCallback } from "react";
import { ComposedChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";
import {
  Search, Star, ArrowUpRight, ArrowDownRight, ChevronLeft, X, Info,
  TrendingUp, TrendingDown, Flame, Clock, BarChart3, Wallet, GraduationCap,
  Compass, Settings, CircleAlert, ShieldAlert, Check, RefreshCw, Rocket, Sparkles, Users, ExternalLink, Bell
} from "lucide-react";

/* ============================================================
   DESIGN TOKENS
   Ink-black terminal, warm amber signal (not the usual acid-green
   or Solana purple), tabular mono for every number so prices/PnL
   align like a real ticker.
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
  amberGlow: "rgba(240,169,62,0.12)",
  buy: "#3ECF7E",
  buyDim: "#15291F",
  sell: "#F5525B",
  sellDim: "#2E1518",
};

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
`;

const SOL_FALLBACK_PRICE = 148.0;

/* ============================================================
   UTILITIES
============================================================ */
function fmtUsd(n, opts = {}) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "K";
  if (abs > 0 && abs < 0.01) return n.toFixed(6);
  if (abs < 1) return n.toFixed(4);
  return n.toFixed(opts.decimals ?? 2);
}
function fmtPrice(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n === 0) return "0";
  if (n < 0.000001) return n.toExponential(2);
  if (n < 0.01) {
    // show leading zeros compactly for tiny memecoin prices
    const s = n.toFixed(10).replace(/0+$/, "");
    return s;
  }
  if (n < 1) return n.toFixed(6);
  return n.toFixed(4);
}
function fmtSol(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return n.toFixed(4).replace(/\.?0+$/, "") || "0";
}
function pct(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function timeAgo(ms) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 900);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

/* ============================================================
   DATA LAYER — DexScreener public API, with simulated fallback
   if the sandbox blocks cross-origin fetches. We surface which
   mode we're in rather than silently faking "live" data.
============================================================ */
const DS_BASE = "https://api.dexscreener.com";

function seedSimTokens() {
  const names = [
    ["SNAIL", "Turbo Snail"], ["FROG", "Based Frog"], ["MOON", "Moonshot Inu"],
    ["WOJAK", "Wojak Classic"], ["PEPE2", "Solana Pepe"], ["CHAD", "Chad Coin"],
    ["RUG", "Definitely Not A Rug"], ["DEGEN", "Degen Capital"], ["FLOKI", "Floki Sol"],
    ["NYAN", "Nyan Sol"], ["APU", "Apu Apustaja"], ["MEOW", "Meow Finance"],
  ];
  return names.map(([sym, name], i) => {
    const price = +(Math.random() * (i < 3 ? 2 : 0.05)).toFixed(8);
    // spread tokens across memescope stages so every tab has content in sim mode:
    // i 0-4  -> brand new bonding pairs (<10 min old)
    // i 5-7  -> close to graduating (<1 hr old, high bonding %, $10K+ mc)
    // i 8-11 -> already graduated
    const group = i < 5 ? "new" : i < 8 ? "graduating" : "graduated";
    const stage = group === "graduated" ? "graduated" : "bonding";
    const threshold = gradMarketCapUsd(SOL_FALLBACK_PRICE);
    const bondingPctVal =
      group === "new" ? Math.random() * 55 : group === "graduating" ? 80 + Math.random() * 20 : 100;
    const ageMs =
      group === "new"
        ? Math.random() * TEN_MIN_MS
        : group === "graduating"
        ? Math.random() * ONE_HOUR_MS
        : Math.random() * 1000 * 60 * 60 * 24 * 20;
    const feesSol = group === "new" ? Math.random() * 0.3 : group === "graduating" ? 0.5 + Math.random() * 2 : 1 + Math.random() * 7;
    const volume24h = Math.random() * 4_000_000;
    const mc = stage === "bonding" ? (bondingPctVal / 100) * threshold : Math.random() * 12_000_000 + 100_000;
    const buys24h = Math.floor(Math.random() * 900) + 20;
    const sellRatio = 0.3 + Math.random() * 0.5;
    return {
      address: "SIM" + uid() + i,
      pairAddress: "SIM" + uid(),
      symbol: sym,
      name,
      image: null,
      priceUsd: price || 0.0000123,
      change5m: (Math.random() - 0.5) * 6,
      change1h: (Math.random() - 0.5) * 20,
      change6h: (Math.random() - 0.5) * 40,
      change24h: (Math.random() - 0.45) * 80,
      volume24h,
      volume1h: volume24h * (0.02 + Math.random() * 0.08),
      liquidity: Math.random() * 900_000 + 20_000,
      marketCap: mc,
      fdv: mc * (1 + Math.random() * 0.15),
      buys24h,
      sells24h: Math.floor(buys24h * sellRatio),
      buys1h: Math.floor(buys24h * 0.05),
      sells1h: Math.floor(buys24h * sellRatio * 0.05),
      createdAt: Date.now() - ageMs,
      stage,
      bondingPctVal,
      feesSol,
      simulated: true,
    };
  });
}

function jitterSimTokens(tokens) {
  return tokens.map((t) => {
    const drift = 1 + (Math.random() - 0.5) * 0.06;
    const newPrice = Math.max(t.priceUsd * drift, 0.0000000001);
    const delta24 = ((newPrice - t.priceUsd) / t.priceUsd) * 100;
    const newBonding =
      t.stage === "bonding" ? Math.min(100, Math.max(0, t.bondingPctVal + (Math.random() - 0.35) * 3)) : t.bondingPctVal;
    return {
      ...t,
      priceUsd: newPrice,
      change5m: t.change5m + (Math.random() - 0.5) * 1,
      change1h: t.change1h + (Math.random() - 0.5) * 2,
      change6h: t.change6h + (Math.random() - 0.5) * 3,
      change24h: t.change24h + delta24,
      bondingPctVal: newBonding,
      feesSol: t.feesSol + Math.random() * 0.02,
      buys24h: t.buys24h + Math.floor(Math.random() * 4),
      sells24h: t.sells24h + Math.floor(Math.random() * 3),
      stage: newBonding >= 100 ? "graduated" : t.stage,
    };
  });
}

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
    buys1h: p.txns?.h1?.buys ?? 0,
    sells1h: p.txns?.h1?.sells ?? 0,
    createdAt: p.pairCreatedAt ?? null,
    dexId: p.dexId ?? null,
    image: p.info?.imageUrl ?? null,
    url: p.url,
    simulated: false,
  };
}

/* ------------------------------------------------------------
   Memescope stage classification.
   Pump.fun tokens trade on a bonding curve until they hit the
   graduation threshold, then migrate ("bond") to an AMM like
   Raydium. The curve completes once ~85 SOL has been raised
   into it, so the USD threshold moves with the live SOL price
   rather than being a fixed dollar figure.
------------------------------------------------------------- */
const GRAD_SOL_RAISE = 85;
const TEN_MIN_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const NEW_PAIR_WINDOW_MS = 6 * 60 * 60 * 1000; // realistic window given free-API freshness limits
// Pump.fun charges ~1% on bonding-curve trades. Exact cumulative fee totals
// aren't exposed by the free DexScreener API, so we approximate fees paid
// from trading volume. Flagged as an approximation everywhere it's shown.
const FEE_RATE_APPROX = 0.01;

function gradMarketCapUsd(solPrice) {
  return GRAD_SOL_RAISE * (solPrice || SOL_FALLBACK_PRICE);
}
function bondingStage(t) {
  if (t.simulated) return t.stage;
  if (t.dexId && t.dexId !== "pumpfun") return "graduated";
  return "bonding";
}
function bondingPct(t, solPrice) {
  if (t.simulated) return t.bondingPctVal ?? 0;
  if (t.dexId && t.dexId !== "pumpfun") return 100;
  const threshold = gradMarketCapUsd(solPrice);
  return Math.min(100, Math.max(0, (t.marketCap / threshold) * 100));
}
function estimateFeesSol(t, solPrice) {
  if (t.simulated) return t.feesSol ?? 0;
  const usdFees = (t.volume24h || 0) * FEE_RATE_APPROX;
  return usdFees / (solPrice || SOL_FALLBACK_PRICE);
}

async function fetchLiveSolPairs(query) {
  const res = await fetch(`${DS_BASE}/latest/dex/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("dexscreener search failed");
  const data = await res.json();
  const pairs = (data.pairs || []).filter((p) => p.chainId === "solana" && p.baseToken?.symbol);
  return pairs.map(mapPair);
}

/* ------------------------------------------------------------
   Real token discovery. Searching for the literal text "pump"
   mostly just found the $PUMP token itself, not a broad set of
   memecoins — wrong tool for the job. This instead pulls from
   DexScreener's boosted/profiled-token feeds (a real curated
   universe of active tokens, most with icons already attached),
   then resolves those addresses to full trading data in one
   batched call.
------------------------------------------------------------- */
async function fetchTokenPaidStatus(tokenAddress) {
  const res = await fetch(`${DS_BASE}/orders/v1/solana/${tokenAddress}`);
  if (!res.ok) throw new Error("orders fetch failed");
  const orders = await res.json();
  return Array.isArray(orders) && orders.some((o) => o.status === "approved");
}

async function fetchDiscoveryUniverse() {
  const [topBoostsRes, latestBoostsRes, profilesRes] = await Promise.allSettled([
    fetch(`${DS_BASE}/token-boosts/top/v1`).then((r) => r.json()),
    fetch(`${DS_BASE}/token-boosts/latest/v1`).then((r) => r.json()),
    fetch(`${DS_BASE}/token-profiles/latest/v1`).then((r) => r.json()),
  ]);
  const topBoosts = topBoostsRes.status === "fulfilled" && Array.isArray(topBoostsRes.value) ? topBoostsRes.value : [];
  const latestBoosts = latestBoostsRes.status === "fulfilled" && Array.isArray(latestBoostsRes.value) ? latestBoostsRes.value : [];
  const profiles = profilesRes.status === "fulfilled" && Array.isArray(profilesRes.value) ? profilesRes.value : [];
  const combined = [...latestBoosts, ...topBoosts, ...profiles].filter((e) => e.chainId === "solana" && e.tokenAddress);

  const iconByAddress = {};
  const addresses = [];
  const seen = new Set();
  for (const e of combined) {
    if (!seen.has(e.tokenAddress)) {
      seen.add(e.tokenAddress);
      addresses.push(e.tokenAddress);
    }
    if (e.icon && !iconByAddress[e.tokenAddress]) iconByAddress[e.tokenAddress] = e.icon;
  }
  if (!addresses.length) return [];

  // /latest/dex/tokens/{addresses} accepts up to 30 comma-separated addresses per call
  const chunks = [];
  for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));
  const chunkResults = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const res = await fetch(`${DS_BASE}/latest/dex/tokens/${chunk.join(",")}`);
      if (!res.ok) throw new Error("tokens fetch failed");
      const data = await res.json();
      return data.pairs || [];
    })
  );
  const rawPairs = chunkResults.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  return rawPairs
    .filter((p) => p.chainId === "solana" && p.baseToken?.symbol)
    .map((p) => {
      const mapped = mapPair(p);
      if (!mapped.image && iconByAddress[mapped.address]) mapped.image = iconByAddress[mapped.address];
      return mapped;
    });
}

/* ------------------------------------------------------------
   Wallet tracker — imported from the user's Axiom tracked-wallet
   export. One entry with a slur baked into its label was dropped;
   everything else carried over as-is (name/emoji/address).
   Activity is fetched on-demand per wallet via Solana's public
   RPC (getSignaturesForAddress) — real on-chain data, not a mock.
   It surfaces recent signatures/timestamps only; decoding which
   token was bought or sold isn't implemented yet.
------------------------------------------------------------- */
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";

async function fetchWalletActivity(address, limit = 8) {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [address, { limit }],
    }),
  });
  if (!res.ok) throw new Error("rpc request failed");
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "rpc error");
  return json.result || [];
}

/* ------------------------------------------------------------
   Contract safety — reads the token mint account directly from
   Solana's public RPC using jsonParsed encoding, so the RPC does
   the SPL Token layout decoding, not us (hand-decoding raw bytes
   would risk getting offsets wrong and silently showing garbage).
   Tells you whether mint/freeze authority have been revoked —
   real on-chain facts, the same signal every terminal shows.
------------------------------------------------------------- */
async function fetchMintSafety(mintAddress) {
  const res = await fetch(SOLANA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getAccountInfo",
      params: [mintAddress, { encoding: "jsonParsed" }],
    }),
  });
  if (!res.ok) throw new Error("rpc request failed");
  const json = await res.json();
  const info = json?.result?.value?.data?.parsed?.info;
  if (!info) throw new Error("no parsed mint info returned");
  return {
    mintAuthority: info.mintAuthority || null,
    freezeAuthority: info.freezeAuthority || null,
    supply: info.supply,
    decimals: info.decimals,
  };
}

/* ------------------------------------------------------------
   Chart data — real OHLCV candles from GeckoTerminal's free
   public API, polled and drawn ourselves. (An earlier version
   tried embedding DexScreener's own chart in an iframe; that
   render blank because DexScreener blocks third-party framing —
   this fetches real data instead of embedding their page.)
------------------------------------------------------------- */
async function fetchOhlcv(pairAddress) {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/minute?aggregate=5&limit=96`
  );
  if (!res.ok) throw new Error("geckoterminal ohlcv failed");
  const json = await res.json();
  const list = json?.data?.attributes?.ohlcv_list || [];
  if (!list.length) throw new Error("empty ohlcv");
  return list
    .slice()
    .reverse()
    .map(([ts, open, high, low, close, volume]) => ({ t: ts * 1000, open, high, low, close, volume }));
}

/* ============================================================
   PERSISTED PORTFOLIO STATE
============================================================ */
const DEFAULT_STATE = {
  balance: 100,
  holdings: {}, // address -> {symbol, name, amount, avgEntry, address}
  trades: [], // closed+open trade log
  watchlist: [],
  beginnerMode: true,
  realizedPnl: 0,
  orders: [], // pending limit orders: {id, type: buy|sell, address, symbol, name, targetPrice, solAmount|pct, status, createdAt}
  notifications: [], // {id, kind, message, time, read}
};

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

function usePortfolio() {
  const [state, setState] = useState(null);
  const [ready, setReady] = useState(false);

  // Runs as a normal deployed site now, not inside Claude.ai's artifact
  // sandbox, so state persists in this browser's localStorage instead of
  // Claude's memory tool. It'll survive reloads on this device/browser,
  // but won't follow you to a different device or browser.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("portfolio-v1");
      setState(raw ? JSON.parse(raw) : DEFAULT_STATE);
    } catch {
      setState(DEFAULT_STATE);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !state) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem("portfolio-v1", JSON.stringify(state));
      } catch {
        /* best-effort */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state, ready]);

  return [state, setState, ready];
}

/* ============================================================
   SMALL UI PRIMITIVES
============================================================ */
function Pill({ positive, children }) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        fontWeight: 600,
        color: positive ? C.buy : C.sell,
        background: positive ? C.buyDim : C.sellDim,
        borderRadius: 6,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Tooltip({ term, def, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 3 }}>
      <span
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ borderBottom: `1px dashed ${C.faint}`, cursor: "pointer" }}
      >
        {children}
      </span>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute", bottom: "125%", left: 0, zIndex: 50,
            width: 220, background: C.panel2, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 10, fontSize: 12.5, lineHeight: 1.45,
            color: C.text, boxShadow: "0 8px 24px rgba(0,0,0,.5)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, color: C.amber }}>{term}</div>
          {def}
        </div>
      )}
    </span>
  );
}

function Sparkline({ data, width = 52, height = 22, color }) {
  if (!data || data.length < 2) return <div style={{ width, height, flexShrink: 0 }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || max || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`).join(" ");
  return (
    <svg width={width} height={height} style={{ flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function WatchlistTicker({ watchlist, tokenMap, onOpen }) {
  const items = watchlist.map((addr) => tokenMap[addr]).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 14px", borderBottom: `1px solid ${C.borderSoft}` }}>
      {items.map((t) => {
        const up = (t.change24h ?? 0) >= 0;
        return (
          <div
            key={t.address}
            onClick={() => onOpen(t)}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0, cursor: "pointer",
              background: C.panel2, border: `1px solid ${C.borderSoft}`, borderRadius: 20, padding: "4px 10px",
            }}
          >
            <Star size={10} color={C.amber} fill={C.amber} />
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{t.symbol}</span>
            <span style={{ fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", color: up ? C.buy : C.sell }}>
              {pct(t.change24h)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Avatar({ t, size = 38, radius = 10, fontSize }) {
  const [broken, setBroken] = useState(false);
  const showImg = !!t?.image && !broken;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: radius, background: C.panel2,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 800, fontSize: fontSize || size * 0.34, color: C.amber, flexShrink: 0,
        border: `1px solid ${C.border}`, overflow: "hidden",
      }}
    >
      {showImg ? (
        <img src={t.image} onError={() => setBroken(true)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        (t?.symbol || "?").slice(0, 2)
      )}
    </div>
  );
}

function useFlash(value) {
  const prevRef = useRef(value);
  const timerRef = useRef(null);
  const [dir, setDir] = useState(null);
  useEffect(() => {
    if (prevRef.current !== undefined && prevRef.current !== null && value !== prevRef.current) {
      setDir(value > prevRef.current ? "up" : "down");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setDir(null), 700);
    }
    prevRef.current = value;
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [value]);
  return dir;
}

function NotificationBell({ portfolio, setPortfolio }) {
  const [open, setOpen] = useState(false);
  const unread = portfolio.notifications.filter((n) => !n.read).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setPortfolio((p) => ({ ...p, notifications: p.notifications.map((n) => ({ ...n, read: true })) }));
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <div onClick={toggle} style={{ cursor: "pointer", position: "relative", display: "flex", alignItems: "center" }}>
        <Bell size={18} color={open ? C.amber : C.sub} />
        {unread > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -5, background: C.sell, color: "#fff", fontSize: 9, fontWeight: 700,
              borderRadius: 99, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </div>
      {open && (
        <div
          style={{
            position: "absolute", top: "130%", right: 0, width: 300, maxHeight: 380, overflowY: "auto",
            background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 14px 34px rgba(0,0,0,.55)", zIndex: 300,
          }}
        >
          <div style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: C.faint, borderBottom: `1px solid ${C.borderSoft}`, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Notifications
          </div>
          {portfolio.notifications.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 12.5, color: C.faint }}>Nothing yet — trade fills and TP/SL/limit orders will show up here.</div>
          ) : (
            portfolio.notifications.slice(0, 30).map((n) => (
              <div key={n.id} style={{ padding: "10px 14px", borderBottom: `1px solid ${C.borderSoft}`, fontSize: 12.5 }}>
                <div style={{ color: C.text, lineHeight: 1.4 }}>{n.message}</div>
                <div style={{ color: C.faint, fontSize: 10.5, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>{timeAgo(n.time)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function LiveBadge({ dataMode }) {
  const live = dataMode === "live";
  return (
    <div
      style={{
        fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
        background: live ? C.buyDim : C.amberDim, color: live ? C.buy : C.amber,
        display: "flex", alignItems: "center", gap: 5,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: "currentColor", animation: "pulseDot 1.6s ease-in-out infinite" }} />
      {live ? "LIVE" : "SIMULATED"}
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: C.sub }}>
      <Icon size={28} style={{ opacity: 0.5, marginBottom: 10 }} />
      <div style={{ color: C.text, fontWeight: 600, fontSize: 14.5 }}>{title}</div>
      <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );
}

/* ============================================================
   TOKEN LIST CARD
============================================================ */
function TokenCard({ t, onOpen, onToggleWatch, watched, bonding, sparkline }) {
  const up = (t.change24h ?? 0) >= 0;
  const showBondingBar = bonding !== undefined && bonding !== null;
  const graduated = bonding >= 100;
  const flash = useFlash(t.marketCap);
  const buys = t.buys24h ?? 0;
  const sells = t.sells24h ?? 0;
  const totalTx = buys + sells;
  const buyRatio = totalTx > 0 ? buys / totalTx : 0.5;
  const showTxBar = !showBondingBar && totalTx > 0;
  return (
    <div
      onClick={() => onOpen(t)}
      style={{
        display: "flex", flexDirection: "column", gap: 7, padding: "10px 12px",
        borderBottom: `1px solid ${C.borderSoft}`, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <Avatar t={t} size={36} radius={10} fontSize={12.5} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{t.symbol}</span>
            <span style={{ color: C.sub, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {t.name}
            </span>
            {t.createdAt && (
              <span style={{ fontSize: 10, color: C.faint, flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                · {timeAgo(t.createdAt)}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 9, marginTop: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.faint }}>
            <span>${fmtPrice(t.priceUsd)}</span>
            <span>Liq {fmtUsd(t.liquidity)}</span>
            <span>Vol {fmtUsd(t.volume24h)}</span>
            {totalTx > 0 && <span>{fmtUsd(totalTx)} tx</span>}
          </div>
        </div>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} color={up ? C.buy : C.sell} />
        )}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 14, borderRadius: 6, padding: "1px 4px",
              background: flash === "up" ? C.buyDim : flash === "down" ? C.sellDim : "transparent", transition: "background .5s",
            }}
          >
            {fmtUsd(t.marketCap)}
          </div>
          <Pill positive={up}>{pct(t.change24h)}</Pill>
        </div>
        <Star
          size={15}
          onClick={(e) => { e.stopPropagation(); onToggleWatch(t); }}
          style={{ marginLeft: 1, flexShrink: 0, color: watched ? C.amber : C.faint, fill: watched ? C.amber : "none" }}
        />
      </div>
      {showBondingBar && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 47 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 99, background: C.panel2, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, bonding)}%`, height: "100%",
                background: graduated ? C.buy : C.amber, borderRadius: 99, transition: "width .3s",
              }}
            />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: graduated ? C.buy : C.amber, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
            {graduated ? "BONDED" : `${bonding.toFixed(0)}%`}
          </span>
        </div>
      )}
      {showTxBar && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 47 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 99, background: C.sellDim, overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${buyRatio * 100}%`, background: C.buy, height: "100%" }} />
          </div>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0, color: C.faint }}>
            <span style={{ color: C.buy }}>{buys}</span>/<span style={{ color: C.sell }}>{sells}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   DISCOVER SCREEN
============================================================ */
const DISCOVER_TABS = ["Trending", "New", "Gainers", "Losers", "Volume", "Mcap", "Watchlist"];

const LIQ_FILTERS = [
  { label: "All", min: 0 },
  { label: "$5K+ Liq", min: 5000 },
  { label: "$25K+ Liq", min: 25000 },
  { label: "$100K+ Liq", min: 100000 },
];

function DiscoverScreen({ tokens, loading, dataMode, onOpen, watchlist, onToggleWatch, query, setQuery, solPrice, compact, priceHistory }) {
  const [tab, setTab] = useState("Trending");
  const [minLiq, setMinLiq] = useState(0);

  let list = tokens.filter((t) => t.liquidity >= minLiq);
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    list = list.filter((t) => t.symbol?.toLowerCase().includes(q) || t.name?.toLowerCase().includes(q));
  } else if (tab === "Watchlist") {
    list = list.filter((t) => watchlist.includes(t.address));
  } else if (tab === "New") {
    list = [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else if (tab === "Gainers") {
    list = [...list].sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
  } else if (tab === "Losers") {
    list = [...list].sort((a, b) => (a.change24h ?? 0) - (b.change24h ?? 0));
  } else if (tab === "Volume") {
    list = [...list].sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0));
  } else if (tab === "Mcap") {
    list = [...list].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  } else {
    list = [...list].sort((a, b) => (b.volume24h ?? 0) * (1 + (b.change24h ?? 0) / 100) - (a.volume24h ?? 0) * (1 + (a.change24h ?? 0) / 100));
  }

  const totalVol = tokens.reduce((s, t) => s + (t.volume24h || 0), 0);

  return (
    <div>
      <div style={{ padding: "14px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>Discover</div>
          <LiveBadge dataMode={dataMode} />
        </div>
        {!compact && (
          <div style={{ display: "flex", gap: 14, marginBottom: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.faint }}>
            <span>SOL <span style={{ color: C.text, fontWeight: 600 }}>${solPrice.toFixed(2)}</span></span>
            <span>{tokens.length} tracked</span>
          <span>{fmtUsd(totalVol)} 24h vol</span>
          </div>
        )}
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, background: C.panel,
            border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 12px",
          }}
        >
          <Search size={15} color={C.faint} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tokens..."
            style={{
              background: "transparent", border: "none", outline: "none", color: C.text,
              fontSize: 14, width: "100%", fontFamily: "'Inter', sans-serif",
            }}
          />
        </div>
      </div>

      {!query.trim() && (
        <>
          <div style={{ display: "flex", gap: 6, padding: "0 14px 8px", overflowX: "auto" }}>
            {DISCOVER_TABS.map((tb) => (
              <button
                key={tb}
                onClick={() => setTab(tb)}
                style={{
                  flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 20,
                  border: `1px solid ${tab === tb ? C.amber : C.border}`,
                  background: tab === tb ? C.amberDim : "transparent",
                  color: tab === tb ? C.amber : C.sub, cursor: "pointer",
                }}
              >
                {tb}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, padding: "0 14px 12px", overflowX: "auto" }}>
            {LIQ_FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setMinLiq(f.min)}
                style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 16,
                  border: `1px solid ${minLiq === f.min ? C.borderStrong : C.borderSoft}`,
                  background: minLiq === f.min ? C.panel3 : "transparent",
                  color: minLiq === f.min ? C.text : C.faint, cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ background: C.panel, borderRadius: 16, margin: "0 10px 20px", border: `1px solid ${C.borderSoft}`, overflow: "hidden" }}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ padding: "14px", borderBottom: `1px solid ${C.borderSoft}` }}>
              <div style={{ height: 14, width: "40%", background: C.panel2, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 10, width: "60%", background: C.panel2, borderRadius: 6 }} />
            </div>
          ))
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === "Watchlist" ? Star : Search}
            title={tab === "Watchlist" ? "No tokens watched yet" : "No tokens found"}
            sub={tab === "Watchlist" ? "Tap the star on any token to add it here." : "Try a different search or lower the liquidity filter."}
          />
        ) : (
          list.map((t) => (
            <TokenCard key={t.address} t={t} onOpen={onOpen} onToggleWatch={onToggleWatch} watched={watchlist.includes(t.address)} sparkline={priceHistory?.[t.address]} />
          ))
        )}
      </div>
    </div>
  );
}

/* ============================================================
   MEMESCOPE SCREEN — new pairs / about-to-graduate / bonded,
   all at once, the way Photon/Axiom's scope view works.
============================================================ */
const MEME_TABS = [
  { id: "new", label: "New Pairs", icon: Sparkles },
  { id: "graduating", label: "Final Stretch", icon: Rocket },
  { id: "graduated", label: "Bonded", icon: Check },
];

function MemescopeScreen({ tokens, dataMode, onOpen, watchlist, onToggleWatch, solPrice, priceHistory }) {
  const [tab, setTab] = useState("new");
  const now = Date.now();

  const withMeta = tokens.map((t) => ({
    ...t,
    _bonding: bondingPct(t, solPrice),
    _stage: bondingStage(t),
    _ageMs: t.createdAt ? now - t.createdAt : null,
    _feesSol: estimateFeesSol(t, solPrice),
  }));

  let list;
  if (tab === "new") {
    list = withMeta
      .filter((t) => t._stage !== "graduated" && t._ageMs !== null && t._ageMs <= NEW_PAIR_WINDOW_MS)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else if (tab === "graduating") {
    list = withMeta
      .filter((t) => t._stage !== "graduated" && t.marketCap >= 10000 && t._ageMs !== null && t._ageMs <= ONE_HOUR_MS && t._feesSol >= 0.5)
      .sort((a, b) => b._bonding - a._bonding);
  } else {
    list = withMeta
      .filter((t) => t._stage === "graduated" && t.marketCap >= 10000 && t._feesSol >= 1)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  const threshold = gradMarketCapUsd(solPrice);
  const tabDef = {
    new: "Newest bonding-curve pairs in the current feed (last 6 hours). Truly sub-10-minute listings aren't available — pump.fun's own API blocks direct browser access.",
    graduating: `Under 1 hour old, $10K+ market cap, 0.5+ SOL in fees — closing in on ${fmtUsd(threshold)} to migrate.`,
    graduated: "Already bonded — $10K+ market cap, 1+ SOL in lifetime fees.",
  }[tab];

  return (
    <div>
      <div style={{ padding: "14px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>Memescope</div>
          <LiveBadge dataMode={dataMode} />
        </div>
        <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 4 }}>{tabDef}</div>
        {tab !== "new" && dataMode === "live" && (
          <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 8 }}>
            Fees are estimated from trading volume — exact cumulative fee totals aren't exposed by the free API.
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, padding: "0 14px 12px" }}>
        {MEME_TABS.map((mt) => {
          const Icon = mt.icon;
          const active = tab === mt.id;
          return (
            <button
              key={mt.id}
              onClick={() => setTab(mt.id)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                fontSize: 12, fontWeight: 600, padding: "8px 6px", borderRadius: 12,
                border: `1px solid ${active ? C.amber : C.border}`,
                background: active ? C.amberDim : "transparent",
                color: active ? C.amber : C.sub, cursor: "pointer",
              }}
            >
              <Icon size={13} />
              {mt.label}
            </button>
          );
        })}
      </div>

      <div style={{ background: C.panel, borderRadius: 16, margin: "0 10px 20px", border: `1px solid ${C.borderSoft}`, overflow: "hidden" }}>
        {list.length === 0 ? (
          <EmptyState icon={Rocket} title="Nothing here yet" sub="This list refreshes as new pairs launch and bond." />
        ) : (
          list.map((t) => (
            <TokenCard
              key={t.address}
              t={t}
              onOpen={onOpen}
              onToggleWatch={onToggleWatch}
              watched={watchlist.includes(t.address)}
              bonding={t._bonding}
              sparkline={priceHistory?.[t.address]}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PriceChart({ pairAddress, simulated }) {
  const [points, setPoints] = useState(null);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    if (simulated || !pairAddress) {
      setStatus("empty");
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchOhlcv(pairAddress);
        if (!cancelled) {
          setPoints(data);
          setStatus("ok");
        }
      } catch {
        if (!cancelled) setStatus((s) => (s === "loading" ? "empty" : s));
      }
    }
    setStatus("loading");
    load();
    const iv = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [pairAddress, simulated]);

  if (status === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.faint, fontSize: 12.5, gap: 6 }}>
        <RefreshCw size={16} className="spin" />
        Loading live chart...
      </div>
    );
  }
  if (status === "empty" || !points) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: C.faint, fontSize: 12.5, gap: 6, textAlign: "center", padding: "0 20px" }}>
        <BarChart3 size={22} />
        {simulated ? "Simulated token — no real chart data (preview-only fallback chart; the deployed build uses real candlesticks)" : "No live chart data available for this pair yet"}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
        <XAxis dataKey="t" hide />
        <YAxis domain={["auto", "auto"]} hide />
        <Bar dataKey={(d) => [d.low, d.high]} shape={<PreviewCandle />} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// NOTE: this artifact-preview build uses a recharts-based candlestick
// because lightweight-charts isn't in the small set of libraries the
// Claude.ai artifact sandbox bundles. The deployable project (the zip)
// uses the real lightweight-charts implementation with proper
// zoom/pan/crosshair and a volume pane — this is a preview-only stand-in
// so layout/flow can still be checked here.
function PreviewCandle(props) {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;
  if (high === low || !isFinite(height) || height <= 0) return null;
  const color = close >= open ? C.buy : C.sell;
  const ratio = height / (high - low);
  const openY = y + (high - open) * ratio;
  const closeY = y + (high - close) * ratio;
  const bodyY = Math.min(openY, closeY);
  const bodyHeight = Math.max(Math.abs(closeY - openY), 1.5);
  const bodyWidth = Math.max(width * 0.6, 2);
  const bodyX = x + (width - bodyWidth) / 2;
  const wickX = x + width / 2;
  return (
    <g>
      <line x1={wickX} x2={wickX} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyY} width={bodyWidth} height={bodyHeight} fill={color} />
    </g>
  );
}

function ContractSafetyPanel({ tokenAddress, simulated }) {
  const [state, setState] = useState({ status: "loading", data: null });

  useEffect(() => {
    if (simulated || !tokenAddress) {
      setState({ status: "unavailable", data: null });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", data: null });
    (async () => {
      try {
        const data = await fetchMintSafety(tokenAddress);
        if (!cancelled) setState({ status: "ok", data });
      } catch {
        if (!cancelled) setState({ status: "error", data: null });
      }
    })();
    return () => { cancelled = true; };
  }, [tokenAddress, simulated]);

  const wrap = (children) => (
    <div style={{ margin: "0 14px 14px", background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: 14, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
        Contract Safety
      </div>
      {children}
    </div>
  );

  if (state.status === "loading") return wrap(<div style={{ fontSize: 12, color: C.faint }}>Checking mint on-chain...</div>);
  if (state.status !== "ok") {
    return wrap(
      <div style={{ fontSize: 12, color: C.faint }}>
        {simulated ? "Not available for simulated tokens." : "Couldn't reach Solana RPC to check this contract right now."}
      </div>
    );
  }

  const { mintAuthority, freezeAuthority } = state.data;
  const mintRevoked = !mintAuthority;
  const freezeRevoked = !freezeAuthority;
  const Row = ({ label, revoked, tip }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Tooltip term={label} def={tip}><span style={{ fontSize: 13, color: C.sub }}>{label}</span></Tooltip>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: revoked ? C.buy : C.sell, display: "flex", alignItems: "center", gap: 4 }}>
        {revoked ? <Check size={13} /> : <CircleAlert size={13} />} {revoked ? "Revoked" : "Active"}
      </span>
    </div>
  );

  return wrap(
    <>
      <Row
        label="Mint Authority"
        revoked={mintRevoked}
        tip="Whether the creator can still mint (create) more supply out of thin air. Revoked is safer — total supply can never be inflated after the fact."
      />
      <Row
        label="Freeze Authority"
        revoked={freezeRevoked}
        tip="Whether the creator can freeze specific wallets, blocking them from trading. Revoked is safer — no one can be locked out after buying in."
      />
    </>
  );
}

/* ============================================================
   TOKEN DETAIL / TRADE SCREEN
============================================================ */
function TokenScreen({ token, portfolio, setPortfolio, onBack, watched, onToggleWatch, solPrice, isDesktop }) {
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [solAmount, setSolAmount] = useState("");
  const [sellPct, setSellPct] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [tpInput, setTpInput] = useState("");
  const [slInput, setSlInput] = useState("");

  const holding = portfolio.holdings[token.address];
  const beginnerMode = portfolio.beginnerMode;

  const priceUsd = token.priceUsd;
  const mcFlash = useFlash(token.marketCap);
  const paidStatus = usePaidStatus(token.address, token.simulated);
  const posAmount = holding?.amount || 0;
  const posValueUsd = posAmount * priceUsd;
  const posCostUsd = posAmount * (holding?.avgEntry || 0);
  const unrealizedPnl = posValueUsd - posCostUsd;
  const unrealizedPct = posCostUsd > 0 ? (unrealizedPnl / posCostUsd) * 100 : 0;

  function flashToast(msg, tone = "buy") {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 2200);
  }

  function executeBuy(sol) {
    const solNum = parseFloat(sol);
    if (!solNum || solNum <= 0 || solNum > portfolio.balance) return;
    const usdSpent = solNum * solPrice;
    const tokensBought = usdSpent / priceUsd;
    setPortfolio((p) => {
      const h = p.holdings[token.address];
      const newAmount = (h?.amount || 0) + tokensBought;
      const newCost = (h ? h.amount * h.avgEntry : 0) + usdSpent;
      const newAvg = newCost / newAmount;
      return {
        ...p,
        balance: +(p.balance - solNum).toFixed(6),
        holdings: {
          ...p.holdings,
          [token.address]: { symbol: token.symbol, name: token.name, address: token.address, amount: newAmount, avgEntry: newAvg },
        },
        trades: [
          { id: uid(), type: "buy", symbol: token.symbol, address: token.address, solAmount: solNum, priceUsd, tokenAmount: tokensBought, time: Date.now() },
          ...p.trades,
        ],
      };
    });
    flashToast(`Bought ${fmtUsd(tokensBought)} ${token.symbol} for ${fmtSol(solNum)} SOL`, "buy");
    setSolAmount("");
  }

  function executeSell(percentOfPos) {
    if (!holding || holding.amount <= 0) return;
    const tokensToSell = holding.amount * (percentOfPos / 100);
    const usdReceived = tokensToSell * priceUsd;
    const solReceived = usdReceived / solPrice;
    const costBasis = tokensToSell * holding.avgEntry;
    const realized = usdReceived - costBasis;
    setPortfolio((p) => {
      const h = p.holdings[token.address];
      const remaining = h.amount - tokensToSell;
      const newHoldings = { ...p.holdings };
      if (remaining <= 0.000001) delete newHoldings[token.address];
      else newHoldings[token.address] = { ...h, amount: remaining };
      return {
        ...p,
        balance: +(p.balance + solReceived).toFixed(6),
        holdings: newHoldings,
        realizedPnl: p.realizedPnl + realized,
        trades: [
          { id: uid(), type: "sell", symbol: token.symbol, address: token.address, solAmount: solReceived, priceUsd, tokenAmount: tokensToSell, realizedUsd: realized, time: Date.now() },
          ...p.trades,
        ],
      };
    });
    flashToast(
      `Sold ${percentOfPos}% for ${fmtSol(solReceived)} SOL (${realized >= 0 ? "+" : ""}$${realized.toFixed(2)})`,
      realized >= 0 ? "buy" : "sell"
    );
  }

  const quickBuys = [0.1, 0.5, 1, 2, 5];

  function placeLimitBuy(sol, targetPriceStr) {
    const solNum = parseFloat(sol);
    const tp = parseFloat(targetPriceStr);
    if (!solNum || solNum <= 0 || solNum > portfolio.balance || !tp || tp <= 0) return;
    setPortfolio((p) => ({
      ...p,
      orders: [
        { id: uid(), type: "buy", address: token.address, symbol: token.symbol, name: token.name, targetPrice: tp, solAmount: solNum, status: "pending", createdAt: Date.now() },
        ...p.orders,
      ],
    }));
    flashToast(`Limit buy placed: ${token.symbol} at $${fmtPrice(tp)}`, "buy");
    setSolAmount("");
    setLimitPrice("");
  }

  function placeLimitSell(pctVal, targetPriceStr) {
    const tp = parseFloat(targetPriceStr);
    if (!holding || !pctVal || !tp || tp <= 0) return;
    setPortfolio((p) => ({
      ...p,
      orders: [
        { id: uid(), type: "sell", address: token.address, symbol: token.symbol, name: token.name, targetPrice: tp, pct: pctVal, status: "pending", createdAt: Date.now() },
        ...p.orders,
      ],
    }));
    flashToast(`Limit sell placed: ${token.symbol} at $${fmtPrice(tp)}`, "sell");
    setLimitPrice("");
  }

  useEffect(() => {
    setTpInput(holding?.tpPct != null ? String(holding.tpPct) : "");
    setSlInput(holding?.slPct != null ? String(holding.slPct) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token.address]);

  function saveAutoOrders() {
    const tp = tpInput === "" ? null : Math.abs(parseFloat(tpInput)) || null;
    const sl = slInput === "" ? null : Math.abs(parseFloat(slInput)) || null;
    setPortfolio((p) => {
      const h = p.holdings[token.address];
      if (!h) return p;
      return { ...p, holdings: { ...p.holdings, [token.address]: { ...h, tpPct: tp, slPct: sl } } };
    });
    flashToast(
      tp || sl ? `Auto-sell set: ${tp ? `+${tp}% TP` : ""}${tp && sl ? " / " : ""}${sl ? `-${sl}% SL` : ""}` : "Auto-sell orders cleared",
      "buy"
    );
  }

  return (
    <div style={{ paddingBottom: isDesktop ? 24 : 100 }}>
      <div style={isDesktop ? { display: "flex", gap: 24, alignItems: "flex-start", padding: "14px 20px 24px" } : undefined}>
      <div style={isDesktop ? { flex: "1 1 0%", minWidth: 0 } : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 8px" }}>
        <ChevronLeft size={22} onClick={onBack} style={{ cursor: "pointer" }} />
        <Avatar t={token} size={30} radius={8} fontSize={11} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{token.symbol}</span>
            {paidStatus !== null && (
              <span
                style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 5,
                  background: paidStatus ? C.buyDim : C.panel2, color: paidStatus ? C.buy : C.faint,
                }}
              >
                {paidStatus ? "PAID" : "UNPAID"}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: C.sub }}>{token.name}</div>
        </div>
        <Star
          size={19}
          onClick={() => onToggleWatch(token)}
          style={{ color: watched ? C.amber : C.faint, fill: watched ? C.amber : "none", cursor: "pointer" }}
        />
      </div>

      <div style={{ padding: "4px 14px 12px" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 34, fontWeight: 700, letterSpacing: -0.5, display: "inline-block",
            borderRadius: 8, padding: "1px 6px", marginLeft: -6,
            background: mcFlash === "up" ? C.buyDim : mcFlash === "down" ? C.sellDim : "transparent", transition: "background .5s",
          }}
        >
          {fmtUsd(token.marketCap)}
        </div>
        <div style={{ fontSize: 11.5, color: C.faint, marginTop: 2 }}>Market Cap</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <Pill positive={(token.change5m ?? 0) >= 0}>5m {pct(token.change5m)}</Pill>
          <Pill positive={(token.change1h ?? 0) >= 0}>1h {pct(token.change1h)}</Pill>
          <Pill positive={(token.change6h ?? 0) >= 0}>6h {pct(token.change6h)}</Pill>
          <Pill positive={(token.change24h ?? 0) >= 0}>24h {pct(token.change24h)}</Pill>
        </div>
      </div>

      <div style={{ margin: "0 14px 14px", borderRadius: 14, overflow: "hidden", border: `1px solid ${C.borderSoft}`, height: 260, background: C.panel }}>
        <PriceChart pairAddress={token.pairAddress} simulated={token.simulated} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "0 14px 10px" }}>
        {[
          ["Price", "$" + fmtPrice(token.priceUsd), null],
          ["Liquidity", fmtUsd(token.liquidity), "How much money sits in the trading pool. Low liquidity means bigger price swings on small trades."],
          ["24h Volume", fmtUsd(token.volume24h), "Total traded in the last 24 hours. High volume relative to market cap usually means real activity, not just a quiet chart."],
          ["FDV", fmtUsd(token.fdv), "Fully diluted valuation — price × total supply that will ever exist, vs. market cap which uses circulating supply only."],
          ["Age", token.createdAt ? timeAgo(token.createdAt) : "—", "How long ago this pair started trading."],
          ["24h Txns", fmtUsd((token.buys24h || 0) + (token.sells24h || 0)), "Total buy + sell transactions in the last 24 hours."],
        ].map(([label, val, tip]) => (
          <div key={label} style={{ background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: C.faint }}>
              {tip ? <Tooltip term={label} def={tip}>{label}</Tooltip> : label}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13.5, marginTop: 2 }}>{val}</div>
          </div>
        ))}
      </div>

      {(token.buys24h || token.sells24h) > 0 && (
        <div style={{ margin: "0 14px 14px", background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 14, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.faint, marginBottom: 8 }}>
            <Tooltip term="Buy/Sell Pressure" def="The split between buy and sell transactions in the last 24 hours. More buys than sells doesn't guarantee price goes up, but it's a useful read on sentiment.">
              Buy/Sell Pressure (24h)
            </Tooltip>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: C.buy }}>{token.buys24h}</span> / <span style={{ color: C.sell }}>{token.sells24h}</span>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 99, background: C.sellDim, overflow: "hidden", display: "flex" }}>
            <div
              style={{
                width: `${((token.buys24h || 0) / Math.max(1, (token.buys24h || 0) + (token.sells24h || 0))) * 100}%`,
                background: C.buy, height: "100%", transition: "width .4s",
              }}
            />
          </div>
        </div>
      )}

      <ContractSafetyPanel tokenAddress={token.address} simulated={token.simulated} />

      {posAmount > 0 && (
        <div style={{ margin: "0 14px 14px", background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, color: C.faint, marginBottom: 8 }}>Your position</div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: C.sub }}>Value</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${posValueUsd.toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: C.sub }}>Avg entry</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>${fmtPrice(holding.avgEntry)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, color: C.sub }}>Unrealized PnL</span>
            <Pill positive={unrealizedPnl >= 0}>
              {unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(2)} ({pct(unrealizedPct)})
            </Pill>
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderSoft}` }}>
            <Tooltip term="Take-Profit / Stop-Loss" def="Set a target gain or loss percentage once, and the app auto-sells the whole position for you the moment it's hit — even if you're not watching this token.">
              <div style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>Auto-sell (TP / SL)</div>
            </Tooltip>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 9px" }}>
                <span style={{ color: C.buy, fontSize: 12, marginRight: 4 }}>+</span>
                <input
                  value={tpInput}
                  onChange={(e) => setTpInput(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="TP %"
                  style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 9, padding: "6px 9px" }}>
                <span style={{ color: C.sell, fontSize: 12, marginRight: 4 }}>-</span>
                <input
                  value={slInput}
                  onChange={(e) => setSlInput(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="SL %"
                  style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
              <button onClick={saveAutoOrders} style={{ padding: "0 14px", borderRadius: 9, border: "none", background: C.amber, color: "#0A0A0C", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Set
              </button>
            </div>
            {(holding.tpPct || holding.slPct) && (
              <div style={{ fontSize: 11, color: C.faint }}>
                Active: {holding.tpPct ? <span style={{ color: C.buy }}>+{holding.tpPct}% TP</span> : null}
                {holding.tpPct && holding.slPct ? " · " : ""}
                {holding.slPct ? <span style={{ color: C.sell }}>-{holding.slPct}% SL</span> : null}
              </div>
            )}
          </div>
        </div>
      )}

      {beginnerMode && (
        <div style={{ margin: "0 14px 14px", display: "flex", gap: 8, background: C.amberDim, border: `1px solid ${C.amber}33`, borderRadius: 12, padding: 12 }}>
          <ShieldAlert size={16} color={C.amber} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
            This is a low-cap memecoin — expect big, fast swings. Never risk more virtual SOL than you're prepared to see go to zero.
            {" "}<Tooltip term="Liquidity" def="How much money sits in the trading pool. Low liquidity means big price swings on small trades, and it can be hard to sell without moving the price against you.">
              What's liquidity?
            </Tooltip>
          </div>
        </div>
      )}
      </div>

      <div
        style={
          isDesktop
            ? { flex: "0 0 360px", position: "sticky", top: 20, background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 16, padding: 16 }
            : { position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: C.bg, borderTop: `1px solid ${C.border}`, padding: 14 }
        }
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          <button
            onClick={() => setSide("buy")}
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13.5, cursor: "pointer", background: side === "buy" ? C.buy : C.panel2, color: side === "buy" ? "#0A0A0C" : C.sub }}
          >
            Buy
          </button>
          <button
            onClick={() => setSide("sell")}
            disabled={!holding}
            style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 13.5, cursor: holding ? "pointer" : "not-allowed", background: side === "sell" ? C.sell : C.panel2, color: side === "sell" ? "#0A0A0C" : C.sub, opacity: holding ? 1 : 0.5 }}
          >
            Sell
          </button>
        </div>

        {side === "buy" ? (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {["market", "limit"].map((ot) => (
                <button
                  key={ot}
                  onClick={() => setOrderType(ot)}
                  style={{
                    flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${orderType === ot ? C.borderStrong : C.borderSoft}`,
                    background: orderType === ot ? C.panel3 : "transparent", color: orderType === ot ? C.text : C.faint,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {ot}
                </button>
              ))}
            </div>
            {orderType === "limit" && (
              <div style={{ display: "flex", alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                <span style={{ color: C.faint, fontSize: 12, marginRight: 6 }}>Trigger $</span>
                <input
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder={fmtPrice(priceUsd)}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
              <input
                value={solAmount}
                onChange={(e) => setSolAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.0"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 17, fontFamily: "'JetBrains Mono', monospace" }}
              />
              <span style={{ color: C.sub, fontSize: 13, fontWeight: 600 }}>SOL</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {quickBuys.map((v) => (
                <button key={v} onClick={() => setSolAmount(String(v))} style={qbBtn}>{v}</button>
              ))}
              <button onClick={() => setSolAmount(String(portfolio.balance.toFixed(4)))} style={qbBtn}>MAX</button>
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 10, fontFamily: "'JetBrains Mono', monospace" }}>
              Balance: {fmtSol(portfolio.balance)} SOL · ≈ {solAmount ? fmtUsd((parseFloat(solAmount) || 0) / priceUsd) : "0"} {token.symbol}
            </div>
            {orderType === "market" ? (
              <button
                onClick={() => executeBuy(solAmount)}
                disabled={!solAmount || parseFloat(solAmount) <= 0 || parseFloat(solAmount) > portfolio.balance}
                style={{ ...actionBtn, background: C.buy, opacity: (!solAmount || parseFloat(solAmount) <= 0 || parseFloat(solAmount) > portfolio.balance) ? 0.4 : 1 }}
              >
                Buy {token.symbol}
              </button>
            ) : (
              <button
                onClick={() => placeLimitBuy(solAmount, limitPrice)}
                disabled={!solAmount || parseFloat(solAmount) <= 0 || parseFloat(solAmount) > portfolio.balance || !limitPrice || parseFloat(limitPrice) <= 0}
                style={{ ...actionBtn, background: C.amber, opacity: (!solAmount || parseFloat(solAmount) <= 0 || parseFloat(solAmount) > portfolio.balance || !limitPrice || parseFloat(limitPrice) <= 0) ? 0.4 : 1 }}
              >
                Place Limit Buy
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              {["market", "limit"].map((ot) => (
                <button
                  key={ot}
                  onClick={() => setOrderType(ot)}
                  style={{
                    flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${orderType === ot ? C.borderStrong : C.borderSoft}`,
                    background: orderType === ot ? C.panel3 : "transparent", color: orderType === ot ? C.text : C.faint,
                    fontSize: 11, fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                  }}
                >
                  {ot}
                </button>
              ))}
            </div>
            {orderType === "limit" && (
              <div style={{ display: "flex", alignItems: "center", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                <span style={{ color: C.faint, fontSize: 12, marginRight: 6 }}>Trigger $</span>
                <input
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder={fmtPrice(priceUsd)}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            )}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[25, 50, 75, 100].map((v) => (
                <button key={v} onClick={() => setSellPct(v)} style={{ ...qbBtn, background: sellPct === v ? C.sellDim : C.panel2, borderColor: sellPct === v ? C.sell : C.border, color: sellPct === v ? C.sell : C.sub }}>
                  {v}%
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 10, fontFamily: "'JetBrains Mono', monospace" }}>
              {holding ? `Position: ${fmtUsd(holding.amount)} ${token.symbol} · $${posValueUsd.toFixed(2)}` : "No position"}
            </div>
            {orderType === "market" ? (
            <button
              onClick={() => sellPct && executeSell(sellPct)}
              disabled={!sellPct || !holding}
              style={{ ...actionBtn, background: C.sell, opacity: (!sellPct || !holding) ? 0.4 : 1 }}
            >
              Sell {sellPct ? `${sellPct}%` : ""} {token.symbol}
            </button>
            ) : (
              <button
                onClick={() => placeLimitSell(sellPct, limitPrice)}
                disabled={!sellPct || !holding || !limitPrice || parseFloat(limitPrice) <= 0}
                style={{ ...actionBtn, background: C.amber, opacity: (!sellPct || !holding || !limitPrice || parseFloat(limitPrice) <= 0) ? 0.4 : 1 }}
              >
                Place Limit Sell
              </button>
            )}
          </>
        )}
      </div>
      </div>

      {toast && (
        <div
          style={{
            position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 100,
            background: toast.tone === "buy" ? C.buy : C.sell, color: "#0A0A0C", fontWeight: 700, fontSize: 13,
            padding: "10px 16px", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.4)", maxWidth: 320, textAlign: "center",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const qbBtn = {
  flex: 1, padding: "8px 0", borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel2,
  color: C.text, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
};
const actionBtn = {
  width: "100%", padding: "13px 0", borderRadius: 12, border: "none", color: "#0A0A0C",
  fontWeight: 800, fontSize: 15, cursor: "pointer",
};

/* ============================================================
   PORTFOLIO SCREEN
============================================================ */
function PortfolioScreen({ portfolio, setPortfolio, tokenMap, solPrice, onOpenToken }) {
  const [tab, setTab] = useState("overview");
  const holdingsArr = Object.values(portfolio.holdings);
  let posValueUsd = 0;
  const rows = holdingsArr.map((h) => {
    const live = tokenMap[h.address];
    const price = live?.priceUsd ?? h.avgEntry;
    const value = h.amount * price;
    posValueUsd += value;
    const cost = h.amount * h.avgEntry;
    const upnl = value - cost;
    return { ...h, price, value, upnl, upnlPct: cost > 0 ? (upnl / cost) * 100 : 0, live };
  });

  const totalValueUsd = portfolio.balance * solPrice + posValueUsd;
  const startValueUsd = 100 * solPrice;
  const totalReturnPct = ((totalValueUsd - startValueUsd) / startValueUsd) * 100;

  const closedTrades = portfolio.trades.filter((t) => t.type === "sell");
  const wins = closedTrades.filter((t) => (t.realizedUsd || 0) > 0).length;
  const winRate = closedTrades.length ? (wins / closedTrades.length) * 100 : null;

  const totalUnrealizedPnl = rows.reduce((s, r) => s + r.upnl, 0);
  const bestTrade = closedTrades.reduce((best, t) => (!best || (t.realizedUsd || 0) > (best.realizedUsd || 0) ? t : best), null);
  const worstTrade = closedTrades.reduce((worst, t) => (!worst || (t.realizedUsd || 0) < (worst.realizedUsd || 0) ? t : worst), null);
  const avgPnlPerTrade = closedTrades.length
    ? closedTrades.reduce((s, t) => s + (t.realizedUsd || 0), 0) / closedTrades.length
    : null;

  const pendingOrders = portfolio.orders.filter((o) => o.status === "pending");
  const pastOrders = portfolio.orders.filter((o) => o.status !== "pending").slice(0, 20);

  function cancelOrder(id) {
    setPortfolio((p) => ({ ...p, orders: p.orders.map((o) => (o.id === id ? { ...o, status: "cancelled" } : o)) }));
  }

  const cardStyle = {
    background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`,
    boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 14, overflow: "hidden",
  };
  const PORT_TABS = [
    { id: "overview", label: "Overview" },
    { id: "positions", label: `Positions${rows.length ? ` (${rows.length})` : ""}` },
    { id: "orders", label: `Orders${pendingOrders.length ? ` (${pendingOrders.length})` : ""}` },
    { id: "history", label: "History" },
  ];

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>Portfolio</div>

      <div style={{ background: `linear-gradient(160deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, borderRadius: 18, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: C.faint }}>Total value</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 36, fontWeight: 700, letterSpacing: -0.5, margin: "4px 0 6px" }}>
          ${totalValueUsd.toFixed(2)}
        </div>
        <Pill positive={totalReturnPct >= 0}>{pct(totalReturnPct)} all-time</Pill>

        <div style={{ display: "flex", gap: 10, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.borderSoft}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.faint }}>SOL balance</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 14.5 }}>{fmtSol(portfolio.balance)}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.faint }}>Realized PnL</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 14.5, color: portfolio.realizedPnl >= 0 ? C.buy : C.sell }}>
              {portfolio.realizedPnl >= 0 ? "+" : ""}${portfolio.realizedPnl.toFixed(2)}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: C.faint }}>Win rate</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 14.5 }}>{winRate === null ? "—" : winRate.toFixed(0) + "%"}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {PORT_TABS.map((pt) => (
          <button
            key={pt.id}
            onClick={() => setTab(pt.id)}
            style={{
              flexShrink: 0, fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 20,
              border: `1px solid ${tab === pt.id ? C.amber : C.border}`,
              background: tab === pt.id ? C.amberDim : "transparent",
              color: tab === pt.id ? C.amber : C.sub, cursor: "pointer",
            }}
          >
            {pt.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            ["Unrealized PnL", `${totalUnrealizedPnl >= 0 ? "+" : ""}$${totalUnrealizedPnl.toFixed(2)}`, totalUnrealizedPnl >= 0],
            ["Total Trades", String(portfolio.trades.length), null],
            ["Avg PnL / Trade", avgPnlPerTrade === null ? "—" : `${avgPnlPerTrade >= 0 ? "+" : ""}$${avgPnlPerTrade.toFixed(2)}`, avgPnlPerTrade === null ? null : avgPnlPerTrade >= 0],
            ["Best Trade", bestTrade ? `+$${(bestTrade.realizedUsd || 0).toFixed(2)}` : "—", bestTrade ? true : null],
            ["Worst Trade", worstTrade ? `${(worstTrade.realizedUsd || 0) >= 0 ? "+" : ""}$${(worstTrade.realizedUsd || 0).toFixed(2)}` : "—", worstTrade ? (worstTrade.realizedUsd || 0) >= 0 : null],
            ["Open Positions", String(rows.length), null],
          ].map(([label, val, positive]) => (
            <div key={label} style={{ background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: C.faint }}>{label}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 14.5, marginTop: 2, color: positive === null ? C.text : positive ? C.buy : C.sell }}>
                {val}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "positions" && (
        <div style={cardStyle}>
          {rows.length === 0 ? (
            <EmptyState icon={Wallet} title="No open positions" sub="Paper-buy a token from Discover to see it here." />
          ) : (
            rows.map((r) => (
              <div
                key={r.address}
                onClick={() => r.live && onOpenToken(r.live)}
                style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}`, cursor: r.live ? "pointer" : "default" }}
              >
                <Avatar t={r.live || r} size={32} radius={9} fontSize={12} />
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{r.symbol}</div>
                  <div style={{ fontSize: 11.5, color: C.faint, fontFamily: "'JetBrains Mono', monospace" }}>
                    {fmtUsd(r.amount)} tokens · avg ${fmtPrice(r.avgEntry)}
                    {(r.tpPct || r.slPct) && (
                      <span style={{ marginLeft: 6 }}>
                        · {r.tpPct ? <span style={{ color: C.buy }}>+{r.tpPct}%TP</span> : null}
                        {r.tpPct && r.slPct ? "/" : ""}
                        {r.slPct ? <span style={{ color: C.sell }}>-{r.slPct}%SL</span> : null}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13.5 }}>${r.value.toFixed(2)}</div>
                  <Pill positive={r.upnl >= 0}>{r.upnl >= 0 ? "+" : ""}${r.upnl.toFixed(2)}</Pill>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "orders" && (
        <div style={cardStyle}>
          {pendingOrders.length === 0 && pastOrders.length === 0 ? (
            <EmptyState icon={Clock} title="No orders" sub="Place a limit order from any token page to see it here." />
          ) : (
            <>
              {pendingOrders.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      {o.type === "buy" ? <span style={{ color: C.buy }}>Buy</span> : <span style={{ color: C.sell }}>Sell</span>} {o.symbol}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.faint, fontFamily: "'JetBrains Mono', monospace" }}>
                      Trigger ${fmtPrice(o.targetPrice)} {o.type === "buy" ? `· ${fmtSol(o.solAmount)} SOL` : `· ${o.pct}%`}
                    </div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, background: C.amberDim, borderRadius: 6, padding: "3px 7px", marginRight: 10 }}>PENDING</span>
                  <X size={16} color={C.faint} style={{ cursor: "pointer" }} onClick={() => cancelOrder(o.id)} />
                </div>
              ))}
              {pastOrders.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${C.borderSoft}`, opacity: 0.6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {o.type === "buy" ? "Buy" : "Sell"} {o.symbol}
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, fontFamily: "'JetBrains Mono', monospace" }}>Trigger ${fmtPrice(o.targetPrice)}</div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: "uppercase" }}>{o.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "history" && (
        <div style={cardStyle}>
          {portfolio.trades.length === 0 ? (
            <EmptyState icon={Clock} title="No trades yet" sub="Your buy and sell history will show up here." />
          ) : (
            portfolio.trades.slice(0, 60).map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", padding: "11px 14px", borderBottom: `1px solid ${C.borderSoft}` }}>
                <Avatar t={tokenMap[t.address] || { symbol: t.symbol }} size={26} radius={7} fontSize={9.5} />
                {t.type === "buy" ? <ArrowUpRight size={13} color={C.buy} style={{ marginLeft: 6, flexShrink: 0 }} /> : <ArrowDownRight size={13} color={C.sell} style={{ marginLeft: 6, flexShrink: 0 }} />}
                <div style={{ flex: 1, marginLeft: 10 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {t.type === "buy" ? "Bought" : "Sold"} {t.symbol}
                    {t.auto && (
                      <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: t.auto === "tp" ? C.buy : C.sell, background: t.auto === "tp" ? C.buyDim : C.sellDim, borderRadius: 5, padding: "2px 5px" }}>
                        AUTO {t.auto.toUpperCase()}
                      </span>
                    )}
                    {t.fromOrder && (
                      <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: C.amber, background: C.amberDim, borderRadius: 5, padding: "2px 5px" }}>
                        LIMIT
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: C.faint }}>{new Date(t.time).toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{fmtSol(t.solAmount)} SOL</div>
                  {t.type === "sell" && (
                    <div style={{ fontSize: 11, color: t.realizedUsd >= 0 ? C.buy : C.sell }}>
                      {t.realizedUsd >= 0 ? "+" : ""}${t.realizedUsd.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   WALLETS SCREEN — tracked wallets imported from Axiom, with
   on-demand recent activity pulled straight from Solana's public
   RPC (real on-chain data, fetched when you tap a wallet).
============================================================ */
function WalletRow({ w }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ status: "idle", data: [] });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state.status === "idle") {
      setState({ status: "loading", data: [] });
      try {
        const sigs = await fetchWalletActivity(w.a, 8);
        setState({ status: "ok", data: sigs });
      } catch {
        setState({ status: "error", data: [] });
      }
    }
  }

  return (
    <div style={{ borderBottom: `1px solid ${C.borderSoft}` }}>
      <div onClick={toggle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}>
        <span style={{ fontSize: 18, width: 28, textAlign: "center", flexShrink: 0 }}>{w.e}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{w.n}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.faint }}>
            {w.a.slice(0, 4)}...{w.a.slice(-4)}
          </div>
        </div>
        <ChevronLeft size={14} color={C.faint} style={{ transform: open ? "rotate(90deg)" : "rotate(-90deg)", transition: "transform .15s" }} />
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {state.status === "loading" && <div style={{ fontSize: 12, color: C.faint }}>Checking recent activity...</div>}
          {state.status === "error" && <div style={{ fontSize: 12, color: C.sell }}>Couldn't reach Solana RPC — try again in a moment.</div>}
          {state.status === "ok" && state.data.length === 0 && (
            <div style={{ fontSize: 12, color: C.faint }}>No recent on-chain activity found.</div>
          )}
          {state.status === "ok" &&
            state.data.map((s) => (
              <a
                key={s.signature}
                href={`https://solscan.io/tx/${s.signature}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0",
                  fontSize: 12, color: C.text, textDecoration: "none", borderTop: `1px solid ${C.borderSoft}`,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: "'JetBrains Mono', monospace", color: C.sub }}>
                  {s.signature.slice(0, 10)}...
                  <ExternalLink size={11} color={C.faint} />
                </span>
                <span style={{ color: s.err ? C.sell : C.faint }}>{s.blockTime ? timeAgo(s.blockTime * 1000) : "—"}</span>
              </a>
            ))}
        </div>
      )}
    </div>
  );
}

function WalletsScreen() {
  const [query, setQuery] = useState("");
  const list = query.trim()
    ? TRACKED_WALLETS.filter((w) => w.n.toLowerCase().includes(query.trim().toLowerCase()))
    : TRACKED_WALLETS;

  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Wallets</div>
      <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 12, lineHeight: 1.5 }}>
        {TRACKED_WALLETS.length} wallets imported from your Axiom tracker. Tap one to pull its recent on-chain activity live from Solana — this reads real signatures and timestamps, but doesn't decode which token was traded yet.
      </div>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8, background: C.panel,
          border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 12px", marginBottom: 14,
        }}
      >
        <Search size={15} color={C.faint} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search wallets..."
          style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, width: "100%", fontFamily: "'Inter', sans-serif" }}
        />
      </div>
      <div style={{ background: C.panel, borderRadius: 16, border: `1px solid ${C.borderSoft}`, overflow: "hidden" }}>
        {list.length === 0 ? (
          <EmptyState icon={Users} title="No wallets found" sub="Try a different search." />
        ) : (
          list.map((w) => <WalletRow key={w.a} w={w} />)
        )}
      </div>
    </div>
  );
}

/* ============================================================
   LEARN SCREEN
============================================================ */
const LESSONS = [
  { term: "Market Cap", def: "The token's price multiplied by its total supply — a rough measure of the project's total value. A $50K market cap coin can move 10x easier than a $50M one." },
  { term: "Liquidity", def: "Money sitting in the trading pool, ready to be swapped. Low liquidity means a small trade can swing the price a lot, and selling a big position can be hard without crashing it yourself." },
  { term: "Volume", def: "How much has traded in a period (usually 24h). High volume relative to market cap often means the token is actively being bought and sold, not just sitting still." },
  { term: "Slippage", def: "The gap between the price you expected and the price you actually got, because the trade itself moved the market. Low-liquidity tokens have higher slippage." },
  { term: "Volatility", def: "How fast and how far a price swings. Memecoins are extremely volatile — 50%+ moves in minutes are normal, not a bug." },
  { term: "FOMO", def: "Fear Of Missing Out — buying because a price is already pumping and you're scared of missing the move. It's the single most common way beginners buy the top." },
  { term: "Taking Profits", def: "Selling some or all of a winning position to lock in gains, instead of hoping it goes higher forever. A common approach: sell enough to recover your original stake, let the rest ride." },
  { term: "Cutting Losses", def: "Selling a losing position on purpose, before it gets worse, instead of hoping it recovers. Deciding your exit before you buy makes this much easier." },
  { term: "Risk Management", def: "Rules you set before trading — like how much of your balance to put in one token — so one bad trade can't wipe you out." },
  { term: "Rug Pulls", def: "When a token's creators drain the liquidity pool or dump their holdings, crashing the price to near zero on purpose. Very low liquidity and a handful of wallets holding most of the supply are red flags." },
  { term: "Scams", def: "Beyond rug pulls: fake hype, paid promotion designed to trigger FOMO, and tokens with no real trading activity aside from the creator's own wallets." },
  { term: "Bonding Curve", def: "The pricing mechanism new pump.fun-style tokens trade on before they reach an exchange. Price rises automatically as more people buy, until the curve is full and the token migrates to a real liquidity pool." },
  { term: "Bonded / Migration", def: "What happens when a token finishes its bonding curve and moves ('bonds') to a permanent pool on an AMM like Raydium. After that, price is driven by normal supply and demand instead of the curve formula." },
  { term: "Trenches", def: "Slang for the fast-moving world of new, low-cap memecoin launches — named for how brutal and fast-paced it is. 'Trenchers' are traders who spend their time hunting new launches here." },
  { term: "Ape / Aping In", def: "Buying a token fast, often with little research, because it looks like it's already moving. The opposite of a planned, researched entry — and a common way to buy the top." },
  { term: "Diamond Hands / Paper Hands", def: "Diamond hands means holding through volatility without panic-selling. Paper hands means selling at the first dip. Neither is automatically right — it depends on why you bought in the first place." },
  { term: "Dev Wallet", def: "The wallet belonging to whoever created the token. Worth watching closely: a dev wallet dumping (selling) a large chunk of supply is one of the strongest warning signs there is." },
  { term: "Sniper / Bundler", def: "Bots or coordinated wallets that buy a token in the first seconds after launch, sometimes before the public can even see it, to lock in a cheap position before the price runs up." },
  { term: "Insider Activity", def: "Wallets connected to a token's creator or early team trading in ways the public can't see coming. A coordinated exit right after you buy in is a classic red flag." },
  { term: "CTO (Community Takeover)", def: "When a token's original developer abandons it and the community steps in to keep it alive — new marketing, new socials, sometimes a new direction entirely. Can go either way." },
  { term: "LP Locked / Burned", def: "Whether the liquidity pool backing a token is locked (can't be withdrawn for a set time) or burned (permanently unable to be withdrawn). An unlocked LP is a major rug-pull risk." },
  { term: "Renounced Contract", def: "When a developer gives up the ability to change the token's contract — like minting extra supply out of thin air. It lowers, but doesn't eliminate, certain kinds of scam risk." },
  { term: "Honeypot", def: "A token built so people can buy but can't sell, trapping their money in the contract. Always a scam — never a legitimate design choice." },
  { term: "Bubble Map", def: "A visual tool showing how a token's supply is spread across wallets. Big bubbles clustered together, or connected back to the dev wallet, usually means supply is dangerously concentrated." },
  { term: "Smart Money", def: "Wallets with a track record of profitable early entries. Some traders track what these wallets buy — useful as a signal, risky if followed blindly." },
  { term: "Market Cap vs. FDV", def: "Market cap is price times the circulating supply. FDV (fully diluted valuation) is price times the total supply that will ever exist. A token can look cheap by market cap but expensive by FDV if a lot of supply hasn't unlocked yet." },
  { term: "NGMI / WAGMI", def: "Trench slang: NGMI ('not gonna make it') for a bad call or outcome, WAGMI ('we're all gonna make it') as a show of collective optimism. Culture, not financial advice." },
];

function LearnScreen({ beginnerMode, setBeginnerMode }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ padding: "14px 14px 90px" }}>
      <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Learn</div>
      <div style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>The basics, in plain language, before you risk anything real.</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 14, padding: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Beginner Mode</div>
          <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>Extra warnings and context while you trade</div>
        </div>
        <div
          onClick={() => setBeginnerMode(!beginnerMode)}
          style={{ width: 44, height: 26, borderRadius: 99, background: beginnerMode ? C.amber : C.panel2, position: "relative", cursor: "pointer", transition: "background .15s", border: `1px solid ${C.border}` }}
        >
          <div style={{ width: 20, height: 20, borderRadius: 99, background: "#0A0A0C", position: "absolute", top: 2, left: beginnerMode ? 21 : 2, transition: "left .15s" }} />
        </div>
      </div>

      <div style={{ background: `linear-gradient(155deg, ${C.panel}, ${C.panel2})`, border: `1px solid ${C.borderSoft}`, boxShadow: "0 1px 0 rgba(255,255,255,0.025) inset, 0 6px 16px rgba(0,0,0,0.18)", borderRadius: 14, overflow: "hidden" }}>
        {LESSONS.map((l, i) => (
          <div key={l.term} style={{ borderBottom: i < LESSONS.length - 1 ? `1px solid ${C.borderSoft}` : "none" }}>
            <div
              onClick={() => setOpen(open === i ? null : i)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 14px", cursor: "pointer" }}
            >
              <span style={{ fontWeight: 600, fontSize: 14 }}>{l.term}</span>
              <Info size={15} color={C.faint} />
            </div>
            {open === i && (
              <div style={{ padding: "0 14px 14px", fontSize: 13, color: C.sub, lineHeight: 1.55 }}>{l.def}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   ROOT APP
============================================================ */
export default function App() {
  const [tab, setTab] = useState("discover");
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataMode, setDataMode] = useState("simulated");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [solPrice, setSolPrice] = useState(SOL_FALLBACK_PRICE);
  const [portfolio, setPortfolio, ready] = usePortfolio();
  const isDesktop = useIsDesktop();

  const tokenMap = Object.fromEntries(tokens.map((t) => [t.address, t]));
  const [priceHistory, setPriceHistory] = useState({});

  useEffect(() => {
    if (tokens.length === 0) return;
    setPriceHistory((prev) => {
      const next = { ...prev };
      for (const t of tokens) {
        const arr = next[t.address] ? next[t.address].slice(-19) : [];
        next[t.address] = [...arr, t.marketCap];
      }
      return next;
    });
  }, [tokens]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [solRes, memeRes] = await Promise.allSettled([
        fetchLiveSolPairs("SOL USDC"),
        fetchDiscoveryUniverse(),
      ]);
      let sol = solRes.status === "fulfilled" ? solRes.value.find((p) => p.symbol === "SOL") : null;
      let meme = memeRes.status === "fulfilled" ? memeRes.value : [];
      meme = meme.filter((t) => t.symbol !== "SOL" && t.liquidity > 500);

      if (meme.length >= 5) {
        // dedupe by token address (not symbol — different mints can share a ticker)
        const byAddr = {};
        meme.forEach((t) => {
          if (!byAddr[t.address] || t.liquidity > byAddr[t.address].liquidity) byAddr[t.address] = t;
        });
        setTokens(Object.values(byAddr).slice(0, 60));
        setDataMode("live");
        if (sol?.priceUsd) setSolPrice(sol.priceUsd);
      } else {
        throw new Error("insufficient live results");
      }
    } catch {
      setTokens(seedSimTokens());
      setDataMode("simulated");
      setSolPrice(SOL_FALLBACK_PRICE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // gentle live-ish refresh
  useEffect(() => {
    const iv = setInterval(() => {
      setTokens((prev) => {
        if (prev.length === 0) return prev;
        if (dataMode === "simulated") return jitterSimTokens(prev);
        return prev;
      });
      if (dataMode === "live") loadData();
    }, dataMode === "live" ? 8000 : 2500);
    return () => clearInterval(iv);
  }, [dataMode, loadData]);

  useEffect(() => {
    if (selected) {
      const fresh = tokenMap[selected.address];
      if (fresh) setSelected(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  // TP/SL automation — runs on every price refresh, closes any position
  // that's crossed its set target, even if you're not viewing that token.
  useEffect(() => {
    if (!ready || !portfolio) return;
    const toClose = [];
    for (const [address, h] of Object.entries(portfolio.holdings)) {
      if (!h.tpPct && !h.slPct) continue;
      const live = tokenMap[address];
      if (!live || !live.priceUsd || !h.avgEntry) continue;
      const pnlPct = ((live.priceUsd - h.avgEntry) / h.avgEntry) * 100;
      if (h.tpPct && pnlPct >= h.tpPct) toClose.push({ address, reason: "tp", price: live.priceUsd });
      else if (h.slPct && pnlPct <= -h.slPct) toClose.push({ address, reason: "sl", price: live.priceUsd });
    }
    if (toClose.length === 0) return;
    setPortfolio((p) => {
      const nextHoldings = { ...p.holdings };
      const newTrades = [];
      const newNotifications = [];
      let realizedDelta = 0;
      let balanceDelta = 0;
      for (const { address, reason, price } of toClose) {
        const h = nextHoldings[address];
        if (!h) continue;
        const usdReceived = h.amount * price;
        const solReceived = usdReceived / solPrice;
        const realized = usdReceived - h.amount * h.avgEntry;
        realizedDelta += realized;
        balanceDelta += solReceived;
        delete nextHoldings[address];
        newTrades.push({
          id: uid(), type: "sell", symbol: h.symbol, address, solAmount: solReceived,
          priceUsd: price, tokenAmount: h.amount, realizedUsd: realized, time: Date.now(), auto: reason,
        });
        newNotifications.push({
          id: uid(), kind: "auto",
          message: `${reason === "tp" ? "Take-profit" : "Stop-loss"} hit: ${h.symbol} sold at $${fmtPrice(price)} (${realized >= 0 ? "+" : ""}$${realized.toFixed(2)})`,
          time: Date.now(), read: false,
        });
      }
      return {
        ...p,
        holdings: nextHoldings,
        balance: +(p.balance + balanceDelta).toFixed(6),
        realizedPnl: p.realizedPnl + realizedDelta,
        trades: [...newTrades, ...p.trades],
        notifications: [...newNotifications, ...p.notifications],
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  // Limit-order fill engine: runs whenever prices refresh. A pending buy
  // fills once price drops to/below its target; a pending sell fills once
  // price rises to/above its target. Executes exactly like a manual trade.
  useEffect(() => {
    if (!portfolio || !portfolio.orders || portfolio.orders.length === 0) return;
    if (!portfolio.orders.some((o) => o.status === "pending")) return;
    setPortfolio((p) => {
      let bal = p.balance;
      let holdings = { ...p.holdings };
      let trades = p.trades;
      let realizedPnl = p.realizedPnl;
      let notifications = p.notifications;
      let changed = false;
      const orders = p.orders.map((o) => {
        if (o.status !== "pending") return o;
        const live = tokenMap[o.address];
        if (!live) return o;
        const price = live.priceUsd;
        if (o.type === "buy" && price <= o.targetPrice) {
          if (o.solAmount > bal) return o; // can't afford yet, stays pending
          const usdSpent = o.solAmount * solPrice;
          const tokensBought = usdSpent / price;
          const h = holdings[o.address];
          const newAmount = (h?.amount || 0) + tokensBought;
          const newCost = (h ? h.amount * h.avgEntry : 0) + usdSpent;
          holdings[o.address] = { symbol: o.symbol, name: o.name, address: o.address, amount: newAmount, avgEntry: newCost / newAmount };
          bal = +(bal - o.solAmount).toFixed(6);
          trades = [
            { id: uid(), type: "buy", symbol: o.symbol, address: o.address, solAmount: o.solAmount, priceUsd: price, tokenAmount: tokensBought, time: Date.now(), fromOrder: true },
            ...trades,
          ];
          notifications = [
            { id: uid(), kind: "order", message: `Limit buy filled: ${o.symbol} at $${fmtPrice(price)}`, time: Date.now(), read: false },
            ...notifications,
          ];
          changed = true;
          return { ...o, status: "filled", filledAt: Date.now() };
        }
        if (o.type === "sell" && price >= o.targetPrice) {
          const h = holdings[o.address];
          if (!h || h.amount <= 0) return { ...o, status: "cancelled" };
          const tokensToSell = h.amount * (o.pct / 100);
          const usdReceived = tokensToSell * price;
          const solReceived = usdReceived / solPrice;
          const realized = usdReceived - tokensToSell * h.avgEntry;
          const remaining = h.amount - tokensToSell;
          if (remaining <= 0.000001) delete holdings[o.address];
          else holdings[o.address] = { ...h, amount: remaining };
          bal = +(bal + solReceived).toFixed(6);
          realizedPnl += realized;
          trades = [
            { id: uid(), type: "sell", symbol: o.symbol, address: o.address, solAmount: solReceived, priceUsd: price, tokenAmount: tokensToSell, realizedUsd: realized, time: Date.now(), fromOrder: true },
            ...trades,
          ];
          notifications = [
            { id: uid(), kind: "order", message: `Limit sell filled: ${o.symbol} at $${fmtPrice(price)} (${realized >= 0 ? "+" : ""}$${realized.toFixed(2)})`, time: Date.now(), read: false },
            ...notifications,
          ];
          changed = true;
          return { ...o, status: "filled", filledAt: Date.now() };
        }
        return o;
      });
      if (!changed) return p;
      return { ...p, balance: bal, holdings, trades, realizedPnl, orders, notifications };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  function toggleWatch(t) {
    setPortfolio((p) => {
      const has = p.watchlist.includes(t.address);
      return { ...p, watchlist: has ? p.watchlist.filter((a) => a !== t.address) : [...p.watchlist, t.address] };
    });
  }

  if (!ready || !portfolio) {
    return (
      <div style={{ minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, color: C.sub }}>
        Loading...
      </div>
    );
  }

  const NAV = [
    { id: "discover", label: "Discover", icon: Compass },
    { id: "memescope", label: "Memescope", icon: Flame },
    { id: "wallets", label: "Wallets", icon: Users },
    { id: "portfolio", label: "Portfolio", icon: Wallet },
    { id: "learn", label: "Learn", icon: GraduationCap },
  ];

  return (
    <div
      style={{
        background: `radial-gradient(ellipse 900px 500px at 50% -10%, ${C.panel3}55, ${C.bg} 60%)`,
        minHeight: "100%",
        maxWidth: isDesktop ? 1400 : 480, margin: "0 auto",
        paddingLeft: isDesktop ? 220 : 0,
        fontFamily: "'Inter', sans-serif", color: C.text, position: "relative",
      }}
    >
      <style>{FONT_CSS}{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        input::placeholder { color: ${C.faint}; }
        button { font-family: inherit; }
        @keyframes pulseDot { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>

      {!isDesktop && selected ? (
        <TokenScreen
          token={selected}
          portfolio={portfolio}
          setPortfolio={setPortfolio}
          onBack={() => setSelected(null)}
          watched={portfolio.watchlist.includes(selected.address)}
          onToggleWatch={toggleWatch}
          solPrice={solPrice}
          isDesktop={false}
        />
      ) : (
        <>
          <WatchlistTicker watchlist={portfolio.watchlist} tokenMap={tokenMap} onOpen={setSelected} />
          {/* Desktop: browsing + a selected token render side by side, terminal-style —
              no full navigation away from the list. Mobile keeps the full-screen
              takeover above, since there isn't room for both at once. */}
          <div style={{ display: isDesktop ? "flex" : "block", gap: 20, alignItems: "flex-start" }}>
            <div
              style={
                isDesktop
                  ? {
                      flex: selected ? "0 0 340px" : "1 1 auto", minWidth: 0,
                      maxWidth: selected ? 340 : 760, margin: selected ? 0 : "0 auto",
                    }
                  : undefined
              }
            >
              {tab === "discover" && (
                <DiscoverScreen
                  tokens={tokens}
                  loading={loading}
                  dataMode={dataMode}
                  onOpen={setSelected}
                  watchlist={portfolio.watchlist}
                  onToggleWatch={toggleWatch}
                  query={query}
                  setQuery={setQuery}
                  solPrice={solPrice}
                  compact={isDesktop && !!selected}
                  priceHistory={priceHistory}
                />
              )}
              {tab === "memescope" && (
                <MemescopeScreen
                  tokens={tokens}
                  dataMode={dataMode}
                  onOpen={setSelected}
                  watchlist={portfolio.watchlist}
                  onToggleWatch={toggleWatch}
                  solPrice={solPrice}
                  priceHistory={priceHistory}
                />
              )}
              {tab === "wallets" && <WalletsScreen />}
              {tab === "portfolio" && (
                <PortfolioScreen portfolio={portfolio} setPortfolio={setPortfolio} tokenMap={tokenMap} solPrice={solPrice} onOpenToken={setSelected} />
              )}
              {tab === "learn" && (
                <LearnScreen
                  beginnerMode={portfolio.beginnerMode}
                  setBeginnerMode={(v) => setPortfolio((p) => ({ ...p, beginnerMode: v }))}
                />
              )}
            </div>

            {isDesktop && selected && (
              <div style={{ flex: "1 1 0%", minWidth: 0 }}>
                <TokenScreen
                  token={selected}
                  portfolio={portfolio}
                  setPortfolio={setPortfolio}
                  onBack={() => setSelected(null)}
                  watched={portfolio.watchlist.includes(selected.address)}
                  onToggleWatch={toggleWatch}
                  solPrice={solPrice}
                  isDesktop={true}
                />
              </div>
            )}
          </div>

          {isDesktop ? (
            <div
              style={{
                position: "fixed", top: 0, left: "max(0px, calc(50% - 700px))", bottom: 0, width: 220,
                display: "flex", flexDirection: "column", gap: 4, background: C.panel,
                borderRight: `1px solid ${C.border}`, padding: "20px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px 14px" }}>
                <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: -0.3 }}>
                  <span style={{ color: C.amber }}>●</span> Paper Trader
                </div>
                <NotificationBell portfolio={portfolio} setPortfolio={setPortfolio} />
              </div>
              <div style={{ padding: "0 10px 18px", borderBottom: `1px solid ${C.borderSoft}`, marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 }}>Balance</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 15 }}>{fmtSol(portfolio.balance)} SOL</div>
                <div style={{ fontSize: 11, marginTop: 2, color: portfolio.realizedPnl >= 0 ? C.buy : C.sell, fontFamily: "'JetBrains Mono', monospace" }}>
                  {portfolio.realizedPnl >= 0 ? "+" : ""}${portfolio.realizedPnl.toFixed(2)} realized
                </div>
              </div>
              {NAV.map((n) => {
                const Icon = n.icon;
                const active = tab === n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => { setTab(n.id); setSelected(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
                      cursor: "pointer", background: active ? C.amberDim : "transparent",
                      color: active ? C.amber : C.sub, fontWeight: 600, fontSize: 14,
                      boxShadow: active ? `inset 3px 0 0 ${C.amber}` : "none",
                      transition: "background .15s, box-shadow .15s",
                    }}
                  >
                    <Icon size={18} />
                    {n.label}
                  </div>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto",
                display: "flex", background: C.panel, borderTop: `1px solid ${C.border}`, padding: "8px 0 10px",
              }}
            >
              {NAV.map((n) => {
                const Icon = n.icon;
                const active = tab === n.id;
                return (
                  <div
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}
                  >
                    <Icon size={20} color={active ? C.amber : C.faint} />
                    <span style={{ fontSize: 10.5, fontWeight: 600, color: active ? C.amber : C.faint }}>{n.label}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!isDesktop && (
            <div style={{ position: "fixed", top: 14, right: 14, zIndex: 250, background: C.panel2, border: `1px solid ${C.border}`, borderRadius: 99, padding: 8, boxShadow: "0 6px 18px rgba(0,0,0,.4)" }}>
              <NotificationBell portfolio={portfolio} setPortfolio={setPortfolio} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
