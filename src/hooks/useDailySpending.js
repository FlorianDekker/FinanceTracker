import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { CATEGORY_MAP } from '../constants/categories'

export async function setDailyIncludeVoorschot(value) {
  await db.settings.put({ key: 'dailyIncludeVoorschot', value })
}

export function useDailySpending(year, month) {
  return useLiveQuery(async () => {
    if (!year || !month) return null
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const [txs, setting] = await Promise.all([
      db.transactions.where('date').startsWith(prefix).toArray(),
      db.settings.get('dailyIncludeVoorschot'),
    ])
    const includeVoorschot = setting?.value ?? false

    const daysInMonth = new Date(year, month, 0).getDate()
    const now = new Date()
    const todayDay = (year === now.getFullYear() && month === now.getMonth() + 1)
      ? now.getDate()
      : daysInMonth

    const daily = Array(daysInMonth + 1).fill(0)
    for (const tx of txs) {
      if (tx.type !== 'debit') continue
      const catType = CATEGORY_MAP[tx.category]?.type
      if (catType !== 'expense' && !(includeVoorschot && tx.category === 'voorschot')) continue
      const day = parseInt(tx.date.slice(8, 10), 10)
      if (day >= 1 && day <= daysInMonth) daily[day] += tx.amount
    }

    const spentDays = daily.slice(1, todayDay + 1).filter(v => v > 0).length
    const total = daily.slice(1, todayDay + 1).reduce((s, v) => s + v, 0)
    const average = spentDays > 0 ? total / todayDay : 0

    return { daily: daily.slice(1), daysInMonth, todayDay, average, total, includeVoorschot }
  }, [year, month])
}
