// B20_BUILD_ID: launch-b20-v1
"use client";

/**
 * LaunchB20Tab — Phase 1: create a B20 Asset token via Base's native B20Factory
 * precompile, optionally mint an initial supply to the creator.
 *
 * B20 is NOT a deployable smart contract — it's a fixed precompile built into
 * every Base node (same address on every network). No Solidity, no deploy step,
 * just a direct call from the client, same as every other tab in this app.
 *
 * Every fact below (addresses, struct layout, role hashes, function signatures)
 * was read directly from the official source, not guessed:
 *   - docs.base.org/get-started/launch-b20-token
 *   - github.com/base/base-std (IB20Factory.sol, B20FactoryLib.sol, B20Constants.sol)
 *
 * Phase 1 scope: ASSET variant only. STABLECOIN variant can be added later by
 * branching on `variant` and swapping in `encodeStablecoinCreateParams`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useSendTransaction } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import {
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseUnits,
  toHex,
  type Hex,
} from "viem";

import {
  ActionButton,
  ErrorMessage,
  InfoBox,
  Spinner,
  TxLink,
  useEnsureBaseChain,
} from "./shared";
import { withBuilderSuffix } from "@/lib/txHelpers";
import { CHAIN_ID } from "@/lib/contracts";
import { config as wagmiConfig } from "@/wagmi";

// ---------------------------------------------------------------------------
// B20 precompile addresses — fixed, identical on every Base network.
// Source: docs.base.org/get-started/launch-b20-token
// ---------------------------------------------------------------------------

const B20_FACTORY_ADDRESS = "0xB20f000000000000000000000000000000000000" as const;
const ACTIVATION_REGISTRY_ADDRESS = "0x8453000000000000000000000000000000000001" as const;

/** B20Variant enum from IB20Factory.sol. Phase 1 only uses ASSET. */
const B20_VARIANT_ASSET = 0;

/** Feature id the Activation Registry checks. Source: launch-b20-token quickstart. */
const B20_ASSET_FEATURE_ID = keccak256(toHex("base.b20_asset"));

/** MINT_ROLE = keccak256("MINT_ROLE"). Source: B20Constants.sol. */
const MINT_ROLE = keccak256(toHex("MINT_ROLE"));

/** type(uint128).max — the "no cap" sentinel. Source: B20Constants.sol MAX_SUPPLY_CAP. */
const NO_SUPPLY_CAP = (1n << 128n) - 1n;

const MIN_ASSET_DECIMALS = 6;
const MAX_ASSET_DECIMALS = 18;

// ---------------------------------------------------------------------------
// Minimal ABI fragments — only what this tab calls.
// ---------------------------------------------------------------------------

