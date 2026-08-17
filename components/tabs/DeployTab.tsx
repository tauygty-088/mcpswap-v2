"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { decodeEventLog, encodeFunctionData, parseEther } from "viem";
import {
  CHAIN_ID,
  FACTORY_ABI,
  FACTORY_CONTRACT_ADDRESS,
  MINT_PRICE_ABI,
  MINT_QTY_SELECTOR,
  PROXY,
  TRANSFER_FROM_ABI,
} from "@/lib/contracts";
import { extractTransferTokenId, withBuilderSuffix } from "@/lib/txHelpers";
import { ActionButton, ErrorMessage, InfoBox, TxLink } from "./shared";

async function pinFileToIPFS(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${PROXY}/ipfs/image`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Image upload to IPFS failed (${res.status})`);
  return data.cid;
}

async function pinJSONToIPFS(json: unknown): Promise<string> {
  const res = await fetch(`${PROXY}/ipfs/json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(json),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Metadata upload to IPFS failed (${res.status})`);
  return data.cid;
}

export function DeployTab() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();

  // ── Step 1: Deploy ──
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("1000");
  const [price, setPrice] = useState("");
  const [deployError, setDeployError] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployTxHash, setDeployTxHash] = useState<`0x${string}` | undefined>();
  const [deployedAddress, setDeployedAddress] = useState<`0x${string}` | null>(null);
  const [deployedName, setDeployedName] = useState<string | null>(null);
  const { isSuccess: deployConfirmed } = useWaitForTransactionReceipt({ hash: deployTxHash });

  // ── Step 2: Mint from the newly deployed collection ──
  const [mintQty, setMintQty] = useState(1);
  const [mintPriceWei, setMintPriceWei] = useState<bigint>(0n);
  const [mintError, setMintError] = useState<string | null>(null);
  const [isMinting, setIsMinting] = useState(false);
  const [mintTxHash, setMintTxHash] = useState<`0x${string}` | undefined>();
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);
  const { isSuccess: mintConfirmed } = useWaitForTransactionReceipt({ hash: mintTxHash });

  // ── Step 3: Send the minted NFT ──
  const [recipient, setRecipient] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendTxHash, setSendTxHash] = useState<`0x${string}` | undefined>();
  const { isSuccess: sendConfirmed } = useWaitForTransactionReceipt({ hash: sendTxHash });

  function onImageSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setDeployError("Image must be under 10MB");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  const canDeploy = Boolean(imageFile && name.trim() && symbol.trim() && parseInt(supply) > 0);

  async function handleDeploy() {
    if (!address || !publicClient) return;
    setDeployError(null);
    if (!imageFile) { setDeployError("Please upload a collection image"); return; }
    const trimmedName = name.trim();
    const trimmedSymbol = symbol.trim().toUpperCase();
    const maxSupply = parseInt(supply);
    const priceEth = parseFloat(price) || 0;
    if (!trimmedName || !trimmedSymbol || !maxSupply) {
      setDeployError("Please fill in all fields");
      return;
    }

    setIsDeploying(true);
    try {
      const imageCid = await pinFileToIPFS(imageFile);
      const metadataCid = await pinJSONToIPFS({
        name: trimmedName,
        symbol: trimmedSymbol,
        description: `${trimmedName} — created on MCPSwap`,
        image: `ipfs://${imageCid}`,
      });
      const baseURI = `ipfs://${metadataCid}`;
      const priceWei = parseEther(String(priceEth || 0));

      let platformFee = 0n;
      try {
        platformFee = (await publicClient.readContract({
          address: FACTORY_CONTRACT_ADDRESS,
          abi: FACTORY_ABI,
          functionName: "platformFee",
        })) as bigint;
      } catch {
        // Factory may not charge a platform fee — default to 0.
      }

      const calldata = encodeFunctionData({
        abi: FACTORY_ABI,
        functionName: "createCollection",
        args: [trimmedName, trimmedSymbol, baseURI, BigInt(maxSupply), priceWei],
      });

      const hash = await sendTransactionAsync({
        to: FACTORY_CONTRACT_ADDRESS,
        data: withBuilderSuffix(calldata),
        value: platformFee,
        chainId: CHAIN_ID,
      });
      setDeployTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      let newAddr: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== FACTORY_CONTRACT_ADDRESS.toLowerCase()) continue;
        try {
          const parsed = decodeEventLog({ abi: FACTORY_ABI, data: log.data, topics: log.topics });
          if (parsed.eventName === "CollectionCreated") {
            newAddr = parsed.args.contractAddress as `0x${string}`;
            break;
          }
        } catch {
          // not the event we're looking for
        }
      }
      if (newAddr) {
        setDeployedAddress(newAddr);
        setDeployedName(trimmedName);
      }
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setDeployError(err.shortMessage || err.message || "Deploy failed. Please try again.");
    } finally {
      setIsDeploying(false);
    }
  }

  async function loadMintStepPrice(contractAddress: `0x${string}`) {
    if (!publicClient) return;
    try {
      const result = (await publicClient.readContract({
        address: contractAddress,
        abi: MINT_PRICE_ABI,
        functionName: "mintPrice",
      })) as bigint;
      setMintPriceWei(result);
    } catch {
      // Collection may have been deployed with 0 price, or the read
      // genuinely failed — default to 0 (shown as "Free mint") rather
      // than leaving the mint step stuck on a stale/guessed value.
      setMintPriceWei(0n);
    }
  }

  // Load the mint price as soon as a collection is deployed.
  useEffect(() => {
    if (deployedAddress) loadMintStepPrice(deployedAddress); // eslint-disable-line react-hooks/set-state-in-effect -- fetches external on-chain price once the collection address is known
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployedAddress]);

  async function handleMintStep() {
    if (!address || !deployedAddress) return;
    setMintError(null);
    setIsMinting(true);
    try {
      const totalWei = mintPriceWei * BigInt(mintQty);
      const data = withBuilderSuffix(
        (MINT_QTY_SELECTOR + mintQty.toString(16).padStart(64, "0")) as `0x${string}`,
      );
      const hash = await sendTransactionAsync({
        to: deployedAddress,
        data,
        value: totalWei,
        chainId: CHAIN_ID,
      });
      setMintTxHash(hash);
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      const tokenId = extractTransferTokenId(receipt.logs, deployedAddress, address);
      if (tokenId !== null) setMintedTokenId(tokenId);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setMintError(err.shortMessage || err.message || "Mint failed");
    } finally {
      setIsMinting(false);
    }
  }

  async function handleSendStep() {
    if (!address || !deployedAddress || mintedTokenId === null) return;
    setSendError(null);
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      setSendError("Please enter a valid wallet address");
      return;
    }
    setIsSending(true);
    try {
      const calldata = encodeFunctionData({
        abi: TRANSFER_FROM_ABI,
        functionName: "transferFrom",
        args: [address, recipient as `0x${string}`, mintedTokenId],
      });
      const hash = await sendTransactionAsync({
        to: deployedAddress,
        data: withBuilderSuffix(calldata),
        chainId: CHAIN_ID,
      });
      setSendTxHash(hash);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setSendError(err.shortMessage || err.message || "Send failed");
    } finally {
      setIsSending(false);
    }
  }

  const mintStepUnlocked = Boolean(deployedAddress);
  const sendStepUnlocked = mintedTokenId !== null;
  const mintTotalEth = Number(mintPriceWei * BigInt(mintQty)) / 1e18;

  return (
    <div className="w-full max-w-[440px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-lg font-bold">Deploy Contract</span>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Collection Image</div>
      <label
        htmlFor="deploy-image-input"
        className="block w-[110px] h-[110px] mx-auto mb-4 rounded-2xl bg-black/20 border border-[var(--mcp-border)] cursor-pointer overflow-hidden flex items-center justify-center hover:border-[var(--mcp-accent)] transition-colors"
      >
        {imagePreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagePreview} alt="Collection" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-2">
            <div className="text-xl mb-1">+</div>
            <div className="text-[10px] text-[var(--mcp-text-dim)] leading-tight">Click to upload</div>
          </div>
        )}
      </label>
      <input
        id="deploy-image-input"
        type="file"
        accept="image/png,image/jpeg,image/gif"
        className="hidden"
        onChange={onImageSelected}
      />

      <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Name</div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        placeholder="My Awesome Collection"
        className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none mb-3"
      />

      <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Token Symbol</div>
      <input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        maxLength={10}
        placeholder="MYNFT"
        className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none mb-3 uppercase"
      />

      <div className="flex gap-2.5 mb-1">
        <div className="flex-1">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Max Supply</div>
          <input
            type="number"
            min={1}
            max={1000000}
            value={supply}
            onChange={(e) => setSupply(e.target.value)}
            className="w-full text-center px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold outline-none"
          />
        </div>
        <div className="flex-1">
          <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Mint Price (ETH)</div>
          <input
            type="number"
            min={0}
            step={0.0001}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.001"
            className="w-full text-center px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold outline-none placeholder:text-[var(--mcp-text-dim)] placeholder:font-normal"
          />
        </div>
      </div>

      <InfoBox
        rows={[
          ["Network", "Base Mainnet"],
          ["You pay", "Deploy gas only"],
          ["Ownership", "100% yours — no admin access for MCPSwap"],
        ]}
      />

      <ErrorMessage message={deployError} />
      {deployConfirmed && deployTxHash && (
        <TxLink
          label={deployedAddress ? `🎉 Deployed at ${deployedAddress.slice(0, 8)}...${deployedAddress.slice(-6)}` : "🎉 Deployed!"}
          href={`https://basescan.org/tx/${deployTxHash}`}
        />
      )}

      <ActionButton
        onClick={handleDeploy}
        disabled={!isConnected || !canDeploy || Boolean(deployedAddress)}
        loading={isDeploying}
        loadingText="Deploying..."
        className="mt-1"
      >
        {deployedAddress ? "✅ Collection deployed" : "Deploy Collection"}
      </ActionButton>

      {/* Step 2: Mint */}
      <div className="mt-5 pt-5 border-t border-[var(--mcp-border)]">
        <div className="flex items-center gap-2 mb-3.5">
          <div
            className={`w-[22px] h-[22px] rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 ${
              mintStepUnlocked
                ? "bg-[var(--mcp-accent)] border-[var(--mcp-accent)] text-white"
                : "bg-black/20 border-[var(--mcp-border)] text-[var(--mcp-text-dim)]"
            }`}
          >
            2
          </div>
          <span className={`text-sm font-semibold ${mintStepUnlocked ? "text-[var(--mcp-text)]" : "text-[var(--mcp-text-dim)]"}`}>
            {deployedName ? `Mint from ${deployedName}` : "Mint from your new collection"}
          </span>
        </div>

        <div className="flex gap-2.5 mb-3">
          <div className="flex-1">
            <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Quantity</div>
            <input
              type="number"
              min={1}
              max={20}
              value={mintQty}
              disabled={!mintStepUnlocked}
              onChange={(e) => setMintQty(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
              className="w-full text-center px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold outline-none disabled:opacity-50"
            />
          </div>
          <div className="flex-1">
            <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Total Price</div>
            <div className="px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-lg font-bold text-center">
              {mintStepUnlocked ? (mintTotalEth === 0 ? "Free mint" : `${mintTotalEth} ETH`) : "—"}
            </div>
          </div>
        </div>

        <ErrorMessage message={mintError} />
        {mintConfirmed && mintTxHash && <TxLink label="🎉 Minted!" href={`https://basescan.org/tx/${mintTxHash}`} />}

        <ActionButton
          onClick={handleMintStep}
          disabled={!isConnected || !mintStepUnlocked || mintedTokenId !== null}
          loading={isMinting}
          loadingText="Minting..."
        >
          {mintedTokenId !== null ? "✅ Minted" : "🎨 Mint NFT"}
        </ActionButton>
      </div>

      {/* Step 3: Send */}
      <div className="mt-5 pt-5 border-t border-[var(--mcp-border)]">
        <div className="flex items-center gap-2 mb-3.5">
          <div
            className={`w-[22px] h-[22px] rounded-full border flex items-center justify-center text-[11px] font-bold shrink-0 ${
              sendStepUnlocked
                ? "bg-[var(--mcp-accent)] border-[var(--mcp-accent)] text-white"
                : "bg-black/20 border-[var(--mcp-border)] text-[var(--mcp-text-dim)]"
            }`}
          >
            3
          </div>
          <span className={`text-sm font-semibold ${sendStepUnlocked ? "text-[var(--mcp-text)]" : "text-[var(--mcp-text-dim)]"}`}>
            Send your NFT
          </span>
        </div>

        <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">Recipient wallet address</div>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          disabled={!sendStepUnlocked}
          placeholder="0x..."
          className="w-full px-3.5 py-2.5 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-sm outline-none mb-3 font-mono disabled:opacity-50"
        />

        <ErrorMessage message={sendError} />
        {sendConfirmed && sendTxHash && <TxLink label="🎉 Sent!" href={`https://basescan.org/tx/${sendTxHash}`} />}

        <ActionButton
          onClick={handleSendStep}
          disabled={!isConnected || !sendStepUnlocked}
          loading={isSending}
          loadingText="Sending..."
        >
          Send
        </ActionButton>
      </div>
    </div>
  );
}
