/**
 * BillSwipe on-chain indexer
 *
 * Strategy:
 *  - Initial load: call billCount() then getBill(1..N) sequentially.
 *    This avoids wide eth_getLogs scans on a fast chain with short rate limits.
 *  - Subsequent ticks: getLogs over a small window (new blocks only) to catch
 *    new BillCreated events, then re-enrich any Open bills for status changes.
 *
 * RPC: uses RPC_PROXY_BASE_URL when available, falls back to the public URL
 * read from onchain-facts (never a hardcoded literal).
 */

import { createPublicClient, http, parseAbiItem } from 'viem'
import { ONCHAIN_CHAINS } from '../src/onchain-facts'
import { BILLSWIPE_ABI } from '../src/contract'

// ── Chain IDs ─────────────────────────────────────────────────────────────────

const ARC_TESTNET_ID = 5042002
const ARC_MAINNET_ID = 5042

// ── RPC URL resolution ────────────────────────────────────────────────────────

function rpcUrl(compassKey: string, chainId: number): string {
  const base   = process.env.RPC_PROXY_BASE_URL
  const token  = process.env.RPC_PROXY_TOKEN
  const chains = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map(s => s.trim())
  if (base && token && chains.includes(compassKey)) {
    return `${base}/api/rpc/${compassKey}?_rpc_token=${token}`
  }
  const chain = ONCHAIN_CHAINS.find(c => c.chainId === chainId)
  const url   = chain?.rpcUrls[0]
  if (!url) throw new Error(`No RPC URL found for chain ${chainId}`)
  console.warn(`[indexer] chain=${chainId} on public RPC — may rate-limit`)
  return url
}

// ── Chain config ──────────────────────────────────────────────────────────────

interface ChainCfg {
  id:         number
  compassKey: string
  contract:   string
}

const CHAIN_CFGS: ChainCfg[] = [
  {
    id:         ARC_TESTNET_ID,
    compassKey: 'Arc_Testnet',
    contract:   (process.env.VITE_BILLSWIPE_ADDRESS        ?? '').toLowerCase(),
  },
  {
    id:         ARC_MAINNET_ID,
    compassKey: 'Arc',
    contract:   (process.env.VITE_BILLSWIPE_MAINNET_ADDRESS ?? '').toLowerCase(),
  },
]

// ── ABI fragments for getLogs ─────────────────────────────────────────────────

const CREATED_ABI = parseAbiItem(
  'event BillCreated(uint256 indexed id, address indexed requester, address payoutAddress, uint256 amount, string metadataURI, uint256 deadline)'
)
const PAID_ABI = parseAbiItem(
  'event BillPaid(uint256 indexed id, address indexed payer, address indexed requester, uint256 amount, string txNote, uint256 timestamp)'
)

// ── Types ─────────────────────────────────────────────────────────────────────

const STATUS_MAP = ['Open', 'Paid', 'Cancelled', 'Expired'] as const
type BillStatus = typeof STATUS_MAP[number]

export interface IndexedBill {
  id:            string
  requester:     string
  payoutAddress: string
  amount:        string
  funded:        string
  metadataURI:   string
  deadline:      string
  status:        BillStatus
  paidBy:        string
  paidAt:        string
  txNote:        string
  title?:        string
  pitch?:        string
  category?:     string
  imageUrl?:     string
  chainId:       number
}

export interface IndexedActivity {
  billId:    string
  payer:     string
  requester: string
  amount:    string
  txNote:    string
  timestamp: string
  txHash?:   string
  chainId:   number
}

// ── In-memory store ───────────────────────────────────────────────────────────

const billStore     = new Map<string, IndexedBill>()
const activityStore = new Map<string, IndexedActivity>()
const metaCache     = new Map<string, Partial<IndexedBill>>()
const lastBlock     = new Map<number, bigint>()
const initialised   = new Set<number>()  // chains whose full bill list was loaded

export function getBills(chainId?: number): IndexedBill[] {
  const all = Array.from(billStore.values())
  const filtered = chainId ? all.filter(b => b.chainId === chainId) : all
  return filtered.sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)))
}

export function getActivity(chainId?: number): IndexedActivity[] {
  const all = Array.from(activityStore.values())
  const filtered = chainId ? all.filter(a => a.chainId === chainId) : all
  return filtered.sort((a, b) => Number(BigInt(b.timestamp) - BigInt(a.timestamp))).slice(0, 100)
}

