/**
 * useGatewayPay — Cross-chain USDC payment via Circle Gateway.
 *
 * Flow:
 *  1. User has USDC on a source chain (Base Sepolia/Base, ETH Sepolia/ETH, etc.).
 *  2. We build a GatewayWallet burn intent: source → Arc (testnet or mainnet), recipient = bill.requester.
 *  3. User signs the EIP-712 typed data in their wallet.
 *  4. We POST to Gateway API → receive attestation + mint signature.
 *  5. We switch wallet to Arc and call gatewayMint on GatewayMinter.
 *  6. USDC lands directly in the requester's wallet on Arc.
 *
 * References:
 *   skills/built-in/use-gateway/references/evm-to-evm-browser-wallet.md
 */

import { useState, useCallback } from 'react'
import { useAccount, useConnectorClient } from 'wagmi'
import {
  createWalletClient, createPublicClient, custom,
  getContract, parseUnits, zeroAddress,
} from 'viem'
import { arcTestnet, baseSepolia, sepolia, arbitrumSepolia, base, mainnet as ethMainnet, arbitrum } from 'viem/chains'
import type { Chain, EIP1193Provider } from 'viem'
import { getProtocolContractByName, getUsdc } from '@/onchain-facts'
import { ARC_TESTNET_ID, ARC_MAINNET_ID, isArcChain } from '../contract'
import { arcMainnet } from '../config'

// ── Supported source chains ────────────────────────────────────────────────
export interface SourceChain {
  id: number
  label: string
  viemChain: Chain
  gatewayDomain: number
  usdcAddress: `0x${string}`
  bridgeChainKey: string // Circle bridge-kit chain identifier
}

/** Testnet source chains (pair with Arc Testnet destination) */
export const SOURCE_CHAINS_TESTNET: SourceChain[] = [
  {
    id: baseSepolia.id,
    label: 'Base Sepolia',
    viemChain: baseSepolia,
    gatewayDomain: 6,
    usdcAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    bridgeChainKey: 'Base_Sepolia',
  },
  {
    id: sepolia.id,
    label: 'Ethereum Sepolia',
    viemChain: sepolia,
    gatewayDomain: 0,
    usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    bridgeChainKey: 'ETH_Sepolia',
  },
  {
    id: arbitrumSepolia.id,
    label: 'Arbitrum Sepolia',
    viemChain: arbitrumSepolia,
    gatewayDomain: 3,
    usdcAddress: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    bridgeChainKey: 'ARB_Sepolia',
  },
]

/** Mainnet source chains (pair with Arc Mainnet destination) */
export const SOURCE_CHAINS_MAINNET: SourceChain[] = [
  {
    id: base.id,
    label: 'Base',
    viemChain: base,
    gatewayDomain: 6,
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    bridgeChainKey: 'Base',
  },
  {
    id: ethMainnet.id,
    label: 'Ethereum',
    viemChain: ethMainnet,
    gatewayDomain: 0,
    usdcAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    bridgeChainKey: 'ETH',
  },
  {
    id: arbitrum.id,
    label: 'Arbitrum One',
    viemChain: arbitrum,
    gatewayDomain: 3,
    usdcAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    bridgeChainKey: 'ARB',
  },
]

/** Convenience — backward compat alias, defaults to testnet list */
export const SOURCE_CHAINS = SOURCE_CHAINS_TESTNET

// ── Gateway constants (resolved per network from registry) ─────────────────
const GW_WALLET_TESTNET  = (getProtocolContractByName('GatewayWallet', 'testnet')?.address  ?? '0x0077777d7EBA4688BDeF3E311b846F25870A19B9') as `0x${string}`
const GW_MINTER_TESTNET  = (getProtocolContractByName('GatewayMinter', 'testnet')?.address  ?? '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B') as `0x${string}`
const GW_WALLET_MAINNET  = (getProtocolContractByName('GatewayWallet', 'mainnet')?.address  ?? '0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE') as `0x${string}`
const GW_MINTER_MAINNET  = (getProtocolContractByName('GatewayMinter', 'mainnet')?.address  ?? '0x2222222d7164433c4C09B0b0D809a9b52C04C205') as `0x${string}`

