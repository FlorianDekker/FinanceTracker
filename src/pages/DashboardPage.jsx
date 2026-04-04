import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { useBudgetStats } from '../hooks/useBudgetStats'
import { euro, fmtDate } from '../utils/formatters'
import { MONTHS_LONG, CAT_COLORS } from '../constants/categories'
import { TransactionForm } from '../components/transactions/TransactionForm'
import { useMonth } from '../hooks/useMonth'
import { useSheetGestures } from '../hooks/useSheetGestures'
import { db } from '../db/db'

export function DashboardPage() {
  const { year, month, animDir, showPill, isCurrentMonth, goMonth, goToNow } = useMonth()
  const [selectedCat, setSelectedCat] = useState(null)
  const listRef = useRef(null)

  const stats = useBudgetStats(year, month)
  const expenseStats = stats.filter(c => c.type === 'expense')
  const voorschotStat = stats.find(c => c.key === 'voorschot')
  const totalBudget = expenseStats.reduce((s, c) => s + c.budget, 0)
  const totalSpent = expenseStats.reduce((s, c) => s + c.spent, 0)
  const totalRemaining = totalBudget - totalSpent
  const isOver = totalRemaining < 0

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    let startX = null, startY = null, horizontal = null

    const onStart = e => {
      const x = e.touches[0].clientX
      if (x < 24) { startX = null; return }
      startX = x
      startY = e.touches[0].clientY
      horizontal = null
    }
    const onMove = e => {
      if (startX === null) return
      const dx = Math.abs(e.touches[0].clientX - startX)
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (horizontal === null) {
        if (dx < 6 && dy < 6) return
        horizontal = dx > dy
      }
      if (horizontal) e.preventDefault()
    }
    const onEnd = e => {
      if (startX === null || !horizontal) { startX = null; return }
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      startX = null
      if (Math.abs(dx) < 60 || dy > Math.abs(dx)) return
      goMonth(dx < 0 ? 'next' : 'prev')
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  const slideClass = animDir === 'left'
    ? 'animate-slide-in-left'
    : animDir === 'right'
    ? 'animate-slide-in-right'
    : ''

  return (
    <PageWrapper>
      {/* Sticky month header */}
      <div className="sticky top-0 z-10 bg-bg px-4 py-2 safe-top border-b border-border">
        <div className="flex items-center justify-between">
          <button onClick={() => goMonth('prev')} className="text-muted px-2 py-1 text-xl">‹</button>
          <div className="flex items-center gap-2">
            <span className="font-medium">{MONTHS_LONG[month - 1]} {year}</span>
            {!isCurrentMonth && (
              <button onClick={goToNow} className="text-xs text-green border border-green/40 rounded-full px-2 py-0.5">Nu</button>
            )}
          </div>
          <button onClick={() => goMonth('next')} className="text-muted px-2 py-1 text-xl">›</button>
        </div>
      </div>

      {/* Floating month pill */}
      {showPill && (
        <div className="fixed inset-x-0 top-1/3 -translate-y-1/2 flex justify-center z-30 pointer-events-none">
          <div className="bg-surface/95 border border-border rounded-2xl px-8 py-4 text-lg font-semibold animate-scale-in shadow-lg">
            {MONTHS_LONG[month - 1]} {year}
          </div>
        </div>
      )}

      <div ref={listRef} className={`touch-pan-y px-4 pb-6 ${slideClass}`}>
        {/* Budget summary */}
        <div className="pt-5 pb-4 text-center">
          <div className="text-[11px] font-medium text-muted uppercase tracking-widest mb-2">
            {isOver ? 'Over budget' : 'Nog beschikbaar'}
          </div>
          <div className={`text-[52px] font-bold tracking-tight leading-none tabular-nums ${isOver ? 'text-red' : 'text-green'}`}>
            {isOver ? `-${euro(Math.abs(totalRemaining))}` : euro(totalRemaining)}
          </div>
          <div className="text-xs text-muted mt-2">
            <span className="text-white/60">{euro(totalSpent)}</span> uitgegeven · <span className="text-white/60">{euro(totalBudget)}</span> budget
          </div>
        </div>

        {/* Expense category cards */}
        <div className="mb-2">
          <div className="text-[10px] text-muted uppercase tracking-widest mb-2 px-1">Uitgaven · {euro(totalSpent)}</div>
          <div className="grid grid-cols-3 gap-2.5">
            {expenseStats.map(cat => (
              <CategoryCard key={cat.key} cat={cat} onClick={() => setSelectedCat(cat)} />
            ))}
          </div>
        </div>

        {/* Voorschot */}
        {voorschotStat && voorschotStat.spent > 0 && (
          <div className="mt-4">
            <div className="text-[10px] text-muted uppercase tracking-widest mb-2 px-1">Voorschot</div>
            <div className="grid grid-cols-3 gap-2.5">
              <CategoryCard cat={voorschotStat} onClick={() => setSelectedCat(voorschotStat)} />
            </div>
          </div>
        )}
      </div>

      {selectedCat && (
        <CategorySheet
          cat={selectedCat}
          year={year}
          month={month}
          onClose={() => setSelectedCat(null)}
        />
      )}
    </PageWrapper>
  )
}

function CategoryCard({ cat, onClick }) {
  const color = CAT_COLORS[cat.key] ?? '#8E8E93'
  const spent = cat.spent
  const budget = cat.budget
  const ratio = budget > 0 ? Math.min(spent / budget, 1) : (spent > 0 ? 1 : 0)
  const overspent = budget > 0 && spent > budget

  return (
    <button
      onClick={onClick}
      className="relative rounded-2xl p-3 flex flex-col items-center gap-1.5 text-center overflow-hidden"
      style={{ backgroundColor: color + '15' }}
    >
      {/* Category name */}
      <div className="text-[10px] text-white/70 truncate w-full leading-tight">{cat.label}</div>

      {/* Icon */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
        style={{ backgroundColor: color + '25' }}
      >
        {cat.icon}
      </div>

      {/* Amount */}
      <div className={`text-xs font-bold tabular-nums ${overspent ? 'text-red' : 'text-white'}`}>
        {euro(spent)}
      </div>

      {/* Progress bar */}
      {budget > 0 && (
        <div className="w-full h-[3px] rounded-full mt-0.5" style={{ backgroundColor: color + '20' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.round(ratio * 100)}%`,
              backgroundColor: overspent ? '#D32F2F' : color,
            }}
          />
        </div>
      )}
    </button>
  )
}

function CategorySheet({ cat, year, month, onClose }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const sheetRef = useSheetGestures(onClose)
  const [editing, setEditing] = useState(null)
  const txTouchStart = useRef(null)

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix).filter(t => t.category === cat.key).sortBy('date'),
    [prefix, cat.key]
  )

  const sorted = txs ? [...txs].reverse() : null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-40 bg-surface rounded-t-2xl max-h-[70vh] overflow-y-auto pb-24 animate-slide-up">
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">{cat.icon} {cat.label}</span>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        {sorted === null && (
          <div className="text-center text-muted py-8 text-sm">Laden…</div>
        )}
        {sorted?.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">Geen transacties deze maand</div>
        )}
        {sorted?.map(tx => {
          const sub = cat.subs?.find(s => s.key === tx.subcategory)
          return (
            <button
              key={tx.id}
              onTouchStart={e => { txTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
              onTouchEnd={e => {
                if (!txTouchStart.current) return
                const s = txTouchStart.current; txTouchStart.current = null
                if (Math.abs(e.changedTouches[0].clientX - s.x) < 8 && Math.abs(e.changedTouches[0].clientY - s.y) < 8) setEditing(tx)
              }}
              onTouchCancel={() => { txTouchStart.current = null }}
              className="w-full flex items-center gap-3 px-4 py-3 border-b border-border text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{tx.note || cat.label}</div>
                <div className="text-xs text-muted">{fmtDate(tx.date)}{sub ? ` · ${sub.label}` : ''}</div>
              </div>
              <span className={`text-sm font-semibold shrink-0 ${tx.type === 'credit' ? 'text-green' : 'text-red'}`}>
                {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
              </span>
            </button>
          )
        })}
      </div>

      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
