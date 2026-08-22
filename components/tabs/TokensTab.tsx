"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useBalance, useSendTransaction } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { setOnchainKitConfig } from "@coinbase/onchainkit";
import { buildSwapTransaction, getTokens } from "@coinbase/onchainkit/api";
import type { Token } from "@coinbase/onchainkit/token";
import { config as wagmiConfig } from "@/wagmi";
import { CHAIN_ID } from "@/lib/contracts";
import { withBuilderSuffix } from "@/lib/txHelpers";
import {
  dexscreenerEmbedUrl,
  fetchActivityTrades,
  fetchBaseMarketTokens,
  fetchLiquidityPools,
  fetchTokenByAddress,
  parseBaseAddress,
  refreshMarketTokens,
  formatAmount,
  formatPct,
  formatUsd,
  holdersFromTrades,
  shortWallet,
  timeAgo,
  type ActivityTrade,
  type HolderRow,
  type LiquidityPool,
  type MarketToken,
} from "@/lib/tokensMarket";
import { ActionButton, ErrorMessage, TxLink } from "./shared";

setOnchainKitConfig({ apiKey: process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY });

const ETH: Token = {
  address: "",
  chainId: CHAIN_ID,
  decimals: 18,
  name: "Ethereum",
  symbol: "ETH",
  image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
};

const USDC: Token = {
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: CHAIN_ID,
  decimals: 6,
  name: "USD Coin",
  symbol: "USDC",
  image:
    "https://dynamic-assets.coinbase.com/3c15df5e2ac7d4abbe9499ed9335041f00c620f28e8de2f93474a9f432058742cdf4674bd43f309e69778a26969372310135be97eb183d91c492154176d455b8/asset_icons/9d67b728b6c8f457717154b3a35f9ddc702eae7e76c4684ee39302c4d7fd0bb8.png",
};

function pctClass(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-[var(--mcp-text-dim)]";
}

function ListedBadge() {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[#2081E2] text-[9px] leading-none text-white"
      title="Listed token"
    >
      ✓
    </span>
  );
}

function isListedCoinbase(row: MarketToken, listed: Set<string>): boolean {
  return listed.has(row.address.toLowerCase());
}

function sanitizeAmount(raw: string): string {
  let next = raw.replace(",", ".");
  next = next.replace(/[^0-9.]/g, "");
  const firstDot = next.indexOf(".");
  if (firstDot !== -1) {
    next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
  }
  return next;
}

type SortKey = "name" | "priceUsd" | "changeH1" | "changeH24" | "volumeH24" | "fdv";

function sortValue(row: MarketToken, key: SortKey): number | string {
  if (key === "name") return row.symbol.toUpperCase();
  if (key === "fdv") return row.fdv ?? -1;
  return row[key];
}

