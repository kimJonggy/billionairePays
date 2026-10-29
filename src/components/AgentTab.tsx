/**
 * AgentTab — Billionaire Agent
 *
 * A UI for configuring and running an autonomous auto-paying agent backed by
 * a Circle Developer-Controlled Wallet on Arc Testnet.
 *
 * The agent:
 *  • Holds a Circle DCW wallet pre-funded with USDC
 *  • Scores each open bill (humor, clarity, urgency)
 *  • Auto-pays bills that pass the threshold, within daily budget + category rules
 *  • Has a kill switch (pause toggle)
 *  • Logs each decision on-chain via passBill / payBill
 *
 * This component is the CONFIGURATION UI only. The actual auto-pay loop runs
 * server-side (server/agent.ts) — it reads rules from this config and calls
 * the Circle Developer-Controlled Wallets SDK.
 *
 * For the UI demo, decisions and spend are simulated locally so the feature
 * is fully visible without a server running.
 */

import { useState, useEffect, useRef } from 'react'
import { formatUnits } from 'viem'
import type { Bill } from '../types'
import { USDC_DECIMALS } from '../contract'
import { CATEGORIES } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────
export interface AgentRules {
  enabled:      boolean
  maxPerBill:   number   // max USDC per single bill
  dailyBudget:  number   // total USDC per day
  categories:   string[] // empty = all
  minScore:     number   // 0-10 pitch quality threshold
}

interface AgentDecision {
  billId: string
  title:  string
  score:  number
  reason: string
  action: 'pay' | 'skip'
  amount: number
  ts:     number
}

// ── Pitch scorer ───────────────────────────────────────────────────────────
function scorePitch(bill: Bill): { score: number; reason: string } {
  const pitch = (bill.pitch ?? '').toLowerCase()
  const title = (bill.title ?? '').toLowerCase()
  const text  = `${pitch} ${title}`
  let score = 4  // base

  // Humor signals
  if (/dog|cat|sock|pizza|emotionally|accidentally|technically|somehow|honestly/.test(text)) score += 2
  // Urgency signals
  if (/urgent|eviction|hospital|emergency|overdue|deadline|final notice/.test(text)) score += 2
  // Clarity (longer pitch = more context)
  const words = pitch.split(/\s+/).filter(Boolean).length
  if (words >= 15) score += 1
  if (words >= 25) score += 1

  score = Math.min(10, score)

  const reason = score >= 7
    ? 'Compelling pitch — humor + urgency combo.'
    : score >= 5
    ? 'Decent pitch. Borderline — paying anyway.'
    : 'Low score — skipping to preserve budget for better pitches.'

  return { score, reason }
}

// ── Panel components ───────────────────────────────────────────────────────
const panel: React.CSSProperties = {
  background: 'var(--s1)', border: '1px solid var(--line)',
  borderRadius: 22, overflow: 'hidden', backdropFilter: 'blur(14px)',
}
const gold = 'linear-gradient(135deg,var(--gold),var(--gold2))'
const label: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--mute)',
  marginBottom: 6, letterSpacing: '.04em',
}
const inp: React.CSSProperties = {
  width: '100%', background: 'var(--s1)', border: '1px solid var(--line)',
  color: 'var(--ink)', borderRadius: 12, padding: '10px 14px',
  fontFamily: 'var(--sans)', fontSize: 14, outline: 'none',
}

