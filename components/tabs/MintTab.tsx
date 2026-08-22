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
import { ActionButton, ErrorMessage, InfoBox, TxLink } from "./shared";

const MAX_PER_TX = 20;

const X402_ENDPOINT =
  "https://mcpswap-x402.kdlcfa.workers.dev/mint?x402=v2";
const X402_CLI = `npx awal x402 pay "${X402_ENDPOINT}" --max-amount 60000`;
const X402_PRICE = "0.05 USDC";

type View = "list" | "detail";
type DetailTab = "humans" | "agents";

export function MintTab() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [view, setView] = useState<View>("list");
  const [detailTab, setDetailTab] = useState<DetailTab>("agents");
  const [copied, setCopied] = useState(false);

  const [qty, setQty] = useState(1);
  const [unitPriceWei, setUnitPriceWei] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    refreshPrice();
    const id = setInterval(refreshPrice, 30_000);
    return () => clearInterval(id);
  }, [refreshPrice]);

  const { sendTransactionAsync } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const totalWeiDisplay =
    unitPriceWei !== null ? unitPriceWei * BigInt(qty) : null;
  const unitEth =
    unitPriceWei !== null ? Number(unitPriceWei) / 1e18 : null;
  const totalEth =
    totalWeiDisplay !== null ? Number(totalWeiDisplay) / 1e18 : null;

  function changeQty(delta: number) {
    setQty((q) => Math.max(1, Math.min(MAX_PER_TX, q + delta)));
  }

  async function handleMint() {
    if (!address) return;
    setError(null);
    setTxHash(undefined);
    setIsSubmitting(true);
    try {
      const result = await publicClient!.call({
        to: CRYPTOCATS_CONTRACT,
        data: CURRENT_PRICE_SELECTOR,
      });
      const freshUnitWei = result.data ? BigInt(result.data) : 0n;
      const totalWei = (freshUnitWei * BigInt(qty) * 102n) / 100n;
      const valueWei =
        totalWei > 0n ? totalWei : BigInt(Math.floor(0.00004 * 1e18));

      const data = withBuilderSuffix(
        (MINT_QTY_SELECTOR +
          qty.toString(16).padStart(64, "0")) as `0x${string}`,
      );

      const hash = await sendTransactionAsync({
        to: CRYPTOCATS_CONTRACT,
        data,
        value: valueWei,
        chainId: CHAIN_ID,
      });
      setTxHash(hash);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(
        err.shortMessage || err.message || "Mint failed. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const busy = isSubmitting || isConfirming;

  async function copyCli() {
    try {
      await navigator.clipboard.writeText(X402_CLI);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  // ---------- List view ----------
  if (view === "list") {
    return (
      <div className="w-full max-w-[440px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
        <div className="flex items-center justify-between mb-5">
          <span className="text-lg font-bold">NFT Tools</span>
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Base
          </div>
        </div>

        <button
          type="button"
          onClick={() => setView("detail")}
          className="w-full text-left rounded-2xl border border-[var(--mcp-border)] bg-black/20 overflow-hidden hover:border-[var(--mcp-accent)] transition-colors"
        >
          <div className="w-full aspect-[16/10] bg-black/30 relative">
            <CryptoCatArt label="CRYPTO CATS" />
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Crypto Cats</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                LIVE
              </span>
            </div>
            <div className="mt-2 text-sm text-[var(--mcp-text-dim)]">
              Mint via x402 (USDC) or on-chain (ETH)
            </div>
            <div className="mt-3 text-sm font-medium">{X402_PRICE}</div>
          </div>
        </button>
      </div>
    );
  }

  // ---------- Detail view ----------
  return (
    <div className="w-full max-w-[440px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setView("list")}
          className="text-sm text-[var(--mcp-text-dim)] hover:text-[var(--mcp-text)]"
        >
          ← Back
        </button>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-lg font-bold">Crypto Cats</div>
          <div className="text-sm text-[var(--mcp-text-dim)] mt-0.5">
            {X402_PRICE} · x402 + on-chain
          </div>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 shrink-0">
          LIVE
        </span>
      </div>

      <div className="w-full aspect-square max-h-[200px] rounded-[16px] bg-black/20 border border-[var(--mcp-border)] overflow-hidden mb-4 relative">
        <CryptoCatArt label="CRYPTO CATS" />
      </div>

      {/* For humans / For agents */}
      <div className="flex gap-1 p-1 rounded-full bg-black/20 border border-[var(--mcp-border)] mb-4">
        <button
          type="button"
          onClick={() => setDetailTab("humans")}
          className={`flex-1 py-1.5 rounded-full text-sm transition-colors ${
            detailTab === "humans"
              ? "bg-[var(--mcp-accent)] text-white"
              : "text-[var(--mcp-text-dim)] hover:text-[var(--mcp-text)]"
          }`}
        >
          For humans
        </button>
        <button
          type="button"
          onClick={() => setDetailTab("agents")}
          className={`flex-1 py-1.5 rounded-full text-sm transition-colors ${
            detailTab === "agents"
              ? "bg-[var(--mcp-accent)] text-white"
              : "text-[var(--mcp-text-dim)] hover:text-[var(--mcp-text)]"
          }`}
        >
          For agents
        </button>
      </div>

      {detailTab === "agents" ? (
        <div className="space-y-3">
          <div className="text-sm text-[var(--mcp-text-dim)]">
            Pay {X402_PRICE} via x402 → mint on Base. No wallet connect in the
            browser required.
          </div>
          <div className="relative">
            <pre className="text-xs font-mono bg-black/30 border border-[var(--mcp-border)] rounded-xl p-3 pr-16 overflow-x-auto whitespace-pre-wrap break-all">
              {X402_CLI}
            </pre>
            <button
              type="button"
              onClick={copyCli}
              className="absolute top-2 right-2 text-xs px-2 py-1 rounded-lg bg-[var(--mcp-accent)] text-white hover:opacity-90"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <InfoBox
            rows={[
              ["Price", X402_PRICE],
              ["Network", "Base Mainnet"],
              ["Endpoint", "mcpswap-x402…/mint"],
            ]}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-[var(--mcp-text-dim)] mb-1">
            Mint on-chain with ETH (wallet required)
          </div>

          <div className="flex gap-2.5">
            <div className="flex-1">
              <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">
                Quantity
              </div>
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
                  type="button"
                  onClick={() => changeQty(-1)}
                  className="flex-1 py-1.5 bg-black/20 hover:bg-black/40 text-[var(--mcp-text-dim)]"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => changeQty(1)}
                  className="flex-1 py-1.5 bg-black/20 hover:bg-black/40 text-[var(--mcp-text-dim)]"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex-1">
              <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">
                Total Price
              </div>
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
              [
                "Contract",
                <span key="c" className="font-mono text-[11px]">
                  {CRYPTOCATS_CONTRACT.slice(0, 8)}…
                  {CRYPTOCATS_CONTRACT.slice(-6)}
                </span>,
              ],
              ["Network", "Base Mainnet"],
              ["Gas (est.)", "~$0.01"],
            ]}
          />

          <ErrorMessage message={error} />
          {isConfirmed && txHash && (
            <TxLink
              label="Minted!"
              href={`https://basescan.org/tx/${txHash}`}
            />
          )}

          <ActionButton
            onClick={handleMint}
            disabled={!isConnected}
            loading={busy}
            loadingText={
              isSubmitting
                ? "Confirm in wallet..."
                : "Waiting confirmation..."
            }
          >
            {!isConnected
              ? "Connect Wallet to Mint"
              : `Mint ${qty} NFT${qty > 1 ? "s" : ""}`}
          </ActionButton>
        </div>
      )}
    </div>
  );
}
