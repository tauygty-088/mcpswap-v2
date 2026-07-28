"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { encodeFunctionData } from "viem";
import {
  EVOLVED_ABI,
  EVOLVED_CONTRACT_ADDRESS,
  ORIGINAL_ABI,
  ORIGINAL_CONTRACT_ADDRESS,
} from "@/lib/contracts";
import { decodeOnchainTokenURI, extractTransferTokenId, withBuilderSuffix } from "@/lib/txHelpers";
import { ActionButton, ErrorMessage, InfoBox, TxLink, useEnsureBaseChain } from "./shared";

type CatSlot = {
  tokenId: string;
  image: string | null;
  label: string | null;
};

const emptySlot: CatSlot = { tokenId: "", image: null, label: null };

export function BreedTab() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { sendTransactionAsync } = useSendTransaction();
  const ensureBaseChain = useEnsureBaseChain();

  const [mintPriceWei, setMintPriceWei] = useState<bigint | null>(null);
  const [breedPriceWei, setBreedPriceWei] = useState<bigint | null>(null);

  useEffect(() => {
    if (!publicClient) return;
    (async () => {
      try {
        const [mp, bp] = await Promise.all([
          publicClient.readContract({
            address: ORIGINAL_CONTRACT_ADDRESS,
            abi: ORIGINAL_ABI,
            functionName: "currentMintPriceWei",
          }) as Promise<bigint>,
          publicClient.readContract({
            address: ORIGINAL_CONTRACT_ADDRESS,
            abi: ORIGINAL_ABI,
            functionName: "currentBreedPriceWei",
          }) as Promise<bigint>,
        ]);
        setMintPriceWei(mp);
        setBreedPriceWei(bp);
      } catch {
        setMintPriceWei(null);
        setBreedPriceWei(null);
      }
    })();
  }, [publicClient]);

  const [slotA, setSlotA] = useState<CatSlot>(emptySlot);
  const [slotB, setSlotB] = useState<CatSlot>(emptySlot);
  const [mintError, setMintError] = useState<string | null>(null);
  const [mintTxHash, setMintTxHash] = useState<`0x${string}` | undefined>();
  const [mintingSlot, setMintingSlot] = useState<"a" | "b" | null>(null);
  const { isSuccess: mintConfirmed } = useWaitForTransactionReceipt({ hash: mintTxHash });

  const [breedError, setBreedError] = useState<string | null>(null);
  const [breeding, setBreeding] = useState(false);
  const [breedTxHash, setBreedTxHash] = useState<`0x${string}` | undefined>();
  const [resultCat, setResultCat] = useState<{ image: string | null; label: string | null } | null>(null);
  const { isSuccess: breedConfirmed } = useWaitForTransactionReceipt({ hash: breedTxHash });

  const debounceRef = useRef<Record<"a" | "b", ReturnType<typeof setTimeout> | undefined>>({
    a: undefined,
    b: undefined,
  });

  async function loadThumb(
    tokenId: string,
    contractAddress: `0x${string}`,
  ): Promise<{ image: string | null; label: string | null }> {
    try {
      const uri = (await publicClient!.readContract({
        address: contractAddress,
        abi: contractAddress === EVOLVED_CONTRACT_ADDRESS ? EVOLVED_ABI : ORIGINAL_ABI,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      })) as string;
      const meta = decodeOnchainTokenURI(uri);
      if (!meta) return { image: null, label: null };
      return {
        image: meta.image,
        label: `#${tokenId}${meta.paletteLabel ? ` — ${meta.paletteLabel}` : ""}`,
      };
    } catch {
      return { image: null, label: null };
    }
  }

  function onTokenInput(which: "a" | "b", value: string) {
    const setSlot = which === "a" ? setSlotA : setSlotB;
    setSlot((s) => ({ ...s, tokenId: value }));
    clearTimeout(debounceRef.current[which]);
    if (!value.trim()) {
      setSlot((s) => ({ ...s, image: null, label: null }));
      return;
    }
    debounceRef.current[which] = setTimeout(async () => {
      const thumb = await loadThumb(value.trim(), ORIGINAL_CONTRACT_ADDRESS);
      setSlot((s) => (s.tokenId === value ? { ...s, ...thumb } : s));
    }, 500);
  }

  async function handleMint(slot: "a" | "b") {
    if (!address || !publicClient) return;
    setMintError(null);
    setMintingSlot(slot);
    try {
      const priceWei =
        (mintPriceWei ??
          ((await publicClient.readContract({
            address: ORIGINAL_CONTRACT_ADDRESS,
            abi: ORIGINAL_ABI,
            functionName: "currentMintPriceWei",
          })) as bigint));

      const calldata = encodeFunctionData({ abi: ORIGINAL_ABI, functionName: "mint", args: [] });
      await ensureBaseChain();
      const hash = await sendTransactionAsync({
        to: ORIGINAL_CONTRACT_ADDRESS,
        data: withBuilderSuffix(calldata),
        value: priceWei,
      });
      setMintTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const tokenId = extractTransferTokenId(receipt.logs, ORIGINAL_CONTRACT_ADDRESS, address);
      if (tokenId !== null) {
        const thumb = await loadThumb(tokenId.toString(), ORIGINAL_CONTRACT_ADDRESS);
        const setSlot = slot === "a" ? setSlotA : setSlotB;
        setSlot({ tokenId: tokenId.toString(), ...thumb });
      }
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setMintError(err.shortMessage || err.message || "Transaction failed");
    } finally {
      setMintingSlot(null);
    }
  }

  async function handleBreed() {
    if (!address || !publicClient) return;
    setBreedError(null);

    const tokenA = slotA.tokenId.trim();
    const tokenB = slotB.tokenId.trim();
    if (!tokenA || !tokenB) {
      setBreedError("Please enter both Token IDs.");
      return;
    }
    if (tokenA === tokenB) {
      setBreedError("Token IDs must be different.");
      return;
    }

    setBreeding(true);
    try {
      const [ownerA, ownerB, priceWei] = await Promise.all([
        publicClient.readContract({
          address: ORIGINAL_CONTRACT_ADDRESS,
          abi: ORIGINAL_ABI,
          functionName: "ownerOf",
          args: [BigInt(tokenA)],
        }) as Promise<string>,
        publicClient.readContract({
          address: ORIGINAL_CONTRACT_ADDRESS,
          abi: ORIGINAL_ABI,
          functionName: "ownerOf",
          args: [BigInt(tokenB)],
        }) as Promise<string>,
        publicClient.readContract({
          address: ORIGINAL_CONTRACT_ADDRESS,
          abi: ORIGINAL_ABI,
          functionName: "currentBreedPriceWei",
        }) as Promise<bigint>,
      ]);
      if (ownerA.toLowerCase() !== address.toLowerCase()) throw new Error(`You don't own Token #${tokenA}`);
      if (ownerB.toLowerCase() !== address.toLowerCase()) throw new Error(`You don't own Token #${tokenB}`);

      const calldata = encodeFunctionData({
        abi: ORIGINAL_ABI,
        functionName: "breed",
        args: [BigInt(tokenA), BigInt(tokenB)],
      });
      await ensureBaseChain();
      const hash = await sendTransactionAsync({
        to: ORIGINAL_CONTRACT_ADDRESS,
        data: withBuilderSuffix(calldata),
        value: priceWei,
      });
      setBreedTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const newTokenId = extractTransferTokenId(receipt.logs, EVOLVED_CONTRACT_ADDRESS, address);
      if (newTokenId !== null) {
        const thumb = await loadThumb(newTokenId.toString(), EVOLVED_CONTRACT_ADDRESS);
        setResultCat(thumb);
      }
      setSlotA(emptySlot);
      setSlotB(emptySlot);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setBreedError(err.shortMessage || err.message || "Transaction failed");
    } finally {
      setBreeding(false);
    }
  }

  const canBreed = Boolean(slotA.tokenId.trim() && slotB.tokenId.trim());

  return (
    <div className="w-full max-w-[540px] rounded-3xl border border-[var(--mcp-border)] bg-[var(--mcp-surface)] p-6">
      <div className="flex items-center justify-between mb-5">
        <span className="text-lg font-bold">Breed NFT</span>
        <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-[var(--mcp-border)] bg-black/20">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Base
        </div>
      </div>

      <div className="text-sm text-[var(--mcp-text-dim)] mb-4 leading-relaxed">
        Mint NFT 1 and NFT 2, then burn them together to breed a brand new Evolved Cat (NFT 3).
      </div>

      <InfoBox
        rows={[
          ["Mint price", mintPriceWei !== null ? "~$0.02" : "—"],
          ["Breed price", breedPriceWei !== null ? "~$0.05" : "—"],
          ["Network", "Base Mainnet"],
        ]}
      />

      <ErrorMessage message={mintError} />
      {mintConfirmed && mintTxHash && <TxLink label="✅ Minted!" href={`https://basescan.org/tx/${mintTxHash}`} />}

      <div className="flex gap-2.5 mt-3">
        {(["a", "b"] as const).map((slot) => {
          const s = slot === "a" ? slotA : slotB;
          return (
            <div key={slot} className="flex-1">
              <div className="text-xs text-[var(--mcp-text-dim)] mb-1.5">NFT {slot === "a" ? 1 : 2}</div>
              <input
                type="number"
                min={1}
                placeholder="Token ID"
                value={s.tokenId}
                onChange={(e) => onTokenInput(slot, e.target.value)}
                className="w-full text-center px-2.5 py-2 bg-black/20 border border-[var(--mcp-border)] rounded-xl text-[15px] outline-none"
              />
              {s.image && (
                <div className="flex items-center gap-2.5 mt-2.5 px-3 py-2.5 bg-black/20 rounded-xl border border-[var(--mcp-border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt="" className="w-14 h-14 rounded-lg object-cover bg-black/40 shrink-0" />
                  <span className="text-[13px] text-[var(--mcp-text-dim)]">{s.label}</span>
                </div>
              )}
              <ActionButton
                onClick={() => handleMint(slot)}
                disabled={!isConnected}
                loading={mintingSlot === slot}
                loadingText="Minting..."
                className="!w-auto !py-2.5 !px-5 !text-sm mt-2 mx-auto block"
              >
                Mint
              </ActionButton>
            </div>
          );
        })}
      </div>

      <div className="h-px bg-[var(--mcp-border)] my-6" />

      <div className="text-sm font-semibold mb-3">Breed NFT1 + NFT2 → New NFT</div>
      <ErrorMessage message={breedError} />
      {breedConfirmed && breedTxHash && <TxLink label="✅ Bred successfully!" href={`https://basescan.org/tx/${breedTxHash}`} />}

      {resultCat?.image && (
        <div className="max-w-[220px] mx-auto mt-2 flex items-center gap-2.5 px-3 py-2.5 bg-black/20 rounded-xl border border-[var(--mcp-border)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resultCat.image} alt="" className="w-14 h-14 rounded-lg object-cover bg-black/40 shrink-0" />
          <span className="text-[13px] text-[var(--mcp-text-dim)]">NFT 3{resultCat.label ? ` ${resultCat.label}` : ""}</span>
        </div>
      )}

      <ActionButton
        onClick={handleBreed}
        disabled={!isConnected || !canBreed}
        loading={breeding}
        loadingText="Breeding..."
        className="mt-4"
      >
        Breed
      </ActionButton>
    </div>
  );
}
