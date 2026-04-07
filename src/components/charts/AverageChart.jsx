import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, euroParts } from '../../utils/formatters'
import { EXPENSE_CATEGORIES, CAT_COLORS, MONTHS } from '../../constants/categories'

const now = new Date()

export function AverageChart() {
  const txs = useLiveQuery(() => db.transactions.toArray(), [])

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  // Count months with data
  const monthSet = new Set()
  const catTotals = {}
  for (const cat of EXPENSE_CATEGORIES) catTotals[cat.key] = 0

  for (const tx of txs) {
    if (tx.type !== 'debit' || tx.category === 'bankoverschrijving') continue
    const [y, m] = tx.date.split('-').map(Number)
    if (y !== currentYear) continue
    monthSet.add(m)
    if (catTotals[tx.category] !== undefined) catTotals[tx.category] += tx.amount
  }

  const monthCount = Math.max(monthSet.size, 1)
  const cats = EXPENSE_CATEGORIES
    .map(cat => ({ ...cat, total: catTotals[cat.key] ?? 0, avg: Math.round((catTotals[cat.key] ?? 0) / monthCount) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.avg - a.avg)

  const totalAvg = cats.reduce((s, c) => s + c.avg, 0)
  const maxAvg = cats[0]?.avg ?? 1
  const tp = euroParts(totalAvg)

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Gemiddeld per maand
          </div>
          <div className="tabular-nums tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{tp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{tp.dec}</span>
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            {monthCount} maanden in {currentYear}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        {cats.map((cat, i) => {
          const color = CAT_COLORS[cat.key] ?? '#8E8E93'
          const barPct = Math.max((cat.avg / maxAvg) * 100, 2)
          return (
            <div
              key={cat.key}
              className="flex items-center gap-3 px-4 py-3 relative overflow-hidden"
              style={i < cats.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="absolute inset-y-0 left-0" style={{ width: `${barPct}%`, backgroundColor: color, opacity: 0.08 }} />
              <span className="text-base relative">{cat.icon}</span>
              <div className="flex-1 min-w-0 relative">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{cat.label}</div>
                <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>Totaal: {euro(cat.total)}</div>
              </div>
              <div className="text-right relative">
                <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(cat.avg)}</div>
                <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted)' }}>/mnd</div>
              </div>
            </div>
          )
        })}
      </div>

      {cats.length === 0 && (
        <div className="text-center text-muted py-12 text-sm">Geen uitgaven dit jaar</div>
      )}
    </div>
  )
}
