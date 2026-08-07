"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { setOnchainKitConfig } from "@coinbase/onchainkit";
import { buildSwapTransaction } from "@coinbase/onchainkit/api";
import type { Token } from "@coinbase/onchainkit/token";
import { CHAIN_ID } from "@/lib/contracts";
import { withBuilderSuffix } from "@/lib/txHelpers";
import { ActionButton, ErrorMessage, InfoBox, TxLink } from "./shared";

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
    "https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/44/2b/442b80bd16af0c0d9b22e03a16753823fe826e5bfd457292b55fa0ba8c1ba213-ZWUzYjJmZGUtMDYxNy00NDcyLTg0NjQtMWI4OGEwYjBiODE2",
};

const DAI: Token = {
  address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
  chainId: CHAIN_ID,
  decimals: 18,
  name: "Dai",
  symbol: "DAI",
  image: "",
};

const TOKENS: Token[] = [ETH, USDC, DAI];

// Manually built via OnchainKit's buildSwapTransaction (not the pre-made
// <Swap> component) so we can append the MCPSwap Base Builder Code suffix
// to the calldata before signing — the <Swap> component signs internally
// and doesn't expose a dataSuffix hook, so this lower-level API is the
// Base-recommended way to keep both official swap quoting AND attribution.
export function SwapTab() {
  const { address, isConnected } = useAccount();

  const [fromToken, setFromToken] = useState<Token>(ETH);
  const [toToken, setToToken] = useState<Token>(USDC);
  const [amount, setAmount] = useState("0.001");
  const [quoteAmount, setQuoteAmount] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { sendTransactionAsync } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

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
        useAggregator: false, // Uniswap V3 default, matches Base docs recommendation
        fromAddress: address,
      });
      if ("quote" in result) {
        setQuoteAmount(result.quote.toAmount ?? null);
      } else {
        setQuoteAmount(null);
      }
    } catch {
      setQuoteAmount(null);
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

  async function handleSwap() {
    if (!address) return;
    setError(null);
    setTxHash(undefined);
    setIsSubmitting(true);
    try {
      const result = await buildSwapTransaction({
        from: fromToken,
        to: toToken,
        amount,
        useAggregator: false,
        fromAddress: address,
      });

      if (!("transaction" in result)) {
        throw new Error(result.error ?? "Could not build swap transaction.");
      }

      // ERC-20 sources need an approval first (native ETH does not).
      if (result.approveTransaction?.data) {
        const approveHash = await sendTransactionAsync({
          to: result.approveTransaction.to as `0x${string}`,
          data: withBuilderSuffix(result.approveTransaction.data as `0x${string}`),
          chainId: CHAIN_ID,
        });
        setTxHash(approveHash);
      }

      const swapHash = await sendTransactionAsync({
        to: result.transaction.to as `0x${string}`,
        data: withBuilderSuffix(result.transaction.data as `0x${string}`),
        value: BigInt(result.transaction.value || 0),
        chainId: CHAIN_ID,
      });
      setTxHash(swapHash);
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

      <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Sell</div>
      <div className="flex gap-2 mb-2">
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="flex-1 px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold outline-none"
        />
        <select
          value={fromToken.symbol}
          onChange={(e) =>
            setFromToken(TOKENS.find((t) => t.symbol === e.target.value) ?? ETH)
          }
          className="px-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm font-semibold outline-none"
        >
          {TOKENS.map((t) => (
            <option key={t.symbol} value={t.symbol}>
              {t.symbol}
            </option>
          ))}
        </select>
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
        <div className="flex-1 px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold">
          {isQuoting ? "…" : displayQuote ?? "—"}
        </div>
        <select
          value={toToken.symbol}
          onChange={(e) =>
            setToToken(TOKENS.find((t) => t.symbol === e.target.value) ?? USDC)
          }
          className="px-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm font-semibold outline-none"
        >
          {TOKENS.map((t) => (
            <option key={t.symbol} value={t.symbol}>
              {t.symbol}
            </option>
          ))}
        </select>
      </div>

      <InfoBox
        rows={[
          ["Router", "Uniswap V3"],
          ["Network", "Base Mainnet"],
          ["Builder Code", "bc_2esgljny ✓"],
        ]}
      />

      <ErrorMessage message={error} />
      {isConfirmed && txHash && (
        <TxLink label="✅ Swapped!" href={`https://basescan.org/tx/${txHash}`} />
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
    </div>
  );
}
