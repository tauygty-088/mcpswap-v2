"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { base } from "wagmi/chains";
import { config } from "@/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: {
              name: "MCPSwap",
              mode: "dark",
              theme: "default",
            },
            wallet: {
              // Per Base docs (Wallet Modal): without this, <ConnectWallet>
              // connects directly with the first connector (baseAccount),
              // skipping the picker entirely. This restores the standard
              // Coinbase Wallet / MetaMask / Phantom choice modal.
              display: "modal",
            },
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
