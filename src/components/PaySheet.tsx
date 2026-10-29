import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatUnits } from 'viem'
import type { Bill } from '../types'
import { USDC_DECIMALS, txUrl, formatAddress } from '../contract'
import { usePayBill } from '../hooks/useBillActions'
import { usePreApprove } from '../hooks/usePreApprove'
import { useUSDCBalance } from '../hooks/useUSDCBalance'
import { useAccount } from 'wagmi'

const spring  = { type: 'spring' as const, stiffness: 380, damping: 38 }
const GOLD    = 'linear-gradient(135deg,var(--gold),var(--gold2))'

interface PaySheetProps {
  bill:          Bill | null
  onClose:       () => void
  onSuccess:     () => void
  onSwapPay?:    (bill: Bill) => void
  onForwardPay?: (bill: Bill) => void
}

export function PaySheet({ bill, onClose, onSuccess, onSwapPay, onForwardPay }: PaySheetProps) {
  const { address }  = useAccount()
  const [txNote,     setTxNote]     = useState('')
  const [mode,       setMode]       = useState<'full' | 'partial'>('full')
  const [partialAmt, setPartialAmt] = useState('')
  const { raw: balance, display: balDisplay } = useUSDCBalance(address)
  const { payBill, contribute, isPending, isConfirming, isSuccess, hash, error, reset, isApproved } = usePayBill()
  const preApprove = usePreApprove()

  const remaining  = bill ? bill.amount - bill.funded : 0n
  const remDisplay = parseFloat(formatUnits(remaining, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 })
  const fullAmt    = parseFloat(formatUnits(remaining, USDC_DECIMALS)).toFixed(6)
  const hasEnough  = mode === 'full'
    ? balance >= remaining
    : balance >= (partialAmt ? BigInt(Math.floor(parseFloat(partialAmt) * 10 ** USDC_DECIMALS)) : 0n)

  // whole-dollar display (no trailing .00 if whole)
  const amtFloat = bill ? parseFloat(formatUnits(bill.amount, USDC_DECIMALS)) : 0
  const amtDisplay = amtFloat % 1 === 0
    ? amtFloat.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : amtFloat.toLocaleString('en-US', { minimumFractionDigits: 2 })

  async function handlePay() {
    if (!bill) return
    try {
      if (mode === 'full') {
        await payBill(bill.id, fullAmt, txNote)
      } else {
        if (!partialAmt || parseFloat(partialAmt) <= 0) return
        await contribute(bill.id, partialAmt, txNote)
      }
    } catch { /* errors shown via hook */ }
  }

  function handleClose() {
    if (isSuccess) onSuccess()
    reset()
    setTxNote(''); setPartialAmt(''); setMode('full')
    onClose()
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--s1)', border: '1px solid var(--line)',
    color: 'var(--ink)', borderRadius: 12, padding: '12px 14px',
    fontFamily: 'var(--sans)', fontSize: 15, outline: 'none',
  }

  return (
    <AnimatePresence>
      {bill !== null && (
        <motion.div
          style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          {/* backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(6px)' }} />

          <motion.section
            style={{
              position: 'relative', width: '100%', maxWidth: 500,
              borderRadius: '28px 28px 0 0',
              background: 'color-mix(in srgb, var(--card) 96%, white 2%)',
              border: '1px solid var(--line)',
              overflow: 'hidden',
            }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={spring}
            onClick={e => e.stopPropagation()}
          >
            {/* gold strip */}
            <div style={{ height: 3, background: GOLD }} />

            {/* drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 99, background: 'var(--line2)' }} />
            </div>

            <div style={{ padding: '8px 24px 40px' }}>
              {isSuccess ? (
                /* ── success state ── */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 0 16px', gap: 16, textAlign: 'center' }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--ok-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: 'var(--ok)' }}>✓</div>
                  <h2 style={{ font: '700 28px var(--serif)' }}>Bill Paid!</h2>
                  <p style={{ color: 'var(--mute)', fontSize: 14 }}>The billionaire has spoken. The bill is handled.</p>
                  {hash && (
                    <a href={txUrl(hash)} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>View on explorer ↗</a>
                  )}
                  <button onClick={handleClose}
                    style={{ marginTop: 8, width: '100%', background: GOLD, color: '#17130e', border: 0, borderRadius: 16, padding: '15px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ font: '700 22px var(--serif)' }}>Pay Bill</h2>
                      {bill.title && <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 2 }}>{bill.title}</p>}
                    </div>
                    <button onClick={handleClose}
                      style={{ background: 'var(--s2)', border: 0, borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: 'var(--mute)', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      ×
                    </button>
                  </div>

                  {/* amount summary */}
                  <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 20px', marginBottom: 18 }}>
                    <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 4, letterSpacing: '.04em' }}>TOTAL REMAINING</p>
                    <p style={{ font: '700 42px var(--serif)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      ${remDisplay} <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--mute)' }}>USDC</span>
                    </p>
                    {bill.title && <p style={{ fontSize: 13, color: 'var(--mute)', marginTop: 6 }}>{bill.title} · ${amtDisplay} total</p>}
                  </div>

                  {/* mode toggle */}
                  <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 18 }}>
                    {(['full', 'partial'] as const).map(m => (
                      <button key={m} onClick={() => setMode(m)} style={{
                        flex: 1, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        border: 0, transition: '.2s',
                        background: mode === m ? GOLD : 'transparent',
                        color:      mode === m ? '#17130e' : 'var(--mute)',
                      }}>
                        {m === 'full' ? 'Pay Full' : 'Contribute'}
                      </button>
                    ))}
                  </div>

                  {mode === 'partial' && (
                    <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px', marginBottom: 18 }}>
                      <input
                        inputMode="decimal"
                        value={partialAmt}
                        onChange={e => { const v = e.target.value.replace(/[^0-9.]/g,''); if (v===''||/^\d*\.?\d*$/.test(v)) setPartialAmt(v) }}
                        placeholder="0.00"
                        style={{ width: '100%', background: 'transparent', border: 'none', font: '700 32px var(--serif)', color: 'var(--ink)', outline: 'none' }}
                      />
                      <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 4 }}>USDC · Balance: {balDisplay}</p>
                    </div>
                  )}

                  {/* note */}
                  <input
                    type="text" value={txNote}
                    onChange={e => setTxNote(e.target.value)}
                    placeholder="Add a note… (optional)"
                    maxLength={120}
                    style={{ ...inp, marginBottom: 16 }}
                  />

                  {/* errors */}
                  {!hasEnough && (
                    <p style={{ fontSize: 13, textAlign: 'center', color: 'var(--danger)', marginBottom: 12 }}>
                      Insufficient USDC. Use "Get test USDC" in the sidebar.
                    </p>
                  )}
                  {error && (
                    <p style={{ fontSize: 13, textAlign: 'center', color: 'var(--danger)', marginBottom: 12 }}>
                      {error.message.includes('User rejected') ? 'Transaction cancelled.' : 'Transaction failed. Please try again.'}
                    </p>
                  )}

                  {/* Payout destination */}
                  {bill.payoutAddress && bill.payoutAddress !== '0x0000000000000000000000000000000000000000' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: 'var(--mute)' }}>Funds go to</span>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--gold)' }}>{formatAddress(bill.payoutAddress)}</span>
                    </div>
                  )}

                  {/* Pre-approve banner — shown when not yet pre-approved */}
                  {!isApproved && !preApprove.isApproved && (
                    <div style={{ background: 'rgba(233,200,128,.07)', border: '1px solid rgba(233,200,128,.2)', borderRadius: 14, padding: '12px 14px', marginBottom: 4 }}>
                      <p style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 600, marginBottom: 6 }}>
                        ⚡ Enable instant payments
                      </p>
                      <p style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 10, lineHeight: 1.5 }}>
                        Approve once — then every future bill pays with one click, no wallet popup.
                      </p>
                      <button
                        onClick={() => { void preApprove.preApprove() }}
                        disabled={preApprove.isPending || preApprove.isConfirming}
                        style={{
                          width: '100%', background: 'rgba(233,200,128,.15)', border: '1px solid rgba(233,200,128,.4)',
                          color: 'var(--gold)', borderRadius: 12, padding: '10px 0', fontSize: 13, fontWeight: 700,
                          cursor: 'pointer', opacity: (preApprove.isPending || preApprove.isConfirming) ? 0.5 : 1,
                        }}
                      >
                        {preApprove.isPending ? '⏳ Confirm in wallet…' : preApprove.isConfirming ? '⏳ Confirming…' : 'Set up instant pay'}
                      </button>
                    </div>
                  )}

                  {(isApproved || preApprove.isApproved) && (
                    <p style={{ fontSize: 11, color: 'var(--ok)', fontWeight: 600, textAlign: 'center', marginBottom: 6 }}>
                      ⚡ Instant pay enabled — no extra confirmation needed
                    </p>
                  )}

                  {/* CTA — Pay with Arc USDC */}
                  <button
                    onClick={() => { void handlePay() }}
                    disabled={isPending || isConfirming || !hasEnough}
                    style={{
                      width: '100%', background: GOLD, color: '#17130e', border: 0,
                      borderRadius: 16, padding: '16px 0', fontSize: 16, fontWeight: 700,
                      cursor: 'pointer', transition: '.2s',
                      opacity: (isPending || isConfirming || !hasEnough) ? 0.4 : 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {isPending    ? '⏳ Confirm in wallet…'
                     : isConfirming ? '⏳ Confirming…'
                     : (isApproved || preApprove.isApproved)
                       ? `⚡ Pay $${mode === 'full' ? remDisplay : partialAmt ? parseFloat(partialAmt).toFixed(2) : ''} instantly`
                       : `Pay ${mode === 'full' ? `$${remDisplay}` : partialAmt ? `$${parseFloat(partialAmt).toFixed(2)}` : ''} USDC`}
                  </button>

                  {/* Alt pay options row */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    {onSwapPay && (
                      <button
                        onClick={() => onSwapPay(bill)}
                        style={{
                          flex: 1, background: 'var(--s1)', border: '1px solid var(--line)',
                          borderRadius: 14, padding: '11px 0', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', color: 'var(--ink)', transition: '.2s',
                        }}
                      >
                        🔄 Pay with any token
                      </button>
                    )}
                    {onForwardPay && (
                      <button
                        onClick={() => onForwardPay(bill)}
                        style={{
                          flex: 1, background: 'var(--s1)', border: '1px solid var(--line)',
                          borderRadius: 14, padding: '11px 0', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', color: 'var(--ink)', transition: '.2s',
                        }}
                      >
                        ⛓ Auto-bridge payment
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
