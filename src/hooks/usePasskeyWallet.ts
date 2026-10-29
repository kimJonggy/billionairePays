import { useState, useCallback } from 'react'
import {
  WebAuthnMode,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  encodeTransfer,
  ContractAddress,
} from '@circle-fin/modular-wallets-core'
import { createPublicClient } from 'viem'
import { createBundlerClient, toWebAuthnAccount } from 'viem/account-abstraction'
import { arcTestnet } from 'viem/chains'
import type { P256Credential, SmartAccount } from 'viem/account-abstraction'
import { parseUsdc, formatUsdc as fmtUsdc } from '@/onchain-money'

const CLIENT_KEY = import.meta.env.VITE_CLIENT_KEY as string | undefined
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL as string | undefined

export type PasskeyState = 'idle' | 'registering' | 'logging-in' | 'ready' | 'sending' | 'error'

function getTransports() {
  if (!CLIENT_KEY || !CLIENT_URL) throw new Error('VITE_CLIENT_KEY and VITE_CLIENT_URL are required. Complete Console setup first.')
  const passkeyTransport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY)
  const modularTransport = toModularTransport(`${CLIENT_URL}/arcTestnet`, CLIENT_KEY)
  const publicClient     = createPublicClient({ chain: arcTestnet, transport: modularTransport })
  const bundlerClient    = createBundlerClient({ chain: arcTestnet, transport: modularTransport })
  return { passkeyTransport, publicClient, bundlerClient }
}

export function usePasskeyWallet() {
  const [state,   setState]   = useState<PasskeyState>('idle')
  const [address, setAddress] = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [txHash,  setTxHash]  = useState<string | null>(null)
  const [account, setAccount] = useState<SmartAccount | null>(null)

  const isConfigured  = Boolean(CLIENT_KEY && CLIENT_URL)
  const isRegistered  = state === 'ready' && address !== null
  const isLoggedIn    = isRegistered

  const register = useCallback(async (username: string) => {
    setState('registering'); setError(null); setTxHash(null)
    try {
      const { passkeyTransport, publicClient } = getTransports()
      const credential: P256Credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode: WebAuthnMode.Register,
        username,
      })
      localStorage.setItem('billswipe_passkey', JSON.stringify(credential))
      const acc = await toCircleSmartAccount({
        client: publicClient,
        owner: toWebAuthnAccount({ credential }),
      })
      setAccount(acc); setAddress(acc.address); setState('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setState('error')
    }
  }, [])

  const login = useCallback(async () => {
    setState('logging-in'); setError(null); setTxHash(null)
    try {
      const { passkeyTransport, publicClient } = getTransports()
      const credential: P256Credential = await toWebAuthnCredential({
        transport: passkeyTransport,
        mode: WebAuthnMode.Login,
      })
      localStorage.setItem('billswipe_passkey', JSON.stringify(credential))
      const acc = await toCircleSmartAccount({
        client: publicClient,
        owner: toWebAuthnAccount({ credential }),
      })
      setAccount(acc); setAddress(acc.address); setState('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setState('error')
    }
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('billswipe_passkey')
    setAccount(null); setAddress(null); setState('idle'); setError(null); setTxHash(null)
  }, [])

  const sendUsdc = useCallback(async (to: string, amountUsd: string): Promise<string> => {
    if (!account) { setError('No wallet loaded'); setState('error'); return '' }
    setState('sending'); setError(null); setTxHash(null)
    try {
      const { bundlerClient } = getTransports()
      const amount   = parseUsdc(amountUsd)
      const callData = encodeTransfer(to as `0x${string}`, ContractAddress.ArcTestnet_USDC, amount)
      const userOpHash = await bundlerClient.sendUserOperation({
        account,
        calls: [callData],
        paymaster: true,
      })
      const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
      setTxHash(receipt.transactionHash); setState('ready')
      return receipt.transactionHash
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setState('error')
      return ''
    }
  }, [account])

  const restoreFromStorage = useCallback(async () => {
    const raw = localStorage.getItem('billswipe_passkey')
    if (!raw) return
    try {
      const { publicClient } = getTransports()
      const credential = JSON.parse(raw) as P256Credential
      const acc = await toCircleSmartAccount({
        client: publicClient,
        owner: toWebAuthnAccount({ credential }),
      })
      setAccount(acc); setAddress(acc.address); setState('ready')
    } catch { /* silently ignore stale credential */ }
  }, [])

  const formatUsdc = (raw: bigint) => fmtUsdc(raw)

  return {
    state, address, error, txHash,
    isConfigured, isRegistered, isLoggedIn,
    register, login, logout, sendUsdc, restoreFromStorage, formatUsdc,
  }
}
