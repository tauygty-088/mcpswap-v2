"use client";

import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "wagmi/chains";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
