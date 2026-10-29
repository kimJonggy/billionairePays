/**
 * wagmi configuration — Arc Testnet + Arc Mainnet
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { defineChain } from 'viem'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { requireChain } from './onchain-facts'

// ── Arc Mainnet (chain ID 5042) ───────────────────────────────────────────
const arcMainnetFacts = requireChain(5042)
export const arcMainnet = defineChain({
  id:   arcMainnetFacts.chainId,
  name: arcMainnetFacts.name,
  nativeCurrency: {
    name:     'USDC',
    symbol:   'USDC',
    decimals: arcMainnetFacts.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: { http: arcMainnetFacts.rpcUrls as [string, ...string[]] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: arcMainnetFacts.explorerBase },
  },
})

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id,  arcTestnet.rpcUrls.default.http[0])
registerChain(arcMainnet.id,  arcMainnetFacts.rpcUrls[0])

export { arcTestnet }

export const ARC_TESTNET_CHAIN_ID = arcTestnet.id   // 5042002
export const ARC_MAINNET_CHAIN_ID = arcMainnet.id   // 5042

export const config = createConfig({
  chains: [arcTestnet, arcMainnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]:  http(),
    [arcMainnet.id]:  http(arcMainnetFacts.rpcUrls[0]),
    [mainnet.id]:     http(), // ENS resolution
  },
})
