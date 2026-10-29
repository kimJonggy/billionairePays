/**
 * CrossChainPaySheet — "Pay from any chain" bottom sheet.
 *
 * Shows when payer selects a source chain other than Arc Testnet.
 * Uses Gateway burn → mint so USDC lands on Arc directly in the
 * requester's wallet. No custody, no bridge UI for the requester.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatUnits } from 'viem'
import type { Bill } from '../types'
import { USDC_DECIMALS, txUrl } from '../contract'
import { useGatewayPay } from '../hooks/useGatewayPay'
import type { SourceChain } from '../hooks/useGatewayPay'
import { ARC_MAINNET_ID } from '../contract'
import { useAccount } from 'wagmi'

const spring = { type: 'spring' as const, stiffness: 380, damping: 38 }
const gold   = 'linear-gradient(135deg,var(--gold),var(--gold2))'

const STEP_LABELS: Record<string, string> = {
  'switching-source':  'Switching to source chain…',
  'building-intent':   'Building transfer intent…',
  'signing':           'Sign the transfer in your wallet…',
  'submitting-gateway':'Submitting to Circle Gateway…',
  'switching-arc':     'Switching to Arc…',
  'minting':           'Minting USDC on Arc…',
}

interface Props {
  bill:     Bill | null
  onClose:  () => void
  onSuccess: () => void
}

export function CrossChainPaySheet({ bill, onClose, onSuccess }: Props) {
  const { chainId } = useAccount()
  const { pay, step, mintTx, error, reset, isPending, sourceChainList } = useGatewayPay()
  const [srcChain, setSrcChain] = useState<SourceChain | null>(null)

  // Auto-select first available source chain whenever the list changes
  const effectiveSrc = srcChain ?? sourceChainList[0]

  const isMainnet = chainId === ARC_MAINNET_ID

  const open     = bill !== null
  const remaining = bill ? bill.amount - bill.funded : 0n
  const remFmt    = parseFloat(formatUnits(remaining, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 })

  function handleClose() {
    if (step === 'done') onSuccess()
    reset()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(8px)' }} />

          <motion.section
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', width: '100%', maxWidth: 500, borderRadius: '28px 28px 0 0', background: 'color-mix(in srgb, var(--card) 95%, white 2%)', border: '1px solid var(--line)', overflow: 'hidden' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={spring}
          >
            {/* header strip */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,var(--rose),var(--gold))' }} />
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--line2)' }} />
            </div>

            <div style={{ padding: '8px 24px 36px' }}>
              {step === 'done' ? (
                // ── SUCCESS ──────────────────────────────────────────────
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 0', gap: 16, textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--ok-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, color: 'var(--ok)' }}>✓</div>
                  <h2 style={{ font: '700 26px var(--serif)', color: 'var(--ink)' }}>Paid Cross-Chain!</h2>
                  <p style={{ color: 'var(--mute)', fontSize: 14 }}>USDC landed on Arc {isMainnet ? 'Mainnet' : 'Testnet'} via Circle Gateway. Instant, no bridging UI needed.</p>
                  {mintTx && (
                    <a href={txUrl(mintTx)} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>View mint tx on Arc ↗</a>
                  )}
                  <button onClick={handleClose} style={{ marginTop: 8, width: '100%', background: gold, color: '#17130e', border: 0, borderRadius: 16, padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Done</button>
                </div>
              ) : (
                <>
                  {/* ── HEADER ─────────────────────────────────────────── */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div>
                      <h2 style={{ font: '700 20px var(--serif)', color: 'var(--ink)' }}>Pay from Any Chain</h2>
                      <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 3 }}>USDC arrives on Arc in &lt;1s via Circle Gateway</p>
                    </div>
                    <button onClick={handleClose} style={{ background: 'var(--s2)', border: 0, borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', color: 'var(--mute)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>

                  {/* ── AMOUNT ─────────────────────────────────────────── */}
                  <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px', marginBottom: 18 }}>
                    <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 4 }}>Amount</p>
                    <p style={{ font: '700 34px var(--serif)', color: 'var(--ink)' }}>
                      ${remFmt} <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--mute)' }}>USDC</span>
                    </p>
                  </div>

                  {/* ── SOURCE CHAIN PICKER ────────────────────────────── */}
                  <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 8, letterSpacing: '.04em' }}>
                    PAY FROM {isMainnet ? '(Mainnet)' : '(Testnet)'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                    {sourceChainList.map(c => (
                      <button key={c.id} onClick={() => setSrcChain(c)} style={{
                        padding: '8px 16px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--line)', transition: '.2s',
                        background: effectiveSrc?.id === c.id ? gold : 'var(--s1)',
                        color: effectiveSrc?.id === c.id ? '#17130e' : 'var(--mute)',
                      }}>{c.label}</button>
                    ))}
                  </div>

                  {/* ── FLOW DIAGRAM ───────────────────────────────────── */}
                  <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', marginBottom: 18, fontSize: 13, color: 'var(--mute)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{effectiveSrc?.label ?? '…'}</span>
                    <span>→</span>
                    <span style={{ fontSize: 11, background: 'var(--s2)', borderRadius: 99, padding: '2px 8px' }}>Circle Gateway</span>
                    <span>→</span>
                    <span style={{ fontWeight: 600, color: 'var(--gold)' }}>{isMainnet ? 'Arc Mainnet' : 'Arc Testnet'}</span>
                    <span>→</span>
                    <span style={{ fontWeight: 600, color: 'var(--ok)' }}>Requester</span>
                  </div>

                  {/* ── STEP PROGRESS ──────────────────────────────────── */}
                  {isPending && (
                    <div style={{ background: 'var(--s2)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 18, height: 18, border: '2px solid var(--line)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                      <p style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>{STEP_LABELS[step] ?? step}</p>
                    </div>
                  )}

                  {error && (
                    <p style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 14, textAlign: 'center' }}>{error}</p>
                  )}

                  {/* ── DEPOSIT REMINDER ───────────────────────────────── */}
                  <div style={{ background: 'rgba(233,200,128,.08)', border: '1px solid rgba(233,200,128,.2)', borderRadius: 12, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: 'var(--mute)' }}>
                    <b style={{ color: 'var(--gold)' }}>Before paying:</b> deposit USDC into your{' '}
                    <a href={isMainnet ? 'https://gateway-api.circle.com' : 'https://gateway-api-testnet.circle.com'} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Gateway unified balance</a>{' '}
                    on {effectiveSrc?.label ?? 'the source chain'} first. The Gateway burn deducts from that balance.
                  </div>

                  <button
                    onClick={() => { if (bill && effectiveSrc) void pay(effectiveSrc, parseFloat(formatUnits(remaining, USDC_DECIMALS)).toFixed(6), bill.requester as `0x${string}`) }}
                    disabled={isPending || !effectiveSrc}
                    style={{ width: '100%', background: 'linear-gradient(135deg,var(--rose),var(--gold))', color: '#17130e', border: 0, borderRadius: 16, padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: '.2s' }}
                  >
                    {isPending ? '⏳ Processing…' : `Pay $${remFmt} via Gateway`}
                  </button>
                </>
              )}
            </div>
          </motion.section>

          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
