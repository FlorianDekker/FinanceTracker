import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useYearGrid } from '../../hooks/useYearGrid'
import { euroCompact, euro, fmtDate } from '../../utils/formatters'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { MONTHS, MONTHS_LONG } from '../../constants/categories'
import { useCategories } from '../../hooks/useCategories'
import { db } from '../../db/db'
import { countsInTotals } from '../../utils/claims'

const now = new Date()

function heatColor(net, budget) {
  if (net < 0) return { bg: '#EFF6FF', text: '#3B82F6' } // net profit
  if (net === 0 || !budget) return null
  const r = net / budget
  if (r <= 0.5)  return { bg: '#ECFDF5', text: '#059669' }
  if (r <= 0.85) return { bg: '#D1FAE5', text: '#059669' }
  if (r <= 1.0)  return { bg: '#A7F3D0', text: '#047857' }
  if (r <= 1.2)  return { bg: '#FEF3C7', text: '#D97706' }
  return               { bg: '#FEE2E2', text: '#DC2626' }
}

export function YearGrid({ year }) {
  const data = useYearGrid(year)
  // Jaaroverzicht: gearchiveerde categorieen moeten zichtbaar blijven.
  const { allCategories } = useCategories()
  const [selected, setSelected] = useState(null) // { cat, month (0-indexed) }

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { matrix, monthTotals } = data
  const currentMonth = year === now.getFullYear() ? now.getMonth() : 11
  const expenseCats = allCategories.filter(c => c.type === 'expense')
  const budgetMap = Object.fromEntries(allCategories.map(c => [c.key, c.budget]))
  const visibleMonths = MONTHS.slice(0, currentMonth + 1)

  const yearTotal = monthTotals.slice(0, currentMonth + 1).reduce((s, v) => s + v, 0)

  return (
    <div>
      {/* Category cards */}
      <div className="space-y-2 mb-4">
        {expenseCats.map(cat => {
          const row = matrix[cat.key] ?? Array(12).fill(0)
          const budget = budgetMap[cat.key] ?? 0
          const catTotal = row.slice(0, currentMonth + 1).reduce((s, v) => s + v, 0)

          return (
            <div key={cat.key} className="card px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{cat.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{cat.label}</span>
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>
                  {euroCompact(Math.abs(catTotal))}
                </span>
              </div>
              <div className="flex gap-1">
                {row.slice(0, currentMonth + 1).map((net, m) => {
                  const heat = heatColor(net, budget)
                  const isEmpty = net === 0
                  return (
                    <button
                      key={m}
                      onClick={() => !isEmpty && setSelected({ cat, month: m })}
                      className="flex-1 rounded-lg py-1.5 tabular-nums text-center transition-all active:scale-95"
                      style={{
                        backgroundColor: heat?.bg ?? 'var(--color-surface-2)',
                        color: isEmpty ? 'var(--color-text-dim)' : (heat?.text ?? 'var(--color-muted)'),
                        fontSize: 9,
                        fontWeight: isEmpty ? 400 : 600,
                      }}
                    >
                      {isEmpty ? '·' : euroCompact(Math.abs(net))}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-1 mt-1">
                {visibleMonths.map((m, i) => (
                  <div key={i} className="flex-1 text-center text-[8px]" style={{ color: i === currentMonth ? 'var(--color-accent)' : 'var(--color-muted)', fontWeight: i === currentMonth ? 700 : 400 }}>
                    {m}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals card */}
      <div className="card px-4 py-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Totaal</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>
            {euroCompact(yearTotal)}
          </span>
        </div>
        <div className="flex gap-1">
          {monthTotals.slice(0, currentMonth + 1).map((total, m) => (
            <div
              key={m}
              className="flex-1 rounded-lg py-1.5 tabular-nums text-center font-semibold"
              style={{
                backgroundColor: total !== 0 ? 'var(--color-surface-2)' : 'transparent',
                color: total === 0 ? 'var(--color-text-dim)' : 'var(--color-text)',
                fontSize: 9,
              }}
            >
              {total !== 0 ? euroCompact(Math.abs(total)) : '·'}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="card p-3 flex gap-3 flex-wrap justify-center">
        {[
          { label: 'Winst', bg: '#EFF6FF', text: '#3B82F6' },
          { label: '≤ 50%', bg: '#ECFDF5', text: '#059669' },
          { label: '≤ 85%', bg: '#D1FAE5', text: '#059669' },
          { label: '≤ 100%', bg: '#A7F3D0', text: '#047857' },
          { label: '> 100%', bg: '#FEF3C7', text: '#D97706' },
          { label: '> 120%', bg: '#FEE2E2', text: '#DC2626' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1.5 text-[10px]">
            <span className="w-4 h-4 rounded-md inline-block" style={{ backgroundColor: l.bg }} />
            <span style={{ color: l.text, fontWeight: 600 }}>{l.label}</span>
          </span>
        ))}
      </div>

      {selected && (
        <YearGridSheet
          cat={selected.cat}
          year={year}
          month={selected.month + 1}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function YearGridSheet({ cat, year, month, onClose }) {
  const { colors } = useCategories()
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix).filter(t => t.category === cat.key && countsInTotals(t)).sortBy('date'),
    [prefix, cat.key]
  )
  const sorted = txs ? [...txs].reverse() : null
  const netTotal = sorted?.reduce((s, t) => s + (t.type === 'debit' ? t.amount : -t.amount), 0) ?? 0

  return (
    <TransactionListSheet
      onClose={onClose}
      accent={colors[cat.key] ?? '#8E8E93'}
      leading={<span className="text-2xl">{cat.icon}</span>}
      title={`${cat.label} — ${MONTHS_LONG[month - 1]}`}
      subtitle={sorted
        ? `Netto: ${netTotal < 0 ? '+' : ''}${euro(Math.abs(netTotal))} · ${sorted.length} transacties`
        : undefined}
      transactions={sorted}
      showIcon={false}
      renderLabel={tx => tx.note || cat.label}
      renderMeta={tx => fmtDate(tx.date)}
    />
  )
}
