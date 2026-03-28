import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

export function useTransactions(year, month) {
  return useLiveQuery(async () => {
    if (!year || !month) return db.transactions.orderBy('date').reverse().toArray()
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return db.transactions
      .where('date')
      .startsWith(prefix)
      .reverse()
      .sortBy('date')
  }, [year, month])
}

export async function addTransaction(tx) {
  return db.transactions.add({ ...tx, importedAt: Date.now() })
}

export async function updateTransaction(id, changes) {
  return db.transactions.update(id, changes)
}

export async function deleteTransaction(id) {
  return db.transactions.delete(id)
}

export async function bulkAddTransactions(txs) {
  return db.transactions.bulkAdd(txs.map(t => ({ ...t, importedAt: Date.now() })))
}
