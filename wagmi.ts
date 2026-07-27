import { http, createConfig, createStorage, cookieStorage } from "wagmi";
import { base } from "wagmi/chains";
import { baseAccount, injected, walletConnect } from "wagmi/connectors";

// WalletConnect covers wallets that aren't browser-injected on desktop,
// e.g. Phantom's EVM support, Rainbow, and mobile wallets via QR scan.
// Get a free project ID at https://cloud.reown.com and put it in .env.local
// as NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID before deploying.
const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const config = createConfig({
  chains: [base],
  connectors: [
    baseAccount({
      appName: "MCPSwap",
    }),
    injected({
      // Lets the injected connector present itself distinctly when the
      // browser extension identifies as MetaMask specifically.
      shimDisconnect: true,
    }),
    ...(walletConnectProjectId
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: false })]
      : []),
  ],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}
