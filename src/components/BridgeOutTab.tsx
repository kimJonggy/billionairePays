/**
 * BridgeOutTab — Pull paid USDC from Arc (testnet or mainnet) to any supported chain.
 *
 * Uses Circle Bridge Kit (wagmi adapter) to do a full CCTP bridge.
 * Automatically uses testnet chains when on Arc Testnet, mainnet chains on Arc Mainnet.
 *
 * References:
 *   skills/built-in/bridge-tokens/references/adapter-wagmi.md
 */

import { useState, useCallback } from 'react'
import { useAccount, useConnectorClient, useSwitchChain } from 'wagmi'
import { arcTestnet, baseSepolia, sepolia, arbitrumSepolia, base, mainnet as ethMainnet, arbitrum } from 'viem/chains'
import type { Chain, EIP1193Provider } from 'viem'
import { numberToHex } from 'viem'
import { ARC_TESTNET_ID, ARC_MAINNET_ID, isArcChain } from '../contract'
import { useUSDCBalance } from '../hooks/useUSDCBalance'
import { ConnectKitButton } from 'connectkit'

// ── Destination chains ─────────────────────────────────────────────────────
interface DestChain {
  id: number
  label: string
  viemChain: Chain
  kitChainKey: string
  explorer: string
}

const DEST_CHAINS_TESTNET: DestChain[] = [
  { id: baseSepolia.id,     label: 'Base Sepolia',     viemChain: baseSepolia,     kitChainKey: 'Base_Sepolia', explorer: 'https://sepolia.basescan.org'   },
  { id: sepolia.id,         label: 'ETH Sepolia',      viemChain: sepolia,          kitChainKey: 'ETH_Sepolia',  explorer: 'https://sepolia.etherscan.io'   },
  { id: arbitrumSepolia.id, label: 'Arbitrum Sepolia', viemChain: arbitrumSepolia,  kitChainKey: 'ARB_Sepolia',  explorer: 'https://sepolia.arbiscan.io'    },
]

const DEST_CHAINS_MAINNET: DestChain[] = [
  { id: base.id,        label: 'Base',         viemChain: base,        kitChainKey: 'Base', explorer: 'https://basescan.org'    },
  { id: ethMainnet.id,  label: 'Ethereum',     viemChain: ethMainnet,  kitChainKey: 'ETH',  explorer: 'https://etherscan.io'    },
  { id: arbitrum.id,    label: 'Arbitrum One', viemChain: arbitrum,    kitChainKey: 'ARB',  explorer: 'https://arbiscan.io'     },
]

// ── withAddChainFallback (from bridge-tokens/references/adapter-wagmi.md) ──
const isUnrecognized = (error: unknown) => {
  const e = error as { code?: number; data?: { originalError?: { code?: number } } }
  return e?.code === 4902 || e?.data?.originalError?.code === 4902
}
const ALL_CHAINS = [arcTestnet, baseSepolia, sepolia, arbitrumSepolia]

