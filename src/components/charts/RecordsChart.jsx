import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, fmtDate } from '../../utils/formatters'
import { CATEGORY_MAP, MONTHS_LONG } from '../../constants/categories'

export function RecordsChart() {
  const txs = useLiveQuery(() => db.transactions.toArray(), [])

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const debits = txs.filter(t => t.type === 'debit' && t.category !== 'bankoverschrijving')

  if (debits.length === 0) return <div className="text-center text-muted py-12 text-sm">Geen uitgaven</div>

  // Biggest single transaction
  const biggest = debits.reduce((max, t) => t.amount > max.amount ? t : max, debits[0])
  const biggestCat = CATEGORY_MAP[biggest.category]

  // Most expensive day
  const dayMap = new Map()
  for (const t of debits) {
    dayMap.set(t.date, (dayMap.get(t.date) ?? 0) + t.amount)
  }
  let expensiveDay = { date: '', amount: 0 }
  for (const [date, amount] of dayMap) {
    if (amount > expensiveDay.amount) expensiveDay = { date, amount }
  }

  // Cheapest day (with spending)
  let cheapDay = { date: '', amount: Infinity }
  for (const [date, amount] of dayMap) {
    if (amount < cheapDay.amount) cheapDay = { date, amount }
  }

  // Monthly totals
  const monthMap = new Map()
  for (const t of debits) {
    const key = t.date.slice(0, 7)
    monthMap.set(key, (monthMap.get(key) ?? 0) + t.amount)
  }
  let expensiveMonth = { key: '', amount: 0 }
  let cheapMonth = { key: '', amount: Infinity }
  for (const [key, amount] of monthMap) {
    if (amount > expensiveMonth.amount) expensiveMonth = { key, amount }
    if (amount < cheapMonth.amount) cheapMonth = { key, amount }
  }

  // Most frequent category
  const catCount = new Map()
  for (const t of debits) {
    catCount.set(t.category, (catCount.get(t.category) ?? 0) + 1)
  }
  let topCatKey = ''
  let topCatCount = 0
  for (const [key, count] of catCount) {
    if (count > topCatCount) { topCatKey = key; topCatCount = count }
  }
  const topCat = CATEGORY_MAP[topCatKey]

  // Most spent category (total)
  const catSpend = new Map()
  for (const t of debits) {
    catSpend.set(t.category, (catSpend.get(t.category) ?? 0) + t.amount)
  }
  let topSpendKey = ''
  let topSpendAmt = 0
  for (const [key, amt] of catSpend) {
    if (amt > topSpendAmt) { topSpendKey = key; topSpendAmt = amt }
  }
  const topSpendCat = CATEGORY_MAP[topSpendKey]

  // Total transactions & total spent
  const totalSpent = debits.reduce((s, t) => s + t.amount, 0)

  function formatMonth(key) {
    const [y, m] = key.split('-')
    return `${MONTHS_LONG[parseInt(m) - 1]} ${y}`
  }

  const records = [
    { icon: '💸', label: 'Grootste transactie', value: euro(biggest.amount), sub: `${biggest.note || biggestCat?.label} · ${fmtDate(biggest.date)}` },
    { icon: '📅', label: 'Duurste dag', value: euro(expensiveDay.amount), sub: fmtDate(expensiveDay.date) },
    { icon: '🌱', label: 'Goedkoopste dag', value: euro(cheapDay.amount), sub: fmtDate(cheapDay.date) },
    { icon: '📈', label: 'Duurste maand', value: euro(expensiveMonth.amount), sub: formatMonth(expensiveMonth.key) },
    { icon: '📉', label: 'Goedkoopste maand', value: euro(cheapMonth.amount), sub: formatMonth(cheapMonth.key) },
    { icon: '🔄', label: 'Meeste transacties', value: `${topCatCount}x`, sub: `${topCat?.icon} ${topCat?.label}` },
    { icon: '🏆', label: 'Meeste uitgegeven aan', value: euro(topSpendAmt), sub: `${topSpendCat?.icon} ${topSpendCat?.label}` },
    { icon: '📊', label: 'Totaal ooit uitgegeven', value: euro(totalSpent), sub: `${debits.length} transacties` },
  ]

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Jouw records
          </div>
          <div className="text-4xl font-extrabold leading-none" style={{ color: 'var(--color-text)' }}>
            🏆
          </div>
          <div className="text-sm font-bold mt-2" style={{ color: 'var(--color-muted)', opacity: 0.5 }}>
            {debits.length} transacties geanalyseerd
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {records.map((r, i) => (
          <div key={i} className="card px-4 py-3.5 flex items-center gap-3">
            <span className="text-2xl">{r.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>{r.label}</div>
              <div className="text-lg font-extrabold tabular-nums mt-0.5" style={{ color: 'var(--color-text)' }}>{r.value}</div>
              <div className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>{r.sub}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
