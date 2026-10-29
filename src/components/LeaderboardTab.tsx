import { formatUnits } from 'viem'
import type { LeaderEntry, ActivityItem } from '../types'
import { USDC_DECIMALS, formatAddress, addressUrl, txUrl } from '../contract'

const GOLD = 'linear-gradient(135deg,var(--gold),var(--gold2))'

function rankLabel(i: number) {
  if (i === 0) return { txt: '1st', color: 'var(--gold)' }
  if (i === 1) return { txt: '2nd', color: 'var(--ink2)' }
  if (i === 2) return { txt: '3rd', color: '#cd7f32' }
  return { txt: `#${i + 1}`, color: 'var(--mute)' }
}

function badgeFor(e: LeaderEntry) {
  const amt  = Number(e.totalPaid) / 1e6
  const diff = Date.now() / 1000 - (e.lastPaidAt ? Number(e.lastPaidAt) : 0)
  if (e.billCount >= 10)  return { label: 'Serial Savior',      bg: 'rgba(74,222,156,.16)',   color: 'var(--ok)'   }
  if (diff < 3600)        return { label: 'Midnight Benefactor', bg: 'rgba(175,143,244,.18)',  color: '#af8ff4'     }
  if (amt >= 500)         return { label: 'High Roller',         bg: 'rgba(233,200,128,.18)',  color: 'var(--gold)' }
  return null
}

const panel: React.CSSProperties = {
  background: 'var(--s1)', border: '1px solid var(--line)',
  borderRadius: 22, overflow: 'hidden', backdropFilter: 'blur(14px)',
}

export function LeaderboardTab({ leaderboard, activity, loading }: {
  leaderboard: LeaderEntry[]
  activity:    ActivityItem[]
  loading:     boolean
}) {
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 20px' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── TOP PAYERS ─────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ height: 3, background: GOLD }} />
        <div style={{ padding: '20px 22px 24px' }}>
          <h2 style={{ font: '700 20px var(--serif)', marginBottom: 18 }}>Top payers</h2>

          {leaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ font: '600 20px var(--serif)', marginBottom: 8 }}>No payments yet.</p>
              <p style={{ color: 'var(--mute)', fontSize: 14 }}>Be the first billionaire.</p>
            </div>
          ) : (
            <div>
              {leaderboard.slice(0, 10).map((entry, i) => {
                const rank  = rankLabel(i)
                const bdg   = badgeFor(entry)
                const total = parseFloat(formatUnits(entry.totalPaid, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 })
                return (
                  <div key={entry.address} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: i < Math.min(9, leaderboard.length - 1) ? '1px solid var(--line)' : 'none' }}>
                    <span style={{ font: '700 15px var(--serif)', color: rank.color, width: 36, textAlign: 'center', flexShrink: 0 }}>{rank.txt}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <a href={addressUrl(entry.address)} target="_blank" rel="noreferrer"
                          style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--mono)', color: 'var(--ink)', textDecoration: 'none' }}>
                          {formatAddress(entry.address)}
                        </a>
                        {bdg && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: bdg.bg, color: bdg.color }}>{bdg.label}</span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 2 }}>{entry.billCount} bill{entry.billCount !== 1 ? 's' : ''} paid</p>
                    </div>
                    <span style={{ font: '700 16px var(--serif)', color: 'var(--gold)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>${total}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── LIVE ACTIVITY ─────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ padding: '20px 22px 24px' }}>
          <h2 style={{ font: '700 20px var(--serif)', marginBottom: 18 }}>Live activity</h2>

          {activity.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--mute)', textAlign: 'center', padding: '16px 0' }}>
              No payments yet.
            </p>
          ) : (
            <div>
              {activity.slice(0, 20).map((item, i) => {
                const amt = parseFloat(formatUnits(item.amount, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 })
                const ts  = new Date(Number(item.timestamp) * 1000).toLocaleString()
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < Math.min(19, activity.length - 1) ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,107,139,.12)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, color: 'var(--rose)' }}>$</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14 }}>
                        <span style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{formatAddress(item.payer)}</span>
                        {' paid '}
                        <span style={{ fontWeight: 700, color: 'var(--gold)' }}>${amt} USDC</span>
                        {' → '}<span style={{ fontFamily: 'var(--mono)' }}>{formatAddress(item.requester)}</span>
                      </p>
                      {item.txNote && <p style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--mute)', marginTop: 3 }}>"{item.txNote}"</p>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--mute)' }}>{ts}</span>
                        {item.txHash && <a href={txUrl(item.txHash)} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>View ↗</a>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
