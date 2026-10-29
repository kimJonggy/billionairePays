# BillSwipe

Upload your bills. Bored billionaires swipe right to pay them — in real USDC on Arc Testnet.

Built with [Arc Studio](https://studio.arc.io)

---

## What It Does

BillSwipe has two roles. **Requesters** upload a bill (rent, medical, groceries, etc.) with a 280-character pitch, an amount, a deadline, and an optional photo. **Payers** browse a swipe deck: drag right (or press →) to pay, drag left (or press ←) to pass. Payments go directly from payer to requester — the contract never holds funds. Split/partial funding via contributions is also supported.

Gamification includes a live leaderboard of top payers, a live activity feed of payments, and badges like "Serial Savior" and "Midnight Benefactor" earned from on-chain payment history.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Chain | Arc Testnet + Mainnet (chain IDs 5042002 / 5042) — USDC is the native gas token |
| USDC | `0x3600000000000000000000000000000000000000` (6 decimals) |
| Contract | Solidity 0.8.28, OpenZeppelin 5.6.1, Foundry, Cancun EVM |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, framer-motion |
| Wallet | wagmi v2, viem v2, ConnectKit + Circle Modular Wallets (passkey / ERC-4337) |
| Metadata | IPFS (via nft.storage, with data URI fallback) |
| Circle Kits | App Kit (Unified Balance, Onramp, Swap), Bridge Kit (CCTP forwarding) |
| Backend | Bun + Express: chain indexer, x402 Pitch Review, SCP webhooks, Onramp sessions |

---

## Deployed Contract

| Contract | Network | Address |
|---|---|---|
| BillSwipe | Arc Testnet | `0x73e9de0f1afe843d68b5ce8921d2fdf0294d4b69` |

Explorer: https://explorer.testnet.arc.io/address/0x73e9de0f1afe843d68b5ce8921d2fdf0294d4b69

---

## Prerequisites

- [Bun](https://bun.sh) 1.x
- [Foundry](https://book.getfoundry.sh) (`forge`)
- A browser wallet (MetaMask) with Arc Testnet added

---

## Getting Started

```bash
# Install dependencies
bun install

# Run the dev server
bun run dev
```

Visit http://localhost:5173 in your browser.

To get testnet USDC, use the **Get test USDC** button in the Arc Studio sidebar, or connect your wallet and request from the Arc testnet faucet.

---

## Running the Backend

The backend indexer and API server must run alongside the frontend dev server:

```bash
bun run server
```

It starts on port 3001 and is proxied by Vite at `/api`. Keep both running during development.

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `VITE_BILLSWIPE_ADDRESS` | BillSwipe contract address (Arc Testnet) | Yes |
| `VITE_BILLSWIPE_MAINNET_ADDRESS` | BillSwipe contract address (Arc Mainnet) | Mainnet only |
| `VITE_NFT_STORAGE_KEY` | nft.storage API key for IPFS metadata upload | No — falls back to a data URI |
| `VITE_CLIENT_KEY` | Circle Modular Wallets client key (passkey login) | Wallets tab |
| `VITE_CLIENT_URL` | Circle Modular Wallets client URL (pre-filled) | Wallets tab |
| `VITE_ONRAMP_WIDGET_BASE_URL` | Circle Onramp widget base URL (sandbox pre-filled) | Onramp feature |
| `VITE_CIRCLE_APP_ID` | Circle User-Controlled Wallets App ID | UCW feature |
| `CIRCLE_API_KEY` | Circle Standard Developer API Key (backend only) | Onramp + Webhooks |
| `RESEND_API_KEY` | Resend email API key (optional webhook notifications) | No |
| `VITE_DEFAULT_FORWARD_CHAIN` | Default destination chain for CCTP forwarding | No |
| `RPC_PROXY_BASE_URL` | Arc Studio RPC proxy base URL | Optional outside Arc Studio |
| `RPC_PROXY_TOKEN` | Arc Studio RPC proxy token | Optional outside Arc Studio |

---

## Build & Test

```bash
# Production build
bunx vite build

# Compile contracts
bun run contracts:build

# Run Foundry tests (92 unit + fuzz + invariant tests)
bun run contracts:test

# Lint + typecheck
bun run check
```

---

## Architecture

- **On-chain:** Bill state (amount, funded, status, payer, deadline) lives entirely on the `BillSwipe` contract. Metadata (title, pitch, category, image) is stored on IPFS; only the URI is on-chain.
- **Indexing:** The frontend scans the last 100,000 blocks of `BillCreated` and `BillPaid` events directly in the browser — no backend indexer required.
- **Payments:** `payBill` pays the full remaining amount; `contribute` pays a partial amount. Both require a prior USDC `approve` call. Funds go directly to the requester.
- **No custody:** The contract never holds USDC. No oracle. No off-chain signer.

---

## Demo Flow (60–90 seconds)

1. Connect MetaMask to Arc Testnet and get test USDC from the sidebar.
2. **Upload** tab: set a title ("November Rent"), category (Rent), amount ($50), pitch ("Landlord won't budge. Please help."), and submit.
3. **Swipe** tab: your bill appears in the deck. Swipe right (or press →) to open the pay sheet.
4. Confirm the USDC approval + payment in your wallet.
5. Confetti fires. Check **My Bills** for the receipt, or **Leaderboard** to see your name.

---

## Testnet Only

This app is deployed on Arc Testnet. No real money is involved.
Footer on the app: "Testnet only. No real money."
