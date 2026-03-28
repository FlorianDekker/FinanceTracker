import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

const EARNED_INCOME_KEYWORDS = ['salaris', 'salary', 'loon', 'overige_kosten']

export function useCashflowData(monthsBack = 6) {
  const data = useLiveQuery(async () => {
    const now = new Date()
    const months = []
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }

    const results = []
    for (const { year, month } of months) {
      const prefix = `${year}-${String(month).padStart(2, '0')}`
      const txs = await db.transactions.where('date').startsWith(prefix).toArray()

      let income = 0
      let expenses = 0
      let refunds = 0

      for (const tx of txs) {
        if (tx.type === 'credit') {
          const cat = (tx.category ?? '').toLowerCase()
          const isEarned = EARNED_INCOME_KEYWORDS.some(kw => cat.includes(kw))
          if (isEarned) income += tx.amount
          else refunds += tx.amount
        } else if (tx.type === 'debit') {
          expenses += tx.amount
        }
      }

      const netExpenses = Math.max(0, expenses - refunds)
      const saved = Math.max(0, income - netExpenses)
      const savingsRate = income > 0 ? saved / income : 0

      results.push({ year, month, income, expenses: netExpenses, saved, savingsRate })
    }

    return results
  }, [monthsBack])

  return data ?? []
}
