"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useBalance, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { setOnchainKitConfig } from "@coinbase/onchainkit";
import { buildSwapTransaction, getTokens } from "@coinbase/onchainkit/api";
import type { Token } from "@coinbase/onchainkit/token";
import { config as wagmiConfig } from "@/wagmi";
import { CHAIN_ID } from "@/lib/contracts";
import { withBuilderSuffix } from "@/lib/txHelpers";
import { ActionButton, ErrorMessage, TxLink } from "./shared";

// OnchainKit's buildSwapTransaction needs an API key set once at module load.
// Uses the same NEXT_PUBLIC_ONCHAINKIT_API_KEY as the rest of the app.
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

// Kept as sensible defaults for the initial Sell/Buy tokens; the picker
// modal below can select any token on Base via getTokens(), not just these.

// Manually built via OnchainKit's buildSwapTransaction (not the pre-made
// <Swap> component, which signs internally and has no hook for attribution).
//
// Attribution: uses withBuilderSuffix() (manual hex concat onto calldata,
// lib/txHelpers.ts) via plain sendTransaction — NOT the sendCalls +
// `dataSuffix` capability path docs.base.org's quickstart shows, because
// that path silently drops the suffix on wallets that don't yet implement
// the capability (MetaMask, tested here, is one of them: tx still sends,
// just with no suffix, so nothing gets attributed). Manual concatenation
// is the older mechanism but every EOA wallet supports it, since the
// wallet never needs to know what the extra bytes mean.
//
// useAggregator: true — empirically the working route for this app/pair
// (confirmed via testing: the aggregator route landed on Uniswap V3 and
// succeeded; useAggregator: false routed through 0x's Exchange Proxy and
// hit an allowance error). This is opposite to the <Swap> component's own
// documented default of false, so don't "correct" it back without testing
// again first.
export function SwapTab() {
  const { address, isConnected } = useAccount();

  const [fromToken, setFromToken] = useState<Token>(ETH);
  const [toToken, setToToken] = useState<Token>(USDC);
  const [amount, setAmount] = useState("");
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [fromAmountUSD, setFromAmountUSD] = useState<string | null>(null);
  const [toAmountUSD, setToAmountUSD] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  // Separate from txHash on purpose: txHash tracks whichever tx is
  // currently in flight (approve OR swap) purely to drive the busy/
  // loading state below. swapHash is set ONLY once the real swap tx
  // (never the approve tx) is sent, so the "✅ Swapped!" banner can't
  // fire early just because the approve step happened to confirm first.
  const [swapHash, setSwapHash] = useState<`0x${string}` | undefined>();

  const { sendTransactionAsync } = useSendTransaction();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });
  const { isSuccess: isSwapConfirmed } = useWaitForTransactionReceipt({ hash: swapHash });

  // Read-only balance display — does not touch swap/signing logic at all.
  const isFromNative = !fromToken.address;
  const isToNative = !toToken.address;
  const { data: fromBalance, refetch: refetchFromBalance } = useBalance({
    address,
    token: isFromNative ? undefined : (fromToken.address as `0x${string}`),
    query: { enabled: !!address },
  });
  const { data: toBalance, refetch: refetchToBalance } = useBalance({
    address,
    token: isToNative ? undefined : (toToken.address as `0x${string}`),
    query: { enabled: !!address },
  });

  // Re-fetch both balances once a swap confirms on-chain, so the numbers
  // update automatically without the user needing to refresh the page.
  useEffect(() => {
    if (isSwapConfirmed) {
      refetchFromBalance();
      refetchToBalance();
    }
  }, [isSwapConfirmed, refetchFromBalance, refetchToBalance]);

  // Token picker modal — uses OnchainKit's official getTokens() search API
  // (same data source the Base-standard <Swap> component uses) so users can
  // find any token on Base instead of a hardcoded 3-token <select>. This is
  // purely a token-selection UX layer; it never touches handleSwap().
  const [pickerFor, setPickerFor] = useState<"from" | "to" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  const [isSearchingTokens, setIsSearchingTokens] = useState(false);

  const openPicker = useCallback((side: "from" | "to") => {
    setPickerFor(side);
    setSearchQuery("");
  }, []);

  useEffect(() => {
    if (pickerFor === null) return;
    let cancelled = false;
    setIsSearchingTokens(true); // eslint-disable-line react-hooks/set-state-in-effect
    const id = setTimeout(async () => {
      try {
        const result = await getTokens({ search: searchQuery, limit: "30" });
        if (!cancelled) {
          setSearchResults(Array.isArray(result) ? result : []);
        }
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setIsSearchingTokens(false);
      }
    }, 300); // debounce while typing
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [pickerFor, searchQuery]);

  function pickToken(token: Token) {
    if (pickerFor === "from") setFromToken(token);
    if (pickerFor === "to") setToToken(token);
    setPickerFor(null);
  }

  // getTokens() has no built-in spam/impersonation filter (per Base docs —
  // it's a plain name/symbol/address search over every deployed contract).
  // Anyone can deploy a token with symbol "ETH" pointing at garbage, and
  // since real native ETH isn't a contract at all, it may not even appear
  // in search results — leaving only impostors to pick from. Two guards:
  // (1) always show the real, hardcoded native ETH pinned at the top,
  // regardless of what the search returns, and (2) drop any search result
  // that claims the "ETH" symbol but isn't the genuine native asset.
  // Filter both symbol AND name — the impostor from testing used name
  // "Ethereum" with a different symbol ("SOETH") specifically to slip
  // past a symbol-only check. Anyone can set either field to anything on
  // their own contract, so both need checking.
  const filteredSearchResults = searchResults.filter((t) => {
    if (t.address === "") return true; // never filter the genuine native entry
    const isImpostor = t.symbol.toUpperCase() === "ETH" || t.name.toLowerCase() === "ethereum";
    return !isImpostor;
  });

  const fetchQuote = useCallback(async () => {
    if (!address || !amount || Number(amount) <= 0) {
      setQuoteAmount(null);
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
        setFromAmountUSD(result.quote.fromAmountUSD ?? null);
        setToAmountUSD(result.quote.toAmountUSD ?? null);
        // Base's own API returns a `warning` (on the top-level result
        // and/or nested under `quote`) with a human-readable
        // `description` explaining *why* a swap is likely to revert --
        // e.g. insufficient liquidity, insufficient balance, high price
        // impact. Surfaced to the user instead of silently discarded.
        const warning = result.warning ?? result.quote.warning;
        setQuoteWarning(warning?.description ?? warning?.message ?? null);
      } else {
        setQuoteAmount(null);
        setFromAmountUSD(null);
        setToAmountUSD(null);
        setQuoteWarning(null);
      }
    } catch {
      setQuoteAmount(null);
      setQuoteWarning(null);
    } finally {
      setIsQuoting(false);
    }
  }, [address, amount, fromToken, toToken]);

  useEffect(() => {
    const id = setTimeout(fetchQuote, 500); // debounce while typing
    return () => clearTimeout(id);
  }, [fetchQuote]);

  function swapDirection() {
    setFromToken(toToken);
    setToToken(fromToken);
    setQuoteAmount(null);
  }

  // Native <input type="number"> renders using the OS/browser locale's
  // decimal separator (e.g. "0,001" on vi-VN) even though the underlying
  // value is always dot-based — confusing, and if a user types a comma
  // to match what they see, type="number" silently rejects it. Using
  // type="text" + this filter keeps the displayed and stored value
  // always dot-based, regardless of system locale — same approach
  // OnchainKit's own SwapAmountInput uses internally.
  function handleAmountChange(raw: string) {
    let next = raw.replace(",", "."); // tolerate a pasted/typed comma
    next = next.replace(/[^0-9.]/g, ""); // digits and dot only
    const firstDot = next.indexOf(".");
    if (firstDot !== -1) {
      next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
    }
    setAmount(next);
  }

  async function handleSwap() {
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

      // ERC-20 sources need an approval first (native ETH does not).
      // Crucially: wait for the approve tx to actually be MINED before
      // sending the swap tx — sendTransactionAsync only resolves once the
      // tx is signed & broadcast, not once it's confirmed on-chain. Firing
      // the swap immediately after risks it executing before the allowance
      // is actually set, which is exactly what caused "likely to fail" /
      // reverted swaps when selling an ERC-20 (e.g. USDC) instead of ETH.
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

        // Re-quote: the swap transaction built above now has a STALE
        // price/minAmountOut/deadline after waiting for the approve to
        // mine (price moves during that delay, however short) — sending
        // the old `result.transaction` here is exactly what caused the
        // "likely to fail" revert. Only needed on the ERC-20 approval
        // path; native ETH sales skip straight to the swap with the
        // original fresh quote.
        result = await buildSwapTransaction({
          from: fromToken,
          to: toToken,
          amount,
          useAggregator: true,
          fromAddress: address,
        });
        if (!("transaction" in result)) {
          throw new Error(result.error ?? "Could not rebuild swap transaction after approval.");
        }
      }

      const finalSwapTxHash = await sendTransactionAsync({
        to: result.transaction.to as `0x${string}`,
        data: withBuilderSuffix(result.transaction.data as `0x${string}`),
        value: BigInt(result.transaction.value || 0),
        chainId: CHAIN_ID,
      });
      setTxHash(finalSwapTxHash);
      setSwapHash(finalSwapTxHash); // only set here — never on the approve tx
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage || err.message || "Swap failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const busy = isSubmitting || isConfirming;
  const displayQuote =
    quoteAmount !== null
      ? (Number(quoteAmount) / 10 ** toToken.decimals).toFixed(6)
      : null;

  return (
    <div className="w-full max-w-[440px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-lg font-bold">Swap</span>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-[var(--mcp-text-dim)]">Sell</span>
        {fromBalance && (
          <button
            type="button"
            onClick={() => setAmount(fromBalance.formatted)}
            className="text-xs text-[var(--mcp-text-dim)] hover:text-white"
          >
            Balance: {Number(fromBalance.formatted).toFixed(6)}{" "}
            <span className="underline">Max</span>
          </button>
        )}
      </div>
      <div className="flex gap-2 mb-1">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => handleAmountChange(e.target.value)}
          placeholder="0"
          className="flex-1 px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold outline-none"
        />
        <button
          type="button"
          onClick={() => openPicker("from")}
          className="flex items-center gap-1.5 px-4 py-2 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm font-semibold hover:bg-black/30"
        >
          {fromToken.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fromToken.image} alt="" className="w-5 h-5 rounded-full" />
          )}
          {fromToken.symbol}
          <span className="text-[var(--mcp-text-dim)]">▾</span>
        </button>
      </div>
      <div className="text-xs text-[var(--mcp-text-dim)] mb-3">
        {fromAmountUSD ? `$${Number(fromAmountUSD).toFixed(2)}` : "$0.00"}
      </div>

      <div className="flex justify-center -my-1 relative z-10">
        <button
          onClick={swapDirection}
          className="w-9 h-9 rounded-full bg-[var(--mcp-surface)] border border-[var(--mcp-border)] flex items-center justify-center hover:bg-black/20 text-[var(--mcp-text-dim)]"
          aria-label="Swap direction"
        >
          ↓
        </button>
      </div>

      <div className="flex items-center justify-between mb-1.5 mt-1">
        <span className="text-xs text-[var(--mcp-text-dim)]">Buy</span>
        {toBalance && (
          <span className="text-xs text-[var(--mcp-text-dim)]">
            Balance: {Number(toBalance.formatted).toFixed(6)}
          </span>
        )}
      </div>
      <div className="flex gap-2 mb-1">
        <div className="flex-1 px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold">
          {isQuoting ? "…" : displayQuote ?? "0"}
        </div>
        <button
          type="button"
          onClick={() => openPicker("to")}
          className="flex items-center gap-1.5 px-4 py-2 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm font-semibold hover:bg-black/30"
        >
          {toToken.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={toToken.image} alt="" className="w-5 h-5 rounded-full" />
          )}
          {toToken.symbol}
          <span className="text-[var(--mcp-text-dim)]">▾</span>
        </button>
      </div>
      <div className="text-xs text-[var(--mcp-text-dim)] mb-4">
        {toAmountUSD ? `$${Number(toAmountUSD).toFixed(2)}` : "$0.00"}
      </div>

      <ErrorMessage message={quoteWarning ? `⚠️ ${quoteWarning}` : null} />
      <ErrorMessage message={error} />
      {isSwapConfirmed && swapHash && (
        <TxLink label="✅ Swapped!" href={`https://basescan.org/tx/${swapHash}`} />
      )}

      <ActionButton
        onClick={handleSwap}
        disabled={!isConnected || !amount || Number(amount) <= 0}
        loading={busy}
        loadingText={isSubmitting ? "Confirm in wallet..." : "Waiting confirmation..."}
        className="mt-1"
      >
        {!isConnected ? "Connect Wallet to Swap" : `Swap ${fromToken.symbol} → ${toToken.symbol}`}
      </ActionButton>

      {pickerFor !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPickerFor(null)}
        >
          <div
            className="w-full max-w-[400px] max-h-[70vh] flex flex-col rounded-2xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold">Select a token</span>
              <button
                type="button"
                onClick={() => setPickerFor(null)}
                className="text-[var(--mcp-text-dim)] hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <input
              autoFocus
              type="text"
              placeholder="Search name, symbol, or 0x address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2.5 mb-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
            />
            <div className="overflow-y-auto flex-1 -mx-1">
              {/* Always-available genuine ETH — never dependent on search
                  results, so a fake "ETH"-symbol token can never be the
                  only option. */}
              {ETH.address !== (pickerFor === "from" ? toToken.address : fromToken.address) && (
                <button
                  type="button"
                  onClick={() => pickToken(ETH)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/20 text-left"
                >
                  {ETH.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ETH.image} alt="" className="w-8 h-8 rounded-full" />
                  )}
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{ETH.name}</span>
                    <span className="text-xs text-[var(--mcp-text-dim)]">{ETH.symbol}</span>
                  </div>
                </button>
              )}
              {isSearchingTokens && (
                <div className="px-3 py-4 text-sm text-[var(--mcp-text-dim)]">
                  Searching Base tokens…
                </div>
              )}
              {!isSearchingTokens && filteredSearchResults.length === 0 && (
                <div className="px-3 py-4 text-sm text-[var(--mcp-text-dim)]">
                  No tokens found.
                </div>
              )}
              {!isSearchingTokens &&
                filteredSearchResults.map((t) => (
                  <button
                    key={t.address || t.symbol}
                    type="button"
                    onClick={() => pickToken(t)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-black/20 text-left"
                  >
                    {t.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image} alt="" className="w-8 h-8 rounded-full" />
                    )}
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold">{t.name}</span>
                      <span className="text-xs text-[var(--mcp-text-dim)]">
                        {t.symbol}
                      </span>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
