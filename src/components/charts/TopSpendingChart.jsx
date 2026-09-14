import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { isCountedExpense } from '../../utils/claims'
import { euro, fmtDate } from '../../utils/formatters'
import { useCategories } from '../../hooks/useCategories'
import { TransactionForm } from '../transactions/TransactionForm'
import { StatCard } from '../ui/StatCard'

export function TopSpendingChart({ year, month }) {
  const { catMap, colors } = useCategories()
  const [editing, setEditing] = useState(null)
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions
      .where('date').startsWith(prefix)
      .filter(t => isCountedExpense(t) && t.category !== 'bankoverschrijving')
      .sortBy('amount'),
    [prefix]
  )

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const sorted = [...txs].reverse().slice(0, 15)
  const total = sorted.reduce((s, t) => s + t.amount, 0)
  const maxAmount = sorted[0]?.amount ?? 1

  return (
    <div>
      <div className="card p-5 mb-4">
        <StatCard label="Top 15 uitgaven" value={total} delta={`${sorted.length} transacties`} />
      </div>

      <div data-chart-area className="card overflow-hidden">
        {sorted.map((tx, i) => {
          const cat = catMap[tx.category]
          const color = colors[tx.category] ?? '#8E8E93'
          const barWidth = Math.max((tx.amount / maxAmount) * 100, 3)

          return (
            <button
              key={tx.id}
              onClick={() => setEditing(tx)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left relative overflow-hidden"
              style={i < sorted.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="absolute inset-y-0 left-0" style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.08 }} />
              <div className="relative flex items-center gap-3 w-full">
                <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--color-muted)' }}>{i + 1}</span>
                <span className="text-base">{cat?.icon ?? '💸'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{tx.note || cat?.label || tx.category}</div>
                  <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{fmtDate(tx.date)} · {cat?.label}</div>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: 'var(--color-text)' }}>
                  {euro(tx.amount)}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      {sorted.length === 0 && (
        <div className="text-center text-muted py-12 text-sm">Geen uitgaven deze maand</div>
      )}

      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
