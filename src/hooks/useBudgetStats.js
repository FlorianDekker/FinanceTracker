import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { countsInTotals } from '../utils/claims'
import { useCategories } from './useCategories'

export function useBudgetStats(year, month) {
  const { allCategories, catMap, getByRole } = useCategories()
  const transferKey = getByRole('transfer')?.key

  const spentData = useLiveQuery(async () => {
    if (!year || !month) return {}
    const prefix = `${year}-${String(month).padStart(2, '0')}`

    // Alle transacties van dit jaar (huidige maand + eerdere maanden)
    const yearPrefix = `${year}-`
    const allYearTxs = await db.transactions
      .where('date').startsWith(yearPrefix)
      .filter(countsInTotals)     // lopende declaraties en hun uitbetaling tellen niet mee
      .toArray()

    const spent = {}
    const spentBefore = {}

    for (const tx of allYearTxs) {
      const catType = catMap[tx.category]?.type
      // Skip income credits (salary) — they're not spending
      if (tx.type === 'credit' && catType === 'income') continue
      // Skip de overboekingscategorie (rol 'transfer') en alles van het type
      // Overboeking (sparen, investeren): geen uitgave, het geld is er nog.
      if (transferKey && tx.category === transferKey) continue
      if (catType === 'transfer') continue
      const amount = tx.type === 'credit' ? -tx.amount : tx.amount
      const m = Number(tx.date.slice(5, 7))
      if (tx.date.startsWith(prefix)) {
        spent[tx.category] = (spent[tx.category] ?? 0) + amount
      } else if (m < month) {
        spentBefore[tx.category] = (spentBefore[tx.category] ?? 0) + amount
      }
    }

    return { spent, spentBefore }
  }, [year, month, catMap, transferKey])

  if (!spentData || !allCategories.length) return []

  const { spent = {}, spentBefore = {} } = spentData

  // Gearchiveerde categorieën blijven meedoen zolang ze in de getoonde maand
  // nog uitgaven hebben — anders zou een oude maand ineens minder tonen.
  return allCategories.map(cat => {
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
  }).filter(cat => !cat.archived || cat.spent !== 0)
}
