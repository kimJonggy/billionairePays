// SwapSheet: pay a bill by swapping any EVM token to USDC first (Circle App Kit Swap)
// Feature 6: "Pay with Any Token"
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatUnits } from 'viem'
import type { Bill } from '../types'
import { USDC_DECIMALS } from '../contract'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit, type SwapEstimate } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { useConnectorClient } from 'wagmi'

const appKit = new AppKit()

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 38 }
const GOLD   = 'linear-gradient(135deg,var(--gold),var(--gold2))'

// Tokens swappable on Arc Testnet via Circle Swap Kit (testnet only supports Arc_Testnet)
const SWAP_TOKENS = ['USDC', 'EURC'] as const
type SwapToken = typeof SWAP_TOKENS[number]

interface SwapSheetProps {
  bill:      Bill | null
  onClose:   () => void
  onSuccess: () => void
}

export function SwapSheet({ bill, onClose, onSuccess }: SwapSheetProps) {
  const { address } = useAccount()
  const chainId     = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const { data: connectorClient } = useConnectorClient()

  const [tokenIn,    setTokenIn]    = useState<SwapToken>('EURC')
  const [estimate,   setEstimate]   = useState<SwapEstimate | null>(null)
  const [step,       setStep]       = useState<'idle' | 'estimating' | 'reviewing' | 'swapping' | 'done' | 'error'>('idle')
  const [errorMsg,   setErrorMsg]   = useState('')
  const [txHash,     setTxHash]     = useState('')

  const remDisplay = bill
    ? parseFloat(formatUnits(bill.amount - bill.funded, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 })
    : '0.00'
  const remAmount = bill
    ? parseFloat(formatUnits(bill.amount - bill.funded, USDC_DECIMALS)).toFixed(6)
    : '0'

  async function getAdapter() {
    if (!connectorClient) throw new Error('Wallet not connected')
    // Switch to Arc Testnet (5042002) which is the only testnet Swap Kit supports
    const arcTestnetId = 5042002
    if (chainId !== arcTestnetId) {
      await switchChainAsync({ chainId: arcTestnetId })
    }
    // The wagmi connector client's transport is an EIP-1193 provider
    const provider = connectorClient.transport as unknown as EIP1193Provider
    return await createViemAdapterFromProvider({ provider })
  }

  async function handleEstimate() {
    if (!bill || !address) return
    setStep('estimating')
    setErrorMsg('')
    try {
      const adapter = await getAdapter()
      // On Arc Testnet, USDC IS the native asset, so USDC->USDC is a no-op.
      // We estimate the swap from tokenIn -> USDC on Arc_Testnet.
      if (tokenIn === 'USDC') {
        // USDC->USDC is a pass-through; synthesise a matching estimate shape
        const passthrough = { estimatedOutput: { amount: remAmount, token: 'USDC' }, fees: [] as readonly never[] } as unknown as SwapEstimate
        setEstimate(passthrough)
        setStep('reviewing')
        return
      }
      const est = await appKit.estimateSwap({
        from:     { adapter, chain: 'Arc_Testnet' },
        tokenIn,
        tokenOut: 'USDC',
        amountIn: remAmount,
      })
      setEstimate(est)
      setStep('reviewing')
    } catch (e) {
      setErrorMsg(String(e instanceof Error ? e.message : e))
      setStep('error')
    }
  }

  async function handleSwap() {
    if (!bill || !address || !estimate) return
    setStep('swapping')
    setErrorMsg('')
    try {
      const adapter = await getAdapter()
      if (tokenIn === 'USDC') {
        // tokenIn is already USDC — just close and let the caller pay directly
        onSuccess()
        return
      }
      const result = await appKit.swap({
        from:     { adapter, chain: 'Arc_Testnet' },
        tokenIn,
        tokenOut: 'USDC',
        amountIn: remAmount,
        config:   { slippageBps: 100 },
      })
      setTxHash(result.txHash ?? '')
      setStep('done')
    } catch (e) {
      setErrorMsg(String(e instanceof Error ? e.message : e))
      setStep('error')
    }
  }

  function handleClose() {
    setStep('idle')
    setEstimate(null)
    setErrorMsg('')
    setTxHash('')
    onClose()
  }

  const isOpen = bill !== null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* backdrop */}
          <motion.div
            key="swap-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 40, backdropFilter: 'blur(4px)' }}
          />

          {/* sheet */}
          <motion.div
            key="swap-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={SPRING}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'var(--bg)', borderRadius: '24px 24px 0 0',
              border: '1px solid var(--line)', borderBottom: 'none',
              padding: '28px 24px 40px', zIndex: 50,
              maxWidth: 480, margin: '0 auto',
            }}
          >
            {/* handle */}
            <div style={{ width: 40, height: 4, background: 'var(--line)', borderRadius: 2, margin: '0 auto 24px' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ font: '700 20px var(--serif)' }}>Pay with Any Token</h2>
              <button onClick={handleClose}
                style={{ background: 'var(--s2)', border: 0, borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: 'var(--mute)', fontSize: 20 }}>
                ×
              </button>
            </div>

            {/* notice */}
            <div style={{ background: 'rgba(233,200,128,.08)', border: '1px solid rgba(233,200,128,.25)', borderRadius: 12, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: 'var(--mute)', lineHeight: 1.5 }}>
              Swaps on Arc Testnet are routed through Circle Swap Kit (via LiFi or Circle). USDC and EURC are the supported tokens on Arc Testnet. After swapping you will receive USDC which you can then pay this bill with.
            </div>

            {/* bill summary */}
            <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px', marginBottom: 18 }}>
              <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 4 }}>BILL REMAINING</p>
              <p style={{ font: '700 32px var(--serif)' }}>${remDisplay} <span style={{ fontSize: 14, color: 'var(--mute)' }}>USDC</span></p>
              {bill?.title && <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 4 }}>{bill.title}</p>}
            </div>

            {/* token selector */}
            {step === 'idle' && (
              <>
                <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 10 }}>Select token to swap from:</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {SWAP_TOKENS.map(t => (
                    <button key={t} onClick={() => setTokenIn(t)} style={{
                      flex: 1, padding: '11px 0', borderRadius: 12, fontWeight: 700, fontSize: 14,
                      cursor: 'pointer', border: '2px solid',
                      borderColor: tokenIn === t ? 'var(--gold)' : 'var(--line)',
                      background: tokenIn === t ? 'rgba(233,200,128,.12)' : 'var(--s1)',
                      color: tokenIn === t ? 'var(--gold)' : 'var(--ink)',
                    }}>
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={() => void handleEstimate()}
                  style={{ width: '100%', background: GOLD, color: '#17130e', border: 0, borderRadius: 16, padding: '15px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                  Get Estimate →
                </button>
              </>
            )}

            {step === 'estimating' && (
              <p style={{ textAlign: 'center', color: 'var(--mute)', padding: '30px 0' }}>Fetching swap quote…</p>
            )}

            {step === 'reviewing' && estimate && (
              <>
                <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px', marginBottom: 18 }}>
                  <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 6 }}>SWAP ESTIMATE</p>
                  <p style={{ fontSize: 15, color: 'var(--ink)', fontWeight: 600 }}>
                    {remAmount} {tokenIn} → {parseFloat(estimate.estimatedOutput.amount).toFixed(4)} {estimate.estimatedOutput.token}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 6 }}>Slippage: 1% · Routes via LiFi / Circle</p>
                </div>
                <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 16, lineHeight: 1.5 }}>
                  This swap is routed through Circle Swap Kit which may use a third-party aggregator (LiFi) subject to their terms. Rates can move before execution.
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setStep('idle')}
                    style={{ flex: 1, background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
                    Back
                  </button>
                  <button onClick={() => void handleSwap()}
                    style={{ flex: 2, background: GOLD, color: '#17130e', border: 0, borderRadius: 14, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Confirm Swap
                  </button>
                </div>
              </>
            )}

            {step === 'swapping' && (
              <p style={{ textAlign: 'center', color: 'var(--mute)', padding: '30px 0' }}>⏳ Executing swap… confirm in wallet</p>
            )}

            {step === 'done' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ fontSize: 28, marginBottom: 10 }}>🎉</p>
                <p style={{ font: '700 18px var(--serif)', color: 'var(--gold)', marginBottom: 8 }}>Swap complete!</p>
                {txHash && <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 16, wordBreak: 'break-all' }}>Tx: {txHash.slice(0, 20)}…</p>}
                <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 20 }}>USDC received. You can now pay the bill directly.</p>
                <button onClick={onSuccess}
                  style={{ background: GOLD, color: '#17130e', border: 0, borderRadius: 14, padding: '13px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Pay Bill Now
                </button>
              </div>
            )}

            {step === 'error' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <p style={{ color: 'var(--rose)', fontSize: 14, marginBottom: 16 }}>{errorMsg || 'Swap failed. Please try again.'}</p>
                <button onClick={() => setStep('idle')}
                  style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
                  Try Again
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
