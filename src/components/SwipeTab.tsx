import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { SwipeCard } from './SwipeCard'
import { PaySheet }  from './PaySheet'
import type { Bill, Category, ActivityItem } from '../types'
import { CATEGORIES } from '../types'
import { formatUnits } from 'viem'
import { USDC_DECIMALS, txUrl, formatAddress } from '../contract'

interface SwipeTabProps {
  bills:            Bill[]
  loading:          boolean
  refetch:          () => void
  onPaySuccess?:    () => void
  onCrossChainPay?: (bill: Bill) => void
  onSwapPay?:       (bill: Bill) => void
  onForwardPay?:    (bill: Bill) => void
}

// ── Boredom Meter ─────────────────────────────────────────────────────────
function BoredomMeter({ cleared }: { cleared: number }) {
  const pct   = Math.max(0, 100 - cleared * 10)
  const label = pct > 60
    ? 'Maximum boredom. Someone please pay a bill.'
    : pct > 20
    ? 'Getting entertained.'
    : 'Billionaires are thriving. Upload more bills.'
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px' }}>
      <h3 style={{ font: '600 16px var(--serif)', color: 'var(--ink)', marginBottom: 10 }}>Boredom meter</h3>
      <div style={{ height: 8, background: 'var(--s2)', borderRadius: 9, overflow: 'hidden', marginBottom: 8 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,var(--rose),var(--gold))', transition: 'width .5s' }} />
      </div>
      <p style={{ fontSize: 13, color: 'var(--mute)' }}>{label}</p>
    </div>
  )
}

// ── Live activity feed ─────────────────────────────────────────────────────
function ActivityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px' }}>
      <h3 style={{ font: '600 16px var(--serif)', color: 'var(--ink)', marginBottom: 12 }}>Live activity</h3>
      {items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--mute)' }}>No payments yet. Be the first.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {items.slice(0, 6).map((item, i) => {
            const amt = parseFloat(formatUnits(item.amount, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 })
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < Math.min(5, items.length - 1) ? '1px solid var(--line)' : 'none' }}>
                <span style={{ color: 'var(--gold)', fontSize: 14, flexShrink: 0 }}>◆</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{formatAddress(item.payer)}</span>
                    {' paid '}
                    <span style={{ fontWeight: 700, color: 'var(--gold)' }}>${amt}</span>
                  </p>
                </div>
                {item.txHash && (
                  <a href={txUrl(item.txHash)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600, flexShrink: 0 }}>↗</a>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Session stats ─────────────────────────────────────────────────────────
function SessionStats({ deckLen, passed, paid, totalSpent }: { deckLen: number; passed: number; paid: number; totalSpent: bigint }) {
  const spent = parseFloat(formatUnits(totalSpent, USDC_DECIMALS)).toFixed(2)
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 18px' }}>
      <h3 style={{ font: '600 16px var(--serif)', color: 'var(--ink)', marginBottom: 12 }}>This session</h3>
      {[
        { label: 'Bills left', value: deckLen },
        { label: 'Passed',     value: passed  },
        { label: 'Paid',       value: paid    },
        { label: 'USDC spent', value: `$${spent}` },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13, color: 'var(--mute)' }}>{label}</span>
          <span style={{ font: '700 15px var(--serif)', color: 'var(--ink)' }}>{value}</span>
        </div>
      ))}
    </div>
  )
}