const CREATE_B20_ABI = [
  {
    type: "function",
    name: "createB20",
    stateMutability: "payable",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "salt", type: "bytes32" },
      { name: "params", type: "bytes" },
      { name: "initCalls", type: "bytes[]" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
] as const;

const GET_B20_ADDRESS_ABI = [
  {
    type: "function",
    name: "getB20Address",
    stateMutability: "view",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "sender", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const IS_ACTIVATED_ABI = [
  {
    type: "function",
    name: "isActivated",
    stateMutability: "view",
    inputs: [{ name: "featureId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const GRANT_ROLE_ABI = [
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
] as const;

const UPDATE_SUPPLY_CAP_ABI = [
  {
    type: "function",
    name: "updateSupplyCap",
    stateMutability: "nonpayable",
    inputs: [{ name: "newSupplyCap", type: "uint256" }],
    outputs: [],
  },
] as const;

const MINT_ABI = [
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
] as const;

// ---------------------------------------------------------------------------
// Encoding helpers — mirror B20FactoryLib.sol exactly (canonical encoding
// required; the precompile rejects anything else with AbiDecodeFailed).
// ---------------------------------------------------------------------------

/**
 * Encodes a B20AssetCreateParams blob: abi.encode(struct{ uint8 version;
 * string name; string symbol; address initialAdmin; uint8 decimals }).
 * version is hardcoded to 1 (B20_ASSET_CREATE_PARAMS_VERSION).
 */
function encodeAssetCreateParams(
  name: string,
  symbol: string,
  initialAdmin: `0x${string}`,
  decimals: number,
): Hex {
  return encodeAbiParameters(
    [
      { type: "uint8" }, // version
      { type: "string" }, // name
      { type: "string" }, // symbol
      { type: "address" }, // initialAdmin
      { type: "uint8" }, // decimals
    ],
    [1, name, symbol, initialAdmin, decimals],
  );
}

function encodeGrantRole(role: Hex, account: `0x${string}`): Hex {
  return encodeFunctionData({ abi: GRANT_ROLE_ABI, functionName: "grantRole", args: [role, account] });
}

function encodeUpdateSupplyCap(newSupplyCap: bigint): Hex {
  return encodeFunctionData({
    abi: UPDATE_SUPPLY_CAP_ABI,
    functionName: "updateSupplyCap",
    args: [newSupplyCap],
  });
}

/** Cryptographically random bytes32 salt, so token addresses never collide. */
function randomSalt(): Hex {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type LaunchStatus = "idle" | "creating" | "minting" | "success" | "error";

export function LaunchB20Tab() {
  const { address, isConnected } = useAccount();
  const ensureBaseChain = useEnsureBaseChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [decimals, setDecimals] = useState(18);
  const [initialSupply, setInitialSupply] = useState("");
  const [salt, setSalt] = useState<Hex>(() => randomSalt());

  const [predictedAddress, setPredictedAddress] = useState<`0x${string}` | null>(null);
  const [featureActivated, setFeatureActivated] = useState<boolean | null>(null);

  const [status, setStatus] = useState<LaunchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [tokenAddress, setTokenAddress] = useState<`0x${string}` | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Check once whether the ASSET feature is live on this network — deploying
  // before it's activated reverts with FeatureNotActivated (docs warning).
  useEffect(() => {
    let cancelled = false;
    readContract(wagmiConfig, {
      address: ACTIVATION_REGISTRY_ADDRESS,
      abi: IS_ACTIVATED_ABI,
      functionName: "isActivated",
      args: [B20_ASSET_FEATURE_ID],
      chainId: CHAIN_ID,
    })
      .then((activated) => {
        if (!cancelled) setFeatureActivated(activated);
      })
      .catch(() => {
        if (!cancelled) setFeatureActivated(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live-predict the deterministic token address as the form fills in.
  useEffect(() => {
    if (!address) {
      setPredictedAddress(null);
      return;
    }
    let cancelled = false;
    readContract(wagmiConfig, {
      address: B20_FACTORY_ADDRESS,
      abi: GET_B20_ADDRESS_ABI,
      functionName: "getB20Address",
      args: [B20_VARIANT_ASSET, address, salt],
      chainId: CHAIN_ID,
    })
      .then((addr) => {
        if (!cancelled) setPredictedAddress(addr);
      })
      .catch(() => {
        if (!cancelled) setPredictedAddress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, salt]);

  const canLaunch = useMemo(
    () =>
      isConnected &&
      !!address &&
      name.trim().length > 0 &&
      symbol.trim().length > 0 &&
      decimals >= MIN_ASSET_DECIMALS &&
      decimals <= MAX_ASSET_DECIMALS &&
      status !== "creating" &&
      status !== "minting",
    [isConnected, address, name, symbol, decimals, status],
  );

  const handleLaunch = useCallback(async () => {
    if (!address) return;
    setError(null);
    setTxHash(null);

    try {
      await ensureBaseChain();

      // initCalls run atomically inside createB20's bootstrap window: grant
      // ourselves MINT_ROLE (so the follow-up mint() succeeds) and leave the
      // supply uncapped. Both bypass the token's normal role gate only
      // during this window — see IB20Factory.createB20 dev notes.
      const initCalls: Hex[] = [
        encodeGrantRole(MINT_ROLE, address),
        encodeUpdateSupplyCap(NO_SUPPLY_CAP),
      ];

      const params = encodeAssetCreateParams(name.trim(), symbol.trim(), address, decimals);

      const createData = encodeFunctionData({
        abi: CREATE_B20_ABI,
        functionName: "createB20",
        args: [B20_VARIANT_ASSET, salt, params, initCalls],
      });

      setStatus("creating");
      const createHash = await sendTransactionAsync({
        to: B20_FACTORY_ADDRESS,
        data: withBuilderSuffix(createData),
        chainId: CHAIN_ID,
      });
      setTxHash(createHash);
      await waitForTransactionReceipt(wagmiConfig, { hash: createHash });

      const newToken = predictedAddress;
      if (!newToken) {
        throw new Error("Token created, but its address could not be confirmed. Check Basescan for the transaction.");
      }
      setTokenAddress(newToken);

      // Optional: mint the requested initial supply to the creator.
      if (initialSupply.trim().length > 0 && Number(initialSupply) > 0) {
        setStatus("minting");
        const amount = parseUnits(initialSupply.trim(), decimals);
        const mintData = encodeFunctionData({
          abi: MINT_ABI,
          functionName: "mint",
          args: [address, amount],
        });
        const mintHash = await sendTransactionAsync({
          to: newToken,
          data: withBuilderSuffix(mintData),
          chainId: CHAIN_ID,
        });
        setTxHash(mintHash);
        await waitForTransactionReceipt(wagmiConfig, { hash: mintHash });
      }

      setStatus("success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Token launch failed.";
      // A used salt means an earlier attempt with this exact form already
      // registered a token — regenerate and let the user retry.
      if (message.includes("TokenAlreadyExists")) {
        setSalt(randomSalt());
        setError("This token already exists (salt collision) — a new attempt will use a fresh address. Try again.");
      } else {
        setError(message);
      }
      setStatus("error");
    }
  }, [address, ensureBaseChain, name, symbol, decimals, salt, predictedAddress, initialSupply, sendTransactionAsync]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-lg">Launch B20 Token</span>
        <span className="text-xs px-2 py-1 rounded-full bg-[var(--mcp-surface)] border border-[var(--mcp-border)]">
          ● Base
        </span>
      </div>

      {featureActivated === false && (
        <ErrorMessage message="B20 Asset creation is not yet activated on this network." />
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm text-[var(--mcp-text-dim)]">Name</label>
        <input
          type="text"
          placeholder="My Token"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-[var(--mcp-text-dim)]">Symbol</label>
        <input
          type="text"
          placeholder="MYT"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-[var(--mcp-text-dim)]">
          Decimals ({MIN_ASSET_DECIMALS}-{MAX_ASSET_DECIMALS})
        </label>
        <input
          type="number"
          min={MIN_ASSET_DECIMALS}
          max={MAX_ASSET_DECIMALS}
          value={decimals}
          onChange={(e) => setDecimals(Number(e.target.value))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm text-[var(--mcp-text-dim)]">Initial supply (optional)</label>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          value={initialSupply}
          onChange={(e) => setInitialSupply(e.target.value)}
        />
      </div>

      <InfoBox
        rows={[
          ["Predicted address", predictedAddress ?? "—"],
          ["Variant", "Asset"],
          ["Network", "Base Mainnet"],
          ["Builder Code", "bc_2esgljny ✓"],
        ]}
      />

      {(status === "creating" || status === "minting") && <Spinner />}
      <ErrorMessage message={error} />

      <ActionButton
        disabled={!canLaunch}
        loading={status === "creating" || status === "minting"}
        loadingText={status === "creating" ? "Creating token..." : "Minting supply..."}
        onClick={handleLaunch}
      >
        Launch Token
      </ActionButton>

      {status === "success" && tokenAddress && (
        <>
          <InfoBox rows={[["Token address", tokenAddress]]} />
          {txHash && <TxLink label="View on Basescan" href={`https://basescan.org/tx/${txHash}`} />}
        </>
      )}
    </div>
  );
}
