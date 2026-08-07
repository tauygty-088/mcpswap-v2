# MCPSwap v2

An onchain app on Base mainnet combining token swaps and NFT minting, built with Next.js, OnchainKit, and wagmi.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS
- wagmi + viem, preconfigured for Base mainnet (chain ID 8453)
- `@coinbase/onchainkit` for wallet connection and swap tooling
- Three wallet connectors: Base Account (Sign in with Base), injected (MetaMask / browser wallets), WalletConnect (Phantom, mobile wallets via QR)

## Features

| Tab | Status | Description |
|---|---|---|
| **Swap** | Live | Token swaps (ETH / USDC / DAI) built on OnchainKit's `buildSwapTransaction` API, with the Base Builder Code suffix appended to every transaction for onchain attribution. |
| **Mint NFT** | Live | Mints from the CryptoCatsV3 contract, with live on-chain Chainlink ETH/USD pricing. |
| **Deploy Contract** | Live | Deploys a new NFT collection via the collection factory contract. |
| **Breed NFT** | Live | Breeds two NFTs from the OriginalCats contract into a new EvolvedCats token. |

All four tabs share a single wallet connection and consistent design system (`#0A0B0D` background, Base Blue `#0052FF` accent, `#1E2128` borders).

## Base Builder Code

All onchain transactions across every tab append this project's Builder Code (`bc_2esgljny`) to the calldata per the [ERC-8021 attribution standard](https://blog.base.dev/builder-codes-and-erc-8021-fixing-onchain-attribution), so transaction volume is correctly attributed to MCPSwap in Base Builder Rewards.

The suffix is defined once in `lib/contracts.ts` and applied via `withBuilderSuffix()` in `lib/txHelpers.ts`.

## Getting Started

```bash
npm install
npm run dev
```

Set the following environment variables (see `.env.local.example` or Vercel → Settings → Environment Variables):

- `NEXT_PUBLIC_ONCHAINKIT_API_KEY` — Coinbase Developer Platform API key
- (any additional keys required by your wallet connector setup)

## Deployment

```bash
npx vercel
```

Follow the CLI prompts (log in, choose a project name, e.g. `mcpswap-v2`). Vercel will return a preview URL like `mcpswap-v2.vercel.app` for testing before promoting to production.

## Known build notes

`next.config.ts` includes a few module aliases (`@x402/*`, `@coinbase/cdp-sdk`) that intentionally stub out an unused code path (Base subscription payments) which otherwise pulls in unnecessary Solana packages and breaks the build. Do not remove these aliases.

## Roadmap

1. Test wallet connectors end-to-end (Base Account, MetaMask, WalletConnect) on a Vercel preview deployment.
2. Verify swap transactions include the Builder Code suffix on Basescan.
3. Once verified, cut over the production domain from the legacy GitHub Pages build to this app.
