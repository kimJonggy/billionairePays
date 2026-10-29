export type BillStatus = 'Open' | 'Paid' | 'Cancelled' | 'Expired'

export interface Bill {
  id: bigint
  requester: string
  payoutAddress: string   // wallet that receives payment; defaults to requester
  amount: bigint
  funded: bigint
  metadataURI: string
  deadline: bigint
  status: BillStatus
  paidBy: string
  paidAt: bigint
  txNote: string
  // enriched from metadata
  title?: string
  pitch?: string
  category?: string
  imageUrl?: string
}

export type Tab = 'home' | 'upload' | 'swipe' | 'mybills' | 'leaderboard' | 'agent' | 'bridge' | 'wallets'

export interface LeaderEntry {
  address: string
  totalPaid: bigint
  billCount: number
  lastPaidAt: number
}

export interface ActivityItem {
  billId: bigint
  payer: string
  requester: string
  amount: bigint
  txNote: string
  timestamp: bigint
  txHash?: string
}

export const CATEGORIES = [
  'Rent', 'Medical', 'Groceries', 'Education',
  'Utilities', 'Emergency', 'Startup', 'Other',
] as const
export type Category = typeof CATEGORIES[number]

export const CATEGORY_COLORS: Record<string, string> = {
  Rent: '#e86d3a',
  Medical: '#e83a6f',
  Groceries: '#1a8047',
  Education: '#1061a6',
  Utilities: '#6b3abf',
  Emergency: '#c41f1f',
  Startup: '#d4a017',
  Other: '#8a849c',
}
