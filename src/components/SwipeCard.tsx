import { useState } from 'react'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import { formatUnits } from 'viem'
import type { Bill } from '../types'
import { CATEGORY_COLORS } from '../types'
import { USDC_DECIMALS, formatAddress } from '../contract'

interface SwipeCardProps {
  bill:         Bill
  onSwipeRight: (bill: Bill) => void
  onSwipeLeft:  (bill: Bill) => void
  zIndex:       number
  isTop:        boolean
  offset:       number   // 0 = top, 1 = second, 2 = third
}

function daysLeft(deadline: bigint) {
  const diff = Number(deadline) - Date.now() / 1000
  if (diff <= 0) return 'Expired'
  const d = Math.ceil(diff / 86400)
  return `${d}d left`
}

/** Color avatar from address */
function Avatar({ addr }: { addr: string }) {
  const hue = parseInt(addr.slice(2, 4), 16) * 1.4
  return (
    <div style={{
      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
      background: `linear-gradient(135deg,hsl(${hue},60%,60%),hsl(${(hue+60)%360},60%,45%))`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: 12, fontWeight: 700,
    }}>{addr.slice(2, 4).toUpperCase()}</div>
  )
}

/** Category emoji placeholder */
function catEmoji(cat?: string) {
  if (!cat) return '📄'
  const m: Record<string, string> = {
    Medical: '🏥', Rent: '🏠', Groceries: '🛒', Education: '🎓',
    Transport: '🚗', Utilities: '💡', Subscription: '📱', Other: '📄',
  }
  return m[cat] ?? '📄'
}

