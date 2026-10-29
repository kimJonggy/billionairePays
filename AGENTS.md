# BillSwipe

> Built with Arc Studio - money-powered apps in minutes

Project memory for BillSwipe — upload bills, bored billionaires swipe right to pay them in USDC on Arc Testnet.

---

## What This App Does

BillSwipe lets anyone upload a bill (rent, medical, groceries, etc.) with a 280-char pitch. Payers browse a swipe deck (right = pay, left = pass) and pay directly in USDC with no custody. No self-pay, no overpay. Split funding via `contribute()` is also supported.

## Contract Deployments

| Contract | Network | Address | Explorer |
|---|---|---|---|
| BillSwipe v1 (old) | Arc Testnet | `0x73e9de0f1afe843d68b5ce8921d2fdf0294d4b69` | https://explorer.testnet.arc.io/address/0x73e9de0f1afe843d68b5ce8921d2fdf0294d4b69 |
| BillSwipe v2 (payoutAddress) | Arc Testnet | `0x628132116771354caab1d2c4385150a1c66ce15b` | https://explorer.testnet.arc.io/address/0x628132116771354caab1d2c4385150a1c66ce15b |
| BillSwipe | Arc Mainnet | _not yet deployed — see below_ | https://explorer.arc.io |

## Mainnet Deploy (manual — Arc Studio does not deploy to mainnet)

1. Build the contract: `forge build`
2. Deploy from your own wallet (replace `$PRIVATE_KEY` with your key, never paste it):
   ```
   forge create contracts/BillSwipe.sol:BillSwipe \
     --rpc-url https://rpc.mainnet.arc.io \
     --private-key $PRIVATE_KEY \
     --constructor-args <owner_address> \
     --broadcast
   ```
   The RPC URL above is from `onchain-facts.ts` (Arc mainnet, chain ID 5042).
3. Copy the deployed address and set it in `.env`:
   ```
   VITE_BILLSWIPE_MAINNET_ADDRESS=0x<your_deployed_address>
   ```
4. Restart the dev server (`bun run dev`) — Vite reads `.env` only at startup.
5. The app will automatically switch to mainnet contract/explorer when the connected wallet is on Arc Mainnet.

## Chain & Token

- Arc Testnet: chain ID 5042002, RPC: https://rpc.testnet.arc.io, explorer: https://explorer.testnet.arc.io
- Arc Mainnet: chain ID 5042, RPC: https://rpc.mainnet.arc.io, explorer: https://explorer.arc.io
- USDC: `0x3600000000000000000000000000000000000000` (6 decimals ERC-20) — same address on both
- Gas token IS USDC on Arc — no separate gas token needed

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, framer-motion
- Web3: wagmi v2, viem v2, ConnectKit
- Contract: Solidity 0.8.28 + OpenZeppelin 5.6.1, Foundry, Cancun EVM
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals)

## Key Files

- `src/App.tsx` — top-level shell (tabs, header, dark mode, confetti)
- `src/contract.ts` — contract address, ABI import, explorer helpers
- `src/types.ts` — shared TypeScript types, CATEGORIES, status map
- `src/hooks/useBills.ts` — event indexer (getLogs for BillCreated/BillPaid)
- `src/hooks/useBillActions.ts` — payBill, contribute, createBill, cancelBill
- `src/hooks/useUSDCBalance.ts` — ERC-20 balanceOf hook
- `src/components/SwipeCard.tsx` — draggable swipe card with framer-motion
- `src/components/SwipeTab.tsx` — swipe deck, filters, button controls
- `src/components/PaySheet.tsx` — bottom sheet for full pay or contribute
- `src/components/UploadTab.tsx` — bill upload form + IPFS metadata
- `src/components/MyBillsTab.tsx` — requester view of their bills
- `src/components/LeaderboardTab.tsx` — top payers + live activity feed
- `src/components/Confetti.tsx` — confetti burst on successful payment
- `contracts/BillSwipe.sol` — main contract
- `contracts/test/BillSwipe.*.t.sol` — 92 Foundry tests (unit + fuzz + invariant)

## Contract Notes

- `payBill(id, txNote)` pays the full remaining amount in one tx. Payer must approve USDC first.
- `contribute(id, amount, txNote)` pays partial. Also requires prior USDC approval.
- `createBill(amount, metadataURI, deadline, payoutAddress)` — pass `address(0)` to default to `msg.sender`. metadataURI is IPFS JSON with {title, pitch, category, imageUrl}.
- `feeBps` defaults to 0 (no fee). Max 200 bps (2%). Set via `setFee(bps, recipient)` by owner.
- Owner is the platform deployer wallet for Mode 1 deploy. Use Mode 2 (self-deploy) to own admin functions.
- `renounceOwnership()` is blocked while paused (prevents permanent brick).

## Running Tests

```bash
bun run contracts:test
# or
forge test
```

## Event Indexing

The frontend indexes `BillCreated` and `BillPaid` events from a 100k-block lookback window from head. No separate indexer process — purely in-browser via `getLogs`.

## Decisions & Assumptions

- Bill metadata (title, pitch, category, imageUrl) stored on IPFS; only amount/status/URI on-chain.
- IPFS upload falls back to a `data:` URI if no `VITE_NFT_STORAGE_KEY` env var is set.
- Leaderboard and activity feed are derived entirely from on-chain events — no off-chain DB used.
- Supabase (spec item) was not implemented; all gamification is on-chain-event-driven.
- ERC-8004 Billionaire Agent was not implemented in this pass — the spec calls for it as an optional extension.
- Dark mode implemented via CSS class on `<html>` with CSS custom properties.
- Confetti fires on bill creation (redirects to My Bills) and on successful pay.
