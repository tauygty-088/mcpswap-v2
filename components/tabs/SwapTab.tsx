"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSendTransaction } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { setOnchainKitConfig } from "@coinbase/onchainkit";
import { buildSwapTransaction, getTokens } from "@coinbase/onchainkit/api";
import type { Token } from "@coinbase/onchainkit/token";
import { config as wagmiConfig } from "@/wagmi";
import { CHAIN_ID } from "@/lib/contracts";
import { withBuilderSuffix } from "@/lib/txHelpers";
import { ActionButton, ErrorMessage, InfoBox, TxLink } from "./shared";

// buildSwapTransaction / getTokens need an API key set once at module load.
setOnchainKitConfig({ apiKey: process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY });

const NATIVE_ETH: Token = {
  address: "",
  chainId: CHAIN_ID,
  decimals: 18,
  name: "Ethereum",
  symbol: "ETH",
  image: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
};

// Only ETH is hardcoded (native asset, no contract to look up). Every
// other token — including the default "Buy" side — is fetched through
// Base's official getTokens search API so the symbol, decimals, and
// logo are always correct instead of guessed/hardcoded.
const DEFAULT_TO_SYMBOL = "USDC";

function TokenIcon({ token }: { token: Token }) {
  const [failed, setFailed] = useState(false);
  if (!token.image || failed) {
    return (
      <div className="w-6 h-6 rounded-full bg-[var(--mcp-border)] flex items-center justify-center text-[10px] font-bold shrink-0">
        {token.symbol.slice(0, 2)}
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={token.image} alt={token.symbol} className="w-6 h-6 rounded-full shrink-0" onError={() => setFailed(true)} />;
}

function TokenSelect({
  token,
  exclude,
  onSelect,
}: {
  token: Token | null;
  exclude: Token | null;
  onSelect: (t: Token) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        // Works identically whether the user types "USDC" or pastes a
        // 0x... contract address — this is Base's official token search.
        const res = await getTokens({ search: q, limit: "8" });
        setResults(Array.isArray(res) ? (res as Token[]) : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [query, open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm font-semibold hover:bg-black/30 shrink-0"
      >
        {token ? <TokenIcon token={token} /> : <div className="w-6 h-6 rounded-full bg-[var(--mcp-border)]" />}
        {token?.symbol ?? "Select"}
        <span className="text-[var(--mcp-text-dim)]">▾</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-[420px] rounded-2xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold">Select a token</span>
              <button onClick={() => setOpen(false)} className="text-[var(--mcp-text-dim)]">✕</button>
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, symbol, or paste contract address"
              className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none mb-3"
            />
            {!query && (
              <button
                onClick={() => { onSelect(NATIVE_ETH); setOpen(false); }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/20 text-left"
              >
                <TokenIcon token={NATIVE_ETH} />
                <div>
                  <div className="text-sm font-semibold">{NATIVE_ETH.symbol}</div>
                  <div className="text-xs text-[var(--mcp-text-dim)]">{NATIVE_ETH.name}</div>
                </div>
              </button>
            )}
            <div className="max-h-72 overflow-y-auto">
              {loading && <div className="text-xs text-[var(--mcp-text-dim)] px-2 py-3">Searching…</div>}
              {!loading && query && results.length === 0 && (
                <div className="text-xs text-[var(--mcp-text-dim)] px-2 py-3">No tokens found.</div>
              )}
              {results
                .filter((t) => t.address.toLowerCase() !== (exclude?.address ?? "").toLowerCase())
                .map((t) => (
                  <button
                    key={t.address}
                    onClick={() => { onSelect(t); setOpen(false); setQuery(""); }}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-black/20 text-left"
                  >
                    <TokenIcon token={t} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{t.symbol}</div>
                      <div className="text-xs text-[var(--mcp-text-dim)] truncate">{t.name}</div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Manually built via OnchainKit's buildSwapTransaction (not the
// pre-made <Swap> component, which signs internally and has no hook
// for appending the Base Builder Code suffix). ERC-20 sources need an
// approval MINED on-chain before the swap is sent — approve and swap
// are two separate transactions, not one, per the standard ERC-20
// allowance pattern Base's own Swap component follows internally.
export function SwapTab() {
  const { address, isConnected } = useAccount();

  const [fromToken, setFromToken] = useState<Token>(NATIVE_ETH);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [amount, setAmount] = useState("0.001");
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<"" | "approving" | "swapping">("");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [confirmed, setConfirmed] = useState(false);

  const { sendTransactionAsync } = useSendTransaction();

  useEffect(() => {
    getTokens({ search: DEFAULT_TO_SYMBOL, limit: "1" })
      .then((res) => { if (Array.isArray(res) && res[0]) setToToken(res[0] as Token); })
      .catch(() => {});
  }, []);

  const fetchQuote = useCallback(async () => {
    if (!address || !toToken || !amount || Number(amount) <= 0) {
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
      setQuoteAmount("quote" in result ? result.quote.toAmount ?? null : null);
    } catch {
      setQuoteAmount(null);
    } finally {
      setIsQuoting(false);
    }
  }, [address, amount, fromToken, toToken]);

  useEffect(() => {
    const id = setTimeout(fetchQuote, 500);
    return () => clearTimeout(id);
  }, [fetchQuote]);

  function swapDirection() {
    if (!toToken) return;
    setFromToken(toToken);
    setToToken(fromToken);
    setQuoteAmount(null);
  }

  async function handleSwap() {
    if (!address || !toToken) return;
    setError(null);
    setTxHash(undefined);
    setConfirmed(false);
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
        setStep("approving");
        const approveHash = await sendTransactionAsync({
          to: result.approveTransaction.to as `0x${string}`,
          data: withBuilderSuffix(result.approveTransaction.data as `0x${string}`),
          chainId: CHAIN_ID,
        });
        setTxHash(approveHash);
        // Wait for the approval to actually be mined before sending the
        // swap — this is the step that was missing before, and why
        // token → ETH swaps failed while ETH → token (no approval
        // needed) worked fine.
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });

        // Re-quote: the swap tx built above now has a STALE price/minAmountOut
        // after waiting for the approve to mine (price moves during that
        // delay) — this staleness is exactly why token → ETH reverted while
        // ETH → token (no approve step, no delay) always worked fine.
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

      setStep("swapping");
      const swapHash = await sendTransactionAsync({
        to: result.transaction.to as `0x${string}`,
        data: withBuilderSuffix(result.transaction.data as `0x${string}`),
        value: BigInt(result.transaction.value || 0),
        chainId: CHAIN_ID,
      });
      setTxHash(swapHash);
      await waitForTransactionReceipt(wagmiConfig, { hash: swapHash });
      setConfirmed(true);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage || err.message || "Swap failed. Please try again.");
    } finally {
      setStep("");
      setIsSubmitting(false);
    }
  }

  const displayQuote =
    quoteAmount !== null && toToken ? (Number(quoteAmount) / 10 ** toToken.decimals).toFixed(6) : null;

  const loadingText =
    step === "approving" ? "Approve in wallet..." : step === "swapping" ? "Confirm swap in wallet..." : "Waiting...";

  return (
    <div className="w-full max-w-[440px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-lg font-bold">Swap</span>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Sell</div>
      <div className="flex gap-2 mb-2">
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 min-w-0 px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold outline-none"
        />
        <TokenSelect token={fromToken} exclude={toToken} onSelect={setFromToken} />
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

      <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5 mt-1">Buy</div>
      <div className="flex gap-2 mb-3">
        <div className="flex-1 min-w-0 px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold truncate">
          {isQuoting ? "…" : displayQuote ?? "—"}
        </div>
        <TokenSelect token={toToken} exclude={fromToken} onSelect={setToToken} />
      </div>

      <InfoBox
        rows={[
          ["Router", "Uniswap V3"],
          ["Network", "Base Mainnet"],
          ["Builder Code", "bc_2esgljny ✓"],
        ]}
      />

      <ErrorMessage message={error} />
      {confirmed && txHash && <TxLink label="✅ Swapped!" href={`https://basescan.org/tx/${txHash}`} />}

      <ActionButton
        onClick={handleSwap}
        disabled={!isConnected || !toToken || !amount || Number(amount) <= 0}
        loading={isSubmitting}
        loadingText={loadingText}
        className="mt-1"
      >
        {!isConnected ? "Connect Wallet to Swap" : `Swap ${fromToken.symbol} → ${toToken?.symbol ?? "..."}`}
      </ActionButton>
    </div>
  );
}
