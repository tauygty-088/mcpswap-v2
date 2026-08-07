import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // @base-org/account's Base subscription-payments code path (unused
      // by MCPSwap, which only uses wallet connect/sign-in) transitively
      // pulls in @coinbase/cdp-sdk, which in turn dynamically imports
      // Solana/x402 packages that aren't installed. Stub the whole SDK
      // out since none of it runs in MCPSwap's connect flow.
      "@coinbase/cdp-sdk": "./lib/empty-cdp-sdk.ts",
    },
  },
};

export default nextConfig;
