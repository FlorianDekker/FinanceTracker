import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CategoryRow } from '../components/dashboard/CategoryRow'
import { useBudgetStats } from '../hooks/useBudgetStats'
import { euro, euroParts, fmtDate } from '../utils/formatters'
import { MONTHS_LONG, CAT_COLORS } from '../constants/categories'
import { TransactionForm } from '../components/transactions/TransactionForm'
import { useMonth } from '../hooks/useMonth'
import { useSheetGestures } from '../hooks/useSheetGestures'
import { db } from '../db/db'

export function DashboardPage() {
  const { year, month, animDir, showPill, isCurrentMonth, goMonth, goToNow } = useMonth()
  const [selectedCat, setSelectedCat] = useState(null)
  const [view, setView] = useState('cards')
  const listRef = useRef(null)
  const catTouchStart = useRef(null)

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
      {/* Header */}
      <div className="sticky top-0 z-10 safe-top" style={{ background: 'var(--color-accent)' }}>
        <div className="flex items-center justify-between px-5 py-3">
          <button onClick={() => goMonth('prev')} className="px-2 py-1 text-2xl font-light" style={{ color: 'rgba(255,255,255,0.7)' }}>‹</button>
          <div className="flex items-center gap-2.5">
            <span className="text-lg font-bold tracking-tight text-white">{MONTHS_LONG[month - 1]} {year}</span>
            {!isCurrentMonth && (
              <button onClick={goToNow} className="text-[10px] font-bold rounded-full px-2.5 py-1" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff' }}>Nu</button>
            )}
          </div>
          <button onClick={() => goMonth('next')} className="px-2 py-1 text-2xl font-light" style={{ color: 'rgba(255,255,255,0.7)' }}>›</button>
        </div>
        <div className="flex justify-center pb-3">
          <div className="flex rounded-full p-0.5" style={{ background: 'rgba(255,255,255,0.15)' }}>
            {['cards', 'list'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200`}
                style={view === v ? { background: '#fff', color: 'var(--color-accent)' } : { color: 'rgba(255,255,255,0.7)' }}
              >
                {v === 'cards' ? 'Kaarten' : 'Lijst'}
              </button>
            ))}
          </div>
        </div>
      </div>


      <div ref={listRef} className={`touch-pan-y ${slideClass}`}>
        {/* Summary card */}
        <div className="px-4 pt-5 pb-2">
          <div className="card px-5 py-6 text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3" style={{ color: 'var(--color-muted)' }}>
              {isOver ? 'Over budget' : 'Nog beschikbaar'}
            </div>
            {(() => {
              const p = euroParts(Math.abs(totalRemaining))
              return (
                <div className={`leading-none tabular-nums ${isOver ? 'text-red' : 'text-green'}`}>
                  <span className="text-2xl font-bold align-top">{isOver ? '-' : ''}€</span>
                  <span className="text-5xl font-extrabold tracking-tight">{p.whole}</span>
                  <span className="text-xl font-semibold align-top" style={{ opacity: 0.5 }}>{p.dec}</span>
                </div>
              )
            })()}
            <div className="flex justify-center gap-5 mt-5">
              {[{ val: totalSpent, label: 'Uitgegeven' }, { val: totalBudget, label: 'Budget' }].map((item, i) => {
                const ip = euroParts(item.val)
                return (
                  <div key={i} className="text-center">
                    {i > 0 && <div className="absolute -ml-3 h-8 w-px" style={{ background: 'var(--color-border)' }} />}
                    <div className="tabular-nums" style={{ color: 'var(--color-text)' }}>
                      <span className="text-base font-bold">{ip.sign}{ip.whole}</span>
                      <span className="text-xs font-medium" style={{ opacity: 0.4 }}>{ip.dec}</span>
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--color-muted)' }}>{item.label}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {view === 'cards' ? (
          <div className="px-4 pb-6 pt-2">
            <div className="grid grid-cols-3 gap-3">
              {expenseStats.map(cat => (
                <CategoryCard key={cat.key} cat={cat} onClick={() => setSelectedCat(cat)} />
              ))}
            </div>

            {voorschotStat && voorschotStat.spent > 0 && (
              <div className="mt-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--color-muted)' }}>Voorschot</div>
                <div className="grid grid-cols-3 gap-3">
                  <CategoryCard cat={voorschotStat} onClick={() => setSelectedCat(voorschotStat)} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 pb-6 pt-2">
            <div className="card overflow-hidden">
              {expenseStats.map((cat, i) => (
                <button
                  key={cat.key}
                  className="w-full text-left"
                  style={i < expenseStats.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                  onTouchStart={e => { catTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, scrollY: window.scrollY } }}
                  onTouchEnd={e => {
                    if (!catTouchStart.current) return
                    const s = catTouchStart.current; catTouchStart.current = null
                    if (Math.abs(e.changedTouches[0].clientX - s.x) < 8 && Math.abs(e.changedTouches[0].clientY - s.y) < 8 && Math.abs(window.scrollY - s.scrollY) < 3) setSelectedCat(cat)
                  }}
                  onTouchCancel={() => { catTouchStart.current = null }}
                >
                  <CategoryRow category={cat} />
                </button>
              ))}
            </div>
            {voorschotStat && (
              <div className="mt-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--color-muted)' }}>Voorschot</div>
                <div className="card overflow-hidden">
                  <button
                    className="w-full text-left"
                    onTouchStart={e => { catTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, scrollY: window.scrollY } }}
                    onTouchEnd={e => {
                      if (!catTouchStart.current) return
                      const s = catTouchStart.current; catTouchStart.current = null
                      if (Math.abs(e.changedTouches[0].clientX - s.x) < 8 && Math.abs(e.changedTouches[0].clientY - s.y) < 8 && Math.abs(window.scrollY - s.scrollY) < 3) setSelectedCat(voorschotStat)
                    }}
                    onTouchCancel={() => { catTouchStart.current = null }}
                  >
                    <CategoryRow category={voorschotStat} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedCat && (
        <CategorySheet cat={selectedCat} year={year} month={month} onClose={() => setSelectedCat(null)} />
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
      className="p-3 flex flex-col items-center gap-1.5 text-center transition-all duration-150 active:scale-[0.97] overflow-hidden"
      style={{ background: color + '18', borderRadius: 20, boxShadow: 'var(--shadow-card)' }}
    >
      <div className="w-10 h-10 flex items-center justify-center text-lg">
        {cat.icon}
      </div>

      <div className="text-[10px] font-bold truncate w-full" style={{ color: 'var(--color-muted)' }}>{cat.label}</div>

      <div className="tabular-nums">
        <span className={`text-sm font-bold ${overspent ? 'text-red' : ''}`} style={!overspent ? { color: 'var(--color-text)' } : {}}>
          {euro(spent)}
        </span>
      </div>

      {budget > 0 && (
        <div className="w-full h-[3px] rounded-full" style={{ backgroundColor: 'var(--color-surface-2)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.round(ratio * 100)}%`,
              backgroundColor: overspent ? 'var(--color-red)' : 'var(--color-green)',
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
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-40 rounded-t-3xl max-h-[75vh] overflow-y-auto pb-24 animate-slide-up" style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sheet)' }}>
        {/* Colored category header */}
        <div className="sticky top-0 z-10">
          <div className="px-5 pt-2 pb-4 rounded-t-3xl flex flex-col" style={{ background: `linear-gradient(135deg, ${CAT_COLORS[cat.key] ?? '#8E8E93'}, ${CAT_COLORS[cat.key] ?? '#8E8E93'}CC)` }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-3" style={{ background: 'rgba(255,255,255,0.35)' }} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <div className="text-base font-bold text-white">{cat.label}</div>
                  {sorted && <div className="text-xs text-white/70">{sorted.length} transacties</div>}
                </div>
              </div>
              <button onClick={onClose} className="text-white/80 text-lg font-medium w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>✕</button>
            </div>
          </div>
        </div>

        {sorted === null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {sorted?.length === 0 && <div className="text-center text-muted py-8 text-sm">Geen transacties deze maand</div>}
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
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{tx.note || cat.label}</div>
                <div className="text-xs" style={{ color: 'var(--color-muted)' }}>{fmtDate(tx.date)}{sub ? ` · ${sub.label}` : ''}</div>
              </div>
              <span className={`text-sm font-bold shrink-0 tabular-nums ${tx.type === 'credit' ? 'text-green' : 'text-red'}`}>
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
