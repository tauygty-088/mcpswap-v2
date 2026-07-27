// Intentionally empty. @base-org/account's Base subscription-payments code
// path (unused by MCPSwap) transitively imports @coinbase/cdp-sdk, which in
// turn dynamically imports Solana/x402 packages that aren't installed here.
// next.config.ts aliases "@coinbase/cdp-sdk" to this stub so that unused
// branch never actually executes anything real. Do not add real exports.
export class CdpClient {
  constructor() {
    throw new Error(
      "@coinbase/cdp-sdk is stubbed out in this build (unused Base subscription-payments code path).",
    );
  }
}
