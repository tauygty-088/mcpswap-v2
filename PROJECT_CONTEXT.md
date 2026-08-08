# MCPSwap v2 — Project Context (read this first)

## What this is
Base mainnet app combining NFT minting + token swap. Next.js App Router + TypeScript + Tailwind + wagmi/viem + OnchainKit.

## Where the real source lives
- **Local machine**: `~/Desktop/mcpswap-v2` — this is the ONLY correct source folder.
- **GitHub**: https://github.com/tauygty-088/mcpswap-v2 (main branch, kept in sync with local)
- **Do NOT confuse with**: `~/Desktop/gobase/miniapp` — that's a different, unrelated project (GoBase, a payment gateway). Never mix the two.
- **Live production site** (`mcpswap.xyz`) currently runs an OLD v1 build via GitHub Pages (repo `tauygty-088.github.io`), NOT this v2 code. v2 has not been deployed anywhere yet — not to Vercel, not to mcpswap.xyz.

## Structure
- `app/page.tsx` — main page, 4 tabs: Swap / Mint NFT / Deploy Contract / Breed NFT
- `components/tabs/SwapTab.tsx` — swap UI, **fully custom-built and working** (see "Swap architecture" below)
- `components/tabs/MintTab.tsx`, `DeployTab.tsx`, `BreedTab.tsx` — fully implemented, not placeholders
- `lib/contracts.ts` — contract addresses, chain config, `BUILDER_SUFFIX` constant (Base Builder Code `bc_2esgljny`, ERC-8021 format: `0x62635f326573676c6a6e790b0080218021802180218021802180218021`)
- `lib/txHelpers.ts` — `withBuilderSuffix()` helper, appends the builder code to every transaction's calldata

## Key rule: Builder Code attribution
Every onchain transaction (mint, deploy, breed, AND swap) must append the Builder Code suffix via `withBuilderSuffix()` from `lib/txHelpers.ts`, so volume is attributed to this project in Base Builder Rewards.

**Why Swap is custom-built instead of using OnchainKit's `<Swap>` component:** confirmed by reading the actual `@coinbase/onchainkit@1.1.2` source — the `<Swap>` component signs internally via wagmi's `useSendTransaction` inside `SwapProvider`, with zero prop/hook to inject a `dataSuffix`. There is no supported way to attach Builder Code to `<Swap>`. So `SwapTab.tsx` calls `buildSwapTransaction()` from `@coinbase/onchainkit/api` directly, appends `withBuilderSuffix()` to the calldata, and sends via wagmi's `useSendTransaction` manually — same pattern as Mint/Deploy/Breed.

## Swap architecture — READ BEFORE TOUCHING SwapTab.tsx

**CRITICAL: `useAggregator` MUST be `true` in every `buildSwapTransaction()` / `getSwapQuote()` call in this file.**

- `useAggregator: false` (CDP-native) routes through **0x Protocol's Exchange Proxy** (`0xdef1c0ded9bec7f1a1670819833240f027b25eff`), which has an allowance/approve target mismatch on this setup — caused every token → ETH swap to revert on-chain (ETH → token always worked since no approve is needed for native ETH, which is why the bug looked "one-directional"). Confirmed by testing both settings live on mainnet.
- `useAggregator: true` routes through **Uniswap V3** — verified working end-to-end on Base mainnet, including token → ETH, with Builder Code correctly attributed (UI shows "Builder Code: bc_2esgljny ✓", tx confirmed on Basescan).
- **Do not switch this back to `false`** without re-testing a real token → ETH swap on mainnet first.

**Approve-then-swap flow (for ERC-20 sources, e.g. USDC → ETH):**
1. `buildSwapTransaction()` → may return `approveTransaction` (ERC-20 approve) + `transaction` (the swap itself).
2. If `approveTransaction` present: send it (with `withBuilderSuffix()` on its calldata too), then `await waitForTransactionReceipt()` — **must wait for the approve to actually mine**, not just for the wallet to sign.
3. **Re-quote after approve mines**: call `buildSwapTransaction()` again before sending the swap tx, since the first quote can go stale during the approve-mining wait (belt-and-suspenders safeguard, kept even though the `useAggregator: true` fix was the actual root cause of the observed bug).
4. Send the swap tx (`withBuilderSuffix()` applied), wait for receipt, mark confirmed.

