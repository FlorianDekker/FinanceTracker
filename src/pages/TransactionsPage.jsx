import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { PageWrapper } from '../components/layout/PageWrapper'
import { TransactionForm } from '../components/transactions/TransactionForm'
import { euro, fmtDate } from '../utils/formatters'
import { CATEGORY_MAP, MONTHS_LONG } from '../constants/categories'
import { useMonth } from '../hooks/useMonth'

export function TransactionsPage() {
  const { year, month, animDir, showPill, isCurrentMonth, goMonth, goToNow, animating } = useMonth()
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const listRef = useRef(null)
  const txTouchStart = useRef(null)

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const txs = useLiveQuery(async () => {
    const all = await db.transactions.where('date').startsWith(prefix).sortBy('date')
    return all.reverse()
  }, [prefix])

  const filtered = (txs ?? []).filter(tx => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (tx.note ?? '').toLowerCase().includes(q) ||
      (tx.category ?? '').toLowerCase().includes(q)
    )
  })

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
        if (dx < 6 && dy < 6) return  // ambiguous — let browser scroll freely
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
      {/* Month selector */}
      <div className="safe-top px-4 pt-4 pb-2" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center justify-between mb-2.5">
          <button onClick={() => goMonth('prev')} className="text-muted text-xl px-1">‹</button>
          <button onClick={!isCurrentMonth ? goToNow : undefined} className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>{MONTHS_LONG[month - 1]} {year}</h1>
            {!isCurrentMonth && (
              <span className="text-[10px] font-bold rounded-full px-2 py-0.5 btn-accent">Nu</span>
            )}
          </button>
          <button onClick={() => goMonth('next')} className="text-muted text-xl px-1">›</button>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={searchRef}
            type="search"
            placeholder="Zoeken…"
            value={search}
            enterKeyHint="search"
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={e => e.key === 'Enter' && searchRef.current?.blur()}
            className="flex-1 rounded-xl px-3 py-2 placeholder-muted"
            style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
          />
          {searchFocused && (
            <button
              onMouseDown={e => { e.preventDefault(); searchRef.current?.blur() }}
              className="text-sm font-semibold shrink-0 text-accent"
            >
              Klaar
            </button>
          )}
        </div>
      </div>


      {/* List */}
      <div
        ref={listRef}
        className={`flex-1 min-h-[60vh] divide-y divide-border touch-pan-y ${slideClass}`}
      >
        {filtered.length === 0 && (
          <div className="text-center text-muted py-12 text-sm">Geen transacties</div>
        )}
        {filtered.map(tx => {
          const cat = CATEGORY_MAP[tx.category]
          return (
            <button
              key={tx.id}
              onTouchStart={e => { txTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, scrollY: window.scrollY } }}
              onTouchEnd={e => {
                if (!txTouchStart.current) return
                const s = txTouchStart.current; txTouchStart.current = null
                if (Math.abs(e.changedTouches[0].clientX - s.x) < 8 && Math.abs(e.changedTouches[0].clientY - s.y) < 8 && Math.abs(window.scrollY - s.scrollY) < 3) setEditing(tx)
              }}
              onTouchCancel={() => { txTouchStart.current = null }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface"
            >
              <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💸'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{tx.note || cat?.label || tx.category}</div>
                <div className="text-xs text-muted">{fmtDate(tx.date)} · {cat?.label}</div>
              </div>
              <span className={`text-sm font-semibold shrink-0 ${tx.type === 'credit' ? 'text-green' : ''}`} style={tx.type !== 'credit' ? { color: 'var(--color-text)' } : {}}>
                {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
              </span>
            </button>
          )
        })}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed right-4 w-14 h-14 rounded-full bg-green text-white text-2xl flex items-center justify-center shadow-lg z-40 animate-scale-in"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px) + 1rem)', boxShadow: '0 4px 20px rgba(48, 209, 88, 0.35)' }}
      >
        +
      </button>

      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
      {showAdd && <TransactionForm onClose={() => setShowAdd(false)} />}
    </PageWrapper>
  )
}
