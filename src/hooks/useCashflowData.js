import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { countsInTotals } from '../utils/claims'
import { useCategories } from './useCategories'

const EARNED_INCOME_KEYWORDS = ['salaris', 'salary', 'loon', 'overige_kosten']

export function useCashflowData() {
  const { catMap, loading, getByRole } = useCategories()
  const transferKey = getByRole('transfer')?.key

  const data = useLiveQuery(async () => {
    if (loading) return null
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const months = []
    for (let m = 1; m <= currentMonth; m++) {
      months.push({ year: currentYear, month: m })
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
      const saved = Math.max(0, income - expenses)
      const savingsRate = income > 0 ? saved / income : 0

      results.push({ year, month, income, expenses, saved, savingsRate })
    }

    return results
  }, [catMap, loading, transferKey])

  return data ?? []
}