export function SwipeTab({ bills, loading, refetch, onPaySuccess, onCrossChainPay, onSwapPay, onForwardPay }: SwipeTabProps) {
  const { isConnected } = useAccount()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [payBill,   setPayBill]   = useState<Bill | null>(null)
  const [passed,    setPassed]    = useState(0)
  const [paid,      setPaid]      = useState(0)
  const [catFilter, setCatFilter] = useState<Category | 'All'>('All')
  const [maxFilter, setMaxFilter] = useState('')

  // activity from bill events — derive from bills payer info
  const activity: ActivityItem[] = bills
    .filter(b => b.status === 'Paid' && b.paidBy && b.paidBy !== '0x0000000000000000000000000000000000000000')
    .slice(0, 20)
    .map(b => ({
      billId:    b.id,
      payer:     b.paidBy,
      requester: b.requester,
      amount:    b.amount,
      txNote:    b.txNote ?? '',
      txHash:    undefined,
      timestamp: b.paidAt ?? 0n,
    }))

  const deck = bills.filter(b => {
    if (b.status !== 'Open') return false
    if (dismissed.has(b.id.toString())) return false
    if (catFilter !== 'All' && b.category !== catFilter) return false
    if (maxFilter && parseFloat(maxFilter) > 0 && Number(b.amount) / 1e6 > parseFloat(maxFilter)) return false
    return true
  })

  const topBill    = deck[deck.length - 1]
  const totalSpent = paid > 0
    ? bills.filter(b => dismissed.has(b.id.toString())).reduce((s, b) => s + b.amount, 0n)
    : 0n

  const handleSwipeRight = useCallback((b: Bill) => { setPayBill(b) }, [])
  const handleSwipeLeft  = useCallback((b: Bill) => {
    setPassed(p => p + 1)
    setDismissed(prev => new Set([...prev, b.id.toString()]))
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!topBill) return
    if (e.key === 'ArrowRight') handleSwipeRight(topBill)
    if (e.key === 'ArrowLeft')  handleSwipeLeft(topBill)
    if (e.key === 'ArrowUp' || e.key === ' ') { e.preventDefault(); setPayBill(topBill) }
  }

  function handlePaySuccess() {
    if (payBill) {
      setPaid(p => p + 1)
      setDismissed(prev => new Set([...prev, payBill.id.toString()]))
      setPayBill(null)
    }
    onPaySuccess?.()
    void refetch()
  }

  if (!isConnected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 24, textAlign: 'center' }}>
        <p style={{ font: '600 20px var(--serif)' }}>Connect your wallet to start swiping</p>
        <ConnectKitButton />
      </div>
    )
  }

  // ── layout: two-column on desktop ─────────────────────────────────────────
  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 24, alignItems: 'start' }}
      className="lg:grid-cols-[1.1fr_.9fr]"
      onKeyDown={handleKeyDown} tabIndex={0}
    >

      {/* ── LEFT: stack ─────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>

        {/* category + max filters */}
        <div
          className="scrollbar-none"
          style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 18 }}
        >
          {(['All', ...CATEGORIES] as const).map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              flexShrink: 0, padding: '7px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: '1px solid var(--line)', transition: '.2s',
              background: catFilter === c ? 'linear-gradient(135deg,var(--gold),var(--rose))' : 'var(--s1)',
              color:      catFilter === c ? '#0a0a0f' : 'var(--mute)',
            }}>{c}</button>
          ))}
          <input
            type="number" value={maxFilter} onChange={e => setMaxFilter(e.target.value)}
            placeholder="Max $"
            style={{ flexShrink: 0, width: 80, padding: '7px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: 'var(--s1)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none' }}
          />
        </div>

        {/* card stack — height 470px like spec */}
        <div style={{ position: 'relative', height: 470, touchAction: 'none' }}>
          {loading ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 36, border: '3px solid var(--line)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
            </div>
          ) : deck.length === 0 ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 28, padding: 24 }}>
              <p style={{ font: '700 26px var(--serif)' }}>No bills left.</p>
              <p style={{ color: 'var(--mute)', fontSize: 14 }}>The billionaires are bored again.</p>
              <button onClick={refetch} style={{ background: 'linear-gradient(135deg,var(--gold),var(--rose))', color: '#0a0a0f', border: 0, borderRadius: 99, padding: '10px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>Check again</button>
            </div>
          ) : (
            deck.slice(-3).map((bill, idx, arr) => (
              <SwipeCard
                key={bill.id.toString()}
                bill={bill}
                isTop={idx === arr.length - 1}
                offset={arr.length - 1 - idx}
                zIndex={idx}
                onSwipeRight={handleSwipeRight}
                onSwipeLeft={handleSwipeLeft}
              />
            ))
          )}
        </div>

        {/* action buttons — exact spec sizes */}
        {deck.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, marginTop: 22 }}>
              {/* Pass ✕ */}
              <button
                onClick={() => topBill && handleSwipeLeft(topBill)}
                aria-label="Pass"
                style={{ width: 62, height: 62, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--s1)', fontSize: 22, cursor: 'pointer', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '.2s', color: 'var(--rose)' }}
              >✕</button>

              {/* Pay $ — larger, gold */}
              <button
                onClick={() => topBill && handleSwipeRight(topBill)}
                aria-label="Pay bill"
                style={{ width: 72, height: 72, marginTop: -5, borderRadius: '50%', background: 'linear-gradient(135deg,var(--gold),var(--gold2))', border: 0, fontSize: 26, cursor: 'pointer', color: '#17130e', fontWeight: 700, boxShadow: '0 12px 32px var(--glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '.2s', fontFamily: 'var(--serif)' }}
              >$</button>

              {/* Contribute ½ */}
              <button
                onClick={() => { if (topBill) setPayBill(topBill) }}
                aria-label="Pay half"
                style={{ width: 62, height: 62, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--s1)', fontSize: 18, cursor: 'pointer', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '.2s', color: 'var(--mute)', fontWeight: 700, fontFamily: 'var(--serif)' }}
              >½</button>
            </div>
            <p style={{ textAlign: 'center', color: 'var(--mute)', fontSize: 12, marginTop: 14 }}>← pass &nbsp;·&nbsp; → pay &nbsp;·&nbsp; ↑ pay half</p>

            {/* Cross-chain pay button */}
            {onCrossChainPay && topBill && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <button
                  onClick={() => onCrossChainPay(topBill)}
                  style={{ padding: '8px 20px', borderRadius: 99, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,107,139,.35)', background: 'rgba(255,107,139,.08)', color: 'var(--rose)', transition: '.2s' }}
                >
                  ⛓ Pay from any chain
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT: sidebar ──────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <BoredomMeter cleared={paid + passed} />
        <ActivityFeed items={activity} />
        <SessionStats deckLen={deck.length} passed={passed} paid={paid} totalSpent={totalSpent} />

        {/* keyboard shortcuts */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '12px 16px', fontSize: 12, color: 'var(--mute)' }}>
          <p style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>Keyboard shortcuts</p>
          {[['←', 'Pass'], ['→', 'Pay full'], ['↑ / Space', 'Contribute'], ['R', 'Refresh']].map(([k, a]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ fontFamily: 'var(--mono)', background: 'var(--s2)', padding: '1px 8px', borderRadius: 6 }}>{k}</span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      </div>

      <PaySheet
        bill={payBill}
        onClose={() => setPayBill(null)}
        onSuccess={handlePaySuccess}
        onSwapPay={onSwapPay ? (b) => { setPayBill(null); setTimeout(() => onSwapPay(b), 320) } : undefined}
        onForwardPay={onForwardPay ? (b) => { setPayBill(null); setTimeout(() => onForwardPay(b), 320) } : undefined}
      />
    </div>
  )
}
