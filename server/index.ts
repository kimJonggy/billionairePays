/**
 * BillSwipe backend server
 *
 * Routes:
 *   GET  /api/health            — liveness check
 *   GET  /api/bills?chainId=N   — indexed bill list (from in-memory indexer)
 *   GET  /api/activity?chainId=N — indexed activity feed
 *   POST /api/refresh?chainId=N — force a re-index tick
 *   POST /api/review            — x402 Pitch Review (0.10 USDC via Gateway Nanopayments)
 *   POST /api/webhooks/circle   — Circle SCP event webhook
 *
 * Start: bun run server
 */

import express from 'express'
import { startIndexer, forceRefresh, getBills, getActivity, isReady } from './indexer'

const app  = express()
const PORT = 3001

app.use(express.json())

// Start the chain indexer (runs in background, polls every 12s)
startIndexer()

// ── Health / ready ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() })
})

app.get('/api/ready', (req, res) => {
  const chainId = parseInt((req.query.chainId as string) || '5042002', 10)
  res.json({ ready: isReady(chainId), chainId })
})

// ── Bills ─────────────────────────────────────────────────────────────────────
app.get('/api/bills', (req, res) => {
  const chainId = req.query.chainId ? Number(req.query.chainId) : undefined
  res.json(getBills(chainId))
})

// ── Activity / Leaderboard ────────────────────────────────────────────────────
app.get('/api/activity', (req, res) => {
  const chainId = req.query.chainId ? Number(req.query.chainId) : undefined
  res.json(getActivity(chainId))
})

// ── Force refresh ─────────────────────────────────────────────────────────────
// Called by the frontend after a successful createBill() tx so the new bill
// shows up without waiting for the next poll tick.
app.post('/api/refresh', (req, res) => {
  const chainId = req.query.chainId ? Number(req.query.chainId) : 5042002
  forceRefresh(chainId)
  res.json({ ok: true, chainId })
})

// ── x402 Pitch Review ─────────────────────────────────────────────────────────
function scorePitch(pitch: string): { score: number; verdict: string; tips: string[] } {
  const lower  = pitch.toLowerCase()
  const humor  = ['dog','cat','sock','pizza','emotionally','regret','accidentally','somehow','honestly','technically'].some(w => lower.includes(w)) ? 2 : 0
  const urgent = ['urgent','eviction','hospital','emergency','overdue','final notice','deadline'].some(w => lower.includes(w)) ? 2 : 0
  const clear  = pitch.trim().split(' ').length >= 8 ? 1 : 0
  const score  = Math.min(10, humor + urgent + clear + Math.floor(pitch.length / 40))
  const verdict = score >= 7 ? '🔥 Highly payable' : score >= 4 ? '👍 Decent chance' : '🥱 Needs work'
  const tips: string[] = []
  if (humor  === 0) tips.push('Add a funny detail — billionaires love absurdity.')
  if (urgent === 0) tips.push('Convey urgency — deadlines move wallets.')
  if (pitch.length < 60) tips.push('Expand your pitch — more context = more empathy.')
  return { score, verdict, tips }
}

let reviewHandler: express.RequestHandler = (_req, res) => {
  res.json({ error: 'x402 middleware not available — install @circle-fin/x402-batching' })
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createGatewayMiddleware } = require('@circle-fin/x402-batching') as {
    createGatewayMiddleware: (opts: unknown) => {
      require: (price: string, token: string, recipient: string) => express.RequestHandler
    }
  }
  const receiverAddress = process.env.VITE_BILLSWIPE_ADDRESS ?? '0x0000000000000000000000000000000000000000'
  const gateway = createGatewayMiddleware({ facilitatorUrl: 'https://gateway-api-testnet.circle.com' })
  reviewHandler = [
    gateway.require('0.10', 'USDC', receiverAddress),
    (req: express.Request, res: express.Response) => {
      const { pitch } = req.body as { pitch?: string }
      if (!pitch || typeof pitch !== 'string' || pitch.trim().length < 5) {
        res.status(400).json({ error: 'pitch is required (min 5 chars)' }); return
      }
      res.json({ pitch, ...scorePitch(pitch), poweredBy: 'BillSwipe Pitch Intelligence • 0.10 USDC' })
    },
  ] as unknown as express.RequestHandler
} catch { /* x402-batching not installed */ }

app.post('/api/review', reviewHandler)

