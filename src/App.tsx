/**
 * BillSwipe — Upload bills. Bored billionaires pay them.
 * Built with Arc Studio · Arc Testnet + Mainnet · USDC
 */
import { useState, useCallback, useEffect } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useAccount, useSwitchChain } from 'wagmi'
import { AnimatePresence, motion } from 'framer-motion'
import { HomePage }           from './components/HomePage'
import { SwipeTab }           from './components/SwipeTab'
import { UploadTab }          from './components/UploadTab'
import { MyBillsTab }         from './components/MyBillsTab'
import { LeaderboardTab }     from './components/LeaderboardTab'
import { AgentTab }           from './components/AgentTab'
import { BridgeOutTab }       from './components/BridgeOutTab'
import { CrossChainPaySheet } from './components/CrossChainPaySheet'
import { PasskeyWalletTab }   from './components/PasskeyWalletTab'
import { SwapSheet }          from './components/SwapSheet'
import { ForwardingSheet }    from './components/ForwardingSheet'
import { Confetti }           from './components/Confetti'
import { useBillEvents }      from './hooks/useBills'
import type { Tab, Bill }     from './types'
import {
  ARC_TESTNET_ID, ARC_MAINNET_ID,
  BILLSWIPE_ADDRESS_BY_CHAIN, EXPLORER_BASE_BY_CHAIN,
  USDC_DECIMALS, isArcChain, isMainnetReady, getBillSwipeAddress,
  formatAddress, txUrl, addressUrl,
} from './contract'
import { ARC_MAINNET_CHAIN_ID } from './config'
import { formatUnits } from 'viem'

// suppress unused import warnings — re-exported for consumers
void txUrl; void addressUrl; void getBillSwipeAddress

const TABS: { id: Tab; label: string }[] = [
  { id: 'home',        label: 'Home'             },
  { id: 'swipe',       label: 'Billionaire Mode' },
  { id: 'upload',      label: 'Upload a bill'    },
  { id: 'mybills',     label: 'My bills'         },
  { id: 'leaderboard', label: 'Leaderboard'      },
  { id: 'wallets',     label: '🔑 Wallets'        },
  { id: 'agent',       label: '🤖 Agent'          },
  { id: 'bridge',      label: '⛓ Bridge out'      },
]

// ── mark ◆ ────────────────────────────────────────────────────────────────
function Mark() {
  return (
    <div style={{
      width: 34, height: 34, borderRadius: 11, flexShrink: 0,
      background: 'linear-gradient(135deg,var(--gold),var(--rose))',
      display: 'grid', placeItems: 'center',
      color: '#0a0a0f', fontSize: 17,
      boxShadow: '0 6px 24px var(--glow)',
    }}>◆</div>
  )
}

// ── network label pill ────────────────────────────────────────────────────
function NetworkPill({ chainId }: { chainId: number | undefined }) {
  if (chainId === ARC_MAINNET_ID) {
    return (
      <span style={{
        font: '700 11px var(--sans)', letterSpacing: '.08em', textTransform: 'uppercase',
        background: 'linear-gradient(135deg,var(--gold),var(--rose))',
        borderRadius: 99, padding: '3px 9px', marginLeft: 4,
        color: '#0a0a0f',
      }}>Arc Mainnet</span>
    )
  }
  return (
    <span style={{
      font: '600 11px var(--sans)', letterSpacing: '.08em', textTransform: 'uppercase',
      color: 'var(--mute)', border: '1px solid var(--line)', borderRadius: 99, padding: '3px 9px', marginLeft: 4,
    }}>Arc Testnet</span>
  )
}

