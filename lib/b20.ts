import { encodeAbiParameters, keccak256, toBytes, toHex, type Abi } from "viem";

// ─── B20 FACTORY (singleton precompile) ────────────────────────────────
export const B20_FACTORY_ADDRESS =
  "0xB20f000000000000000000000000000000000000" as `0x${string}`;

export const B20_FACTORY_ABI = [
  {
    type: "function",
    name: "createB20",
    stateMutability: "nonpayable",
    inputs: [
      { name: "variant", type: "uint8" },
      { name: "salt", type: "bytes32" },
      { name: "params", type: "bytes" },
      { name: "initCalls", type: "bytes[]" },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
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
] as const satisfies Abi;

export const B20_VARIANT = {
  ASSET: 0,
  STABLECOIN: 1,
} as const;

export type B20VariantKey = keyof typeof B20_VARIANT;

export const MIN_ASSET_DECIMALS = 6;
export const MAX_ASSET_DECIMALS = 18;

export const UNLIMITED_SUPPLY_CAP = (2n ** 128n - 1n).toString();

export function b20Role(roleName: string): `0x${string}` {
  return keccak256(toBytes(roleName));
}

export const MINT_ROLE = b20Role("MINT_ROLE");

export const B20_TOKEN_ABI = [
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
  {
    type: "function",
    name: "updateSupplyCap",
    stateMutability: "nonpayable",
    inputs: [{ name: "newSupplyCap", type: "uint256" }],
    outputs: [],
  },
] as const satisfies Abi;

// ─── PARAMS ENCODING (must be a single tuple — Base docs / B20FactoryLib) ──
export function encodeAssetCreateParams(
  name: string,
  symbol: string,
  initialAdmin: `0x${string}`,
  decimals: number,
): `0x${string}` {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "version", type: "uint8" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "initialAdmin", type: "address" },
          { name: "decimals", type: "uint8" },
        ],
      },
    ],
    [[1, name, symbol, initialAdmin, decimals]],
  );
}

export function encodeStablecoinCreateParams(
  name: string,
  symbol: string,
  initialAdmin: `0x${string}`,
  currency: string,
): `0x${string}` {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "version", type: "uint8" },
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "initialAdmin", type: "address" },
          { name: "currency", type: "string" },
        ],
      },
    ],
    [[1, name, symbol, initialAdmin, currency]],
  );
}

export function randomSalt(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}
