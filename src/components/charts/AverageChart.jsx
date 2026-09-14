import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { countsInTotals } from '../../utils/claims'
import { euro } from '../../utils/formatters'
import { MONTHS } from '../../constants/categories'
import { useCategories } from '../../hooks/useCategories'
import { StatCard } from '../ui/StatCard'

const now = new Date()

export function AverageChart() {
  const txs = useLiveQuery(() => db.transactions.filter(countsInTotals).toArray(), [])
  // Jaaroverzicht: gearchiveerde categorieen moeten zichtbaar blijven.
  const { allCategories, colors } = useCategories()

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const currentYear = now.getFullYear()
  const expenseCats = allCategories.filter(c => c.type === 'expense')

  // Count months with data
  const monthSet = new Set()
  const catTotals = {}
  for (const cat of expenseCats) catTotals[cat.key] = 0

  for (const tx of txs) {
    if (tx.type !== 'debit' || tx.category === 'bankoverschrijving') continue
    const [y, m] = tx.date.split('-').map(Number)
    if (y !== currentYear) continue
    monthSet.add(m)
    if (catTotals[tx.category] !== undefined) catTotals[tx.category] += tx.amount
  }

  const monthCount = Math.max(monthSet.size, 1)
  const cats = expenseCats
    .map(cat => ({ ...cat, total: catTotals[cat.key] ?? 0, avg: Math.round((catTotals[cat.key] ?? 0) / monthCount) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.avg - a.avg)

  const totalAvg = cats.reduce((s, c) => s + c.avg, 0)
  const maxAvg = cats[0]?.avg ?? 1

  return (
    <div>
      <div className="card p-5 mb-4">
        <StatCard label="Gemiddeld per maand" value={totalAvg} delta={`${monthCount} maanden in ${currentYear}`} />
      </div>

      <div className="card overflow-hidden">
        {cats.map((cat, i) => {
          const color = colors[cat.key] ?? '#8E8E93'
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
