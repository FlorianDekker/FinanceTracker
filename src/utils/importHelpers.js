import { db } from '../db/db'

// Build dedup key for a transaction
export function dedupKey(date, amount, type) {
  return `${date}|${amount}|${type}`
}

// Get all existing dedup keys from IndexedDB
export async function getExistingKeys() {
  const all = await db.transactions.toArray()
  return new Set(all.map(t => dedupKey(t.date, t.amount, t.type)))
}

// Serialize all transactions back to CSV
export async function exportToCsv() {
  const txs = await db.transactions.orderBy('date').toArray()
  const header = 'date,amount,type,category,subcategory,note\n'
  const rows = txs.map(t => {
    const note = String(t.note ?? '').replace(/"/g, '""')
    return `${t.date},${t.amount},${t.type},${t.category},${t.subcategory},"${note}"`
  })
  return header + rows.join('\n')
}
