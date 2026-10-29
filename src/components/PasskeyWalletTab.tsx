/**
 * PasskeyWalletTab — Feature 3 (Passkey / Modular Wallets) + Feature 5 (User-Controlled Wallets overview)
 *
 * Requires Console setup:
 *  1. Circle Console → Keys → Client Keys → create a Client Key.
 *     Allowed Domain: ikfejrhkbrsdcxf23a57f.preview.studio.arc.io
 *  2. Paste the key into VITE_CLIENT_KEY in .env
 *  3. Console → Wallets → Modular Wallets → Passkey → Domain Name:
 *     ikfejrhkbrsdcxf23a57f.preview.studio.arc.io
 */
import { useState } from 'react'
import { usePasskeyWallet } from '../hooks/usePasskeyWallet'
import { OnrampSheet }     from './OnrampSheet'
import { useAccount }      from 'wagmi'
import { formatUnits }     from 'viem'

const GOLD = 'linear-gradient(135deg,var(--gold),var(--gold2,#ffd580))'

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--s1)', border: '1px solid var(--line)',
      borderRadius: 20, padding: '20px 22px', backdropFilter: 'blur(12px)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function StatusRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
      <span style={{ fontSize: 13, color: 'var(--mute)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent ? 'var(--gold)' : 'var(--ink)', fontFamily: 'var(--mono)' }}>{value}</span>
    </div>
  )
}

