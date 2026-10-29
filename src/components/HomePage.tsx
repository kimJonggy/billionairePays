import type { Tab } from '../types'
import { motion } from 'framer-motion'

interface HomePageProps {
  onNavigate: (tab: Tab) => void
  totalPaid: string
  billsCleared: number
  billsOpen: number
}

const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

export function HomePage({ onNavigate, totalPaid, billsCleared, billsOpen }: HomePageProps) {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '48px 0 80px', gap: 0 }}
    >
      {/* ── logo mark ──────────────────────────────────────────────────────── */}
      <motion.div variants={item}>
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: 'linear-gradient(135deg,var(--gold),var(--rose))',
          display: 'grid', placeItems: 'center',
          color: '#0a0a0f', fontSize: 36,
          boxShadow: '0 12px 40px var(--glow)',
          marginBottom: 28,
        }}>◆</div>
      </motion.div>

      {/* ── headline ───────────────────────────────────────────────────────── */}
      <motion.h1 variants={item} style={{
        font: 'clamp(36px,8vw,72px)/1.02 var(--serif)',
        fontWeight: 700,
        letterSpacing: -2,
        maxWidth: 760,
        marginBottom: 20,
      }}>
        Upload your bills.{' '}
        <em style={{
          fontStyle: 'italic',
          background: 'linear-gradient(90deg,var(--gold),var(--rose))',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>Bored billionaires</em>
        {' '}swipe right to pay them.
      </motion.h1>

      <motion.p variants={item} style={{ color: 'var(--mute)', fontSize: 17, maxWidth: 480, marginBottom: 52, lineHeight: 1.6 }}>
        Real USDC on Arc Testnet. Sub-second finality. No gas token to juggle.
        Every payment goes directly into your wallet.
      </motion.p>

      {/* ── CTA buttons ────────────────────────────────────────────────────── */}
      <motion.div variants={item} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 72 }}>

        {/* Upload a bill */}
        <button
          onClick={() => onNavigate('upload')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '18px 32px', borderRadius: 18,
            background: 'linear-gradient(135deg,var(--gold),var(--gold2))',
            color: '#17130e', border: 0,
            font: '700 17px var(--sans)',
            boxShadow: '0 12px 40px var(--glow)',
            cursor: 'pointer', transition: 'transform .18s, filter .18s',
          }}
          onMouseEnter={e => { (e.currentTarget).style.transform = 'translateY(-2px)'; (e.currentTarget).style.filter = 'brightness(1.06)' }}
          onMouseLeave={e => { (e.currentTarget).style.transform = ''; (e.currentTarget).style.filter = '' }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>📤</span>
          <span>
            <span style={{ display: 'block', fontSize: 17, fontWeight: 700 }}>Upload a Bill</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, opacity: 0.65, marginTop: 1 }}>Put it in front of the billionaires</span>
          </span>
        </button>

        {/* Pay bills */}
        <button
          onClick={() => onNavigate('swipe')}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '18px 32px', borderRadius: 18,
            background: 'var(--s1)', color: 'var(--ink)',
            border: '1px solid var(--line)',
            font: '700 17px var(--sans)',
            backdropFilter: 'blur(14px)',
            cursor: 'pointer', transition: 'transform .18s, background .18s',
          }}
          onMouseEnter={e => { (e.currentTarget).style.transform = 'translateY(-2px)'; (e.currentTarget).style.background = 'var(--s2)' }}
          onMouseLeave={e => { (e.currentTarget).style.transform = ''; (e.currentTarget).style.background = 'var(--s1)' }}
        >
          <span style={{ fontSize: 24, lineHeight: 1 }}>💸</span>
          <span>
            <span style={{ display: 'block', fontSize: 17, fontWeight: 700 }}>Pay Some Bills</span>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--mute)', marginTop: 1 }}>Swipe right. Change a life.</span>
          </span>
        </button>
      </motion.div>

      {/* ── live stats ─────────────────────────────────────────────────────── */}
      <motion.div variants={item} style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, width: '100%', maxWidth: 560 }}>
        {[
          { val: totalPaid,               label: 'PAID OUT',      accent: 'var(--gold)' },
          { val: billsCleared.toString(),  label: 'BILLS CLEARED', accent: 'var(--ok)'   },
          { val: billsOpen.toString(),     label: 'IN THE DECK',   accent: 'var(--rose)'  },
        ].map(({ val, label, accent }) => (
          <div key={label} style={{
            background: 'var(--s1)', border: '1px solid var(--line)',
            borderRadius: 18, padding: '18px 14px',
            backdropFilter: 'blur(12px)',
          }}>
            <b style={{ display: 'block', font: '700 28px var(--serif)', color: accent, fontVariantNumeric: 'tabular-nums' }}>{val}</b>
            <span style={{ fontSize: 11, color: 'var(--mute)', letterSpacing: '.06em', fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </motion.div>

      {/* ── how it works ───────────────────────────────────────────────────── */}
      <motion.div variants={item} style={{ marginTop: 72, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, width: '100%', maxWidth: 700 }}>
        {[
          { icon: '📝', step: '1', head: 'Upload your bill', body: 'Add a title, amount, and a 280-char pitch. The weirder, the better.' },
          { icon: '💳', step: '2', head: 'Billionaire reviews it', body: 'They swipe through the deck — right to pay, left to pass.' },
          { icon: '⚡', step: '3', head: 'USDC lands instantly', body: 'Sub-second settlement on Arc. No gas token. No waiting.' },
        ].map(({ icon, step, head, body }) => (
          <div key={step} style={{
            background: 'var(--s1)', border: '1px solid var(--line)',
            borderRadius: 18, padding: '22px 20px', textAlign: 'left',
            backdropFilter: 'blur(10px)',
          }}>
            <div style={{ fontSize: 30, marginBottom: 12 }}>{icon}</div>
            <p style={{ font: '600 15px var(--serif)', color: 'var(--ink)', marginBottom: 6 }}>{head}</p>
            <p style={{ fontSize: 13, color: 'var(--mute)', lineHeight: 1.55 }}>{body}</p>
          </div>
        ))}
      </motion.div>
    </motion.div>
  )
}
