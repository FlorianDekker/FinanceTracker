import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { countsInTotals } from '../utils/claims'
import { useCategories } from './useCategories'

const EARNED_INCOME_KEYWORDS = ['salaris', 'salary', 'loon', 'overige_kosten']

/**
 * Inkomen, uitgaven en gespaard per maand.
 * @param window  aantal maanden terug t/m nu (bijv. 24 voor een trend);
 *                zonder `window` alle maanden van het lopende jaar.
 */
export function useCashflowData({ window: venster = null } = {}) {
  const { catMap, loading, getByRole } = useCategories()
  const transferKey = getByRole('transfer')?.key

  const data = useLiveQuery(async () => {
    if (loading) return null
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const months = []
    if (venster) {
      for (let i = venster - 1; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - 1 - i, 1)
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
      }
    } else {
      for (let m = 1; m <= currentMonth; m++) {
        months.push({ year: currentYear, month: m })
      }
    }

    const results = []
    for (const { year, month } of months) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`
      const txs = await db.transactions.where('date').startsWith(prefix).filter(countsInTotals).toArray()

      let income = 0
      let expenses = 0

      for (const tx of txs) {
        if (transferKey && tx.category === transferKey) continue
        if (tx.category === 'voorschot') continue

        const catType = catMap[tx.category]?.type
        if (tx.type === 'credit') {
          if (catType === 'income') {
            income += tx.amount
          } else if (catType === 'expense') {
            // Refund/sale in an expense category — reduces expenses
            expenses -= tx.amount
          }
        } else if (tx.type === 'debit') {
          expenses += tx.amount
        }
      }

      expenses = Math.max(0, expenses)
      // `saved`/`savingsRate` zijn afgekapt op 0 voor de gestapelde balken;
      // `rate` is het eerlijke maandpercentage (negatief kan, null zonder inkomen).
      const saved = Math.max(0, income - expenses)
      const savingsRate = income > 0 ? saved / income : 0
      const rate = income > 0 ? (income - expenses) / income : null

      results.push({ year, month, income, expenses, saved, savingsRate, rate })
    }

    return results
  }, [catMap, loading, transferKey, venster])

  return data ?? []
}
