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
  const categories = useCategories()
  const [selected, setSelected] = useState(null) // { cat, month (0-indexed) }

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { matrix, monthTotals } = data
  const currentMonth = year === now.getFullYear() ? now.getMonth() : 11
  const budgetMap = Object.fromEntries(categories.map(c => [c.key, c.budget]))
  const visibleMonths = MONTHS.slice(0, currentMonth + 1)

  const yearTotal = monthTotals.slice(0, currentMonth + 1).reduce((s, v) => s + v, 0)

  return (
    <div>
      {/* Category cards */}
      <div className="space-y-2 mb-4">
        {EXPENSE_CATEGORIES.map(cat => {
          const row = matrix[cat.key] ?? Array(12).fill(0)
          const budget = budgetMap[cat.key] ?? 0
          const catTotal = row.slice(0, currentMonth + 1).reduce((s, v) => s + v, 0)
          const color = CAT_COLORS[cat.key] ?? '#8E8E93'

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
        <div className="sticky top-0 z-10 rounded-t-3xl" style={{ background: CAT_COLORS[cat.key] ?? '#8E8E93' }}>
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
