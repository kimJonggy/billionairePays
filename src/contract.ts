/**
 * BillSwipe contract config — Arc Testnet + Arc Mainnet
 * Built with Arc Studio
 *
 * Mainnet deploy: set VITE_BILLSWIPE_MAINNET_ADDRESS in .env, then deploy
 * BillSwipe.sol to Arc Mainnet (chain ID 5042) from your own wallet.
 */
import artifact from '../contracts/out/BillSwipe.sol/BillSwipe.json'
import { requireChain, buildTxExplorerUrl, buildAddressExplorerUrl } from './onchain-facts'

export const BILLSWIPE_ABI = artifact.abi

// ── Chain IDs ──────────────────────────────────────────────────────────────
export const ARC_TESTNET_ID = 5042002
export const ARC_MAINNET_ID = 5042

/** All Arc chain IDs this app supports */
export const ARC_CHAIN_IDS = [ARC_TESTNET_ID, ARC_MAINNET_ID] as const
export type  ArcChainId    = typeof ARC_CHAIN_IDS[number]

// ── Per-network facts (imported from registry — never hardcoded) ───────────
const testnetFacts  = requireChain(ARC_TESTNET_ID)
const mainnetFacts  = requireChain(ARC_MAINNET_ID)

// ── USDC addresses per chain ───────────────────────────────────────────────
export const USDC_DECIMALS = 6

export const USDC_ADDRESS_BY_CHAIN: Record<ArcChainId, `0x${string}`> = {
  [ARC_TESTNET_ID]: testnetFacts.usdc!.address as `0x${string}`,
  [ARC_MAINNET_ID]: mainnetFacts.usdc!.address as `0x${string}`,
}

/** Convenience re-export for hooks that only care about testnet */
export const USDC_ADDRESS = USDC_ADDRESS_BY_CHAIN[ARC_TESTNET_ID]

// ── Contract addresses per chain ───────────────────────────────────────────
// Testnet address is fixed (deployed by Arc Studio).
// Mainnet address must be set in .env as VITE_BILLSWIPE_MAINNET_ADDRESS
// after you deploy BillSwipe.sol to Arc Mainnet from your own wallet.
const TESTNET_CONTRACT = '0x628132116771354caab1d2c4385150a1c66ce15b' as `0x${string}`
const MAINNET_CONTRACT = (import.meta.env.VITE_BILLSWIPE_MAINNET_ADDRESS ?? '') as `0x${string}`

export const BILLSWIPE_ADDRESS_BY_CHAIN: Record<ArcChainId, `0x${string}`> = {
  [ARC_TESTNET_ID]: TESTNET_CONTRACT,
  [ARC_MAINNET_ID]: MAINNET_CONTRACT,
}

/** Convenience: testnet address (unchanged) */
export const BILLSWIPE_ADDRESS = TESTNET_CONTRACT

/** Returns the contract address for the active chain, or '' if mainnet not configured. */
export function getBillSwipeAddress(chainId: number): `0x${string}` {
  if (chainId === ARC_MAINNET_ID) return MAINNET_CONTRACT
  return TESTNET_CONTRACT
}

/** Returns true when the given chain ID is a supported Arc chain. */
export function isArcChain(chainId: number | undefined): chainId is ArcChainId {
  return chainId === ARC_TESTNET_ID || chainId === ARC_MAINNET_ID
}

/** Returns true when mainnet contract address has been configured. */
export function isMainnetReady(): boolean {
  return MAINNET_CONTRACT.length > 0 && MAINNET_CONTRACT !== '0x'
}

// ── Explorer helpers ────────────────────────────────────────────────────────
export const EXPLORER_BASE_BY_CHAIN: Record<ArcChainId, string> = {
  [ARC_TESTNET_ID]: testnetFacts.explorerBase,
  [ARC_MAINNET_ID]: mainnetFacts.explorerBase,
}

export const EXPLORER_BASE = testnetFacts.explorerBase

export function txUrl(hash: string, chainId: number = ARC_TESTNET_ID) {
  return buildTxExplorerUrl(chainId, hash)
}

export function addressUrl(addr: string, chainId: number = ARC_TESTNET_ID) {
  return buildAddressExplorerUrl(chainId, addr)
}

export function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