const GATEWAY_API_TESTNET = 'https://gateway-api-testnet.circle.com/v1/transfer'
const GATEWAY_API_MAINNET = 'https://gateway-api.circle.com/v1/transfer'

const ARC_USDC_TESTNET = getUsdc(ARC_TESTNET_ID)!.address as `0x${string}`
const ARC_USDC_MAINNET = getUsdc(ARC_MAINNET_ID)!.address as `0x${string}`

// Max fee the payer is willing to pay (2 USDC in 6-decimal units)
const MAX_FEE = 2_000000n
const ARC_CCTP_DOMAIN = 26

const gatewayMinterAbi = [
  {
    type: 'function' as const, name: 'gatewayMint',
    inputs: [{ name: 'attestationPayload', type: 'bytes' }, { name: 'signature', type: 'bytes' }],
    outputs: [], stateMutability: 'nonpayable',
  },
] as const

// ── EIP-712 typed data (must not be modified) ──────────────────────────────
const TYPED_DATA = {
  domain: { name: 'GatewayWallet', version: '1' },
  types: {
    EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }],
    TransferSpec: [
      { name: 'version',              type: 'uint32'  },
      { name: 'sourceDomain',         type: 'uint32'  },
      { name: 'destinationDomain',    type: 'uint32'  },
      { name: 'sourceContract',       type: 'bytes32' },
      { name: 'destinationContract',  type: 'bytes32' },
      { name: 'sourceToken',          type: 'bytes32' },
      { name: 'destinationToken',     type: 'bytes32' },
      { name: 'sourceDepositor',      type: 'bytes32' },
      { name: 'destinationRecipient', type: 'bytes32' },
      { name: 'sourceSigner',         type: 'bytes32' },
      { name: 'destinationCaller',    type: 'bytes32' },
      { name: 'value',                type: 'uint256' },
      { name: 'salt',                 type: 'bytes32' },
      { name: 'hookData',             type: 'bytes'   },
    ],
    BurnIntent: [
      { name: 'maxBlockHeight', type: 'uint256' },
      { name: 'maxFee',         type: 'uint256' },
      { name: 'spec',           type: 'TransferSpec' },
    ],
  } as const,
  primaryType: 'BurnIntent' as const,
}

// ── Helpers ────────────────────────────────────────────────────────────────
function toBytes32(addr: `0x${string}`): `0x${string}` {
  return `0x${addr.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}
function randomHex32(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`
}

