import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { countsInTotals } from '../utils/claims'
import { useCategories } from './useCategories'

export function useYearGrid(year) {
  // Jaargrid is historisch: ook gearchiveerde uitgavencategorieen tellen mee.
  const { allCategories, loading } = useCategories()
  const expenseCats = useMemo(
    () => allCategories.filter(c => c.type === 'expense'),
    [allCategories]
  )

  return useLiveQuery(async () => {
    if (!year || loading) return null
    const yearPrefix = `${year}-`
    const txs = await db.transactions.where('date').startsWith(yearPrefix).filter(countsInTotals).toArray()

    // Build spend[category][month] matrix
    const matrix = {}
    for (const cat of expenseCats) {
      matrix[cat.key] = Array(12).fill(0)
    }

    // Monthly totals
    const monthTotals = Array(12).fill(0)

    for (const tx of txs) {
      const m = parseInt(tx.date.slice(5, 7), 10) - 1
      if (m < 0 || m > 11) continue
      if (!matrix[tx.category]) continue
      const delta = tx.type === 'debit' ? tx.amount : -tx.amount
      matrix[tx.category][m] += delta
      monthTotals[m] += delta
    }

    return { matrix, monthTotals }
  }, [year, expenseCats, loading])
}
