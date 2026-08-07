// BUILD_ID: providers-v2-wagmi-dataSuffix
"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Attribution } from "ox/erc8021";
import { base } from "wagmi/chains";
import { WagmiProvider, createConfig, http } from "wagmi";

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ["bc_2esgljny"],
});

const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  dataSuffix: DATA_SUFFIX,
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          chain={base}
          config={{
            appearance: {
              mode: "dark",
              theme: "base",
              name: "MCPSwap",
              logo: process.env.NEXT_PUBLIC_APP_ICON,
            },
            wallet: {
              display: "modal",
            },
          }}
          miniKit={{ enabled: true }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
