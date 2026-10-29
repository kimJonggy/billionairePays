// ForwardingSheet: Feature 10 — auto-bridge USDC payment via Circle Unified Balance + Forwarding Service
// The requester receives USDC on their preferred chain; the payer pays from Arc USDC.
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatUnits } from 'viem'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AppKit } from '@circle-fin/app-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import type { Bill } from '../types'
import { USDC_DECIMALS } from '../contract'
import { formatUsdc } from '../onchain-money'

const appKit = new AppKit()
const spring = { type: 'spring' as const, stiffness: 380, damping: 38 }
const GOLD = 'linear-gradient(135deg,var(--gold),var(--gold2))'

// Supported destination chains for forwarding
const DEST_CHAINS: { label: string; id: string; chainId?: number }[] = [
  { label: 'Arc Testnet',      id: 'Arc_Testnet',      chainId: 5042002  },
  { label: 'Base Sepolia',     id: 'Base_Sepolia',     chainId: 84532    },
  { label: 'Arbitrum Sepolia', id: 'Arbitrum_Sepolia', chainId: 421614   },
  { label: 'OP Sepolia',       id: 'Optimism_Sepolia', chainId: 11155420 },
  { label: 'Ethereum Sepolia', id: 'Ethereum_Sepolia', chainId: 11155111 },
]

interface ForwardingSheetProps {
  bill:      Bill | null
  onClose:   () => void
  onSuccess: () => void
}

export function ForwardingSheet({ bill, onClose, onSuccess }: ForwardingSheetProps) {
  const { address, connector } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const [destChain, setDestChain] = useState(DEST_CHAINS[0].id)
  const [status,    setStatus]    = useState<'idle' | 'switching' | 'depositing' | 'spending' | 'done' | 'error'>('idle')
  const [txHash,    setTxHash]    = useState('')
  const [errMsg,    setErrMsg]    = useState('')

  const remaining = bill ? bill.amount - bill.funded : 0n
  const remDisplay = parseFloat(formatUnits(remaining, USDC_DECIMALS)).toFixed(2)
  const amountStr  = formatUsdc(remaining) // human-readable e.g. "12.50"

  const selectedDest = DEST_CHAINS.find(c => c.id === destChain) ?? DEST_CHAINS[0]

  async function handleForward() {
    if (!bill || !connector || !address) return
    setStatus('idle')
    setErrMsg('')
    try {
      // 1. Switch to Arc Testnet (source chain for deposit)
      setStatus('switching')
      const arcTestnetId = 5042002
      if (chainId !== arcTestnetId) {
        await switchChainAsync({ chainId: arcTestnetId })
      }
      const provider = (await connector.getProvider()) as EIP1193Provider
      const adapter  = await createViemAdapterFromProvider({ provider })

      // 2. Deposit USDC into unified balance on Arc Testnet
      setStatus('depositing')
      const depositResult = await appKit.unifiedBalance.deposit({
        from:   { adapter, chain: 'Arc_Testnet' },
        amount: amountStr,
      })
      console.log('[forwarding] deposited:', depositResult.txHash)

      // 3. Spend (burn on Arc, mint on dest via Forwarding Service)
      setStatus('spending')
      const recipientAddress = bill.requester as `0x${string}`
      const spendResult = await appKit.unifiedBalance.spend({
        from: {
          adapter,
          allocations: { amount: amountStr, chain: 'Arc_Testnet' },
        },
        to: {
          chain:            selectedDest.id as Parameters<typeof appKit.unifiedBalance.spend>[0]['to']['chain'],
          recipientAddress,
          useForwarder:     true,
        },
        amount: amountStr,
      })
      console.log('[forwarding] spent:', spendResult.txHash)
      setTxHash(spendResult.txHash)
      setStatus('done')
      setTimeout(() => { onSuccess() }, 1800)
    } catch (e) {
      console.error('[forwarding] error:', e)
      setErrMsg(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }

  const busy = status === 'switching' || status === 'depositing' || status === 'spending'

  const statusLabel: Record<typeof status, string> = {
    idle:       `Forward $${remDisplay} USDC`,
    switching:  '⏳ Switching chain…',
    depositing: '⏳ Depositing to Gateway…',
    spending:   '⏳ Forwarding cross-chain…',
    done:       '✅ Forwarded!',
    error:      'Retry',
  }

  return (
    <AnimatePresence>
      {bill && (
        <>
          {/* backdrop */}
          <motion.div
            key="fwd-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(6px)', zIndex: 90 }}
          />

          {/* sheet */}
          <motion.div
            key="fwd-sheet"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={spring}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 91,
              background: 'var(--canvas)', borderRadius: '24px 24px 0 0',
              padding: '28px 24px 40px', maxWidth: 520, margin: '0 auto',
              boxShadow: '0 -24px 64px rgba(0,0,0,.4)',
            }}
          >
            {/* handle */}
            <div style={{ width: 44, height: 4, background: 'var(--line)', borderRadius: 9, margin: '0 auto 22px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <h2 style={{ font: '700 22px var(--serif)', marginBottom: 4 }}>Auto-Bridge Payment</h2>
                <p style={{ fontSize: 13, color: 'var(--mute)', maxWidth: 320 }}>
                  Pay from Arc. USDC is delivered to the requester on any chain — instantly via Circle Forwarding.
                </p>
              </div>
              <button onClick={onClose}
                style={{ background: 'var(--s2)', border: 0, borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: 'var(--mute)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ×
              </button>
            </div>

            {/* amount */}
            <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px', marginBottom: 18 }}>
              <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 2, letterSpacing: '.04em' }}>YOU PAY (Arc USDC)</p>
              <p style={{ font: '700 40px var(--serif)', lineHeight: 1 }}>${remDisplay}</p>
              <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>Requester receives on selected chain</p>
            </div>

            {/* destination chain selector */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 8, letterSpacing: '.04em' }}>DELIVER TO CHAIN</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DEST_CHAINS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setDestChain(c.id)}
                    style={{
                      padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid var(--line)', transition: '.15s',
                      background: destChain === c.id ? GOLD : 'var(--s1)',
                      color:      destChain === c.id ? '#17130e' : 'var(--mute)',
                    }}
                  >{c.label}</button>
                ))}
              </div>
            </div>

            {/* flow diagram */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px',
              fontSize: 12, color: 'var(--mute)', marginBottom: 20,
            }}>
              <span>Arc USDC</span>
              <span style={{ color: 'var(--gold)' }}>→ Gateway → Forwarder →</span>
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{selectedDest.label}</span>
            </div>

            {errMsg && (
              <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12, textAlign: 'center' }}>
                {errMsg.includes('User rejected') ? 'Transaction cancelled.' : errMsg.slice(0, 120)}
              </p>
            )}

            {status === 'done' && txHash && (
              <p style={{ fontSize: 13, color: 'var(--gold)', marginBottom: 12, textAlign: 'center' }}>
                Sent! <a href={`https://explorer.testnet.arc.io/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>View tx ↗</a>
              </p>
            )}

            <button
              onClick={() => { void handleForward() }}
              disabled={busy || !address || status === 'done'}
              style={{
                width: '100%', background: GOLD, color: '#17130e', border: 0,
                borderRadius: 16, padding: '16px 0', fontSize: 16, fontWeight: 700,
                cursor: 'pointer', transition: '.2s',
                opacity: (busy || !address || status === 'done') ? 0.45 : 1,
              }}
            >
              {statusLabel[status]}
            </button>

            {!address && (
              <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--mute)', marginTop: 10 }}>
                Connect your wallet first.
              </p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
