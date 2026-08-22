// DexScreener + GeckoTerminal public APIs. Off-chain Base data only.
// Isolated from Swap / Launch B20.
// Base docs have no official trending-meme endpoint (getTokens is search-only).

export type MarketToken = {
  address: `0x${string}`;
  name: string;
  symbol: string;
  image: string | null;
  pairAddress: string;
  priceUsd: number;
  changeH1: number;
  changeH24: number;
  volumeH24: number;
  fdv: number | null;
  pairCreatedAt: number | null;
  liquidityUsd: number | null;
  quoteSymbol: string;
};

export type ActivityTrade = {
  hash: string;
  wallet: string;
  kind: "buy" | "sell";
  amount: number;
  usd: number;
  price: number;
  time: string;
};

export type HolderRow = {
  wallet: string;
  usd: number;
  trades: number;
};

export type LiquidityPool = {
  pairAddress: string;
  dexId: string;
  quoteSymbol: string;
  liquidityUsd: number | null;
  volumeH24: number;
  priceUsd: number;
};

const DS = "https://api.dexscreener.com";
const GECKO = "https://api.geckoterminal.com/api/v2";

const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDBC = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA";
const USDT = "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2";
const DAI = "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb";
const VIRTUAL = "0x0b3e328455c4059EEb9e3f84b971c73a5A5bB6d7";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const BRETT = "0x532f27101965dd16442E59d40670FaF5eBB142E4";
const DEGEN = "0x4ed4e862860bed51a9570b96d89af5e1b0efefed";
const TOSHI = "0xAC1Bd2486aAf3B5C0fc3Fd868558b428813C06c7";
const HIGHER = "0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe";
const ZORA = "0x1111111111166b7FE7bd91427724B487980aFc69";

const SKIP_SYMBOLS = new Set([
  "ETH",
  "WETH",
  "USDC",
  "USDBC",
  "USDT",
  "DAI",
  "AXLUSDC",
  "SOL",
  "WSOL",
  "WBTC",
  "CBBTC",
  "CBETH",
  "WSTETH",
]);

const SKIP_ADDRESSES = new Set(
  [WETH, USDC, USDBC, USDT, DAI].map((a) => a.toLowerCase()),
);