// ── Circle Onramp session (Feature 4) ─────────────────────────────────────────
// Mints a short-lived onramp session using the Circle API key.
// The browser never sees the API key — it only gets the session token.
app.post('/api/onramp/session', async (req, res) => {
  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) { res.status(503).json({ error: 'CIRCLE_API_KEY not set' }); return }

  const { appUserId, destinationAddress } = req.body as { appUserId?: string; destinationAddress?: string }
  if (!appUserId || !destinationAddress) {
    res.status(400).json({ error: 'appUserId and destinationAddress are required' }); return
  }

  try {
    const widgetBaseUrl = process.env.VITE_ONRAMP_WIDGET_BASE_URL ?? 'https://onramp-sandbox.arc.io'
    const baseUrl       = widgetBaseUrl.includes('sandbox')
      ? 'https://api-test.circle.com'
      : 'https://api.circle.com'

    const sessionRes = await fetch(`${baseUrl}/v1/w3s/onramp/sessions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body:    JSON.stringify({ appUserId, destinationAddress }),
    })
    if (!sessionRes.ok) {
      const err = await sessionRes.text()
      res.status(sessionRes.status).json({ error: err }); return
    }
    const data = await sessionRes.json() as { data?: { userToken?: string } }
    res.json({ sessionToken: data.data?.userToken ?? '', widgetBaseUrl })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// ── Circle SCP Webhook — Feature 8 ───────────────────────────────────────────
// Register this URL in Circle Console → Smart Contract Platform → Event Monitors.
// Extend the notifyRequester function to send email/push via Resend or similar.
async function notifyRequester(billId: string, payer: string, requester: string, txHash: string) {
  console.log(`[webhook] BillPaid bill=${billId} payer=${payer} requester=${requester} tx=${txHash}`)

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return  // no email configured — log only

  // Resend email stub — replace with your real email lookup / template
  try {
    await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body:    JSON.stringify({
        from:    'BillSwipe <noreply@billswipe.app>',
        to:      [requester],   // replace with real email from your user DB
        subject: `Your bill #${billId} was paid!`,
        html:    `<p>Great news — bill <b>#${billId}</b> was just paid by <code>${payer}</code>.</p>
                  <p>Tx: <a href="https://explorer.testnet.arc.io/tx/${txHash}">${txHash}</a></p>`,
      }),
    })
    console.log(`[webhook] email sent for bill ${billId}`)
  } catch (e) {
    console.error('[webhook] email failed:', e)
  }
}

app.post('/api/webhooks/circle', (req, res) => {
  try {
    const body = req.body as {
      notificationType?: string
      notification?: { contractAddress?: string; txHash?: string; eventName?: string; topics?: string[]; data?: string }
      timestamp?: string
    }
    if (body.notificationType === 'contracts.eventLog') {
      const ev = body.notification?.eventName ?? ''
      if (ev.startsWith('BillPaid(')) {
        const { txHash = '', topics = [] } = body.notification ?? {}
        const billId    = topics[1] ? BigInt(topics[1]).toString() : 'unknown'
        const payer     = topics[2] ? `0x${topics[2].slice(-40)}` : 'unknown'
        const requester = topics[3] ? `0x${topics[3].slice(-40)}` : 'unknown'
        void notifyRequester(billId, payer, requester, txHash)
        // Force indexer to pick up the new paid status quickly
        forceRefresh(5042002); forceRefresh(5042)
      } else if (ev.startsWith('BillCreated(')) {
        const { topics = [] } = body.notification ?? {}
        const billId = topics[1] ? BigInt(topics[1]).toString() : '?'
        console.log(`[webhook] BillCreated bill=${billId}`)
        forceRefresh(5042002); forceRefresh(5042)
      } else {
        console.log(`[webhook] ${ev}`)
      }
    } else {
      console.log(`[webhook] ${body.notificationType ?? 'unknown'} @ ${body.timestamp ?? ''}`)
    }
    res.json({ received: true })
  } catch (e) {
    console.error('[webhook] error:', e)
    res.status(500).json({ error: 'webhook processing failed' })
  }
})

app.listen(PORT, () => {
  console.log(`[server] BillSwipe backend on http://localhost:${PORT}`)
  console.log(`         GET  /api/bills?chainId=5042002`)
  console.log(`         GET  /api/activity?chainId=5042002`)
  console.log(`         GET  /api/ready?chainId=5042002`)
  console.log(`         POST /api/refresh?chainId=5042002`)
  console.log(`         POST /api/onramp/session`)
  console.log(`         POST /api/review`)
  console.log(`         POST /api/webhooks/circle`)
})