export function isReady(chainId: number): boolean {
  return initialised.has(chainId)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Run `tasks` with at most `concurrency` in flight at a time. */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 4,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

async function fetchMeta(uri: string): Promise<Partial<IndexedBill>> {
  if (!uri || uri.startsWith('\x00')) return {}
  if (metaCache.has(uri)) return metaCache.get(uri)!
  try {
    const url = uri.startsWith('ipfs://')
      ? `https://ipfs.io/ipfs/${uri.slice(7)}`
      : uri
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) { metaCache.set(uri, {}); return {} }
    const j = await res.json() as { title?: string; pitch?: string; category?: string; imageUrl?: string }
    const parsed: Partial<IndexedBill> = { title: j.title, pitch: j.pitch, category: j.category, imageUrl: j.imageUrl }
    metaCache.set(uri, parsed)
    return parsed
  } catch {
    metaCache.set(uri, {})
    return {}
  }
}

type ViemClient = ReturnType<typeof createPublicClient>

/** Call getBill(id) with up to 3 retries on rate-limit, return null on persistent failure. */
async function fetchBillById(
  client: ViemClient,
  contract: `0x${string}`,
  id: bigint,
  chainId: number,
): Promise<IndexedBill | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await client.readContract({
        address:      contract,
        abi:          BILLSWIPE_ABI,
        functionName: 'getBill',
        args:         [id],
      })
      // getBill returns a named tuple object
      const r = raw as {
        id: bigint; requester: string; payoutAddress: string; amount: bigint; funded: bigint
        metadataURI: string; deadline: bigint; status: number
        paidBy: string; paidAt: bigint; txNote: string
      }
      const bill: IndexedBill = {
        id:            r.id.toString(),
        requester:     r.requester,
        payoutAddress: r.payoutAddress,
        amount:        r.amount.toString(),
        funded:        r.funded.toString(),
        metadataURI:   r.metadataURI,
        deadline:      r.deadline.toString(),
        status:        STATUS_MAP[r.status] ?? 'Open',
        paidBy:        r.paidBy,
        paidAt:        r.paidAt.toString(),
        txNote:        r.txNote,
        chainId,
      }
      const meta = await fetchMeta(r.metadataURI)
      return { ...bill, ...meta }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isRateLimit = msg.includes('rate limit') || msg.includes('429') || msg.includes('Request exceeds')
      if (isRateLimit && attempt < 2) {
        const wait = 1500 * (attempt + 1)
        console.log(`[indexer] rate-limit getBill(${id}) chain=${chainId} retry in ${wait}ms`)
        await sleep(wait)
      } else {
        console.warn(`[indexer] getBill(${id}) chain=${chainId} failed: ${msg.slice(0, 120)}`)
        return null
      }
    }
  }
  return null
}

/** Fetch BillPaid logs over a small block range (≤2000 blocks). */
async function fetchPaidLogs(
  client: ViemClient,
  contract: `0x${string}`,
  fromBlock: bigint,
  toBlock: bigint,
  chainId: number,
) {
  try {
    const logs = await client.getLogs({ address: contract, event: PAID_ABI, fromBlock, toBlock })
    for (const log of logs as unknown[]) {
      const l = log as {
        args: { id: bigint; payer: string; requester: string; amount: bigint; txNote: string; timestamp: bigint }
        transactionHash?: string
      }
      const key = l.transactionHash ?? `${l.args.id}-${l.args.payer}-${l.args.timestamp}`
      activityStore.set(key, {
        billId:    l.args.id.toString(),
        payer:     l.args.payer,
        requester: l.args.requester,
        amount:    l.args.amount.toString(),
        txNote:    l.args.txNote,
        timestamp: l.args.timestamp.toString(),
        txHash:    l.transactionHash,
        chainId,
      })
    }
  } catch (e) {
    console.warn(`[indexer] BillPaid getLogs chain=${chainId}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`)
  }
}

// ── Per-chain tick ────────────────────────────────────────────────────────────

