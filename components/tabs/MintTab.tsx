"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  CHAIN_ID,
  CRYPTOCATS_CONTRACT,
  CURRENT_PRICE_SELECTOR,
  MINT_QTY_SELECTOR,
} from "@/lib/contracts";
import { withBuilderSuffix } from "@/lib/txHelpers";
import { CryptoCatArt } from "@/components/CryptoCatArt";
import { ActionButton, ErrorMessage, InfoBox, TxLink, useEnsureBaseChain } from "./shared";

const MAX_PER_TX = 20;

export function MintTab() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [qty, setQty] = useState(1);
  const [unitPriceWei, setUnitPriceWei] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const refreshPrice = useCallback(async () => {
    if (!publicClient) return;
    try {
      const result = await publicClient.call({
        to: CRYPTOCATS_CONTRACT,
        data: CURRENT_PRICE_SELECTOR,
      });
      if (result.data) setUnitPriceWei(BigInt(result.data));
    } catch {
      setUnitPriceWei(null);
    }
  }, [publicClient]);

  useEffect(() => {
    refreshPrice(); // eslint-disable-line react-hooks/set-state-in-effect -- fetches external on-chain price on mount/interval
    const id = setInterval(refreshPrice, 30_000);
    return () => clearInterval(id);
  }, [refreshPrice]);

  const { sendTransactionAsync } = useSendTransaction();
  const ensureBaseChain = useEnsureBaseChain();
  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const totalWeiDisplay =
    unitPriceWei !== null ? (unitPriceWei * BigInt(qty)) : null;
  const unitEth = unitPriceWei !== null ? Number(unitPriceWei) / 1e18 : null;
  const totalEth = totalWeiDisplay !== null ? Number(totalWeiDisplay) / 1e18 : null;

  function changeQty(delta: number) {
    setQty((q) => Math.max(1, Math.min(MAX_PER_TX, q + delta)));
  }

  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleMint() {
    if (!address) return;
    setError(null);
    setTxHash(undefined);
    setIsSubmitting(true);
    try {
      // Refresh price right before sending, then add a 2% buffer in case the
      // ETH/USD price ticks between now and wallet confirmation. The
      // contract automatically refunds any excess.
      const result = await publicClient!.call({
        to: CRYPTOCATS_CONTRACT,
        data: CURRENT_PRICE_SELECTOR,
      });
      const freshUnitWei = result.data ? BigInt(result.data) : 0n;
      const totalWei = (freshUnitWei * BigInt(qty) * 102n) / 100n;
      const valueWei = totalWei > 0n ? totalWei : BigInt(Math.floor(0.00004 * 1e18));

      const data = withBuilderSuffix(
        (MINT_QTY_SELECTOR + qty.toString(16).padStart(64, "0")) as `0x${string}`,
      );

      await ensureBaseChain();
      const hash = await sendTransactionAsync({
        to: CRYPTOCATS_CONTRACT,
        data,
        value: valueWei,
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage || err.message || "Mint failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const busy = isSubmitting || isConfirming;

  return (
    <div className="w-full max-w-[540px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-lg font-bold">Mint NFT</span>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="w-full aspect-square max-h-[260px] rounded-[20px] bg-black/20 border border-[var(--mcp-border)] overflow-hidden mb-4 relative">
        <CryptoCatArt label="🐱 CRYPTO CATS" />
      </div>

      <div className="text-sm text-[var(--mcp-text-dim)] mb-3">Collection</div>
      <div className="w-full px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm mb-3">
        Crypto Cats
      </div>

      <div className="flex gap-2.5 mb-3">
        <div className="flex-1">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Quantity</div>
          <input
            type="number"
            min={1}
            max={MAX_PER_TX}
            value={qty}
            onChange={(e) => {
              const v = parseInt(e.target.value) || 1;
              setQty(Math.max(1, Math.min(MAX_PER_TX, v)));
            }}
            className="w-full text-center px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-xl font-bold outline-none"
          />
          <div className="flex gap-px mt-1.5 rounded-lg overflow-hidden border border-[var(--mcp-border)]">
            <button
              onClick={() => changeQty(-1)}
              className="flex-1 py-1.5 bg-black/20 hover:bg-black/40 text-[var(--mcp-text-dim)]"
            >
              −
            </button>
            <button
              onClick={() => changeQty(1)}
              className="flex-1 py-1.5 bg-black/20 hover:bg-black/40 text-[var(--mcp-text-dim)]"
            >
              +
            </button>
          </div>
        </div>
        <div className="flex-1">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Total Price</div>
          <div className="px-3.5 py-3 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-xl font-bold text-center">
            {totalEth !== null ? `${totalEth.toFixed(8)} ETH` : "—"}
          </div>
          {unitEth !== null && (
            <div className="text-xs text-[var(--mcp-text-dim)] mt-1.5 text-center">
              {unitEth.toFixed(8)} ETH / NFT
            </div>
          )}
        </div>
      </div>

      <InfoBox
        rows={[
          ["Contract", <span key="c" className="font-mono text-[11px]">{CRYPTOCATS_CONTRACT.slice(0, 8)}...{CRYPTOCATS_CONTRACT.slice(-6)}</span>],
          ["Network", "Base Mainnet"],
          ["Gas (est.)", "~$0.01"],
        ]}
      />

      <ErrorMessage message={error} />
      {isConfirmed && txHash && <TxLink label="🎉 Minted!" href={`https://basescan.org/tx/${txHash}`} />}

      <ActionButton
        onClick={handleMint}
        disabled={!isConnected}
        loading={busy}
        loadingText={isSubmitting ? "Confirm in wallet..." : "Waiting confirmation..."}
        className="mt-1"
      >
        {!isConnected
          ? "Connect Wallet to Mint"
          : `Mint ${qty} NFT${qty > 1 ? "s" : ""}`}
      </ActionButton>

      <div className="mt-3 text-xs text-[var(--mcp-text-dim)] leading-relaxed">
        If you&apos;d rather not connect a wallet here, you can also use the{" "}
        <a
          href="https://mcpswap-x402.kdlcfa.workers.dev/docs/mint"
          target="_blank"
          rel="noreferrer"
          className="text-[#60a5fa]"
        >
          x402 endpoint
        </a>{" "}
        to pay with USDC via an AI Agent — flat $0.05, no wallet connection needed.
      </div>
    </div>
  );
}
