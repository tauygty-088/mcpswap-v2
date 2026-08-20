"use client";

// LaunchB20Tab — creates a token on Base's native B20 standard.
//
// Two modes:
//   1. Create only  → single createB20 tx (safe default)
//   2. Launch + Pool → createB20 + mint + approve + Uniswap V3 seed
//
// Fully independent from NFT-flow tabs and Swap.

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useBalance,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { config as wagmiConfig } from "@/wagmi";
import { CHAIN_ID } from "@/lib/contracts";
import { withBuilderSuffix } from "@/lib/txHelpers";
import {
  B20_FACTORY_ABI,
  B20_FACTORY_ADDRESS,
  B20_TOKEN_ABI,
  B20_VARIANT,
  MAX_ASSET_DECIMALS,
  MIN_ASSET_DECIMALS,
  MINT_ROLE,
  encodeAssetCreateParams,
  encodeStablecoinCreateParams,
  randomSalt,
  type B20VariantKey,
} from "@/lib/b20";
import { encodeFunctionData, keccak256, parseEther, parseUnits, toBytes } from "viem";
import {
  ERC20_APPROVE_ABI,
  MAX_TICK,
  MIN_TICK,
  POOL_FEE,
  POSITION_MANAGER,
  POSITION_MANAGER_ABI,
  WETH_BASE,
  computeSqrtPriceX96,
  sortTokensAndAmounts,
} from "@/lib/uniswapV3";
import { ActionButton, ErrorMessage, InfoBox, TxLink } from "./shared";