async function indexChain(cfg: ChainCfg) {
  if (!cfg.contract || cfg.contract.length < 10) return

  let url: string
  try { url = rpcUrl(cfg.compassKey, cfg.id) } catch (e) { console.warn(String(e)); return }

  const chainMeta = ONCHAIN_CHAINS.find(c => c.chainId === cfg.id)!
  const viemChain = {
    id:             cfg.id,
    name:           chainMeta.name,
    nativeCurrency: { name: chainMeta.nativeCurrency.symbol, symbol: chainMeta.nativeCurrency.symbol, decimals: chainMeta.nativeCurrency.decimals },
    rpcUrls:        { default: { http: [url] as [string] } },
  }
  const client: ViemClient  = createPublicClient({ transport: http(url), chain: viemChain })
  const contract = cfg.contract as `0x${string}`

  try {
    const head = await client.getBlockNumber()

    // ── Initial load: read billCount then fetch all bills in parallel ─────────
    if (!initialised.has(cfg.id)) {
      console.log(`[indexer] chain=${cfg.id} initial load from billCount()`)
      const countRaw = await client.readContract({
        address: contract, abi: BILLSWIPE_ABI, functionName: 'billCount',
      }) as bigint
      const count = Number(countRaw)
      console.log(`[indexer] chain=${cfg.id} loading ${count} bills (parallel, concurrency=4)`)
      const ids = Array.from({ length: count }, (_, i) => BigInt(i + 1))
      await pMap(ids, async (id) => {
        const bill = await fetchBillById(client, contract, id, cfg.id)
        if (bill) billStore.set(`${cfg.id}-${id}`, bill)
      }, 4)
      // Also fetch recent BillPaid logs for the activity feed
      const lookback = head > 10000n ? head - 10000n : 0n
      await fetchPaidLogs(client, contract, lookback, head, cfg.id)
      initialised.add(cfg.id)
      lastBlock.set(cfg.id, head)
      console.log(`[indexer] chain=${cfg.id} initial load done — ${getBills(cfg.id).length} bills`)
      return
    }

    // ── Subsequent ticks: scan new blocks only ────────────────────────────────
    const prev = lastBlock.get(cfg.id)!
    const from = prev + 1n
    if (from > head) return  // no new blocks yet

    console.log(`[indexer] chain=${cfg.id} incremental ${from}→${head}`)

    // Check for new bills via getLogs (small window — only new blocks)
    const MAX_RANGE = 2000n
    let cursor = from
    const newBillIds: bigint[] = []
    while (cursor <= head) {
      const toBlock = cursor + MAX_RANGE - 1n < head ? cursor + MAX_RANGE - 1n : head
      try {
        const logs = await client.getLogs({ address: contract, event: CREATED_ABI, fromBlock: cursor, toBlock })
        for (const log of logs as unknown[]) {
          const l = log as { args: { id: bigint } }
          newBillIds.push(l.args.id)
        }
      } catch (e) {
        console.warn(`[indexer] BillCreated getLogs chunk ${cursor}→${toBlock}: ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`)
      }
      cursor = toBlock + 1n
    }
    await pMap(newBillIds, async (id) => {
      const bill = await fetchBillById(client, contract, id, cfg.id)
      if (bill) billStore.set(`${cfg.id}-${id}`, bill)
    }, 4)

    // Fetch new BillPaid logs
    await fetchPaidLogs(client, contract, from, head, cfg.id)

    // Re-enrich Open bills in parallel to catch state changes (someone paid)
    const openEntries = Array.from(billStore.entries())
      .filter(([, bill]) => bill.chainId === cfg.id && bill.status === 'Open')
    await pMap(openEntries, async ([key, bill]) => {
      const refreshed = await fetchBillById(client, contract, BigInt(bill.id), cfg.id)
      if (refreshed) billStore.set(key, refreshed)
    }, 4)

    lastBlock.set(cfg.id, head)
    console.log(`[indexer] chain=${cfg.id} done — ${getBills(cfg.id).length} bills`)
  } catch (e) {
    console.warn(`[indexer] chain=${cfg.id} error: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`)
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

const POLL_MS = 30_000
let ticking = false

async function tick() {
  if (ticking) return
  ticking = true
  try {
    for (const cfg of CHAIN_CFGS) await indexChain(cfg)
  } finally {
    ticking = false
  }
}

export function startIndexer() {
  console.log(`[indexer] starting — poll every ${POLL_MS}ms`)
  void tick()
  setInterval(() => { void tick() }, POLL_MS)
}

/** Force a full re-load for a chain (e.g. after a new upload). */
export function forceRefresh(chainId: number) {
  initialised.delete(chainId)
  lastBlock.delete(chainId)
  // Remove cached bills for this chain so the fresh load replaces them cleanly
  for (const key of billStore.keys()) {
    if (key.startsWith(`${chainId}-`)) billStore.delete(key)
  }
  const cfg = CHAIN_CFGS.find(c => c.id === chainId)
  if (cfg) {
    console.log(`[indexer] force-refresh chain=${chainId}`)
    void indexChain(cfg)
  }
}
