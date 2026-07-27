import { decodeEventLog, type Log } from "viem";
import { BUILDER_SUFFIX, TRANSFER_EVENT_ABI } from "./contracts";

/** Append the MCPSwap Base Builder Code suffix to a calldata hex string. */
export function withBuilderSuffix(data: `0x${string}`): `0x${string}` {
  return (data + BUILDER_SUFFIX.slice(2)) as `0x${string}`;
}

/**
 * Scan a transaction receipt's logs for a standard ERC-721 Transfer event
 * emitted by `contractAddress` where `to` matches `toAddress`, and return
 * the tokenId. Used to find the token that was just minted or bred, since
 * contracts don't return the tokenId directly from a payable function call.
 */
export function extractTransferTokenId(
  logs: Log[],
  contractAddress: `0x${string}`,
  toAddress: `0x${string}`,
): bigint | null {
  for (const log of logs) {
    if (log.address.toLowerCase() !== contractAddress.toLowerCase()) continue;
    try {
      const parsed = decodeEventLog({
        abi: TRANSFER_EVENT_ABI,
        data: log.data,
        topics: log.topics,
      });
      if (
        parsed.eventName === "Transfer" &&
        parsed.args.to.toLowerCase() === toAddress.toLowerCase()
      ) {
        return parsed.args.tokenId;
      }
    } catch {
      // Not a Transfer log (or not decodable) — skip.
    }
  }
  return null;
}

export type CatMetadata = {
  image: string;
  paletteLabel?: string;
};

/**
 * Decode an on-chain tokenURI of the form `data:application/json;base64,...`
 * (used by CryptoCats/OriginalCats/EvolvedCats — image is fully on-chain, no
 * IPFS/HTTP round trip needed) into a displayable image + optional label.
 */
export function decodeOnchainTokenURI(uri: string): CatMetadata | null {
  try {
    const b64 = uri.split(",")[1];
    const meta = JSON.parse(atob(b64));
    return {
      image: meta.image,
      paletteLabel: meta.attributes?.[0]?.value,
    };
  } catch {
    return null;
  }
}

export function shortHash(hash: string) {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

export function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
