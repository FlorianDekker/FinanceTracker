import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useCategories } from './useCategories'

export function useBudgetStats(year, month) {
  const categories = useCategories()

  const spentData = useLiveQuery(async () => {
    if (!year || !month) return {}
    const prefix = `${year}-${String(month).padStart(2, '0')}`

    // Get current month debits
    const txs = await db.transactions
      .where('date').startsWith(prefix)
      .toArray()

    // Get all debits before current month (same year)
    const yearPrefix = `${year}-`
    const allYearTxs = await db.transactions
      .where('date').startsWith(yearPrefix)
      .toArray()

    const spent = {}
    const spentBefore = {}

    for (const tx of allYearTxs) {
      if (tx.type === 'credit') continue
      const m = Number(tx.date.slice(5, 7))
      if (tx.date.startsWith(prefix)) {
        spent[tx.category] = (spent[tx.category] ?? 0) + tx.amount
      } else if (m < month) {
        spentBefore[tx.category] = (spentBefore[tx.category] ?? 0) + tx.amount
      }
    }

    return { spent, spentBefore }
  }, [year, month])

  if (!spentData || !categories.length) return []

  const { spent = {}, spentBefore = {} } = spentData

  return categories.map(cat => {
    const budget = cat.budget
    const s = spent[cat.key] ?? 0
    const sb = spentBefore[cat.key] ?? 0
    const remaining = budget - s
    const ratio = budget > 0 ? Math.max(0, Math.min(1, remaining / budget)) : 0

    // Pace knob: how much prior-month overspend eats into this month's budget
    const paceOverspendBefore = sb - budget * (month - 1)
    const paceBuffer = Math.max(0, paceOverspendBefore)
    const bufferAmt = Math.min(Math.max(0, remaining), paceBuffer)
    const bufferRatio = budget > 0 ? Math.max(0, Math.min(1, bufferAmt / budget)) : 0

    return {
      ...cat,
      spent: s,
      spentBefore: sb,
      remaining,
      ratio,
      bufferRatio,
      overspent: remaining < 0,
    }
  })
}
