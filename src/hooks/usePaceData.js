import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { countsInTotals } from '../utils/claims'
import { useCategories } from './useCategories'

const EXCL_SUBCATEGORY = 'belasting'

// Standaard uitgesloten van het budgettempo: vaste lasten + de restbak + investeren.
export function buildDefaultPaceExcluded(fixedKeys, uncategorizedKey) {
  return [...fixedKeys, uncategorizedKey, 'investeren'].filter(Boolean)
}

export function useDefaultPaceExcluded() {
  const { fixedKeys, getByRole } = useCategories()
  const uncategorizedKey = getByRole('uncategorized')?.key ?? 'overige_kosten'
  return useMemo(
    () => buildDefaultPaceExcluded(fixedKeys, uncategorizedKey),
    [fixedKeys, uncategorizedKey],
  )
}

export async function setPaceExcluded(keys) {
  await db.settings.put({ key: 'paceExcluded', value: keys })
}

export function usePaceData(year, month) {
  const { categories, catMap, getByRole } = useCategories()
  const uncategorizedKey = getByRole('uncategorized')?.key ?? 'overige_kosten'
  const defaultExcluded = useDefaultPaceExcluded()

  const data = useLiveQuery(async () => {
    if (!year || !month) return null
    const prefix = `${year}-${String(month).padStart(2, '0')}`

    const [txs, setting] = await Promise.all([
      db.transactions.where('date').startsWith(prefix).filter(countsInTotals).toArray(),
      db.settings.get('paceExcluded'),
    ])

    const excluded = new Set(setting?.value ?? defaultExcluded)
    return { txs, excluded }
  }, [year, month, defaultExcluded])

  if (!data || !categories.length) return null

  const { txs, excluded } = data

  const now = new Date()
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayDay = (year === now.getFullYear() && month === now.getMonth() + 1)
    ? now.getDate()
    : daysInMonth

  // Sum variable budget
  const totalBudgetVariable = categories
    .filter(c => c.type === 'expense' && !excluded.has(c.key))
    .reduce((sum, c) => sum + (c.budget ?? 0), 0)

  // Daily spend array (variable categories only)
  const spendingByDay = Array(daysInMonth + 1).fill(0)

  for (const tx of txs) {
    if (tx.type !== 'debit') continue
    if (catMap[tx.category]?.type !== 'expense') continue
    if (excluded.has(tx.category)) continue
    const cat = tx.category ?? ''
    const sub = (tx.subcategory ?? '').toLowerCase()
    if (cat === uncategorizedKey && sub.includes(EXCL_SUBCATEGORY)) continue

    const day = parseInt(tx.date.slice(8, 10), 10)
    if (day >= 1 && day <= daysInMonth) spendingByDay[day] += tx.amount
  }

  // Build cumulative lines
  const actualCum = []
  let run = 0
  for (let d = 1; d <= daysInMonth; d++) {
    run += spendingByDay[d]
    actualCum.push(run)
  }

  const idealCum = []
  for (let d = 1; d <= daysInMonth; d++) {
    idealCum.push((d / daysInMonth) * totalBudgetVariable)
  }

  const td = Math.max(1, Math.min(daysInMonth, todayDay))
  const actualToday = actualCum[td - 1] ?? 0
  const idealToday = idealCum[td - 1] ?? 0
  const diff = idealToday - actualToday
  const isAhead = diff >= 0

  return {
    actualCum,
    idealCum,
    daysInMonth,
    todayDay: td,
    totalBudgetVariable,
    diff,
    isAhead,
    actualToday,
  }
}
