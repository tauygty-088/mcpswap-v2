import type { Abi } from "viem";

// ─── UNISWAP V3 ON BASE (verified on BaseScan, not guessed) ───────────────
export const UNISWAP_V3_FACTORY =
  "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" as `0x${string}`;
export const POSITION_MANAGER =
  "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as `0x${string}`;
export const WETH_BASE = "0x4200000000000000000000000000000000000006" as `0x${string}`;

// 1% fee tier — standard choice for a brand-new, unproven token pair.
export const POOL_FEE = 10000;

// Full-range ticks for the 1% tier (tick spacing 200). Using the full range
// avoids any tick-math we'd have to get exactly right ourselves — the pool
// just behaves like a constant-product AMM across the whole price curve.
export const MIN_TICK = -887200;
export const MAX_TICK = 887200;

export const POSITION_MANAGER_ABI = [
  {
    type: "function",
    name: "createAndInitializePoolIfNecessary",
    stateMutability: "payable",
    inputs: [
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "sqrtPriceX96", type: "uint160" },
    ],
    outputs: [{ name: "pool", type: "address" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "token0", type: "address" },
          { name: "token1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickLower", type: "int24" },
          { name: "tickUpper", type: "int24" },
          { name: "amount0Desired", type: "uint256" },
          { name: "amount1Desired", type: "uint256" },
          { name: "amount0Min", type: "uint256" },
          { name: "amount1Min", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
    ],
    outputs: [
      { name: "tokenId", type: "uint256" },
      { name: "liquidity", type: "uint128" },
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "refundETH",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "multicall",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const satisfies Abi;

export const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

/**
 * Sorts a token/WETH pair the way Uniswap requires (token0 < token1 by
 * address) and lines up each side's deposit amount to match.
 */
export function sortTokensAndAmounts(
  tokenAddress: `0x${string}`,
  tokenAmount: bigint,
  wethAmount: bigint,
): { token0: `0x${string}`; token1: `0x${string}`; amount0: bigint; amount1: bigint } {
  const tokenIsFirst = tokenAddress.toLowerCase() < WETH_BASE.toLowerCase();
  return tokenIsFirst
    ? { token0: tokenAddress, token1: WETH_BASE, amount0: tokenAmount, amount1: wethAmount }
    : { token0: WETH_BASE, token1: tokenAddress, amount0: wethAmount, amount1: tokenAmount };
}

/**
 * sqrtPriceX96 = sqrt(amount1 / amount0) * 2^96, computed entirely in
 * integer math (no floating point) so there's no precision loss for large
 * token amounts. Uses Newton's method for the integer square root.
 */
export function computeSqrtPriceX96(amount0: bigint, amount1: bigint): bigint {
  if (amount0 <= 0n || amount1 <= 0n) {
    throw new Error("Both pool amounts must be greater than zero.");
  }
  const numerator = amount1 * (1n << 192n);
  const ratioX192 = numerator / amount0;
  return sqrtBigInt(ratioX192);
}

function sqrtBigInt(value: bigint): bigint {
  if (value < 0n) throw new Error("Cannot take the square root of a negative number.");
  if (value < 2n) return value;
  let x0 = value;
  let x1 = (x0 + 1n) >> 1n;
  while (x1 < x0) {
    x0 = x1;
    x1 = (x0 + value / x0) >> 1n;
  }
  return x0;
}