export default function App() {
  const [tab,        setTab]        = useState<Tab>('home')
  const [theme,      setTheme]      = useState<'dark' | 'light'>('dark')
  const [confetti,     setConfetti]     = useState(false)
  const [xChainBill,   setXChainBill]   = useState<Bill | null>(null)
  const [swapBill,     setSwapBill]     = useState<Bill | null>(null)
  const [forwardBill,  setForwardBill]  = useState<Bill | null>(null)

  const { chainId, isConnected } = useAccount()
  const { switchChain }          = useSwitchChain()
  const { bills, activity, leaderboard, loading, syncing, refetch } = useBillEvents()

  // Determine the active Arc chain (falls back to testnet when disconnected)
  const activeChainId: number = (isConnected && isArcChain(chainId)) ? chainId : ARC_TESTNET_ID
  const isMainnet  = activeChainId === ARC_MAINNET_ID
  const wrongChain = isConnected && !isArcChain(chainId)

  // Mainnet is configured but contract address not yet set
  const mainnetUnconfigured = isMainnet && !isMainnetReady()

  const contractAddress = BILLSWIPE_ADDRESS_BY_CHAIN[activeChainId as keyof typeof BILLSWIPE_ADDRESS_BY_CHAIN]
  const explorerBase    = EXPLORER_BASE_BY_CHAIN[activeChainId as keyof typeof EXPLORER_BASE_BY_CHAIN]

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const triggerConfetti = useCallback(() => setConfetti(true), [])

  // ── global stats ──────────────────────────────────────────────────────────
  const totalPaidUSD = leaderboard.reduce((s, e) => s + e.totalPaid, 0n)
  const billsCleared = leaderboard.reduce((s, e) => s + e.billCount, 0)
  const billsOpen    = bills.filter(b => b.status === 'Open').length

  const statVal = (v: bigint | number) =>
    typeof v === 'bigint'
      ? '$' + parseFloat(formatUnits(v, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : v

  // ── styles ─────────────────────────────────────────────────────────────────
  const btn: React.CSSProperties = {
    border: '1px solid var(--line)', background: 'var(--s1)',
    padding: '10px 16px', borderRadius: 12, fontWeight: 600, fontSize: 13,
    backdropFilter: 'blur(10px)', transition: '.2s', cursor: 'pointer', color: 'var(--ink)',
  }

  return (
    <div style={{ minHeight: '100dvh', overflowX: 'hidden', position: 'relative' }}>
      <Confetti active={confetti} onDone={() => setConfetti(false)} />

      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '18px 18px 80px' }}>

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '6px 0 22px' }}>

          {/* logo + network pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mark />
            <span style={{ font: '700 22px var(--serif)', letterSpacing: '-.4px' }}>BillSwipe</span>
            <NetworkPill chainId={activeChainId} />
          </div>

          {/* controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* network switcher buttons */}
            {isConnected && (
              <>
                <button
                  onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
                  style={{ ...btn, ...(activeChainId === ARC_TESTNET_ID ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : {}) }}
                >Testnet</button>
                <button
                  onClick={() => switchChain({ chainId: ARC_MAINNET_CHAIN_ID })}
                  style={{ ...btn, ...(isMainnet ? { background: 'linear-gradient(135deg,var(--gold),var(--rose))', color: '#0a0a0f', border: 0 } : {}) }}
                >Mainnet</button>
              </>
            )}

            {wrongChain && (
              <button onClick={() => switchChain({ chainId: ARC_TESTNET_ID })}
                style={{ ...btn, border: '1px solid var(--rose)', background: 'rgba(255,107,139,.12)', color: 'var(--rose)' }}>
                Switch to Arc
              </button>
            )}

            <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={btn} aria-label="Toggle theme">
              {theme === 'dark' ? '☀ Light' : '◑ Dark'}
            </button>
            <ConnectKitButton />
          </div>
        </header>

        {/* ── MAINNET UNCONFIGURED BANNER ───────────────────────────────── */}
        {mainnetUnconfigured && (
          <div style={{
            background: 'rgba(233,200,128,.1)', border: '1px solid rgba(233,200,128,.35)',
            borderRadius: 14, padding: '14px 18px', marginBottom: 20,
            font: '500 13px var(--sans)', color: 'var(--gold)', lineHeight: 1.6,
          }}>
            <b>Mainnet contract not configured.</b> Deploy BillSwipe.sol to Arc Mainnet (chain ID 5042)
            from your own wallet, then set <code style={{ background: 'rgba(0,0,0,.25)', padding: '1px 6px', borderRadius: 5 }}>VITE_BILLSWIPE_MAINNET_ADDRESS=0x…</code> in{' '}
            <code style={{ background: 'rgba(0,0,0,.25)', padding: '1px 6px', borderRadius: 5 }}>.env</code>{' '}
            and restart the dev server.
          </div>
        )}

        {/* ── Syncing banner — shown while the indexer is doing its initial load */}
        {syncing && loading && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(255,107,139,.07)', border: '1px solid rgba(255,107,139,.25)',
            borderRadius: 14, padding: '12px 18px', marginBottom: 16,
            font: '500 13px var(--sans)', color: 'var(--rose)',
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--rose)', borderTopColor: 'transparent', animation: 'spin .8s linear infinite', flexShrink: 0 }} />
            Loading bills from chain…
          </div>
        )}

        {/* ── HERO + STATS (hidden on home — the HomePage component has its own) */}
        {tab !== 'home' && (
          <>
            <div style={{ margin: '6px 0 22px' }}>
              <h1 style={{ font: `700 clamp(34px,6vw,60px)/1.04 var(--serif)`, letterSpacing: -1.5 }}>
                Upload your bills.<br />
                <em style={{
                  fontStyle: 'italic',
                  background: 'linear-gradient(90deg,var(--gold),var(--rose))',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>Bored billionaires</em>{' '}swipe right to pay them.
              </h1>
              <p style={{ color: 'var(--mute)', maxWidth: 520, marginTop: 10 }}>
                Settled in USDC on Arc.{' '}
                {isMainnet ? 'Real funds. Real payments.' : 'Testnet — no real money.'}
                {' '}Sub-second finality, no gas token to juggle.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '20px 0' }}>
              {[
                { label: 'PAID OUT',      val: statVal(totalPaidUSD) },
                { label: 'BILLS CLEARED', val: statVal(billsCleared) },
                { label: 'IN THE DECK',   val: statVal(billsOpen)    },
              ].map(({ label, val }) => (
                <div key={label} style={{ background: 'var(--s1)', border: '1px solid var(--line)', borderRadius: 16, padding: '14px 16px', backdropFilter: 'blur(12px)' }}>
                  <b style={{ display: 'block', font: '700 24px var(--serif)', color: 'var(--ink)' }}>{val}</b>
                  <span style={{ fontSize: 12, color: 'var(--mute)', letterSpacing: '.04em' }}>{label}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── TAB NAV ────────────────────────────────────────────────────── */}
        <div style={{ width: '100%', overflowX: 'auto', marginBottom: 22 }} className="scrollbar-none">
          <div style={{ display: 'flex', gap: 4, background: 'var(--s1)', border: '1px solid var(--line)', padding: 4, borderRadius: 14, width: 'max-content', minWidth: '100%' }}>
            {TABS.map(({ id, label }) => (
              <button key={id} onClick={() => setTab(id)} style={{
                border: 0, padding: '9px 16px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: '.2s', flexShrink: 0,
                background: tab === id ? 'var(--s2)' : 'none',
                color:      tab === id ? 'var(--ink)' : 'var(--mute)',
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── CONTENT ────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {tab === 'home' && (
              <HomePage
                onNavigate={setTab}
                totalPaid={String(statVal(totalPaidUSD))}
                billsCleared={billsCleared}
                billsOpen={billsOpen}
              />
            )}
            {tab === 'swipe'       && <SwipeTab bills={bills} loading={loading} refetch={() => { void refetch() }} onPaySuccess={triggerConfetti} onCrossChainPay={setXChainBill} onSwapPay={setSwapBill} onForwardPay={setForwardBill} />}
            {tab === 'upload'      && <UploadTab onUploaded={() => { void refetch(); triggerConfetti(); setTab('mybills') }} />}
            {tab === 'mybills'     && <MyBillsTab bills={bills} loading={loading} />}
            {tab === 'leaderboard' && <LeaderboardTab leaderboard={leaderboard} activity={activity} loading={loading} />}
            {tab === 'wallets'     && <PasskeyWalletTab />}
            {tab === 'agent'       && <AgentTab bills={bills} />}
            {tab === 'bridge'      && <BridgeOutTab />}
          </motion.div>
        </AnimatePresence>

        <CrossChainPaySheet
          bill={xChainBill}
          onClose={() => setXChainBill(null)}
          onSuccess={() => { setXChainBill(null); triggerConfetti(); void refetch() }}
        />

        <SwapSheet
          bill={swapBill}
          onClose={() => setSwapBill(null)}
          onSuccess={() => { setSwapBill(null); triggerConfetti(); void refetch() }}
        />

        <ForwardingSheet
          bill={forwardBill}
          onClose={() => setForwardBill(null)}
          onSuccess={() => { setForwardBill(null); triggerConfetti(); void refetch() }}
        />

        {/* ── FOOTER ─────────────────────────────────────────────────────── */}
        <p style={{ textAlign: 'center', color: 'var(--mute)', fontSize: 12, marginTop: 48 }}>
          {isMainnet ? 'Arc Mainnet' : 'Arc Testnet'} · USDC · real on-chain payments{' '}
          <a
            href={`${explorerBase}/address/${contractAddress}`}
            target="_blank" rel="noreferrer"
            style={{ color: 'var(--gold)', textDecoration: 'underline' }}
          >{formatAddress(contractAddress || '0x0000000000000000000000000000000000000000')}</a>
        </p>
      </div>

    </div>
  )
}
