import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so this can deploy to Cloudflare Pages the same way as
  // the old single-file index.html — no server runtime needed since
  // MCPSwap has no API routes / server actions, everything runs client-side.
  output: "export",
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
