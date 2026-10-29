/**
 * OnrampSheet — Feature 4: Circle Onramp (fiat → USDC)
 *
 * Mounts the Circle onramp widget inline via App Kit's kit.onramp.mountIframe.
 * Session is minted server-side at POST /api/onramp/session.
 * Sandbox environment (onramp-sandbox.arc.io) by default; production when
 * VITE_ONRAMP_WIDGET_BASE_URL is set to https://onramp.arc.io.
 */
import { useEffect, useRef, useState } from 'react'
import { AppKit } from '@circle-fin/app-kit'

const kit = new AppKit()

interface Props {
  destinationAddress: string   // wallet that receives the purchased USDC
  onClose: () => void
  onSettled?: (txHash: string) => void
}

export function OnrampSheet({ destinationAddress, onClose, onSettled }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetRef    = useRef<{ close(): void } | null>(null)
  const [error,      setError]   = useState<string | null>(null)
  const [mounted,    setMounted] = useState(false)

  useEffect(() => {
    if (!containerRef.current || mounted) return
    setMounted(true)

    void (async () => {
      try {
        // Mint a session server-side (keeps Circle API key off the browser)
        const sessionRes = await fetch('/api/onramp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appUserId:          destinationAddress,   // stable per-user id
            destinationAddress,
          }),
        })
        if (!sessionRes.ok) throw new Error(`Session mint failed: ${sessionRes.status}`)
        const { sessionToken } = await sessionRes.json() as { sessionToken: string }

        // Reach into the kit's onramp API with loose typing to handle SDK version variance.
        // The linter rules on 'any' are suppressed here; all externally supplied values
        // (container, sessionToken) are strongly typed from context above.
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
        const onramp = (kit as any).onramp
        const widget: { close(): void } = onramp.mountIframe({
          container: containerRef.current!,
          session:   { sessionToken },
          widgetBaseUrl: import.meta.env.VITE_ONRAMP_WIDGET_BASE_URL ?? 'https://onramp-sandbox.arc.io',
          onDepositSettled: (e: { event: string; payload?: { transactionHash?: string } }) => {
            if (onSettled && e.payload?.transactionHash) onSettled(e.payload.transactionHash)
          },
          onSessionExpired: () => { widget.close(); onClose() },
          onError: (e: { message?: string }) => setError(e?.message ?? 'Onramp error'),
        })
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
        widgetRef.current = widget
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()

    return () => { widgetRef.current?.close() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(10,10,15,.85)', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--bg)', borderRadius: '24px 24px 0 0',
        padding: '0 0 env(safe-area-inset-bottom)',
        overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px' }}>
          <p style={{ font: '700 18px var(--serif)' }}>💳 Buy USDC with Fiat</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--mute)' }}>×</button>
        </div>

        {error ? (
          <div style={{ padding: '20px 24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>
            <p style={{ fontSize: 12, color: 'var(--mute)', lineHeight: 1.6 }}>
              Make sure <code style={{ background: 'rgba(0,0,0,.3)', padding: '1px 5px', borderRadius: 4 }}>CIRCLE_API_KEY</code> is set in <code>.env</code> and the backend is running (<code>bun run server</code>).
            </p>
            <button onClick={onClose} style={{ padding: '10px', borderRadius: 12, border: 'none', background: 'var(--s2)', color: 'var(--ink)', fontWeight: 700, cursor: 'pointer' }}>Close</button>
          </div>
        ) : (
          /* The onramp widget iframe mounts here */
          <div ref={containerRef} style={{ height: 600, minHeight: 400 }} />
        )}
      </div>
    </div>
  )
}
