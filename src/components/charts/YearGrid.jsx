import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useYearGrid } from '../../hooks/useYearGrid'
import { euroCompact, euro, fmtDate } from '../../utils/formatters'
import { useSheetGestures } from '../../hooks/useSheetGestures'
import { TransactionForm } from '../transactions/TransactionForm'
import { EXPENSE_CATEGORIES, MONTHS, MONTHS_LONG, CATEGORY_MAP, CAT_COLORS } from '../../constants/categories'
import { useCategories } from '../../hooks/useCategories'
import { db } from '../../db/db'

const now = new Date()

function heatColor(net, budget) {
  if (net < 0) return { bg: 'rgba(10,132,255,0.25)', text: '#0A84FF' } // net profit
  if (net === 0 || !budget) return null
  const r = net / budget
  if (r <= 0.5)  return { bg: 'rgba(48,209,88,0.15)',  text: '#30D158' }
  if (r <= 0.85) return { bg: 'rgba(48,209,88,0.30)',  text: '#30D158' }
  if (r <= 1.0)  return { bg: 'rgba(48,209,88,0.50)',  text: '#30D158' }
  if (r <= 1.2)  return { bg: 'rgba(255,159,10,0.35)', text: '#FF9F0A' }
  return               { bg: 'rgba(255,69,58,0.50)',  text: '#FF453A' }
}

export function YearGrid({ year }) {
  const data = useYearGrid(year)
  const categories = useCategories()
  const [selected, setSelected] = useState(null) // { cat, month (0-indexed) }

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { matrix, monthTotals } = data
  const currentMonth = year === now.getFullYear() ? now.getMonth() : 11
  const budgetMap = Object.fromEntries(categories.map(c => [c.key, c.budget]))
  const visibleMonths = MONTHS.slice(0, currentMonth + 1)

  return (
    <div>
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col />
            {visibleMonths.map((_, i) => <col key={i} style={{ width: 46 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th className="text-left pb-2 pr-1 sticky left-0 bg-bg" />
              {visibleMonths.map((m, i) => (
                <th
                  key={m}
                  className={`text-center pb-2 px-0.5 text-[10px] ${
                    i === currentMonth ? 'text-white font-semibold' : 'text-muted font-normal'
                  }`}
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXPENSE_CATEGORIES.map(cat => {
              const row = matrix[cat.key] ?? Array(12).fill(0)
              const budget = budgetMap[cat.key] ?? 0
              return (
                <tr key={cat.key}>
                  <td className="py-0.5 pr-1 sticky left-0 bg-bg">
                    <span className="text-xs text-muted whitespace-nowrap">{cat.icon} {cat.label}</span>
                  </td>
                  {row.slice(0, currentMonth + 1).map((net, m) => {
                    const heat = heatColor(net, budget)
                    const isEmpty = net === 0
                    return (
                      <td key={m} className="py-0.5 px-0.5 text-center">
                        <button
                          onClick={() => !isEmpty && setSelected({ cat, month: m })}
                          className="rounded-lg w-full py-1.5 tabular-nums transition-opacity active:opacity-60"
                          style={{
                            backgroundColor: heat?.bg ?? 'rgba(255,255,255,0.04)',
                            color: isEmpty ? 'rgba(255,255,255,0.1)' : (heat?.text ?? 'rgba(255,255,255,0.4)'),
                            fontSize: 9,
                            minWidth: 30,
                          }}
                        >
                          {isEmpty ? '·' : euroCompact(Math.abs(net))}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}

            {/* Totals row */}
            <tr>
              <td className="pt-3 pr-1 sticky left-0 bg-bg">
                <span className="text-xs text-white/60 font-medium">Totaal</span>
              </td>
              {monthTotals.slice(0, currentMonth + 1).map((total, m) => (
                <td key={m} className="pt-3 px-0.5 text-center">
                  <div
                    className="rounded-lg w-full py-1.5 tabular-nums font-semibold"
                    style={{
                      backgroundColor: total !== 0 ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: total === 0 ? 'transparent' : total < 0 ? '#0A84FF' : 'rgba(255,255,255,0.7)',
                      fontSize: 9,
                    }}
                  >
                    {total !== 0 ? euroCompact(Math.abs(total)) : '·'}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-4 flex-wrap px-1">
        {[
          { label: 'Winst', bg: 'rgba(10,132,255,0.25)', text: '#0A84FF' },
          { label: '≤ 50%', bg: 'rgba(48,209,88,0.15)', text: '#30D158' },
          { label: '≤ 85%', bg: 'rgba(48,209,88,0.30)', text: '#30D158' },
          { label: '≤ 100%', bg: 'rgba(48,209,88,0.50)', text: '#30D158' },
          { label: '> 100%', bg: 'rgba(255,159,10,0.35)', text: '#FF9F0A' },
          { label: '> 120%', bg: 'rgba(255,69,58,0.50)', text: '#FF453A' },
        ].map(l => (
          <span key={l.label} className="flex items-center gap-1 text-[10px] text-muted">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: l.bg }} />
            <span style={{ color: l.text }}>{l.label}</span>
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
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const sheetRef = useSheetGestures(onClose)
  const [editing, setEditing] = useState(null)

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix).filter(t => t.category === cat.key).sortBy('date'),
    [prefix, cat.key]
  )
  const sorted = txs ? [...txs].reverse() : null
  const netTotal = sorted?.reduce((s, t) => s + (t.type === 'debit' ? t.amount : -t.amount), 0) ?? 0

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl max-h-[70vh] overflow-y-auto pb-24 animate-slide-up" style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sheet)' }}>
        <div className="sticky top-0 z-10">
          <div className="px-5 pt-2 pb-4 flex flex-col items-center justify-between" style={{ background: `linear-gradient(135deg, ${CAT_COLORS[cat.key] ?? '#8E8E93'}, ${CAT_COLORS[cat.key] ?? '#8E8E93'}CC)` }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-3" style={{ background: 'rgba(255,255,255,0.35)' }} />
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <div className="text-base font-bold text-white">{cat.label} — {MONTHS_LONG[month - 1]}</div>
                  {sorted && <div className="text-xs text-white/70">Netto: {netTotal < 0 ? '+' : ''}{euro(Math.abs(netTotal))} · {sorted.length} transacties</div>}
                </div>
              </div>
              <button onClick={onClose} className="text-white/80 text-lg font-medium w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>✕</button>
            </div>
          </div>
        </div>

        {sorted === null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {sorted?.length === 0 && <div className="text-center text-muted py-8 text-sm">Geen transacties</div>}
        {sorted?.map(tx => (
          <button key={tx.id} onClick={() => setEditing(tx)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{tx.note || cat.label}</div>
              <div className="text-xs text-muted">{fmtDate(tx.date)}</div>
            </div>
            <span className={`text-sm font-semibold shrink-0 tabular-nums ${tx.type === 'credit' ? 'text-green' : 'text-red'}`}>
              {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
            </span>
          </button>
        ))}
      </div>
      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