const ACTIVATION_REGISTRY = "0x8453000000000000000000000000000000000001" as `0x${string}`;
const IS_ACTIVATED_ABI = [
  {
    type: "function",
    name: "isActivated",
    stateMutability: "view",
    inputs: [{ name: "featureId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

function activationFeatureId(v: "ASSET" | "STABLECOIN") {
  return keccak256(toBytes(v === "ASSET" ? "base.b20_asset" : "base.b20_stablecoin"));
}

function formatThousands(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";
  return digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

type PoolStep = "idle" | "minting" | "approving" | "creating-pool" | "done";

export function LaunchB20Tab() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: ethBalance } = useBalance({ address });

  const [variant, setVariant] = useState<B20VariantKey>("ASSET");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(18);
  const [currency, setCurrency] = useState("USD");
  const [unlimitedSupply, setUnlimitedSupply] = useState(true);
  const [supplyCap, setSupplyCap] = useState("");

  // Mode: false = Create only (default), true = also seed Uniswap V3 pool
  const [seedPool, setSeedPool] = useState(false);
  const [poolTokenAmount, setPoolTokenAmount] = useState("1000000");
  const [poolEthAmount, setPoolEthAmount] = useState("");
  const [poolStep, setPoolStep] = useState<PoolStep>("idle");

  const [salt] = useState(() => randomSalt());
  const [predictedAddress, setPredictedAddress] = useState<`0x${string}` | null>(null);
  const [createdTokenAddress, setCreatedTokenAddress] = useState<`0x${string}` | null>(null);
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { sendTransactionAsync } = useSendTransaction();
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash });

  const refreshPredictedAddress = useCallback(async () => {
    if (!publicClient || !address) {
      setPredictedAddress(null);
      return;
    }
    try {
      const result = await publicClient.readContract({
        address: B20_FACTORY_ADDRESS,
        abi: B20_FACTORY_ABI,
        functionName: "getB20Address",
        args: [B20_VARIANT[variant], address, salt],
      });
      setPredictedAddress(result as `0x${string}`);
    } catch {
      setPredictedAddress(null);
    }
  }, [publicClient, address, variant, salt]);

  useEffect(() => {
    refreshPredictedAddress();
  }, [refreshPredictedAddress]);

  useEffect(() => {
    if (!publicClient) return;
    let cancelled = false;
    publicClient
      .readContract({
        address: ACTIVATION_REGISTRY,
        abi: IS_ACTIVATED_ABI,
        functionName: "isActivated",
        args: [activationFeatureId(variant)],
      })
      .then((result) => {
        if (!cancelled) setIsActivated(result as boolean);
      })
      .catch(() => {
        if (!cancelled) setIsActivated(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publicClient, variant]);

  function resetForm() {
    setName("");
    setSymbol("");
    setDecimals(18);
    setCurrency("USD");
    setUnlimitedSupply(true);
    setSupplyCap("");
    setSeedPool(false);
    setPoolTokenAmount("1000000");
    setPoolEthAmount("");
    setPoolStep("idle");
    setCreatedTokenAddress(null);
    setError(null);
    setTxHash(undefined);
  }

  async function handleLaunch() {
    if (!address) return;
    setError(null);
    setTxHash(undefined);
    setCreatedTokenAddress(null);
    setIsSubmitting(true);
    setPoolStep("idle");

    try {
      if (!name.trim()) throw new Error("Token name is required.");
      if (!symbol.trim()) throw new Error("Token symbol is required.");
      if (variant === "STABLECOIN" && !/^[A-Z]{1,12}$/.test(currency)) {
        throw new Error("Currency code must be uppercase letters only (e.g. USD).");
      }

      if (seedPool) {
        if (!poolTokenAmount || Number(poolTokenAmount) <= 0) {
          throw new Error("Enter how many tokens to seed the pool with.");
        }
        if (!poolEthAmount || Number(poolEthAmount) <= 0) {
          throw new Error("Enter how much ETH to seed the pool with.");
        }
        const ethNeeded = parseEther(poolEthAmount);
        if (ethBalance && ethBalance.value < ethNeeded) {
          throw new Error(
            `Not enough ETH. You need at least ${poolEthAmount} ETH for the pool (plus gas).`,
          );
        }
        // Soft warning only — do not block. User decides risk.
        // (Previously threw and prevented launch entirely.)
      }

      const params =
        variant === "ASSET"
          ? encodeAssetCreateParams(name.trim(), symbol.trim(), address, decimals)
          : encodeStablecoinCreateParams(name.trim(), symbol.trim(), address, currency);

      const initCalls: `0x${string}`[] = [];

      initCalls.push(
        encodeFunctionData({
          abi: B20_TOKEN_ABI,
          functionName: "grantRole",
          args: [MINT_ROLE, address],
        }),
      );

      if (!unlimitedSupply) {
        if (!supplyCap || Number(supplyCap) <= 0) {
          throw new Error('Enter a supply cap greater than 0, or check "No supply cap".');
        }
        const capUnits =
          BigInt(supplyCap) * 10n ** BigInt(variant === "ASSET" ? decimals : 6);
        initCalls.push(
          encodeFunctionData({
            abi: B20_TOKEN_ABI,
            functionName: "updateSupplyCap",
            args: [capUnits],
          }),
        );
      }

      const calldata = encodeFunctionData({
        abi: B20_FACTORY_ABI,
        functionName: "createB20",
        args: [B20_VARIANT[variant], salt, params, initCalls],
      });

      // Tx 1: createB20
      const createHash = await sendTransactionAsync({
        to: B20_FACTORY_ADDRESS,
        data: calldata,
        chainId: CHAIN_ID,
      });
      setTxHash(createHash);
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash: createHash });
      if (receipt.status !== "success") {
        throw new Error("Token creation transaction reverted.");
      }

      const tokenAddress = predictedAddress;
      if (!tokenAddress) {
        throw new Error("Token created, but its address could not be confirmed. Check Basescan.");
      }

      // Surface the deterministic token address for easy copy (Base docs: getB20Address)
      setCreatedTokenAddress(tokenAddress);

      // Create-only mode ends here
      if (!seedPool) {
        setPoolStep("done");
        return;
      }

      // Launch + Pool continues
      const tokenUnits = parseUnits(poolTokenAmount, decimals);
      const ethUnits = parseEther(poolEthAmount);

      setPoolStep("minting");
      const mintCalldata = encodeFunctionData({
        abi: [
          {
            type: "function",
            name: "mint",
            stateMutability: "nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "amount", type: "uint256" },
            ],
            outputs: [],
          },
        ] as const,
        functionName: "mint",
        args: [address, tokenUnits],
      });
      const mintHash = await sendTransactionAsync({
        to: tokenAddress,
        data: mintCalldata,
        chainId: CHAIN_ID,
      });
      setTxHash(mintHash);
      await waitForTransactionReceipt(wagmiConfig, { hash: mintHash });

      setPoolStep("approving");
      const approveCalldata = encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [POSITION_MANAGER, tokenUnits],
      });
      const approveHash = await sendTransactionAsync({
        to: tokenAddress,
        data: approveCalldata,
        chainId: CHAIN_ID,
      });
      setTxHash(approveHash);
      await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });

      setPoolStep("creating-pool");
      const sorted = sortTokensAndAmounts(tokenAddress, tokenUnits, ethUnits);
      const sqrtPriceX96 = computeSqrtPriceX96(sorted.amount0, sorted.amount1);

      const createPoolCalldata = encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: "createAndInitializePoolIfNecessary",
        args: [sorted.token0, sorted.token1, POOL_FEE, sqrtPriceX96],
      });
      const mintPositionCalldata = encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: "mint",
        args: [
          {
            token0: sorted.token0,
            token1: sorted.token1,
            fee: POOL_FEE,
            tickLower: MIN_TICK,
            tickUpper: MAX_TICK,
            amount0Desired: sorted.amount0,
            amount1Desired: sorted.amount1,
            amount0Min: 0n,
            amount1Min: 0n,
            recipient: address,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
          },
        ],
      });
      const refundCalldata = encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: "refundETH",
        args: [],
      });

      const poolMulticallData = encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: "multicall",
        args: [[createPoolCalldata, mintPositionCalldata, refundCalldata]],
      });

      const poolHash = await sendTransactionAsync({
        to: POSITION_MANAGER,
        data: withBuilderSuffix(poolMulticallData),
        value: ethUnits,
        chainId: CHAIN_ID,
      });
      setTxHash(poolHash);
      await waitForTransactionReceipt(wagmiConfig, { hash: poolHash });
      setPoolStep("done");
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage || err.message || "Failed to launch token. Please try again.");
      setPoolStep("idle");
    } finally {
      setIsSubmitting(false);
    }
  }

  const busy = isSubmitting || isConfirming;

  return (
    <div className="w-full max-w-[440px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-lg font-bold">Launch B20 Token</span>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(["ASSET", "STABLECOIN"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setVariant(v)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border ${
              variant === v
                ? "border-[var(--mcp-accent)] bg-[var(--mcp-accent)]/10 text-white"
                : "border-[var(--mcp-border)] text-[var(--mcp-text-dim)] hover:bg-black/20"
            }`}
          >
            {v === "ASSET" ? "Asset" : "Stablecoin"}
          </button>
        ))}
      </div>
      <p className="text-xs text-[var(--mcp-text-dim)] mb-4">
        {variant === "ASSET"
          ? "General-purpose token — you choose decimals (6-18). Good for in-game currencies, loyalty points, or reward tokens."
          : "Fiat-pegged token — fixed at 6 decimals with a permanent currency code (e.g. USD). Best when integrators expect a standardized precision."}
      </p>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Name</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Token"
            className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
          />
        </div>
        <div>
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Symbol</div>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="MYT"
            className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
          />
        </div>
      </div>

      {variant === "ASSET" ? (
        <div className="mb-3">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">
            Decimals ({MIN_ASSET_DECIMALS}-{MAX_ASSET_DECIMALS})
          </div>
          <input
            type="number"
            min={MIN_ASSET_DECIMALS}
            max={MAX_ASSET_DECIMALS}
            value={decimals}
            onChange={(e) => {
              const n = Number(e.target.value);
              setDecimals(
                Math.min(MAX_ASSET_DECIMALS, Math.max(MIN_ASSET_DECIMALS, n || MIN_ASSET_DECIMALS)),
              );
            }}
            className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
          />
        </div>
      ) : (
        <div className="mb-3">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Currency code</div>
          <input
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 12))}
            placeholder="USD"
            className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
          />
          <p className="text-xs text-[var(--mcp-text-dim)] mt-1">
            Uppercase letters only. This is permanent once the token is created.
          </p>
        </div>
      )}

      <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={unlimitedSupply}
          onChange={(e) => setUnlimitedSupply(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm">
          No supply cap
          <span className="block text-xs text-[var(--mcp-text-dim)]">
            Uncheck to set a maximum total supply that minting can never exceed.
          </span>
        </span>
      </label>

      {!unlimitedSupply && (
        <div className="mb-3">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">
            Max supply (whole tokens, not smallest units)
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={formatThousands(supplyCap)}
            onChange={(e) => setSupplyCap(e.target.value.replace(/\D/g, ""))}
            placeholder="1.000.000"
            className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
          />
        </div>
      )}

      <label className="flex items-start gap-2.5 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={seedPool}
          onChange={(e) => setSeedPool(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-sm">
          Also seed Uniswap V3 pool
          <span className="block text-xs text-[var(--mcp-text-dim)]">
            Creates a real pool so the token is swappable right away. Requires extra ETH and 3 more
            transactions.
          </span>
        </span>
      </label>

      {seedPool && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Pool token amount</div>
              <input
                type="text"
                inputMode="numeric"
                value={formatThousands(poolTokenAmount)}
                onChange={(e) => setPoolTokenAmount(e.target.value.replace(/\D/g, ""))}
                placeholder="1.000.000"
                className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
              />
            </div>
            <div>
              <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Pool ETH amount</div>
              <input
                type="number"
                step="0.001"
                min={0}
                value={poolEthAmount}
                onChange={(e) => setPoolEthAmount(e.target.value)}
                placeholder="0.01"
                className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-[var(--mcp-text-dim)] mb-3">
            Tokens are minted and deposited together with your ETH into a full-range Uniswap V3
            pool (1% fee). Recommended minimum: 0.01 ETH.
          </p>
        </>
      )}

      {isActivated === false && (
        <ErrorMessage message="This token type isn't live on this network yet. Try again later." />
      )}

      <InfoBox
        rows={[
          ["Variant", variant === "ASSET" ? "Asset" : "Stablecoin"],
          ["Mode", seedPool ? "Create + Pool" : "Create only"],
          ["Network", "Base Mainnet"],
          ...(predictedAddress
            ? [["Predicted address", `${predictedAddress.slice(0, 10)}…${predictedAddress.slice(-6)}`]]
            : []),
        ]}
      />

      <ErrorMessage message={error} />

      {isConfirmed && createdTokenAddress && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-black/20 border border-[var(--mcp-border)]">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[var(--mcp-text-dim)] mb-0.5">Token address</div>
              <div className="text-sm font-mono truncate">{createdTokenAddress}</div>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(createdTokenAddress)}
              className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-[var(--mcp-accent)] text-white hover:opacity-90"
            >
              Copy
            </button>
          </div>
          <div className="flex gap-2 text-xs">
            <a
              href={`https://basescan.org/address/${createdTokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--mcp-accent)] hover:underline"
            >
              View token on Basescan
            </a>
            {txHash && (
              <>
                <span className="text-[var(--mcp-text-dim)]">·</span>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--mcp-accent)] hover:underline"
                >
                  View tx
                </a>
              </>
            )}
          </div>
        </div>
      )}

      <ActionButton
        onClick={handleLaunch}
        disabled={
          !isConnected ||
          !name.trim() ||
          !symbol.trim() ||
          (seedPool && (!poolTokenAmount.trim() || !poolEthAmount.trim())) ||
          isActivated === false
        }
        loading={busy}
        loadingText={
          poolStep === "minting"
            ? "Minting pool supply..."
            : poolStep === "approving"
              ? "Approving pool spend..."
              : poolStep === "creating-pool"
                ? "Creating pool..."
                : isSubmitting
                  ? "Confirm in wallet..."
                  : "Waiting confirmation..."
        }
        className="mt-1"
      >
        {!isConnected
          ? "Connect Wallet to Launch"
          : seedPool
            ? "Launch Token + Pool"
            : "Create Token"}
      </ActionButton>

      {isConfirmed && (
        <button
          type="button"
          onClick={resetForm}
          className="w-full mt-2 py-2 text-xs text-[var(--mcp-text-dim)] hover:text-white"
        >
          Launch another token
        </button>
      )}
    </div>
  );
}
