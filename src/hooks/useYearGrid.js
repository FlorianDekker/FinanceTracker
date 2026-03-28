import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { EXPENSE_CATEGORIES } from '../constants/categories'

export function useYearGrid(year) {
  return useLiveQuery(async () => {
    if (!year) return null
    const yearPrefix = `${year}-`
    const txs = await db.transactions.where('date').startsWith(yearPrefix).toArray()

    // Build spend[category][month] matrix
    const matrix = {}
    for (const cat of EXPENSE_CATEGORIES) {
      matrix[cat.key] = Array(12).fill(0)
    }

    // Monthly totals
    const monthTotals = Array(12).fill(0)

    for (const tx of txs) {
      if (tx.type !== 'debit') continue
      const m = parseInt(tx.date.slice(5, 7), 10) - 1
      if (m < 0 || m > 11) continue
      if (matrix[tx.category]) {
        matrix[tx.category][m] += tx.amount
      }
      monthTotals[m] += tx.amount
    }

    return { matrix, monthTotals }
  }, [year])
}