export function SwipeCard({ bill, onSwipeRight, onSwipeLeft, zIndex, isTop, offset }: SwipeCardProps) {
  const x        = useMotionValue(0)
  const rotate   = useTransform(x, [-220, 0, 220], [-18, 0, 18])
  const paidOp   = useTransform(x, [40, 130],   [0, 1])
  const nopeOp   = useTransform(x, [-130, -40], [1, 0])
  const controls = useAnimation()
  const [dragging, setDragging] = useState(false)

  // amount: whole dollars, no decimals (like spec: $480 not $480.00)
  const amtFloat = parseFloat(formatUnits(bill.amount, USDC_DECIMALS))
  const amt      = amtFloat % 1 === 0
    ? amtFloat.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : amtFloat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const pct     = bill.amount > 0n ? Math.min(100, Math.round(Number(bill.funded * 100n / bill.amount))) : 0
  const catCol  = CATEGORY_COLORS[bill.category ?? ''] ?? '#6b6580'
  const peekY   = offset * 14
  const peekSc  = 1 - offset * 0.045
  const peekOp  = 1 - offset * 0.25

  async function handleDragEnd(_: unknown, info: PanInfo) {
    setDragging(false)
    if (info.offset.x > 100) {
      await controls.start({ x: 650, opacity: 0, transition: { duration: 0.28 } })
      onSwipeRight(bill)
    } else if (info.offset.x < -100) {
      await controls.start({ x: -650, opacity: 0, transition: { duration: 0.28 } })
      onSwipeLeft(bill)
    } else {
      void controls.start({ x: 0, rotate: 0, transition: { type: 'spring', stiffness: 320, damping: 30 } })
    }
  }

  return (
    <motion.div
      className="swipe-card"
      style={{
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        y: peekY,
        scale: peekSc,
        opacity: peekOp,
        zIndex,
        position: 'absolute', inset: 0,
        borderRadius: 28,
        background: 'linear-gradient(160deg, var(--card), color-mix(in srgb, var(--card) 80%, var(--gold) 6%))',
        border: '1px solid var(--line)',
        boxShadow: isTop
          ? '0 30px 60px -20px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04)'
          : '0 10px 30px -15px rgba(0,0,0,.35)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
      animate={controls}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragStart={() => setDragging(true)}
      onDragEnd={(...args) => { void handleDragEnd(...args) }}
      whileTap={isTop ? { scale: 0.99 } : {}}
    >
      {/* subtle inner shine */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 28, pointerEvents: 'none', background: 'linear-gradient(120deg,transparent 30%,rgba(255,255,255,.06) 50%,transparent 70%)' }} />

      {/* image / placeholder */}
      <div style={{ position: 'relative', height: 180, flexShrink: 0, overflow: 'hidden', background: 'var(--card2)' }}>
        {bill.imageUrl ? (
          <img src={bill.imageUrl} alt={bill.title ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(7px)', transform: 'scale(1.14)' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 72, opacity: .07 }}>
            {catEmoji(bill.category)}
          </div>
        )}
        {/* gradient overlay to blend into card */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(transparent, var(--card))', pointerEvents: 'none' }} />

        {/* category chip */}
        {bill.category && (
          <span style={{ position: 'absolute', top: 12, left: 14, background: catCol, color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 99, letterSpacing: '.02em' }}>
            {bill.category}
          </span>
        )}

        {/* trust badge */}
        <span style={{ position: 'absolute', top: 12, right: 14, background: 'var(--ok-dim)', color: 'var(--ok)', border: '1px solid color-mix(in srgb,var(--ok) 40%,transparent)', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 99 }}>
          Verified
        </span>

        {/* PAID / NOPE stamps — top card only */}
        {isTop && (
          <>
            <motion.div style={{ opacity: paidOp, position: 'absolute', top: 28, right: 20, transform: 'rotate(10deg)', border: '3px solid var(--ok)', color: 'var(--ok)', borderRadius: 10, padding: '2px 14px', fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 26, letterSpacing: 2, pointerEvents: 'none' }}>
              PAID
            </motion.div>
            <motion.div style={{ opacity: nopeOp, position: 'absolute', top: 28, left: 20, transform: 'rotate(-10deg)', border: '3px solid var(--rose)', color: 'var(--rose)', borderRadius: 10, padding: '2px 14px', fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 26, letterSpacing: 2, pointerEvents: 'none' }}>
              NOPE
            </motion.div>
          </>
        )}
      </div>

      {/* card body */}
      <div style={{ padding: '14px 22px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* requester row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar addr={bill.requester} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{formatAddress(bill.requester)}</span>
            <span style={{ fontSize: 12, color: 'var(--mute)' }}>requester</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--mute)', flexShrink: 0 }}>{daysLeft(bill.deadline)}</span>
        </div>

        {/* payout address — shown only when different from requester */}
        {bill.payoutAddress && bill.payoutAddress !== bill.requester &&
         bill.payoutAddress !== '0x0000000000000000000000000000000000000000' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(233,200,128,.07)', border: '1px solid rgba(233,200,128,.18)', borderRadius: 8, padding: '5px 10px' }}>
            <span style={{ fontSize: 10, color: 'var(--mute)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>Pays out to</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', fontFamily: 'var(--mono)' }}>{formatAddress(bill.payoutAddress)}</span>
          </div>
        )}

        {/* amount */}
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ font: '700 62px/1 var(--serif)', letterSpacing: -2.5, fontVariantNumeric: 'tabular-nums' }}>${amt}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--mute)' }}>USDC</span>
          </div>
          <p style={{ font: '600 20px var(--serif)', marginTop: 2 }}>{bill.title ?? `Bill #${bill.id.toString()}`}</p>
        </div>

        {/* pitch */}
        {bill.pitch && (
          <p style={{ color: 'var(--mute)', fontSize: 14, fontStyle: 'italic', flex: 1, lineHeight: 1.55 }}>
            "{bill.pitch}"
          </p>
        )}

        {/* funded progress */}
        {bill.funded > 0n && (
          <div>
            <div style={{ height: 5, background: 'var(--s2)', borderRadius: 9, overflow: 'hidden', margin: '4px 0 2px' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,var(--gold),var(--rose))', transition: 'width .5s' }} />
            </div>
            <p style={{ fontSize: 11, color: 'var(--mute)' }}>{pct}% funded</p>
          </div>
        )}

        {/* bottom chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {bill.category && (
            <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--s1)', border: '1px solid var(--line)', padding: '5px 11px', borderRadius: 99, color: 'var(--mute)' }}>{bill.category}</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--s1)', border: '1px solid var(--line)', padding: '5px 11px', borderRadius: 99, color: 'var(--mute)' }}>{daysLeft(bill.deadline)}</span>
          <span style={{ fontSize: 12, fontWeight: 600, background: 'var(--s1)', border: '1px solid var(--line)', padding: '5px 11px', borderRadius: 99, color: 'var(--mute)' }}>Arc · USDC</span>
        </div>

        {isTop && !dragging && (
          <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>← pass &nbsp;·&nbsp; pay →</p>
        )}
      </div>
    </motion.div>
  )
}
