import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CategoryRow } from '../components/dashboard/CategoryRow'
import { useBudgetStats } from '../hooks/useBudgetStats'
import { euro, euroParts, fmtDate } from '../utils/formatters'
import { MONTHS_LONG } from '../constants/categories'
import { useCategories } from '../hooks/useCategories'
import { TransactionListSheet } from '../components/transactions/TransactionListSheet'
import { useMonth } from '../hooks/useMonth'
import { useRecurring } from '../hooks/useRecurring'
import { useMonthSwipe } from '../hooks/useMonthSwipe'
import { Sheet } from '../components/ui/Sheet'
import { ReceiptCapture } from '../components/receipts/ReceiptCapture'
import { ReceiptViewer } from '../components/receipts/ReceiptViewer'
import { db } from '../db/db'
import { countsInTotals } from '../utils/claims'
import { useOutstandingClaims } from '../hooks/useClaims'

export function DashboardPage() {
  const { year, month, animDir, isCurrentMonth, goMonth, goToNow } = useMonth()
  const [selectedCat, setSelectedCat] = useState(null)
  const [showExpected, setShowExpected] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [viewerId, setViewerId] = useState(null)
  const [view, setView] = useState('cards')
  const listRef = useRef(null)
  const catTouchStart = useRef(null)

  const stats = useBudgetStats(year, month)
  const claims = useOutstandingClaims()
  const expenseStats = stats.filter(c => c.type === 'expense')
  const voorschotStat = stats.find(c => c.key === 'voorschot')
  const totalBudget = expenseStats.reduce((s, c) => s + c.budget, 0)
  const totalSpent = expenseStats.reduce((s, c) => s + c.spent, 0)
  const totalRemaining = totalBudget - totalSpent
  const isOver = totalRemaining < 0

  // Verwachte vaste lasten: dezelfde detectie als de grafiek "Vaste lasten".
  const { open: unpaidRecurring, betaald: paidRecurring, openTotaal: unpaidFixed } =
    useRecurring(`${year}-${String(month).padStart(2, '0')}`)

  const totalExpected = totalSpent + unpaidFixed

  useMonthSwipe(listRef)

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
        <div className="flex justify-center relative">
          {/* Snelle ingang naar een bon: camera, bestand of klembord */}
          <button
            onClick={() => setCaptureOpen(true)}
            aria-label="Bon toevoegen"
            className="absolute right-0 top-0 w-9 h-9 rounded-full flex items-center justify-center text-base"
            style={{ background: 'var(--color-surface-2)' }}
          >
            📷
          </button>
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

        {/* Openstaande declaraties */}
        {claims.count > 0 && (
          <div className="px-4 pb-1">
            <Link
              to="/declaraties"
              className="card px-4 py-3 flex items-center gap-3"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="text-xl">💼</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Declaraties open</div>
                <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  {claims.count} {claims.count === 1 ? 'transactie' : 'transacties'} · telt niet mee in je budget
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums">{euro(claims.total)}</span>
              <span style={{ color: 'var(--color-muted)' }}>›</span>
            </Link>
          </div>
        )}

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

      <ReceiptCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onDone={id => { setCaptureOpen(false); setViewerId(id) }}
      />
      {viewerId != null && <ReceiptViewer receiptId={viewerId} onClose={() => setViewerId(null)} />}
    </PageWrapper>
  )
}

function CategoryCard({ cat, onClick }) {
  const { colors } = useCategories()
  const color = colors[cat.key] ?? '#8E8E93'
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
  const { colors } = useCategories()
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix).filter(t => t.category === cat.key && countsInTotals(t)).sortBy('date'),
    [prefix, cat.key]
  )
  const sorted = txs ? [...txs].reverse() : null

  return (
    <TransactionListSheet
      onClose={onClose}
      accent={colors[cat.key] ?? '#8E8E93'}
      maxHeight="75vh"
      leading={<span className="text-2xl">{cat.icon}</span>}
      title={cat.label}
      subtitle={sorted ? `${sorted.length} transacties` : undefined}
      transactions={sorted}
      emptyText="Geen transacties deze maand"
      showIcon={false}
      renderLabel={tx => tx.note || cat.label}
      renderMeta={tx => {
        const sub = cat.subs?.find(s => s.key === tx.subcategory)
        return `${fmtDate(tx.date)}${sub ? ` · ${sub.label}` : ''}`
      }}
    />
  )
}

function ExpectedSheet({ unpaid, paid, total, onClose }) {
  return (
    <Sheet open onClose={onClose} maxHeight="70vh">
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
              {unpaid.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={i < unpaid.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                >
                  <span className="text-lg">{r.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{r.label}</div>
                    <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{r.note && r.note !== r.label ? r.note : `${r.monthCount} maanden`}</div>
                  </div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-red)' }}>
                    {euro(r.amount)}
                  </div>
                </div>
              ))}
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
              {paid.map((r, i) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 px-4 py-3"
                  style={i < paid.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                >
                  <span className="text-lg">{r.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-muted)' }}>{r.label}</div>
                    <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{r.note && r.note !== r.label ? r.note : `${r.monthCount} maanden`}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm tabular-nums" style={{ color: 'var(--color-muted)' }}>{euro(r.amount)}</span>
                    <span className="text-green text-xs">✓</span>
                  </div>
                </div>
              ))}
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
    </Sheet>
  )
}
