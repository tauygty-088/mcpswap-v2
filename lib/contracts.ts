import type { Abi } from "viem";

// ─── NETWORK / PROXY ────────────────────────────────────
export const CHAIN_ID = 8453; // Base mainnet
export const PROXY = "https://mcpswap-proxy.kdlcfa.workers.dev";

// Builder code suffix appended to calldata so dashboard.base.org attributes
// these transactions to MCPSwap's Base Builder Code. Carried over verbatim
// from the previous HTML build — do not change.
export const BUILDER_CODE = "bc_2esgljny";
export const BUILDER_SUFFIX =
  "0x62635f326573676c6a6e790b0080218021802180218021802180218021" as `0x${string}`;

// ─── MINT: Crypto Cats (live ERC-721, on-chain Chainlink ETH/USD pricing) ──
export const CRYPTOCATS_CONTRACT =
  "0x2d255Ee1E17aa9b86c9f3736E79011907e1166FB" as `0x${string}`;
// currentPriceWeiPerMint() view function selector — read directly since the
// exact function name isn't in a published ABI we're relying on.
export const CURRENT_PRICE_SELECTOR = "0xf9a9d510" as `0x${string}`;
// mint(uint256 quantity) selector, used for both CryptoCats and any
// self-deployed MCPSwap collection (same mint signature).
export const MINT_QTY_SELECTOR = "0xa0712d68";

// ─── DEPLOY: Collection factory ────────────────────────────────────────────
export const FACTORY_CONTRACT_ADDRESS =
  "0x2cAb7f96DB17404A32E116AdA47EF298b2CF09bf" as `0x${string}`;

export const FACTORY_ABI = [
  {
    type: "function",
    name: "createCollection",
    stateMutability: "payable",
    inputs: [
      { name: "name_", type: "string" },
      { name: "symbol_", type: "string" },
      { name: "baseURI_", type: "string" },
      { name: "maxSupply_", type: "uint256" },
      { name: "mintPriceWei_", type: "uint256" },
    ],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "platformFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "CollectionCreated",
    inputs: [
      { name: "contractAddress", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "maxSupply", type: "uint256", indexed: false },
      { name: "mintPrice", type: "uint256", indexed: false },
    ],
  },
] as const satisfies Abi;

// mintPrice() view — fixed price set by the creator at deploy time, used by
// self-deployed collections from the Deploy tab.
export const MINT_PRICE_ABI = [
  {
    type: "function",
    name: "mintPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const satisfies Abi;

// ─── BREED: OriginalCats (mint + breed) / EvolvedCats (breed results) ──────
export const ORIGINAL_CONTRACT_ADDRESS =
  "0xCBEeC96c641Aa13830FCA52257C37F62Ca16e8a6" as `0x${string}`;
export const EVOLVED_CONTRACT_ADDRESS =
  "0x5A9386B40e302008469D29285E3C68dAa0883a11" as `0x${string}`;

export const ORIGINAL_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "breed",
    stateMutability: "payable",
    inputs: [
      { name: "tokenIdA", type: "uint256" },
      { name: "tokenIdB", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "currentMintPriceWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "currentBreedPriceWei",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

export const EVOLVED_ABI = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const satisfies Abi;

// Standard ERC-721 Transfer event, shared by every collection here — used to
// pull the minted/bred tokenId back out of a transaction receipt.
export const TRANSFER_EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
] as const satisfies Abi;

// transferFrom(address,address,uint256) — used by the Deploy tab's "Send"
// step to hand a freshly minted NFT to a recipient address.
export const TRANSFER_FROM_ABI = [
  {
    type: "function",
    name: "transferFrom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
] as const satisfies Abi;
