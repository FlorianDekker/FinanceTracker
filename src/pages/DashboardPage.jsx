import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CategoryRow } from '../components/dashboard/CategoryRow'
import { useBudgetStats } from '../hooks/useBudgetStats'
import { euro, euroParts, fmtDate } from '../utils/formatters'
import { MONTHS_LONG, CAT_COLORS, CATEGORY_MAP } from '../constants/categories'
import { TransactionForm } from '../components/transactions/TransactionForm'
import { useMonth } from '../hooks/useMonth'
import { useSheetGestures } from '../hooks/useSheetGestures'
import { db } from '../db/db'

export function DashboardPage() {
  const { year, month, animDir, showPill, isCurrentMonth, goMonth, goToNow } = useMonth()
  const [selectedCat, setSelectedCat] = useState(null)
  const [showExpected, setShowExpected] = useState(false)
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

  // Calculate expected spending from recurring transactions
  const RECURRING_CATS = new Set(['woning', 'abonnementen'])
  const currentPrefix = `${year}-${String(month).padStart(2, '0')}`

  const recurringData = useLiveQuery(async () => {
    // Get last 3 months of transactions in recurring categories
    const allTxs = await db.transactions.toArray()
    const recurringTxs = allTxs.filter(t => t.type === 'debit' && RECURRING_CATS.has(t.category))

    // Build merchant → months map (using note as merchant name)
    const merchantMonths = new Map() // merchant → Set of "YYYY-MM"
    const merchantAmounts = new Map() // merchant → latest amount
    const merchantMeta = new Map() // merchant → { category, subcategory, note }

    for (const tx of recurringTxs) {
      const name = (tx.note || '').trim().toLowerCase()
      if (!name) continue
      const ym = tx.date.slice(0, 7)
      if (!merchantMonths.has(name)) merchantMonths.set(name, new Set())
      merchantMonths.get(name).add(ym)
      merchantAmounts.set(name, tx.amount)
      merchantMeta.set(name, { category: tx.category, subcategory: tx.subcategory, note: tx.note })
    }

    // Find recurring: appeared in 2+ different months
    const recurring = []
    for (const [name, months] of merchantMonths) {
      if (months.size < 2) continue
      const paidThisMonth = months.has(currentPrefix)
      recurring.push({
        name,
        amount: merchantAmounts.get(name),
        paid: paidThisMonth,
        ...merchantMeta.get(name),
      })
    }

    return recurring.sort((a, b) => b.amount - a.amount)
  }, [year, month])

  const unpaidRecurring = (recurringData ?? []).filter(r => !r.paid)
  const paidRecurring = (recurringData ?? []).filter(r => r.paid)
  const unpaidFixed = unpaidRecurring.reduce((s, r) => s + r.amount, 0)
  const totalExpected = totalSpent + unpaidFixed

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
      <div className="safe-top px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => goMonth('prev')} className="text-muted text-xl px-1">‹</button>
          <button onClick={!isCurrentMonth ? goToNow : undefined} className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{MONTHS_LONG[month - 1]} {year}</h1>
            {!isCurrentMonth && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5 btn-accent">Nu</span>
            )}
          </button>
          <button onClick={() => goMonth('next')} className="text-muted text-xl px-1">›</button>
        </div>
        <div className="flex justify-center">
          <div className="flex rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
            {['cards', 'list'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${view === v ? 'btn-accent' : 'text-muted'}`}
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
            <div className="flex justify-center gap-4 mt-5">
              {[
                { val: totalSpent, label: 'Uitgegeven' },
                { val: totalExpected, label: 'Verwacht', color: totalExpected > totalBudget ? 'var(--color-red)' : null, tap: () => setShowExpected(true) },
                { val: totalBudget, label: 'Budget' },
              ].map((item, i) => {
                const ip = euroParts(item.val)
                const inner = (
                  <>
                    <div className="tabular-nums" style={{ color: item.color ?? 'var(--color-text)' }}>
                      <span className="text-sm font-bold">{ip.sign}{ip.whole}</span>
                      <span className="text-[10px] font-medium" style={{ opacity: 0.4 }}>{ip.dec}</span>
                    </div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: 'var(--color-muted)' }}>{item.label}</div>
                  </>
                )
                return item.tap ? (
                  <button key={i} onClick={item.tap} className="text-center">
                    {inner}
                    <div className="text-[8px] mt-0.5" style={{ color: 'var(--color-accent)' }}>details ›</div>
                  </button>
                ) : (
                  <div key={i} className="text-center">{inner}</div>
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

      {showExpected && (
        <ExpectedSheet unpaid={unpaidRecurring} paid={paidRecurring} total={unpaidFixed} onClose={() => setShowExpected(false)} />
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
        <div className="sticky top-0 z-10 rounded-t-3xl" style={{ background: CAT_COLORS[cat.key] ?? '#8E8E93' }}>
          <div className="px-5 pt-2 pb-4 flex flex-col" style={{ background: `linear-gradient(135deg, ${CAT_COLORS[cat.key] ?? '#8E8E93'}, ${CAT_COLORS[cat.key] ?? '#8E8E93'}CC)` }}>
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

function ExpectedSheet({ unpaid, paid, total, onClose }) {
  const sheetRef = useSheetGestures(onClose)

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-40 rounded-t-3xl max-h-[70vh] overflow-y-auto pb-24 animate-slide-up sheet-handle" style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sheet)' }}>
        <div className="px-5 pt-2 pb-4">
          <div className="text-center mb-4">
            <div className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
              Verwachte vaste lasten
            </div>
            <div className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--color-text)' }}>
              {euro(total)}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>
              nog te verwachten deze maand
            </div>
          </div>

          {/* Unpaid recurring */}
          {unpaid.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--color-red)' }}>
                Nog niet betaald ({unpaid.length})
              </div>
              <div className="card overflow-hidden mb-4">
                {unpaid.map((r, i) => {
                  const cat = CATEGORY_MAP[r.category]
                  return (
                    <div
                      key={`${r.name}-${i}`}
                      className="flex items-center gap-3 px-4 py-3"
                      style={i < unpaid.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                    >
                      <span className="text-lg">{cat?.icon ?? '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{r.note}</div>
                        <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{cat?.label}</div>
                      </div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-red)' }}>
                        {euro(r.amount)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Paid recurring */}
          {paid.length > 0 && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1" style={{ color: 'var(--color-green)' }}>
                Betaald ({paid.length})
              </div>
              <div className="card overflow-hidden">
                {paid.map((r, i) => {
                  const cat = CATEGORY_MAP[r.category]
                  return (
                    <div
                      key={`${r.name}-${i}`}
                      className="flex items-center gap-3 px-4 py-3"
                      style={i < paid.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                    >
                      <span className="text-lg">{cat?.icon ?? '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--color-muted)' }}>{r.note}</div>
                        <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{cat?.label}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm tabular-nums" style={{ color: 'var(--color-muted)' }}>{euro(r.amount)}</span>
                        <span className="text-green text-xs">✓</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {unpaid.length === 0 && paid.length === 0 && (
            <div className="text-center text-muted py-8 text-sm">Geen terugkerende transacties gevonden</div>
          )}
          {unpaid.length === 0 && paid.length > 0 && (
            <div className="text-center text-sm mt-3" style={{ color: 'var(--color-green)' }}>Alle vaste lasten zijn betaald deze maand</div>
          )}
        </div>
      </div>
    </>
  )
}