function SortHead({
  label,
  id,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  id: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (id: SortKey) => void;
}) {
  const active = sortKey === id;
  return (
    <th className="py-2 pr-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(id)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${
          active ? "text-white" : "text-[var(--mcp-text-dim)]"
        }`}
      >
        {label}
        <span className="text-[10px]">{active ? (sortDir === "desc" ? "▼" : "▲") : "↕"}</span>
      </button>
    </th>
  );
}

const WATCH_KEY = "mcpswap.tokens.watchlist";

function readWatchlist(): MarketToken[] {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWatchlist(rows: MarketToken[]) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(rows));
}

function marketToToken(row: MarketToken, decimals: number, image: string | null): Token {
  return {
    address: row.address,
    chainId: CHAIN_ID,
    decimals,
    name: row.name,
    symbol: row.symbol,
    image: image || row.image || "",
  };
}

export function TokensTab() {
  const [mode, setMode] = useState<"trending" | "new" | "watchlist">("trending");
  const [rows, setRows] = useState<MarketToken[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<MarketToken | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("volumeH24");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [watched, setWatched] = useState<MarketToken[]>([]);
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [listedAddresses, setListedAddresses] = useState<Set<string>>(new Set());

  useEffect(() => {
    setWatched(readWatchlist());
  }, []);

  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;
    void (async () => {
      const next = new Set<string>();
      try {
        const popular = await getTokens({ limit: "50", search: "" });
        if (Array.isArray(popular)) {
          for (const t of popular) {
            if (t.address) next.add(t.address.toLowerCase());
          }
        }
      } catch {
        // ignore
      }
      const sample = rows.slice(0, 30);
      for (const row of sample) {
        const key = row.address.toLowerCase();
        if (next.has(key)) continue;
        try {
          const found = await getTokens({ limit: "10", search: row.address });
          if (Array.isArray(found) && found.some((t) => t.address?.toLowerCase() === key)) {
            next.add(key);
          }
        } catch {
          // ignore
        }
      }
      if (!cancelled) setListedAddresses(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const watchedSet = useMemo(
    () => new Set(watched.map((w) => w.address.toLowerCase())),
    [watched],
  );

  const loadList = useCallback(async (isFirst: boolean) => {
    if (isFirst) {
      setListLoading(true);
      setListError(null);
    }
    try {
      let next: MarketToken[];
      if (mode === "watchlist") {
        const cached = readWatchlist();
        const fresh = await refreshMarketTokens(cached.map((w) => w.address));
        next = fresh.length > 0 ? fresh : cached;
      } else {
        next = await fetchBaseMarketTokens(mode);
      }
      setRows(next);
      if (next.length === 0) {
        setListError(
          mode === "watchlist" ? null : "No Base tokens returned. Retry in a moment.",
        );
      } else setListError(null);
    } catch (e) {
      const err = e as { message?: string };
      if (isFirst) {
        setRows([]);
        setListError(err.message || "Could not load tokens.");
      }
    } finally {
      if (isFirst) setListLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadList(true);
  }, [loadList]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (selected) return;
    const id = window.setInterval(() => {
      const addrs = rowsRef.current.map((r) => r.address);
      if (addrs.length === 0) return;
      void refreshMarketTokens(addrs)
        .then((fresh) => {
          if (fresh.length === 0) return;
          const byAddr = new Map(fresh.map((r) => [r.address.toLowerCase(), r]));
          setRows((prev) =>
            prev.map((row) => byAddr.get(row.address.toLowerCase()) ?? row),
          );
        })
        .catch(() => undefined);
    }, 1_000);
    return () => window.clearInterval(id);
  }, [selected]);

  async function handleImport() {
    setSearchError(null);
    const q = query.trim();
    if (!q) return;
    const addr = parseBaseAddress(q);
    if (addr) {
      setSearching(true);
      try {
        const row = await fetchTokenByAddress(addr);
        try {
          const found = await getTokens({ limit: "1", search: addr });
          if (Array.isArray(found) && found[0]) {
            row.name = found[0].name || row.name;
            row.symbol = found[0].symbol || row.symbol;
            row.image = found[0].image || row.image;
          }
        } catch {
          // Keep DexScreener / stub metadata.
        }
        setSelected(row);
        setQuery("");
      } catch (e) {
        const err = e as { message?: string };
        setSearchError(err.message || "Could not import that contract.");
      } finally {
        setSearching(false);
      }
      return;
    }
    const lower = q.toLowerCase();
    const hit = rows.find(
      (r) =>
        r.symbol.toLowerCase().includes(lower) ||
        r.name.toLowerCase().includes(lower) ||
        r.address.toLowerCase() === lower,
    );
    if (hit) setSelected(hit);
    else setSearchError("No match. Paste a Base 0x contract to import.");
  }

  function toggleWatch(row: MarketToken) {
    setWatched((prev) => {
      const key = row.address.toLowerCase();
      const exists = prev.some((w) => w.address.toLowerCase() === key);
      const next = exists
        ? prev.filter((w) => w.address.toLowerCase() !== key)
        : [...prev, row];
      writeWatchlist(next);
      if (mode === "watchlist" && exists) {
        setRows((cur) => cur.filter((r) => r.address.toLowerCase() !== key));
      }
      return next;
    });
  }

  function toggleSort(id: SortKey) {
    if (sortKey === id) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(id);
      setSortDir(id === "name" ? "asc" : "desc");
    }
  }

  const sortedRows = useMemo(() => {
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = Number(av);
      const bn = Number(bv);
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  if (selected) {
    return (
      <TokenDetail
        row={selected}
        onBack={() => setSelected(null)}
        listedAddresses={listedAddresses}
      />
    );
  }

  return (
    <div className="w-full max-w-6xl rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold">Tokens</div>
          <div className="text-xs text-[var(--mcp-text-dim)] mt-0.5">
            Base market data. Not financial advice.
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {(
          [
            ["trending", "Trending"],
            ["watchlist", "Watchlist"],
            ["new", "New"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`px-3 py-1.5 rounded-full text-sm ${
              mode === id
                ? "bg-[var(--mcp-accent)] text-white"
                : "text-[var(--mcp-text-dim)] border border-[var(--mcp-border)]"
            }`}
          >
            {id === "watchlist" ? `★ ${label}` : label}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleImport();
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchError(null);
          }}
          placeholder="Search name or paste a Base contract 0x…"
          className="flex-1 min-w-0 px-3 py-2 bg-black/20 border border-[var(--mcp-border)] rounded-2xl text-sm outline-none"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="px-4 py-2 rounded-2xl text-sm font-medium bg-[var(--mcp-accent)] text-white disabled:opacity-50"
        >
          {searching ? "…" : "Import"}
        </button>
      </form>
      <ErrorMessage message={searchError} />

      <ErrorMessage message={listError} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs border-b border-[var(--mcp-border)]">
              <SortHead label="Token" id="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="Price" id="priceUsd" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="1H Change" id="changeH1" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="24H Change" id="changeH24" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="24H Vol" id="volumeH24" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <SortHead label="FDV" id="fdv" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {listLoading && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-[var(--mcp-text-dim)]">
                  Loading Base tokens…
                </td>
              </tr>
            )}
            {!listLoading && mode === "watchlist" && sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-[var(--mcp-text-dim)]">
                  No watched tokens. Tap the star on Trending to add one.
                </td>
              </tr>
            )}
            {!listLoading &&
              sortedRows.map((row) => (
                <tr
                  key={row.address}
                  onClick={() => setSelected(row)}
                  className="border-b border-[var(--mcp-border)]/70 hover:bg-white/5 cursor-pointer"
                >
                  <td className="py-3 pr-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        aria-label="Watchlist"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleWatch(row);
                        }}
                        className={`shrink-0 text-base leading-none ${
                          watchedSet.has(row.address.toLowerCase())
                            ? "text-amber-400"
                            : "text-[var(--mcp-text-dim)]"
                        }`}
                      >
                        {watchedSet.has(row.address.toLowerCase()) ? "★" : "☆"}
                      </button>
                      {row.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={row.image} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <span className="w-6 h-6 rounded-full bg-black/40" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium truncate inline-flex items-center gap-1 max-w-full">
                          <span className="truncate">{row.name}</span>
                          {isListedCoinbase(row, listedAddresses) && <ListedBadge />}
                        </div>
                        <div className="text-xs text-[var(--mcp-text-dim)]">{row.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">{formatUsd(row.priceUsd)}</td>
                  <td className={`py-3 pr-3 whitespace-nowrap ${pctClass(row.changeH1)}`}>
                    {formatPct(row.changeH1)}
                  </td>
                  <td className={`py-3 pr-3 whitespace-nowrap ${pctClass(row.changeH24)}`}>
                    {formatPct(row.changeH24)}
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">{formatUsd(row.volumeH24)}</td>
                  <td className="py-3 whitespace-nowrap">{formatUsd(row.fdv)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TokenDetail({
  row,
  onBack,
  listedAddresses,
}: {
  row: MarketToken;
  onBack: () => void;
  listedAddresses: Set<string>;
}) {
  const { address, isConnected } = useAccount();
  const { sendTransactionAsync } = useSendTransaction();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [payToken, setPayToken] = useState<Token>(ETH);
  const [target, setTarget] = useState<Token>(() => marketToToken(row, 18, row.image));
  const [amount, setAmount] = useState("");
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [fromUsd, setFromUsd] = useState<string | null>(null);
  const [toUsd, setToUsd] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [swapHash, setSwapHash] = useState<`0x${string}` | undefined>();

  const fromToken = side === "buy" ? payToken : target;
  const toToken = side === "buy" ? target : payToken;

  const { data: fromBalance } = useBalance({
    address,
    token: fromToken.address === "" ? undefined : (fromToken.address as `0x${string}`),
    chainId: CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await getTokens({ limit: "1", search: row.address });
        if (cancelled || !Array.isArray(found) || found.length === 0) return;
        const hit = found[0];
        setTarget(
          marketToToken(
            row,
            typeof hit.decimals === "number" ? hit.decimals : 18,
            hit.image || row.image,
          ),
        );
      } catch {
        // Keep list metadata if OnchainKit lookup fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row]);

  const fetchQuote = useCallback(async () => {
    if (!address || !amount || Number(amount) <= 0) {
      setQuoteAmount(null);
      setFromUsd(null);
      setToUsd(null);
      setQuoteWarning(null);
      return;
    }
    setIsQuoting(true);
    try {
      const result = await buildSwapTransaction({
        from: fromToken,
        to: toToken,
        amount,
        useAggregator: true,
        fromAddress: address,
      });
      if ("quote" in result) {
        setQuoteAmount(result.quote.toAmount ?? null);
        setFromUsd(result.quote.fromAmountUSD ?? null);
        setToUsd(result.quote.toAmountUSD ?? null);
        const warning = result.warning ?? result.quote.warning;
        setQuoteWarning(warning?.description ?? warning?.message ?? null);
      } else {
        setQuoteAmount(null);
        setFromUsd(null);
        setToUsd(null);
        setQuoteWarning(null);
      }
    } catch {
      setQuoteAmount(null);
      setFromUsd(null);
      setToUsd(null);
      setQuoteWarning(null);
    } finally {
      setIsQuoting(false);
    }
  }, [address, amount, fromToken, toToken]);

  useEffect(() => {
    const id = setTimeout(() => {
      void fetchQuote();
    }, 500);
    return () => clearTimeout(id);
  }, [fetchQuote]);

  async function handleTrade() {
    if (!address) return;
    setError(null);
    setTxHash(undefined);
    setSwapHash(undefined);
    setIsSubmitting(true);
    try {
      let result = await buildSwapTransaction({
        from: fromToken,
        to: toToken,
        amount,
        useAggregator: true,
        fromAddress: address,
      });
      if (!("transaction" in result)) {
        throw new Error(result.error ?? "Could not build swap transaction.");
      }
      if (result.approveTransaction?.data) {
        const approveHash = await sendTransactionAsync({
          to: result.approveTransaction.to as `0x${string}`,
          data: withBuilderSuffix(result.approveTransaction.data as `0x${string}`),
          chainId: CHAIN_ID,
        });
        setTxHash(approveHash);
        await waitForTransactionReceipt(wagmiConfig, {
          hash: approveHash,
          chainId: CHAIN_ID,
        });
        result = await buildSwapTransaction({
          from: fromToken,
          to: toToken,
          amount,
          useAggregator: true,
          fromAddress: address,
        });
        if (!("transaction" in result)) {
          throw new Error(result.error ?? "Could not rebuild swap after approval.");
        }
      }
      const finalHash = await sendTransactionAsync({
        to: result.transaction.to as `0x${string}`,
        data: withBuilderSuffix(result.transaction.data as `0x${string}`),
        value: BigInt(result.transaction.value || 0),
        chainId: CHAIN_ID,
      });
      setTxHash(finalHash);
      setSwapHash(finalHash);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage || err.message || "Trade failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const displayQuote = useMemo(() => {
    if (quoteAmount === null) return null;
    return (Number(quoteAmount) / 10 ** toToken.decimals).toFixed(6);
  }, [quoteAmount, toToken.decimals]);

  const payUsdLabel = useMemo(() => {
    if (fromUsd) return formatUsd(Number(fromUsd));
    if (side === "sell" && amount && Number(amount) > 0 && row.priceUsd > 0) {
      return formatUsd(Number(amount) * row.priceUsd);
    }
    return "$0.00";
  }, [fromUsd, side, amount, row.priceUsd]);

  const receiveUsdLabel = useMemo(() => {
    if (toUsd) return formatUsd(Number(toUsd));
    if (side === "buy" && displayQuote && row.priceUsd > 0) {
      return formatUsd(Number(displayQuote) * row.priceUsd);
    }
    return "$0.00";
  }, [toUsd, side, displayQuote, row.priceUsd]);

  const chartSrc = dexscreenerEmbedUrl(row.pairAddress);

  return (
    <div className="w-full max-w-[1440px]">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-sm text-[var(--mcp-text-dim)] hover:text-white"
      >
        ← Tokens
      </button>

      <div className="flex flex-col xl:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-5">
            <div className="flex items-center gap-3 mb-4">
              {row.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.image} alt="" className="w-11 h-11 rounded-full" />
              ) : null}
              <div>
                <div className="font-bold text-xl inline-flex items-center gap-1.5 flex-wrap">
                  <span>{row.name}</span>
                  {isListedCoinbase(row, listedAddresses) && <ListedBadge />}
                  <span className="text-[var(--mcp-text-dim)]">{row.symbol}</span>
                </div>
                <div className="text-sm text-[var(--mcp-text-dim)]">
                  {formatUsd(row.priceUsd)} · 24H {formatPct(row.changeH24)}
                </div>
              </div>
            </div>
            <div className="relative w-full h-[560px] rounded-2xl overflow-hidden bg-[#0b0e13]">
              {row.pairAddress ? (
                <iframe
                  title={`${row.symbol} chart`}
                  src={chartSrc}
                  className="absolute inset-x-0 top-0 w-full border-0"
                  style={{ height: "calc(100% + 42px)" }}
                  allow="clipboard-write"
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-[var(--mcp-text-dim)] px-6 text-center">
                  No DexScreener pool yet. You can still try Buy if a route exists.
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-[var(--mcp-border)]">
              <Stat label="FDV" value={formatUsd(row.fdv)} />
              <Stat label="24H Vol" value={formatUsd(row.volumeH24)} />
              <Stat label="Liquidity" value={formatUsd(row.liquidityUsd ?? null)} />
              <Stat label="24H" value={formatPct(row.changeH24)} valueClass={pctClass(row.changeH24)} />
            </div>
          </div>

          <TokenMarketTabs row={row} />
        </div>

        <div className="w-full xl:w-[440px] shrink-0 xl:sticky xl:top-4 rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-5 flex flex-col">
          <div className="flex gap-1 mb-2">
            {(["buy", "sell"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setSide(id)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize ${
                  side === id
                    ? "bg-[var(--mcp-accent)] text-white"
                    : "text-[var(--mcp-text-dim)] border border-[var(--mcp-border)]"
                }`}
              >
                {id}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-[var(--mcp-text-dim)]">
              {side === "buy" ? "Pay with" : "Sell"}
            </span>
            {fromBalance && (
              <div className="flex items-center gap-1.5">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      const amt = (Number(fromBalance.formatted) * pct) / 100;
                      setAmount(amt.toString());
                    }}
                    className="px-2 py-0.5 text-xs rounded-full border border-[var(--mcp-border)] text-[var(--mcp-text-dim)] hover:text-white hover:border-white/40"
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(fromBalance.formatted)}
                  className="px-2 py-0.5 text-xs rounded-full border border-[var(--mcp-border)] text-[var(--mcp-text-dim)] hover:text-white hover:border-white/40"
                >
                  Max
                </button>
              </div>
            )}
          </div>
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1">
            {fromBalance ? `Balance: ${Number(fromBalance.formatted).toFixed(6)}` : "\u00A0"}
          </div>
          <div className="flex gap-2 mb-1">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              placeholder="0"
              className="flex-1 min-w-0 px-4 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-2xl text-2xl font-bold outline-none"
            />
            {side === "buy" ? (
              <button
                type="button"
                onClick={() => setPayToken(payToken.symbol === "ETH" ? USDC : ETH)}
                className="flex items-center gap-2 px-4 min-w-[118px] bg-black/20 border border-[var(--mcp-border)] rounded-2xl text-base font-semibold"
              >
                {payToken.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={payToken.image} alt="" className="w-6 h-6 rounded-full" />
                ) : null}
                {payToken.symbol}
              </button>
            ) : (
              <div className="flex items-center gap-2 px-4 min-w-[118px] bg-black/20 border border-[var(--mcp-border)] rounded-2xl text-base font-semibold">
                {target.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={target.image} alt="" className="w-6 h-6 rounded-full" />
                ) : null}
                {target.symbol}
              </div>
            )}
          </div>
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1">{payUsdLabel}</div>

          <div className="flex justify-center my-1">
            <button
              type="button"
              onClick={() => setSide((s) => (s === "buy" ? "sell" : "buy"))}
              className="w-9 h-9 rounded-full border border-[var(--mcp-border)] bg-black/30 text-sm text-[var(--mcp-text-dim)] hover:text-white"
              aria-label="Switch buy and sell"
            >
              ↓
            </button>
          </div>

          <div className="text-sm text-[var(--mcp-text-dim)] mb-1">Receive</div>
          <div className="flex gap-2 mb-1">
            <div className="flex-1 min-w-0 px-4 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-2xl text-2xl font-bold">
              {isQuoting ? "…" : displayQuote ?? "0"}
            </div>
            {side === "buy" ? (
              <div className="flex items-center gap-2 px-4 min-w-[118px] bg-black/20 border border-[var(--mcp-border)] rounded-2xl text-base font-semibold">
                {target.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={target.image} alt="" className="w-6 h-6 rounded-full" />
                ) : null}
                {target.symbol}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPayToken(payToken.symbol === "ETH" ? USDC : ETH)}
                className="flex items-center gap-2 px-4 min-w-[118px] bg-black/20 border border-[var(--mcp-border)] rounded-2xl text-base font-semibold"
              >
                {payToken.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={payToken.image} alt="" className="w-6 h-6 rounded-full" />
                ) : null}
                {payToken.symbol}
              </button>
            )}
          </div>
          <div className="text-xs text-[var(--mcp-text-dim)] mb-3">{receiveUsdLabel}</div>

          <ErrorMessage message={quoteWarning ? `⚠️ ${quoteWarning}` : null} />
          <ErrorMessage message={error} />
          {swapHash && <TxLink label="Trade sent" href={`https://basescan.org/tx/${swapHash}`} />}

          <ActionButton
            onClick={() => void handleTrade()}
            disabled={!isConnected || !amount || Number(amount) <= 0}
            loading={isSubmitting}
            loadingText={txHash && !swapHash ? "Waiting approval..." : "Confirm in wallet..."}
            className="py-3.5 text-base mt-2"
          >
            {!isConnected
              ? "Connect Wallet"
              : `${side === "buy" ? "Buy" : "Sell"} ${target.symbol}`}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--mcp-text-dim)] uppercase tracking-wide">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${valueClass ?? ""}`}>{value}</div>
    </div>
  );
}