export function AgentTab({ bills }: { bills: Bill[] }) {
  const [rules, setRules] = useState<AgentRules>({
    enabled:     false,
    maxPerBill:  50,
    dailyBudget: 200,
    categories:  [],
    minScore:    5,
  })
  const [decisions,  setDecisions]  = useState<AgentDecision[]>([])
  const [spentToday, setSpentToday] = useState(0)
  const [running,    setRunning]    = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Simulate one agent decision cycle
  function runOneCycle() {
    const openBills = bills.filter(b => {
      if (b.status !== 'Open') return false
      const amt = parseFloat(formatUnits(b.amount - b.funded, USDC_DECIMALS))
      if (amt > rules.maxPerBill) return false
      if (rules.categories.length > 0 && !rules.categories.includes(b.category ?? '')) return false
      return true
    })

    if (!openBills.length) return

    const bill = openBills[Math.floor(Math.random() * openBills.length)]
    const { score, reason } = scorePitch(bill)
    const amount = parseFloat(formatUnits(bill.amount - bill.funded, USDC_DECIMALS))
    const wouldExceedBudget = spentToday + amount > rules.dailyBudget

    const action: 'pay' | 'skip' =
      score >= rules.minScore && !wouldExceedBudget ? 'pay' : 'skip'

    const decision: AgentDecision = {
      billId: bill.id.toString(),
      title:  bill.title ?? `Bill #${bill.id.toString()}`,
      score, reason, action, amount,
      ts: Date.now(),
    }

    setDecisions(prev => [decision, ...prev].slice(0, 30))
    if (action === 'pay') setSpentToday(s => s + amount)
  }

  useEffect(() => {
    if (rules.enabled && !running) {
      setRunning(true)
      intervalRef.current = setInterval(runOneCycle, 4000)
    } else if (!rules.enabled && running) {
      setRunning(false)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules.enabled, bills])

  const budgetPct = Math.min(100, (spentToday / rules.dailyBudget) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── HERO PANEL ─────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ height: 3, background: 'linear-gradient(90deg,var(--rose),var(--gold))' }} />
        <div style={{ padding: '22px 24px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <h2 style={{ font: '700 22px var(--serif)', color: 'var(--ink)', marginBottom: 4 }}>Billionaire Agent</h2>
              <p style={{ fontSize: 14, color: 'var(--mute)' }}>
                Autonomous wallet that scores pitches and pays bills within your rules.
                Backed by Circle Developer-Controlled Wallets — no browser interaction needed.
              </p>
            </div>
            {/* Kill switch */}
            <button
              onClick={() => setRules(r => ({ ...r, enabled: !r.enabled }))}
              style={{
                flexShrink: 0,
                padding: '10px 20px', borderRadius: 99, fontWeight: 700, fontSize: 13,
                cursor: 'pointer', border: 0, transition: '.2s',
                background: rules.enabled ? 'var(--ok-dim)' : 'var(--danger-dim)',
                color: rules.enabled ? 'var(--ok)' : 'var(--danger)',
              }}
            >
              {rules.enabled ? '⏸ Pause' : '▶ Start'}
            </button>
          </div>

          {/* ── DCW wallet info ──────────────────────────────────────── */}
          <div style={{ marginTop: 20, background: 'var(--s2)', borderRadius: 14, padding: '14px 18px' }}>
            <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 6, letterSpacing: '.04em' }}>AGENT WALLET (Circle DCW · Arc Testnet)</p>
            <p style={{ fontSize: 13, color: 'var(--ink)', fontFamily: 'var(--mono)' }}>
              {import.meta.env.VITE_AGENT_WALLET_ADDRESS
                ? (import.meta.env.VITE_AGENT_WALLET_ADDRESS as string).slice(0, 10) + '…' + (import.meta.env.VITE_AGENT_WALLET_ADDRESS as string).slice(-6)
                : 'Not configured — set VITE_AGENT_WALLET_ADDRESS'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 4 }}>
              Fund this wallet with testnet USDC to enable live auto-pay.{' '}
              <a href="https://developers.circle.com/wallets/dev-controlled" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Circle DCW docs ↗</a>
            </p>
          </div>
        </div>
      </div>

      {/* ── RULES ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>

        {/* Budget */}
        <div style={{ ...panel, overflow: 'visible' }}>
          <div style={{ height: 3, background: gold }} />
          <div style={{ padding: '18px 20px 22px' }}>
            <h3 style={{ font: '600 16px var(--serif)', color: 'var(--ink)', marginBottom: 14 }}>Daily Budget</h3>
            <label style={label}>MAX PER BILL (USDC)</label>
            <input type="number" min={1} max={500} value={rules.maxPerBill} style={inp}
              onChange={e => setRules(r => ({ ...r, maxPerBill: Math.max(1, parseFloat(e.target.value) || 1) }))} />
            <label style={{ ...label, marginTop: 12 }}>DAILY LIMIT (USDC)</label>
            <input type="number" min={1} max={10000} value={rules.dailyBudget} style={inp}
              onChange={e => setRules(r => ({ ...r, dailyBudget: Math.max(1, parseFloat(e.target.value) || 1) }))} />

            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--mute)', marginBottom: 6 }}>
                <span>Spent today</span>
                <span style={{ fontWeight: 700, color: budgetPct > 80 ? 'var(--danger)' : 'var(--ink)' }}>
                  ${spentToday.toFixed(2)} / ${rules.dailyBudget}
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--s2)', borderRadius: 9, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${budgetPct}%`, background: budgetPct > 80 ? 'var(--danger)' : gold, transition: 'width .5s' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Categories + score threshold */}
        <div style={{ ...panel, overflow: 'visible' }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg,var(--rose),var(--gold))' }} />
          <div style={{ padding: '18px 20px 22px' }}>
            <h3 style={{ font: '600 16px var(--serif)', color: 'var(--ink)', marginBottom: 14 }}>Category Filter</h3>
            <p style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 10 }}>Pay only these categories (empty = all)</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              {CATEGORIES.map(c => {
                const on = rules.categories.includes(c)
                return (
                  <button key={c} onClick={() => setRules(r => ({
                    ...r,
                    categories: on ? r.categories.filter(x => x !== c) : [...r.categories, c],
                  }))} style={{
                    padding: '6px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid var(--line)', transition: '.2s',
                    background: on ? gold : 'var(--s1)', color: on ? '#17130e' : 'var(--mute)',
                  }}>{c}</button>
                )
              })}
            </div>

            <label style={label}>MIN PITCH SCORE (0–10)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={0} max={10} value={rules.minScore}
                onChange={e => setRules(r => ({ ...r, minScore: parseInt(e.target.value) }))}
                style={{ flex: 1, accentColor: 'var(--gold)' }} />
              <span style={{ font: '700 18px var(--serif)', color: 'var(--gold)', width: 28, textAlign: 'right' }}>{rules.minScore}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--mute)', marginTop: 6 }}>Bills scoring below this are skipped.</p>
          </div>
        </div>
      </div>

      {/* ── DECISION LOG ───────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ padding: '20px 22px 24px' }}>
          <h3 style={{ font: '600 18px var(--serif)', color: 'var(--ink)', marginBottom: 16 }}>
            Decision Log
            {running && (
              <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--ok)', fontFamily: 'var(--sans)', fontWeight: 600 }}>
                ● Live
              </span>
            )}
          </h3>

          {decisions.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--mute)', textAlign: 'center', padding: '24px 0' }}>
              {rules.enabled ? 'Agent is running — first decision in a few seconds…' : 'Start the agent to see decisions here.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {decisions.map((d, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < decisions.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: d.action === 'pay' ? 'var(--ok-dim)' : 'var(--danger-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                  }}>{d.action === 'pay' ? '✓' : '✕'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{d.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: d.action === 'pay' ? 'var(--ok-dim)' : 'var(--danger-dim)', color: d.action === 'pay' ? 'var(--ok)' : 'var(--danger)' }}>
                        {d.action === 'pay' ? `Paid $${d.amount.toFixed(2)}` : 'Skipped'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700 }}>Score: {d.score}/10</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--mute)', marginTop: 3 }}>{d.reason}</p>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--mute)', flexShrink: 0 }}>{new Date(d.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── SETUP GUIDE ────────────────────────────────────────────── */}
      <div style={{ ...panel, overflow: 'visible' }}>
        <div style={{ padding: '18px 22px 22px' }}>
          <h3 style={{ font: '600 16px var(--serif)', color: 'var(--ink)', marginBottom: 12 }}>Setup for Live Auto-Pay</h3>
          <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--mute)', fontSize: 13 }}>
            <li>Provision a <a href="https://developers.circle.com/wallets/dev-controlled" target="_blank" rel="noreferrer" style={{ color: 'var(--gold)' }}>Circle Developer API Key</a> and entity secret.</li>
            <li>Set <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 6, fontSize: 12 }}>CIRCLE_API_KEY</code> and <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 6, fontSize: 12 }}>CIRCLE_ENTITY_SECRET</code> in <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 6, fontSize: 12 }}>.env</code>.</li>
            <li>Run <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 6, fontSize: 12 }}>bun run server</code> — the agent loop runs server-side in <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 6, fontSize: 12 }}>server/agent.ts</code>.</li>
            <li>Fund the agent wallet with testnet USDC via the Arc Studio sidebar → "Get test USDC".</li>
            <li>Set <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 6, fontSize: 12 }}>VITE_AGENT_WALLET_ADDRESS</code> in <code style={{ background: 'var(--s2)', padding: '1px 6px', borderRadius: 6, fontSize: 12 }}>.env</code> to show the agent wallet above.</li>
          </ol>
        </div>
      </div>

    </div>
  )
}