export function PasskeyWalletTab() {
  const { address: connectedAddress } = useAccount()
  const {
    address: smartAccountAddress, state: status, error,
    isRegistered, isLoggedIn,
    register, login, logout, sendUsdc,
  } = usePasskeyWallet()
  // balance is not tracked by this hook; show a placeholder
  const balance: bigint | null = null

  const [showOnramp, setShowOnramp]   = useState(false)
  const [sendTo,     setSendTo]       = useState('')
  const [sendAmt,    setSendAmt]      = useState('')
  const [sendStatus, setSendStatus]   = useState('')

  const clientKeyMissing = !import.meta.env.VITE_CLIENT_KEY

  async function handleSend() {
    if (!sendTo || !sendAmt) return
    setSendStatus('sending')
    try {
      const hash = await sendUsdc(sendTo, sendAmt)
      setSendStatus('sent:' + hash)
    } catch (e) {
      setSendStatus('error:' + String(e))
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--s2)', border: '1px solid var(--line)',
    borderRadius: 12, padding: '12px 14px', fontSize: 14,
    color: 'var(--ink)', outline: 'none', boxSizing: 'border-box',
    fontFamily: 'var(--mono)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h2 style={{ font: '700 26px var(--serif)', marginBottom: 2 }}>Wallets &amp; Identity</h2>
      <p style={{ color: 'var(--mute)', fontSize: 14, marginBottom: 6 }}>
        Passkey-powered smart accounts (ERC-4337) on Arc. No seed phrase, gasless transactions via Circle Gas Station.
      </p>

      {/* Console setup gate */}
      {clientKeyMissing && (
        <Card style={{ border: '1px solid rgba(233,200,128,.4)', background: 'rgba(233,200,128,.06)' }}>
          <p style={{ fontSize: 13, color: 'var(--gold)', lineHeight: 1.7 }}>
            <b>Console setup required before passkeys work.</b> Use this exact hostname in both domain fields:
            <br /><code style={{ background: 'rgba(0,0,0,.3)', padding: '2px 6px', borderRadius: 5, display: 'inline-block', margin: '4px 0' }}>
              ikfejrhkbrsdcxf23a57f.preview.studio.arc.io
            </code>
          </p>
          <ol style={{ paddingLeft: 18, marginTop: 10, fontSize: 13, color: 'var(--ink)', lineHeight: 2 }}>
            <li>Circle Console → <b>Keys → Client Keys</b> → create a Client Key. Under <b>Applicable Platforms → Web</b>, set <b>Allowed Domain</b> to the hostname above.</li>
            <li>Paste the Client Key into <code>VITE_CLIENT_KEY</code> in <code>.env</code> (<code>TEST_CLIENT_KEY:…</code>; shown once).</li>
            <li>Console → <b>Wallets → Modular Wallets → Passkey</b> → set <b>Domain Name</b> to the <b>same</b> hostname.</li>
            <li>Restart the dev server and test passkey registration in the preview.</li>
          </ol>
          <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 6 }}>
            Do not use <code>localhost</code>, parent-only domains, or placeholder hostnames.
          </p>
        </Card>
      )}

      {/* Passkey auth */}
      <Card>
        <h3 style={{ font: '600 17px var(--serif)', marginBottom: 14 }}>Passkey Smart Account</h3>
        {error && <p style={{ fontSize: 13, color: 'var(--rose)', marginBottom: 10 }}>{error}</p>}
        {status && !error && <p style={{ fontSize: 13, color: 'var(--mute)', marginBottom: 10 }}>{status}</p>}

        {!isLoggedIn ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => { void register('billswipe-user') }}
              disabled={clientKeyMissing}
              style={{ flex: 1, background: GOLD, color: '#17130e', border: 0, borderRadius: 14, padding: '12px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: clientKeyMissing ? 0.4 : 1 }}
            >
              Register passkey
            </button>
            <button
              onClick={() => { void login() }}
              disabled={clientKeyMissing}
              style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 0', fontWeight: 700, fontSize: 14, cursor: 'pointer', color: 'var(--ink)', opacity: clientKeyMissing ? 0.4 : 1 }}
            >
              Login with passkey
            </button>
          </div>
        ) : (
          <>
            <StatusRow label="Smart account" value={smartAccountAddress ? smartAccountAddress.slice(0,10)+'…'+smartAccountAddress.slice(-8) : '—'} accent />
            <StatusRow label="USDC balance" value={balance !== null ? '$' + parseFloat(formatUnits(balance, 6)).toFixed(4) : '—'} />
            <StatusRow label="Connected wallet" value={connectedAddress ? connectedAddress.slice(0,10)+'…' : '—'} />

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setShowOnramp(true)}
                style={{ flex: 1, background: GOLD, color: '#17130e', border: 0, borderRadius: 14, padding: '11px 0', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                Buy USDC (Onramp)
              </button>
              <button
                onClick={() => logout()}
                style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 14, padding: '11px 0', fontWeight: 600, fontSize: 13, cursor: 'pointer', color: 'var(--mute)' }}
              >
                Logout
              </button>
            </div>

            {/* Send USDC */}
            <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 18 }}>
              <h4 style={{ font: '600 14px var(--sans)', marginBottom: 10, color: 'var(--ink)' }}>Send USDC (gasless)</h4>
              <input value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="Recipient 0x…" style={{ ...inp, marginBottom: 8 }} />
              <input value={sendAmt} onChange={e => setSendAmt(e.target.value)} placeholder="Amount (USDC)" inputMode="decimal" style={{ ...inp, marginBottom: 10 }} />
              {sendStatus.startsWith('sent:') && (
                <p style={{ fontSize: 12, color: 'var(--gold)', marginBottom: 8 }}>Sent! Tx: {sendStatus.slice(5).slice(0,18)}…</p>
              )}
              {sendStatus.startsWith('error:') && (
                <p style={{ fontSize: 12, color: 'var(--rose)', marginBottom: 8 }}>{sendStatus.slice(6)}</p>
              )}
              <button
                onClick={() => { void handleSend() }}
                disabled={sendStatus === 'sending' || !sendTo || !sendAmt}
                style={{ width: '100%', background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 0', fontWeight: 600, fontSize: 14, cursor: 'pointer', color: 'var(--ink)' }}
              >
                {sendStatus === 'sending' ? '⏳ Sending…' : 'Send USDC'}
              </button>
            </div>
          </>
        )}
      </Card>

      {/* User-Controlled Wallets info panel */}
      <Card>
        <h3 style={{ font: '600 17px var(--serif)', marginBottom: 10 }}>Social Login Wallets</h3>
        <p style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.7 }}>
          Circle User-Controlled Wallets let your users sign in with Google, Apple, or email OTP — no seed phrase needed.
          The app never holds private keys; users approve every operation in Circle's hosted UI.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          {['Google', 'Apple', 'Email OTP'].map(p => (
            <span key={p} style={{
              background: 'var(--s2)', border: '1px solid var(--line)', borderRadius: 99,
              padding: '5px 14px', fontSize: 12, fontWeight: 600, color: 'var(--mute)',
            }}>{p}</span>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 12, lineHeight: 1.6 }}>
          To enable: set <code>VITE_CIRCLE_APP_ID</code> in <code>.env</code> and{' '}
          <code>CIRCLE_API_KEY</code> on the backend (from Circle Console → Wallets → User Controlled).
        </p>
      </Card>

      {showOnramp && (
        <OnrampSheet
          destinationAddress={smartAccountAddress ?? connectedAddress ?? ''}
          onClose={() => setShowOnramp(false)}
        />
      )}
    </div>
  )
}
