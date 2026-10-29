import { useState, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { useCreateBill } from '../hooks/useBillActions'
import { CATEGORIES } from '../types'
import { txUrl } from '../contract'

const today = new Date().toISOString().slice(0, 10)
const GOLD  = 'linear-gradient(135deg,var(--gold),var(--gold2))'

async function uploadMetadata(data: { title: string; pitch: string; category: string; imageUrl: string }): Promise<string> {
  const key = import.meta.env.VITE_NFT_STORAGE_KEY as string | undefined
  if (key) {
    try {
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const form = new FormData()
      form.append('file', blob, 'metadata.json')
      const res = await fetch('https://api.nft.storage/upload', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
      })
      if (res.ok) {
        const j = await res.json() as { value: { cid: string } }
        return `ipfs://${j.value.cid}`
      }
    } catch { /* fall through */ }
  }
  return `data:application/json,${encodeURIComponent(JSON.stringify(data))}`
}

const inp: React.CSSProperties = {
  width: '100%', background: 'var(--s1)', border: '1px solid var(--line)',
  color: 'var(--ink)', borderRadius: 12, padding: '12px 14px',
  fontFamily: 'var(--sans)', fontSize: 15, outline: 'none',
}

export function UploadTab({ onUploaded }: { onUploaded: () => void }) {
  const { isConnected, address: connectedAddress } = useAccount()
  const { createBill, isPending, isConfirming, isSuccess, hash, error, reset, wrongChain } = useCreateBill()

  const [title,         setTitle]         = useState('')
  const [pitch,         setPitch]         = useState('')
  const [amount,        setAmount]        = useState('')
  const [category,      setCategory]      = useState<typeof CATEGORIES[number]>(CATEGORIES[0])
  const [imageUrl,      setImageUrl]      = useState('')
  const [payoutAddress, setPayoutAddress] = useState('')
  const [deadline, setDeadline] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
  })
  const [uploading, setUploading] = useState(false)
  const calledRef = useRef(false)

  // Validate payout address: must be a valid 0x address or empty (defaults to requester)
  const payoutIsValid = payoutAddress === '' || /^0x[0-9a-fA-F]{40}$/.test(payoutAddress)
  const canSubmit = title.trim() && pitch.trim().length <= 280 && amount && parseFloat(amount) > 0 && deadline && payoutIsValid

  useEffect(() => {
    if (isSuccess && !calledRef.current) {
      calledRef.current = true
      const t = setTimeout(() => onUploaded(), 2000)
      return () => clearTimeout(t)
    }
  }, [isSuccess, onUploaded])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    calledRef.current = false
    setUploading(true)
    try {
      const uri = await uploadMetadata({ title, pitch, category, imageUrl })
      const payout = (payoutAddress.trim() || '0x0000000000000000000000000000000000000000') as `0x${string}`
      await createBill(amount, uri, Math.floor(new Date(deadline).getTime() / 1000), payout)
    } catch { /* errors shown via hook */ }
    finally { setUploading(false) }
  }

  if (!isConnected) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 20px', gap: 24, textAlign: 'center' }}>
      <p style={{ font: '600 20px var(--serif)' }}>Connect your wallet to upload a bill</p>
      <ConnectKitButton />
    </div>
  )

  if (isSuccess) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '70px 20px', gap: 18, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--ok-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: 'var(--ok)' }}>✓</div>
      <h2 style={{ font: '700 28px var(--serif)' }}>Bill submitted!</h2>
      <p style={{ color: 'var(--mute)', fontSize: 14 }}>Your bill is live on the deck. Good luck.</p>
      {hash && <a href={txUrl(hash)} target="_blank" rel="noreferrer" style={{ color: 'var(--gold)', fontSize: 13, fontWeight: 600 }}>View on explorer ↗</a>}
      <button onClick={() => { reset(); setTitle(''); setPitch(''); setAmount('') }}
        style={{ background: GOLD, color: '#17130e', border: 0, borderRadius: 16, padding: '13px 32px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
        Upload another
      </button>
    </div>
  )

  return (
    <form onSubmit={e => { void handleSubmit(e) }} style={{ maxWidth: 560 }}>
      <div style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 22, overflow: 'hidden', backdropFilter: 'blur(14px)' }}>
        {/* gold strip */}
        <div style={{ height: 3, background: GOLD }} />

        <div style={{ padding: '22px 24px 30px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h2 style={{ font: '700 22px var(--serif)' }}>Put a bill on the deck</h2>

          {/* title */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>TITLE *</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Vet bill, rent, electric…" maxLength={60} style={inp} required />
          </div>

          {/* amount */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>AMOUNT (USDC) *</label>
            <div style={{ background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 18px' }}>
              <input
                inputMode="decimal" value={amount}
                onChange={e => { const v = e.target.value.replace(/[^0-9.]/g,''); if (v===''||/^\d*\.?\d*$/.test(v)) setAmount(v) }}
                placeholder="240"
                style={{ width: '100%', background: 'transparent', border: 'none', font: '700 38px var(--serif)', color: 'var(--ink)', outline: 'none' }}
                required
              />
              <span style={{ fontSize: 13, color: 'var(--mute)' }}>USDC</span>
            </div>
          </div>

          {/* category */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 8, letterSpacing: '.04em' }}>CATEGORY</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORIES.map(c => (
                <button key={c} type="button" onClick={() => setCategory(c)} style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: '1px solid var(--line)', transition: '.2s',
                  background: category === c ? GOLD : 'var(--s1)',
                  color:      category === c ? '#17130e' : 'var(--mute)',
                }}>{c}</button>
              ))}
            </div>
          </div>

          {/* pitch */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>YOUR PITCH · 280 CHARACTERS *</label>
            <textarea value={pitch} onChange={e => setPitch(e.target.value)}
              placeholder="Make it entertaining." maxLength={280} rows={3}
              style={{ ...inp, resize: 'none' }} />
            <p style={{ textAlign: 'right', fontSize: 11, color: pitch.length > 260 ? 'var(--danger)' : 'var(--mute)', marginTop: 4 }}>{pitch.length}/280</p>
          </div>

          {/* image url */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>BILL IMAGE URL (optional)</label>
            <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…" style={inp} />
            <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>Shown blurred on the card.</p>
          </div>

          {/* deadline */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>DEADLINE</label>
            <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} min={today} style={inp} />
          </div>

          {/* payout address */}
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>
              PAYOUT WALLET <span style={{ color: 'var(--gold)' }}>*</span>
            </label>
            <input
              type="text"
              value={payoutAddress}
              onChange={e => setPayoutAddress(e.target.value)}
              placeholder={connectedAddress ?? '0x… EVM wallet that receives payment'}
              style={{ ...inp, borderColor: payoutAddress && !payoutIsValid ? 'var(--danger)' : 'var(--line)' }}
            />
            <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
              Funds go here when someone pays your bill.
              {payoutAddress === '' && connectedAddress && (
                <button type="button" onClick={() => setPayoutAddress(connectedAddress)}
                  style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>
                  Use my wallet
                </button>
              )}
            </p>
            {payoutAddress && !payoutIsValid && (
              <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>Must be a valid 0x… EVM address.</p>
            )}
          </div>

          {wrongChain && <p style={{ fontSize: 13, color: 'var(--rose)', fontWeight: 600 }}>Switch to Arc Testnet in your wallet.</p>}
          {error && <p style={{ fontSize: 13, color: 'var(--danger)' }}>{error.message.includes('User rejected') ? 'Transaction cancelled.' : 'Transaction failed. Please try again.'}</p>}

          <button type="submit" disabled={!canSubmit || isPending || isConfirming || uploading}
            style={{
              background: GOLD, color: '#17130e', border: 0, borderRadius: 16,
              padding: '15px 0', fontSize: 16, fontWeight: 700, cursor: 'pointer', width: '100%',
              opacity: (!canSubmit || isPending || isConfirming || uploading) ? 0.45 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: '.2s',
            }}>
            {uploading || isPending || isConfirming
              ? `⏳ ${uploading ? 'Uploading…' : isConfirming ? 'Confirming…' : 'Confirm in wallet…'}`
              : 'Publish to deck'}
          </button>
        </div>
      </div>
    </form>
  )
}