function TokenMarketTabs({ row }: { row: MarketToken }) {
  const [tab, setTab] = useState<"activity" | "holders" | "liquidity">("activity");
  const [trades, setTrades] = useState<ActivityTrade[]>([]);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [pools, setPools] = useState<LiquidityPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelError, setPanelError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let first = true;

    async function load(isFirst: boolean) {
      if (isFirst) {
        setLoading(true);
        setPanelError(null);
      }
      try {
        const [nextTrades, nextPools] = await Promise.all([
          fetchActivityTrades(row.pairAddress, row.address).catch(() => [] as ActivityTrade[]),
          fetchLiquidityPools(row.address).catch(() => [] as LiquidityPool[]),
        ]);
        if (cancelled) return;
        setTrades(nextTrades);
        setHolders(holdersFromTrades(nextTrades));
        setPools(nextPools);
      } catch (e) {
        if (!cancelled && isFirst) {
          const err = e as { message?: string };
          setPanelError(err.message || "Could not load market tables.");
        }
      } finally {
        if (!cancelled && isFirst) setLoading(false);
      }
    }

    void load(true);
    const id = window.setInterval(() => {
      void load(false);
    }, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [row.address, row.pairAddress]);

  return (
    <div className="rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-5">
      <div className="flex gap-1 mb-4">
        {(
          [
            ["activity", "Activity · live"],
            ["holders", "Holders"],
            ["liquidity", "Liquidity"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-sm ${
              tab === id
                ? "bg-[var(--mcp-accent)] text-white"
                : "text-[var(--mcp-text-dim)] border border-[var(--mcp-border)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {panelError && <ErrorMessage message={panelError} />}
      {loading && <div className="py-8 text-sm text-[var(--mcp-text-dim)]">Loading…</div>}

      {!loading && tab === "activity" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--mcp-text-dim)] border-b border-[var(--mcp-border)]">
                <th className="py-2 pr-3 font-medium">Wallet</th>
                <th className="py-2 pr-3 font-medium">Event</th>
                <th className="py-2 pr-3 font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Total USD</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-[var(--mcp-text-dim)]">
                    No recent trades.
                  </td>
                </tr>
              )}
              {trades.map((t, i) => (
                <tr key={`${t.hash}-${i}`} className="border-b border-[var(--mcp-border)]/70">
                  <td className="py-2.5 pr-3">
                    <a
                      href={`https://basescan.org/address/${t.wallet}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#60a5fa] hover:underline"
                    >
                      {shortWallet(t.wallet)}
                    </a>
                  </td>
                  <td className={`py-2.5 pr-3 font-medium ${t.kind === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                    {t.kind === "buy" ? "Buy" : "Sell"}
                  </td>
                  <td className="py-2.5 pr-3">
                    {t.kind === "sell" ? "-" : "+"}
                    {formatAmount(t.amount)} {row.symbol}
                  </td>
                  <td className={`py-2.5 pr-3 ${t.kind === "buy" ? "text-emerald-400" : "text-red-400"}`}>
                    {formatUsd(t.usd)}
                  </td>
                  <td className="py-2.5 pr-3">{formatUsd(t.price)}</td>
                  <td className="py-2.5">
                    <a
                      href={`https://basescan.org/tx/${t.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--mcp-text-dim)] hover:text-white"
                    >
                      {timeAgo(t.time)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "holders" && (
        <div className="overflow-x-auto">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-3">
            Recent traders on this pool (not a full holder snapshot).
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--mcp-text-dim)] border-b border-[var(--mcp-border)]">
                <th className="py-2 pr-3 font-medium">Wallet</th>
                <th className="py-2 pr-3 font-medium">Trades</th>
                <th className="py-2 font-medium">Volume USD</th>
              </tr>
            </thead>
            <tbody>
              {holders.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-[var(--mcp-text-dim)]">
                    No recent traders.
                  </td>
                </tr>
              )}
              {holders.map((h) => (
                <tr key={h.wallet} className="border-b border-[var(--mcp-border)]/70">
                  <td className="py-2.5 pr-3">
                    <a
                      href={`https://basescan.org/address/${h.wallet}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#60a5fa] hover:underline"
                    >
                      {shortWallet(h.wallet)}
                    </a>
                  </td>
                  <td className="py-2.5 pr-3">{h.trades}</td>
                  <td className="py-2.5">{formatUsd(h.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "liquidity" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--mcp-text-dim)] border-b border-[var(--mcp-border)]">
                <th className="py-2 pr-3 font-medium">Pair</th>
                <th className="py-2 pr-3 font-medium">DEX</th>
                <th className="py-2 pr-3 font-medium">Liquidity</th>
                <th className="py-2 pr-3 font-medium">24H Vol</th>
                <th className="py-2 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {pools.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-[var(--mcp-text-dim)]">
                    No pools found.
                  </td>
                </tr>
              )}
              {pools.map((p) => (
                <tr key={p.pairAddress} className="border-b border-[var(--mcp-border)]/70">
                  <td className="py-2.5 pr-3">
                    {row.symbol}/{p.quoteSymbol || "—"}
                  </td>
                  <td className="py-2.5 pr-3 capitalize">{p.dexId}</td>
                  <td className="py-2.5 pr-3">{formatUsd(p.liquidityUsd)}</td>
                  <td className="py-2.5 pr-3">{formatUsd(p.volumeH24)}</td>
                  <td className="py-2.5">{formatUsd(p.priceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
