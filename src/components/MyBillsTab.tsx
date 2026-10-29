import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { formatUnits } from 'viem'
import type { Bill } from '../types'
import { USDC_DECIMALS, addressUrl, txUrl, formatAddress } from '../contract'
import { CATEGORY_COLORS } from '../types'
import { useCancelBill } from '../hooks/useBillActions'

const GOLD = 'linear-gradient(135deg,var(--gold),var(--gold2))'

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  Open:      { bg: 'rgba(74,222,156,.15)',  color: 'var(--ok)'     },
  Paid:      { bg: 'rgba(233,200,128,.18)', color: 'var(--gold)'   },
  Cancelled: { bg: 'rgba(248,113,113,.15)', color: 'var(--danger)' },
  Expired:   { bg: 'var(--s2)',             color: 'var(--mute)'   },
}

export function MyBillsTab({ bills, loading }: { bills: Bill[]; loading: boolean }) {
  const { address, isConnected } = useAccount()
  const { cancelBill, isPending } = useCancelBill()

  if (!isConnected) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: 24, textAlign: 'center' }}>
      <p style={{ font: '600 20px var(--serif)' }}>Connect to view your bills</p>
      <ConnectKitButton />
    </div>
  )

  // Guard against partially-enriched bills where requester may be undefined during
  // a rate-limited fetch (enrichment failed mid-way and returned the stub object).
  const myBills = bills.filter(b => b.requester && b.requester.toLowerCase() === address?.toLowerCase())

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--line)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
    </div>
  )

  if (myBills.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: 14, textAlign: 'center' }}>
      <p style={{ font: '700 24px var(--serif)' }}>No bills yet</p>
      <p style={{ color: 'var(--mute)', fontSize: 14 }}>Upload a bill and let the billionaires decide.</p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ font: '700 22px var(--serif)', marginBottom: 4 }}>My Bills</h2>

      {myBills.map(bill => {
        const amtFloat  = parseFloat(formatUnits(bill.amount, USDC_DECIMALS))
        const amt       = amtFloat % 1 === 0 ? amtFloat.toLocaleString('en-US') : amtFloat.toLocaleString('en-US', { minimumFractionDigits: 2 })
        const funded    = parseFloat(formatUnits(bill.funded, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2 })
        const pct       = bill.amount > 0n ? Math.min(100, Math.round(Number(bill.funded * 100n / bill.amount))) : 0
        const catColor  = CATEGORY_COLORS[bill.category ?? ''] ?? '#6b6580'
        const deadline  = new Date(Number(bill.deadline) * 1000).toLocaleDateString()
        const ss        = STATUS_STYLE[bill.status] ?? STATUS_STYLE.Open

        return (
          <div key={bill.id.toString()} style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden', backdropFilter: 'blur(14px)' }}>
            {/* gold strip on paid */}
            {bill.status === 'Paid' && <div style={{ height: 3, background: GOLD }} />}

            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h3 style={{ font: '600 17px var(--serif)' }}>{bill.title ?? `Bill #${bill.id.toString()}`}</h3>
                    {bill.category && (
                      <span style={{ fontSize: 11, fontWeight: 700, background: catColor, color: '#fff', borderRadius: 99, padding: '2px 9px' }}>{bill.category}</span>
                    )}
                  </div>
                  <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 10px', background: ss.bg, color: ss.color }}>{bill.status}</span>
                </div>
                <span style={{ font: '700 24px var(--serif)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>${amt}</span>
              </div>

              {bill.pitch && <p style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--mute)' }}>"{bill.pitch}"</p>}

              {/* progress bar */}
              {bill.funded > 0n && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--mute)', marginBottom: 6 }}>
                    <span>{pct}% funded</span><span>${funded} / ${amt}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--s2)', borderRadius: 9, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: GOLD, transition: 'width .5s' }} />
                  </div>
                </div>
              )}

              {/* meta row */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--mute)', alignItems: 'center' }}>
                <span>Deadline {deadline}</span>
                {bill.status === 'Paid' && bill.paidBy && bill.paidBy !== '0x0000000000000000000000000000000000000000' && (
                  <a href={addressUrl(bill.paidBy)} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontWeight: 600 }}>
                    Paid by {formatAddress(bill.paidBy)} ↗
                  </a>
                )}
              </div>

              {/* actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                {bill.status === 'Paid' && (
                  <a
                    href={txUrl(bill.paidBy ?? '')}
                    target="_blank" rel="noreferrer"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--s2)', color: 'var(--ink)', textDecoration: 'none', border: '1px solid var(--line)' }}
                  >
                    Share receipt ↗
                  </a>
                )}
                {bill.status === 'Open' && (
                  <button onClick={() => { void cancelBill(bill.id) }} disabled={isPending}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 12, fontSize: 12, fontWeight: 600, background: 'var(--danger-dim)', color: 'var(--danger)', cursor: 'pointer', border: '1px solid var(--danger-dim)', opacity: isPending ? 0.5 : 1 }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
