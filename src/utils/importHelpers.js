import { db } from '../db/db'

// Build dedup key for a transaction.
// Zonder `note` blijft de sleutel identiek aan de oude vorm (bankimport);
// backup/restore geeft de omschrijving wel mee, zodat twee losse betalingen van
// hetzelfde bedrag op dezelfde dag niet ten onrechte als duplicaat gelden.
export function dedupKey(date, amount, type, note) {
  const base = `${date}|${amount}|${type}`
  return note === undefined ? base : `${base}|${note}`
}

// Get all existing dedup keys from IndexedDB
export async function getExistingKeys() {
  const all = await db.transactions.toArray()
  return new Set(all.map(t => dedupKey(t.date, t.amount, t.type)))
}

// Alle rekeningen (IBAN's, "Revolut Current", …) die al in de app voorkomen.
// Gebruikt om een overboeking naar een eigen rekening te herkennen, zie
// `src/utils/ownTransfers.js`.
export async function getExistingAccounts() {
  const all = await db.transactions.toArray()
  return all.map(t => t.account).filter(Boolean)
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
