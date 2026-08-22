"use client";

import { useState } from "react";
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownDisconnect } from "@coinbase/onchainkit/wallet";
import { Avatar, Name, Identity, Address } from "@coinbase/onchainkit/identity";
import { SwapTab } from "@/components/tabs/SwapTab";
import { TokensTab } from "@/components/tabs/TokensTab";
import { LaunchB20Tab } from "@/components/tabs/LaunchB20Tab";
import { MintTab } from "@/components/tabs/MintTab";
import { DeployTab } from "@/components/tabs/DeployTab";
import { BreedTab } from "@/components/tabs/BreedTab";

const TABS = ["Swap", "Tokens", "Launch B20", "NFT Tools", "Deploy Contract", "Breed NFT"] as const;
type Tab = (typeof TABS)[number];

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Swap");

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--mcp-border)] relative">
        <div
          className="absolute inset-x-0 bottom-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--mcp-accent), #9b8cff, transparent)",
          }}
        />
        <div className="w-full flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 shrink-0">
            <img
              src="/logo.webp"
              alt=""
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="font-semibold text-lg tracking-tight">MCPSwap</span>
          </div>

          <nav className="hidden sm:flex items-center gap-1 bg-[var(--mcp-surface)] border border-[var(--mcp-border)] rounded-full p-1 absolute left-1/2 -translate-x-1/2">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                  activeTab === tab
                    ? "bg-[var(--mcp-accent)] text-white"
                    : "text-[var(--mcp-text-dim)] hover:text-[var(--mcp-text)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>

          <div className="shrink-0">
            <Wallet>
              <ConnectWallet>
                <Avatar className="h-6 w-6" />
                <Name />
              </ConnectWallet>
              <WalletDropdown>
                <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                  <Avatar />
                  <Name />
                  <Address />
                </Identity>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </div>
        </div>

        <nav className="sm:hidden flex gap-1 overflow-x-auto px-4 pb-3">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm border ${
                activeTab === tab
                  ? "bg-[var(--mcp-accent)] text-white border-transparent"
                  : "text-[var(--mcp-text-dim)] border-[var(--mcp-border)]"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        {activeTab === "Swap" && <SwapTab />}
        {activeTab === "Tokens" && <TokensTab />}
        {activeTab === "Launch B20" && <LaunchB20Tab />}
        {activeTab === "NFT Tools" && <MintTab />}
        {activeTab === "Deploy Contract" && <DeployTab />}
        {activeTab === "Breed NFT" && <BreedTab />}
      </main>
    </div>
  );
}