type DsToken = { address?: string; name?: string; symbol?: string };
type DsPair = {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: DsToken;
  quoteToken?: DsToken;
  priceUsd?: string;
  priceChange?: { h1?: number; h24?: number };
  volume?: { h24?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  liquidity?: { usd?: number; base?: number; quote?: number };
  info?: { imageUrl?: string };
};

function isSkipped(token: DsToken | undefined): boolean {
  if (!token?.address) return true;
  if (SKIP_ADDRESSES.has(token.address.toLowerCase())) return true;
  const symbol = (token.symbol || "").toUpperCase();
  return SKIP_SYMBOLS.has(symbol);
}

function toMarketToken(pair: DsPair): MarketToken | null {
  if (pair.chainId !== "base" || !pair.pairAddress) return null;
  const listed = isSkipped(pair.baseToken) ? pair.quoteToken : pair.baseToken;
  const quote = isSkipped(pair.baseToken) ? pair.baseToken : pair.quoteToken;
  if (isSkipped(listed)) return null;
  const price = Number(pair.priceUsd);
  if (!Number.isFinite(price)) return null;
  return {
    address: listed!.address as `0x${string}`,
    name: listed!.name || listed!.symbol || "Token",
    symbol: listed!.symbol || "TOKEN",
    image: pair.info?.imageUrl ?? null,
    pairAddress: pair.pairAddress,
    priceUsd: price,
    changeH1: pair.priceChange?.h1 ?? 0,
    changeH24: pair.priceChange?.h24 ?? 0,
    volumeH24: pair.volume?.h24 ?? 0,
    fdv: pair.fdv ?? pair.marketCap ?? null,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    quoteSymbol: quote?.symbol || "USD",
  };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Market data request failed (${res.status}).`);
  return res.json();
}

function asPairs(data: unknown): DsPair[] {
  if (Array.isArray(data)) return data as DsPair[];
  if (data && typeof data === "object" && Array.isArray((data as { pairs?: DsPair[] }).pairs)) {
    return (data as { pairs: DsPair[] }).pairs;
  }
  return [];
}

function mergeTokens(rows: MarketToken[]): MarketToken[] {
  const byAddr = new Map<string, MarketToken>();
  for (const row of rows) {
    const key = row.address.toLowerCase();
    const prev = byAddr.get(key);
    if (!prev || row.volumeH24 > prev.volumeH24) byAddr.set(key, row);
  }
  return [...byAddr.values()];
}

function boostAddresses(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((b) => b && b.chainId === "base" && typeof b.tokenAddress === "string")
    .map((b) => String(b.tokenAddress));
}

function geckoPoolToPair(item: unknown): DsPair | null {
  if (!item || typeof item !== "object") return null;
  const rec = item as {
    attributes?: Record<string, unknown>;
    relationships?: Record<string, { data?: { id?: string } }>;
  };
  const attrs = rec.attributes ?? {};
  const addr = String(attrs.address || "");
  if (!addr) return null;
  const name = String(attrs.name || "");
  const parts = name.split(" / ");
  const baseSym = parts[0]?.split(" ")[0] || "TOKEN";
  const quoteSym = parts[1]?.split(" ")[0] || "USD";
  const baseId = rec.relationships?.base_token?.data?.id || "";
  const tokenAddr = baseId.includes("_") ? baseId.split("_")[1] : "";
  const price = Number(attrs.base_token_price_usd);
  const vol = attrs.volume_usd as { h24?: string } | undefined;
  const change = attrs.price_change_percentage as { h1?: string; h24?: string } | undefined;
  return {
    chainId: "base",
    dexId: String(attrs.dex_id || "dex"),
    pairAddress: addr,
    baseToken: { address: tokenAddr || addr, name: baseSym, symbol: baseSym },
    quoteToken: { address: USDC, name: quoteSym, symbol: quoteSym },
    priceUsd: Number.isFinite(price) ? String(price) : undefined,
    priceChange: {
      h1: Number(change?.h1) || 0,
      h24: Number(change?.h24) || 0,
    },
    volume: { h24: Number(vol?.h24) || 0 },
    fdv: Number(attrs.fdv_usd) || Number(attrs.market_cap_usd) || undefined,
    liquidity: { usd: Number(attrs.reserve_in_usd) || undefined },
    pairCreatedAt: attrs.pool_created_at
      ? Date.parse(String(attrs.pool_created_at))
      : undefined,
  };
}

async function fetchGeckoPools(path: string): Promise<DsPair[]> {
  const data = await getJson(`${GECKO}/networks/base/${path}?page=1`);
  const rows = (data as { data?: unknown[] }).data ?? [];
  return rows.map(geckoPoolToPair).filter((p): p is DsPair => p !== null);
}

export async function fetchBaseMarketTokens(mode: "trending" | "new"): Promise<MarketToken[]> {
  const pairSources = [WETH, USDC, VIRTUAL, AERO, BRETT, DEGEN, TOSHI, HIGHER, ZORA];
  const pairGets = pairSources.map((addr) =>
    getJson(`${DS}/token-pairs/v1/base/${addr}`).catch(() => []),
  );
  const searches = ["DEGEN", "TOSHI", "BRETT", "CLANKER", "HIGHER", "MOCHI", "BASED"].map((q) =>
    getJson(`${DS}/latest/dex/search?q=${encodeURIComponent(q)}`).catch(() => ({ pairs: [] })),
  );

  const [
    boostsLatest,
    boostsTop,
    profiles,
    recentProfiles,
    geckoTrend,
    geckoNew,
    ...rest
  ] = await Promise.all([
    getJson(`${DS}/token-boosts/latest/v1`).catch(() => []),
    getJson(`${DS}/token-boosts/top/v1`).catch(() => []),
    getJson(`${DS}/token-profiles/latest/v1`).catch(() => []),
    getJson(`${DS}/token-profiles/recent-updates/v1`).catch(() => []),
    fetchGeckoPools("trending_pools").catch(() => [] as DsPair[]),
    fetchGeckoPools("new_pools").catch(() => [] as DsPair[]),
    ...pairGets,
    ...searches,
  ]);

  const pairBatches = rest.slice(0, pairSources.length);
  const searchBatches = rest.slice(pairSources.length);

  const fromPairs = [
    ...pairBatches.flatMap((batch) => asPairs(batch)),
    ...searchBatches.flatMap((batch) => asPairs(batch)),
    ...(geckoTrend as DsPair[]),
    ...(geckoNew as DsPair[]),
  ]
    .map(toMarketToken)
    .filter((row): row is MarketToken => row !== null);

  const profileAddrs = [...asArray(profiles), ...asArray(recentProfiles)]
    .filter((p) => p && p.chainId === "base" && typeof p.tokenAddress === "string")
    .map((p) => String(p.tokenAddress));

  const extraAddrs = [
    ...new Set(
      [...boostAddresses(boostsLatest), ...boostAddresses(boostsTop), ...profileAddrs].map((a) =>
        a.toLowerCase(),
      ),
    ),
  ].slice(0, 40);

  let fromExtra: MarketToken[] = [];
  for (let i = 0; i < extraAddrs.length; i += 20) {
    const chunk = extraAddrs.slice(i, i + 20);
    const boosted = await getJson(`${DS}/tokens/v1/base/${chunk.join(",")}`).catch(() => []);
    fromExtra = fromExtra.concat(
      asPairs(boosted)
        .map(toMarketToken)
        .filter((row): row is MarketToken => row !== null),
    );
  }

  const merged = mergeTokens([...fromPairs, ...fromExtra]);
  if (mode === "new") {
    return merged
      .slice()
      .sort((a, b) => (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0))
      .slice(0, 80);
  }
  return merged
    .slice()
    .sort((a, b) => b.volumeH24 - a.volumeH24)
    .slice(0, 80);
}

export function parseBaseAddress(raw: string): `0x${string}` | null {
  const text = raw.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(text)) return null;
  return text as `0x${string}`;
}

export async function fetchTokenByAddress(address: `0x${string}`): Promise<MarketToken> {
  const want = address.toLowerCase();
  const data = await getJson(`${DS}/token-pairs/v1/base/${address}`).catch(() => []);
  const mapped = asPairs(data)
    .map(toMarketToken)
    .filter((row): row is MarketToken => row !== null);
  const exact = mapped.find((row) => row.address.toLowerCase() === want);
  if (exact) return exact;
  const fallback = mergeTokens(mapped)[0];
  if (fallback) return fallback;
  return {
    address,
    name: "Unknown token",
    symbol: "TOKEN",
    image: null,
    pairAddress: "",
    priceUsd: 0,
    changeH1: 0,
    changeH24: 0,
    volumeH24: 0,
    fdv: null,
    pairCreatedAt: null,
    liquidityUsd: null,
    quoteSymbol: "USD",
  };
}

export async function refreshMarketTokens(addresses: string[]): Promise<MarketToken[]> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()).filter(Boolean))];
  if (uniq.length === 0) return [];
  const out: MarketToken[] = [];
  for (let i = 0; i < uniq.length; i += 30) {
    const chunk = uniq.slice(i, i + 30);
    const data = await getJson(`${DS}/tokens/v1/base/${chunk.join(",")}`).catch(() => []);
    out.push(
      ...asPairs(data)
        .map(toMarketToken)
        .filter((row): row is MarketToken => row !== null),
    );
  }
  return mergeTokens(out);
}

function asArray(data: unknown): Array<{ chainId?: string; tokenAddress?: string }> {
  return Array.isArray(data) ? data : [];
}

export async function fetchActivityTrades(
  pairAddress: string,
  tokenAddress: string,
): Promise<ActivityTrade[]> {
  const data = await getJson(`${GECKO}/networks/base/pools/${pairAddress}/trades`);
  const rows = (data as { data?: Array<{ attributes?: Record<string, string> }> }).data ?? [];
  const token = tokenAddress.toLowerCase();
  return rows.slice(0, 50).map((row) => {
    const a = row.attributes ?? {};
    const kind = a.kind === "sell" ? "sell" : "buy";
    const fromIsToken = (a.from_token_address || "").toLowerCase() === token;
    const amount = Number(fromIsToken ? a.from_token_amount : a.to_token_amount);
    const price = Number(fromIsToken ? a.price_from_in_usd : a.price_to_in_usd);
    return {
      hash: a.tx_hash || "",
      wallet: a.tx_from_address || "",
      kind,
      amount: Number.isFinite(amount) ? amount : 0,
      usd: Number(a.volume_in_usd) || 0,
      price: Number.isFinite(price) ? price : 0,
      time: a.block_timestamp || "",
    };
  });
}

export function holdersFromTrades(trades: ActivityTrade[]): HolderRow[] {
  const map = new Map<string, HolderRow>();
  for (const t of trades) {
    const key = t.wallet.toLowerCase();
    const prev = map.get(key) ?? { wallet: t.wallet, usd: 0, trades: 0 };
    prev.usd += t.usd;
    prev.trades += 1;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => b.usd - a.usd).slice(0, 30);
}

export async function fetchLiquidityPools(tokenAddress: string): Promise<LiquidityPool[]> {
  const data = await getJson(`${DS}/tokens/v1/base/${tokenAddress}`);
  return asPairs(data)
    .filter((p) => p.chainId === "base" && p.pairAddress)
    .map((p) => ({
      pairAddress: p.pairAddress as string,
      dexId: p.dexId || "dex",
      quoteSymbol: isSkipped(p.baseToken) ? p.baseToken?.symbol || "" : p.quoteToken?.symbol || "",
      liquidityUsd: p.liquidity?.usd ?? null,
      volumeH24: p.volume?.h24 ?? 0,
      priceUsd: Number(p.priceUsd) || 0,
    }))
    .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    .slice(0, 12);
}

export function dexscreenerEmbedUrl(pairAddress: string): string {
  const pair = encodeURIComponent(pairAddress);
  return `https://dexscreener.com/base/${pair}?embed=1&loadChartSettings=0&trades=0&tabs=0&info=0&chartLeftToolbar=0&chartTheme=dark&theme=dark&chartStyle=1&chartType=usd&interval=60`;
}

export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.0001) return `$${value.toFixed(4)}`;
  return `$${value.toExponential(2)}`;
}

export function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

export function timeAgo(iso: string): string {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortWallet(addr: string): string {
  if (!addr || addr.length < 10) return addr || "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