async function ensureChain(provider: EIP1193Provider, chain: Chain) {
  const hex = `0x${chain.id.toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  } catch {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: hex, chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: chain.rpcUrls.default.http,
        blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
      }],
    })
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  }
}

// ── Hook ───────────────────────────────────────────────────────────────────
export type GatewayStep =
  | 'idle' | 'switching-source' | 'building-intent'
  | 'signing' | 'submitting-gateway' | 'switching-arc'
  | 'minting' | 'done' | 'error'

export function useGatewayPay() {
  const { data: connectorClient }  = useConnectorClient()
  const { chainId: walletChainId } = useAccount()
  const [step,    setStep]    = useState<GatewayStep>('idle')
  const [mintTx,  setMintTx]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  // Resolve mainnet vs testnet based on the current wallet chain
  const isMainnet = isArcChain(walletChainId) && walletChainId === ARC_MAINNET_ID
  const arcViemChain   = isMainnet ? arcMainnet   : arcTestnet
  const GATEWAY_WALLET = isMainnet ? GW_WALLET_MAINNET : GW_WALLET_TESTNET
  const GATEWAY_MINTER = isMainnet ? GW_MINTER_MAINNET : GW_MINTER_TESTNET
  const GATEWAY_API_URL= isMainnet ? GATEWAY_API_MAINNET : GATEWAY_API_TESTNET
  const ARC_USDC       = isMainnet ? ARC_USDC_MAINNET   : ARC_USDC_TESTNET

  // Expose the right source chain list to callers
  const sourceChainList = isMainnet ? SOURCE_CHAINS_MAINNET : SOURCE_CHAINS_TESTNET

  const reset = useCallback(() => {
    setStep('idle'); setMintTx(null); setError(null)
  }, [])

  const pay = useCallback(async (
    sourceChain: SourceChain,
    amountUsdc: string,            // e.g. "50.00"
    recipientAddress: `0x${string}`, // bill requester
  ) => {
    if (!connectorClient) { setError('Wallet not connected'); return }
    if (!connectorClient.account) { setError('No account'); return }

    // Use window.ethereum as the EIP-1193 provider (wagmi v2 pattern)
    const eth = window.ethereum as EIP1193Provider | undefined
    if (!eth) { setError('No injected wallet found'); return }

    try {
      setError(null)
      const account = connectorClient.account.address

      // 1. Switch to source chain
      setStep('switching-source')
      await ensureChain(eth, sourceChain.viemChain)

      // 2. Build burn intent
      setStep('building-intent')
      const value = parseUnits(amountUsdc, 6)
      const burnIntent = {
        maxBlockHeight: 2n ** 256n - 1n,
        maxFee: MAX_FEE,
        spec: {
          version: 1,
          sourceDomain:         sourceChain.gatewayDomain,
          destinationDomain:    ARC_CCTP_DOMAIN,
          sourceContract:       toBytes32(GATEWAY_WALLET),
          destinationContract:  toBytes32(GATEWAY_MINTER),
          sourceToken:          toBytes32(sourceChain.usdcAddress),
          destinationToken:     toBytes32(ARC_USDC),
          sourceDepositor:      toBytes32(account),
          destinationRecipient: toBytes32(recipientAddress),
          sourceSigner:         toBytes32(account),
          destinationCaller:    toBytes32(zeroAddress),
          value,
          salt:     randomHex32(),
          hookData: '0x' as const,
        },
      }

      // 3. Sign EIP-712
      setStep('signing')
      const sourceWalletClient = createWalletClient({
        account, chain: sourceChain.viemChain, transport: custom(eth),
      })
      const signature = await sourceWalletClient.signTypedData({
        ...TYPED_DATA,
        message: burnIntent,
      })

      // 4. Submit to Gateway API
      setStep('submitting-gateway')
      const apiRes = await fetch(GATEWAY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ burnIntent, signature }],
          (_k, v: unknown) => typeof v === 'bigint' ? v.toString() : v),
      })
      if (!apiRes.ok) {
        const body = await apiRes.text()
        throw new Error(`Gateway API error ${apiRes.status}: ${body}`)
      }
      const { attestation, signature: mintSig } = await apiRes.json() as {
        attestation: `0x${string}`
        signature: `0x${string}`
      }

      // 5. Switch to Arc (testnet or mainnet)
      setStep('switching-arc')
      await ensureChain(eth, arcViemChain)

      // 6. Mint on Arc
      setStep('minting')
      const arcWalletClient = createWalletClient({
        account, chain: arcViemChain, transport: custom(eth),
      })
      const arcPublicClient = createPublicClient({
        chain: arcViemChain, transport: custom(eth),
      })
      const minter = getContract({
        address: GATEWAY_MINTER, abi: gatewayMinterAbi, client: arcWalletClient,
      })
      const mintHash = await minter.write.gatewayMint([attestation, mintSig], { account })
      await arcPublicClient.waitForTransactionReceipt({ hash: mintHash })

      setMintTx(mintHash)
      setStep('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('User rejected') ? 'Transaction cancelled.' : msg)
      setStep('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorClient, GATEWAY_WALLET, GATEWAY_MINTER, GATEWAY_API_URL, ARC_USDC, arcViemChain])

  return {
    pay, step, mintTx, error, reset, sourceChainList,
    isPending: step !== 'idle' && step !== 'done' && step !== 'error',
  }
}