## Known gotchas
- `next.config.ts` has module aliases for `@x402/*` and `@coinbase/cdp-sdk` — these intentionally stub out an unused code path. Do not remove them, removing breaks the build (pulls in unnecessary Solana packages).
- GitHub account for this repo is `tauygty-088`. The machine has a SEPARATE GitHub account `liducfa` also configured — always run `gh auth status` before pushing to confirm you're authenticated as `tauygty-088`, or pushes will fail with a 403 permission error.
- `AGENTS.md` and `CLAUDE.md` at repo root are stray AI-agent config files that keep reappearing untracked — safe to delete, do NOT commit them:
```bash
  rm -f AGENTS.md CLAUDE.md
```
- `components/tabs/TokenSelect.tsx` is an **orphan file**, not imported anywhere (SwapTab.tsx defines its own local `TokenSelect` function instead). Dead code, safe to delete:
```bash
  rm -f components/tabs/TokenSelect.tsx
```
- Dev server sometimes needs a hard restart (`Ctrl+C` then `npm run dev` again) after editing `SwapTab.tsx` — a stale Turbopack process can otherwise serve old code silently.

## Current status (update this section as work progresses)
- [x] Swap tab built with Builder Code attribution
- [x] Token → ETH swap bug found and fixed (`useAggregator: true`, see "Swap architecture" above) — verified working on mainnet
- [x] Repo cleaned once before, but stray files (`AGENTS.md`, `CLAUDE.md`, `TokenSelect.tsx`) have crept back — **still need deleting + committing**
- [ ] Commit the `useAggregator: true` fix + stray file cleanup, then push to GitHub
- [ ] Verify Builder Code suffix on Basescan / builder-code-checker.vercel.app for the record (UI already confirms attribution live, but hasn't been independently double-checked via the checker tool)
- [ ] Deployed to Vercel for testing
- [ ] Production domain (mcpswap.xyz) still points to old v1 — not yet cut over

## Commands for the assistant to run first, before touching any code

Run these yourself (the user will just say "go ahead" — don't ask them to run these manually unless a command fails). Note: in a chat-only interface (no direct terminal access), give these as copy-paste blocks for the user to run and paste output back, one command at a time.

**1. Confirm you're in the right folder and it's not GoBase:**
```bash
cd ~/Desktop/mcpswap-v2 && pwd && ls
```
Expected: you should see `app/ components/ lib/ package.json wagmi.ts README.md PROJECT_CONTEXT.md`.
If you see `PaymentPanel.tsx`, `QrScanner.tsx`, or `ReceivePanel.tsx` anywhere — STOP, you are in the wrong project (that's GoBase). Do not proceed.

**2. Confirm local code matches what's on GitHub (catch any uncommitted changes):**
```bash
cd ~/Desktop/mcpswap-v2 && git status && git log --oneline -5
```

**3. Confirm no stray/legacy files crept back in:**
```bash
cd ~/Desktop/mcpswap-v2 && ls -la | grep -E "AGENTS|CLAUDE|fix_vi" && echo "FOUND STRAY FILES — remove before continuing" || echo "clean"
```

**4. Confirm GitHub auth is the correct account before any push:**
```bash
gh auth status
```
Expected: logged in as `tauygty-088`. If it shows `liducfa` or "not logged in", run `gh auth login` and pick `tauygty-088` before pushing — pushes as the wrong account fail with a 403.

**5. Sanity-check the swap config hasn't regressed:**
```bash
cd ~/Desktop/mcpswap-v2 && grep -n "useAggregator" components/tabs/SwapTab.tsx
```
Expected: all matches say `useAggregator: true,`. If any say `false`, that's the token→ETH revert bug — see "Swap architecture" above.

**6. After finishing a change — commit and push (only if the user asked you to push):**
```bash
cd ~/Desktop/mcpswap-v2 && git add -A && git commit -m "DESCRIBE THE CHANGE HERE" && git push origin main
```

**7. Quick local test before pushing anything:**
```bash
cd ~/Desktop/mcpswap-v2 && npm install && npm run dev
```
Then check `http://localhost:3000` manually — the assistant can't browse it, so ask the user to confirm it looks right if this matters.