function withAddChainFallback(provider: EIP1193Provider): EIP1193Provider {
  const send = provider.request.bind(provider) as (args: { method: string; params?: unknown }) => Promise<unknown>
  const request = (async (args: { method: string; params?: unknown }) => {
    try { return await send(args) }
    catch (error) {
      if (args.method !== 'wallet_switchEthereumChain' || !isUnrecognized(error)) throw error
      const [{ chainId }] = args.params as [{ chainId: string }]
      const chain = ALL_CHAINS.find(c => c.id === Number(chainId))
      if (!chain) throw error
      await send({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: numberToHex(chain.id), chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        }],
      })
      return send(args)
    }
  }) as EIP1193Provider['request']
  return new Proxy(provider, {
    get(target, prop) {
      if (prop === 'request') return request
      const value = Reflect.get(target, prop, target) as unknown
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
}

// ── Bridge step type ───────────────────────────────────────────────────────
type BridgeStep = 'idle' | 'estimating' | 'bridging' | 'done' | 'error'

const STEP_LABEL: Record<BridgeStep, string> = {
  idle:       'Bridge USDC',
  estimating: '⏳ Estimating…',
  bridging:   '⏳ Bridging…',
  done:       '✓ Done',
  error:      'Try again',
}

const gold = 'linear-gradient(135deg,var(--gold),var(--gold2))'

export function BridgeOutTab() {
  const { address, isConnected, chainId: walletChainId } = useAccount()
  const { data: connectorClient } = useConnectorClient()
  const { switchChainAsync } = useSwitchChain()
  const { display: balDisplay } = useUSDCBalance(address)

  const isMainnet  = isArcChain(walletChainId) && walletChainId === ARC_MAINNET_ID
  const arcChainId = isMainnet ? ARC_MAINNET_ID : ARC_TESTNET_ID
  const destChains = isMainnet ? DEST_CHAINS_MAINNET : DEST_CHAINS_TESTNET

  const [dest,    setDest]    = useState<DestChain | null>(null)
  const [amount,  setAmount]  = useState('')
  const [step,    setStep]    = useState<BridgeStep>('idle')
  const [mintTx,  setMintTx]  = useState<string | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [estimate, setEstimate] = useState<string | null>(null)

  const effectiveDest = dest ?? destChains[0]
  const canBridge = isConnected && amount && parseFloat(amount) > 0 && step === 'idle'

  const handleBridge = useCallback(async () => {
    if (!connectorClient || !address || !amount || !effectiveDest) return
    setError(null)

    try {
      // Switch to Arc (testnet or mainnet) as the source
      await switchChainAsync({ chainId: arcChainId })

      const provider = window.ethereum as EIP1193Provider | undefined
      if (!provider) throw new Error('No injected wallet provider found')
      const wrappedProvider = withAddChainFallback(provider)

      // Dynamic import — bridge-kit may not be installed yet
      type EstResult  = { fees?: { amount?: string }[] }
      type AppKitType = {
        estimateBridge: (p: unknown) => Promise<EstResult>
        bridge:         (p: unknown) => Promise<unknown>
      }
      type KitModule = { AppKit: new () => AppKitType }
      type AdapterModule = { createViemAdapterFromProvider: (p: { provider: unknown }) => Promise<unknown> }

      let AppKitClass: new () => AppKitType
      let createViemAdapterFromProvider: AdapterModule['createViemAdapterFromProvider']
      try {
        const kitMod  = await import('@circle-fin/app-kit') as KitModule
        const advMod  = await import('@circle-fin/adapter-viem-v2') as AdapterModule
        AppKitClass                = kitMod.AppKit
        createViemAdapterFromProvider = advMod.createViemAdapterFromProvider
      } catch {
        throw new Error('@circle-fin/app-kit or @circle-fin/adapter-viem-v2 not installed. Run: bun add @circle-fin/app-kit @circle-fin/adapter-viem-v2')
      }

      const kit     = new AppKitClass()
      const adapter = await createViemAdapterFromProvider({ provider: wrappedProvider })

      // Arc kit chain key differs by network
      const arcKitChain = isMainnet ? 'Arc' : 'Arc_Testnet'

      // Estimate first
      setStep('estimating')
      try {
        const est = await kit.estimateBridge({
          token: 'USDC',
          from: { adapter, chain: arcKitChain },
          to:   { adapter, chain: effectiveDest.kitChainKey },
          amount,
        })
        const fee = est?.fees?.[0]?.amount
        if (fee) setEstimate(`~${fee} USDC fee`)
      } catch { /* estimate failed — proceed anyway */ }

      // Execute
      setStep('bridging')
      const result = await kit.bridge({
        token: 'USDC',
        from: { adapter, chain: arcKitChain },
        to:   { adapter, chain: effectiveDest.kitChainKey },
        amount,
      })

      type BridgeResult = { steps?: { name: string; txHash?: string }[] }
      const mintStep = (result as BridgeResult)?.steps?.find(s => s.name === 'mint')
      setMintTx(mintStep?.txHash ?? null)
      setStep('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg.includes('User rejected') ? 'Transaction cancelled.' : msg)
      setStep('error')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorClient, address, amount, effectiveDest, arcChainId, isMainnet, switchChainAsync])

  if (!isConnected) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: 24, textAlign: 'center' }}>
      <p style={{ font: '600 20px var(--serif)', color: 'var(--ink)' }}>Connect your wallet to bridge USDC</p>
      <ConnectKitButton />
    </div>
  )

  const panel: React.CSSProperties = {
    background: 'var(--s1)', border: '1px solid var(--line)',
    borderRadius: 22, overflow: 'hidden', backdropFilter: 'blur(14px)',
    maxWidth: 560,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 560 }}>

      <div style={panel}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,var(--rose),var(--gold))' }} />
        <div style={{ padding: '22px 24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 style={{ font: '700 22px var(--serif)', color: 'var(--ink)' }}>Bridge USDC out of Arc</h2>
            <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 4 }}>
              Move your USDC from Arc {isMainnet ? 'Mainnet' : 'Testnet'} to any chain via Circle CCTP.
            </p>
          </div>

          {/* Balance */}
          <div style={{ background: 'var(--s2)', borderRadius: 14, padding: '12px 16px' }}>
            <p style={{ fontSize: 12, color: 'var(--mute)' }}>Your Arc {isMainnet ? 'Mainnet' : 'Testnet'} USDC</p>
            <p style={{ font: '700 28px var(--serif)', color: 'var(--ink)', marginTop: 4 }}>{balDisplay}</p>
          </div>

          {/* Amount */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>AMOUNT (USDC)</label>
            <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px' }}>
              <input
                inputMode="decimal" value={amount}
                onChange={e => { const v = e.target.value.replace(/[^0-9.]/g, ''); if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v) }}
                placeholder="0.00"
                style={{ width: '100%', background: 'transparent', border: 'none', font: '700 36px var(--serif)', color: 'var(--ink)', outline: 'none' }}
              />
              <span style={{ fontSize: 13, color: 'var(--mute)' }}>USDC · from Arc {isMainnet ? 'Mainnet' : 'Testnet'}</span>
            </div>
          </div>

          {/* Destination */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 8, letterSpacing: '.04em' }}>DESTINATION</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {destChains.map(c => (
                <button key={c.id} onClick={() => setDest(c)} style={{
                  padding: '8px 18px', borderRadius: 99, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid var(--line)', transition: '.2s',
                  background: effectiveDest.id === c.id ? gold : 'var(--s1)',
                  color: effectiveDest.id === c.id ? '#17130e' : 'var(--mute)',
                }}>{c.label}</button>
              ))}
            </div>
          </div>

          {/* Flow */}
          <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: 'var(--mute)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: 'var(--gold)' }}>Arc {isMainnet ? 'Mainnet' : 'Testnet'}</span>
            <span>→ CCTP burn →</span>
            <span style={{ fontSize: 11, background: 'var(--s2)', borderRadius: 99, padding: '2px 8px' }}>Circle attestation</span>
            <span>→ mint →</span>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{effectiveDest.label}</span>
          </div>

          {estimate && step === 'bridging' && (
            <p style={{ fontSize: 13, color: 'var(--mute)', textAlign: 'center' }}>{estimate}</p>
          )}

          {step === 'done' && mintTx && (
            <div style={{ background: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 40%, transparent)', borderRadius: 14, padding: '14px 18px', textAlign: 'center' }}>
              <p style={{ font: '600 16px var(--serif)', color: 'var(--ok)', marginBottom: 6 }}>Bridge complete!</p>
              <a href={`${effectiveDest.explorer}/tx/${mintTx}`} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>View mint tx on {effectiveDest.label} ↗</a>
            </div>
          )}

          {(step === 'error' || error) && (
            <p style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{error}</p>
          )}

          <button
            onClick={() => { if (step === 'done' || step === 'error') { setStep('idle'); setMintTx(null); setError(null); setEstimate(null) } else void handleBridge() }}
            disabled={!canBridge && step === 'idle'}
            style={{
              background: gold, color: '#17130e', border: 0, borderRadius: 16,
              padding: '14px 0', fontSize: 15, fontWeight: 700,
              cursor: !canBridge && step === 'idle' ? 'not-allowed' : 'pointer',
              opacity: !canBridge && step === 'idle' ? 0.4 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: '.2s',
            }}
          >
            {step === 'bridging' || step === 'estimating' ? (
              <>
                <div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,.2)', borderTopColor: '#17130e', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                {STEP_LABEL[step]}
              </>
            ) : STEP_LABEL[step]}
          </button>
        </div>
      </div>

      {/* CCTP info card */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px', maxWidth: 560 }}>
        <p style={{ fontSize: 12, color: 'var(--mute)' }}>
          Powered by <a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Circle CCTP v2</a>.
          Fast mode: ~8-20s end-to-end. USDC is burned on Arc and native USDC is minted on the destination — no wrapped tokens.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
