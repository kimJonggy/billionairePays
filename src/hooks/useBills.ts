/**
 * useBillEvents — fetches bills and activity from the backend REST API
 * instead of calling RPC directly. The backend indexer handles all on-chain
 * polling so the frontend never hits RPC rate limits.
 *
 * useBillCount / useBill — kept for direct contract reads (e.g. post-tx checks)
 * but these are rarely called from UI; the list comes from the indexer.
 */

import { useReadContract, useAccount } from 'wagmi'
import { useState, useEffect, useCallback, useRef } from 'react'
import { BILLSWIPE_ABI, getBillSwipeAddress, ARC_TESTNET_ID, ARC_MAINNET_ID, isArcChain } from '../contract'
import type { Bill, BillStatus, ActivityItem, LeaderEntry } from '../types'
import type { IndexedBill, IndexedActivity } from '../../server/indexer'

// ── Chain helpers ─────────────────────────────────────────────────────────────

function useArcChainId(): typeof ARC_TESTNET_ID | typeof ARC_MAINNET_ID {
  const { chainId } = useAccount()
  return isArcChain(chainId) ? chainId : ARC_TESTNET_ID
}

// ── Direct contract reads (kept for post-tx verification) ─────────────────────

export function useBillCount() {
  const chainId = useArcChainId()
  return useReadContract({ address: getBillSwipeAddress(chainId), abi: BILLSWIPE_ABI, functionName: 'billCount', chainId })
}

export function useBill(id: bigint | undefined) {
  const chainId = useArcChainId()
  return useReadContract({
    address: getBillSwipeAddress(chainId), abi: BILLSWIPE_ABI, functionName: 'getBill',
    args: id ? [id] : undefined, chainId, query: { enabled: id != null && id > 0n },
  })
}

// ── REST → Bill type conversion ───────────────────────────────────────────────

const STATUS_MAP: BillStatus[] = ['Open', 'Paid', 'Cancelled', 'Expired']

function fromIndexed(b: IndexedBill): Bill {
  return {
    id:            BigInt(b.id),
    requester:     b.requester,
    payoutAddress: b.payoutAddress ?? b.requester,   // back-compat: old bills w/o field
    amount:        BigInt(b.amount),
    funded:        BigInt(b.funded),
    metadataURI:   b.metadataURI,
    deadline:      BigInt(b.deadline),
    status:        (STATUS_MAP.includes(b.status) ? b.status : 'Open'),
    paidBy:        b.paidBy,
    paidAt:        BigInt(b.paidAt),
    txNote:        b.txNote,
    title:         b.title,
    pitch:         b.pitch,
    category:      b.category,
    imageUrl:      b.imageUrl,
  }
}

function fromIndexedActivity(a: IndexedActivity): ActivityItem {
  return {
    billId:    BigInt(a.billId),
    payer:     a.payer,
    requester: a.requester,
    amount:    BigInt(a.amount),
    txNote:    a.txNote,
    timestamp: BigInt(a.timestamp),
    txHash:    a.txHash,
  }
}

// ── Main hook ─────────────────────────────────────────────────────────────────

const POLL_MS = 8_000   // poll the backend every 8 s (much cheaper than RPC)

export function useBillEvents() {
  const chainId = useArcChainId()

  const [bills,       setBills]       = useState<Bill[]>([])
  const [activity,    setActivity]    = useState<ActivityItem[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([])
  const [loading,     setLoading]     = useState(true)
  const [syncing,     setSyncing]     = useState(true)  // true while indexer initial load is running

  const abortRef = useRef<AbortController | null>(null)

  // Poll /api/ready until the indexer finishes its initial billCount load
  useEffect(() => {
    let cancelled = false
    const check = async () => {
      try {
        const res = await fetch(`/api/ready?chainId=${chainId}`)
        if (!res.ok) return
        const { ready } = await res.json() as { ready: boolean }
        if (!cancelled) setSyncing(!ready)
      } catch { /* backend not yet up */ }
    }
    void check()
    const id = setInterval(() => { void check() }, 2000)
    return () => { cancelled = true; clearInterval(id) }
  }, [chainId])

  const fetchAll = useCallback(async (signal?: AbortSignal, clearFirst = false) => {
    if (clearFirst) { setBills([]); setActivity([]); setLeaderboard([]) }
    setLoading(true)
    try {
      const [billsRes, actRes] = await Promise.all([
        fetch(`/api/bills?chainId=${chainId}`,    { signal }),
        fetch(`/api/activity?chainId=${chainId}`, { signal }),
      ])
      if (!billsRes.ok || !actRes.ok) throw new Error('backend unavailable')

      const rawBills:    IndexedBill[]     = await billsRes.json() as IndexedBill[]
      const rawActivity: IndexedActivity[] = await actRes.json()   as IndexedActivity[]

      const convertedBills    = rawBills.map(fromIndexed)
      const convertedActivity = rawActivity.map(fromIndexedActivity)

      setBills(convertedBills)
      setActivity(convertedActivity)

      // Build leaderboard from activity
      const payerMap = new Map<string, { totalPaid: bigint; billCount: number; lastPaidAt: number }>()
      for (const item of convertedActivity) {
        const existing = payerMap.get(item.payer) ?? { totalPaid: 0n, billCount: 0, lastPaidAt: 0 }
        payerMap.set(item.payer, {
          totalPaid:  existing.totalPaid + item.amount,
          billCount:  existing.billCount + 1,
          lastPaidAt: Math.max(existing.lastPaidAt, Number(item.timestamp)),
        })
      }
      setLeaderboard(
        Array.from(payerMap.entries())
          .map(([address, v]) => ({ address, ...v }))
          .sort((a, b) => Number(b.totalPaid - a.totalPaid))
      )
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      console.warn('[useBills] fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [chainId])

  // Re-fetch immediately when chain switches, then poll on an interval.
  // All state updates happen inside fetchAll *after* the async fetch resolves,
  // never synchronously during the effect body.
  /* eslint-disable react/set-state-in-effect */
  useEffect(() => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    void fetchAll(ctrl.signal, true)
    const id = setInterval(() => { void fetchAll(ctrl.signal) }, POLL_MS)
    return () => { clearInterval(id); ctrl.abort() }
  }, [fetchAll])
  /* eslint-enable react/set-state-in-effect */

  // Manual refetch — triggers a backend force-refresh (re-runs billCount + getBill)
  const refetch = useCallback(async () => {
    setSyncing(true)
    try { await fetch(`/api/refresh?chainId=${chainId}`, { method: 'POST' }) } catch { /* ok */ }
    // Give the indexer time to complete the re-load, then pull fresh data
    await new Promise<void>(r => setTimeout(r, 5000))
    void fetchAll()
  }, [chainId, fetchAll])

  return { bills, activity, leaderboard, loading, syncing, refetch, chainId }
}
