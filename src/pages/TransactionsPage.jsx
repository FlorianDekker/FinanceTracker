import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { PageWrapper } from '../components/layout/PageWrapper'
import { TransactionForm, TripKiezer } from '../components/transactions/TransactionForm'
import { euro, fmtDate, today } from '../utils/formatters'
import { MONTHS_LONG } from '../constants/categories'
import { useCategories } from '../hooks/useCategories'
import { useMonth } from '../hooks/useMonth'
import { useMonthSwipe } from '../hooks/useMonthSwipe'
import { useToast } from '../hooks/useToast'
import { CLAIM_STATUSES, isOpenClaim } from '../utils/claims'
import { groupTransactionsByDay, monthTotals } from '../utils/transactionGrouping'
import { ClaimBadge } from '../components/transactions/ClaimBadge'
import { ReceiptViewer } from '../components/receipts/ReceiptViewer'
import { CategoryPicker } from '../components/categories/CategoryPicker'
import {
  bulkDeleteTransactions,
  bulkMarkClaim,
  bulkSetCategory,
  bulkSetTrip,
  restoreTransactions,
} from '../hooks/useTransactions'

// Lang indrukken op een rij duurt dit lang voordat de selectiemodus aangaat;
// een beweging groter dan LONG_PRESS_SLOP tijdens het wachten annuleert het
// (dan is het een scroll of een swipe, geen lang-indrukken).
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP = 10

export function TransactionsPage() {
  const { year, month, animDir, isCurrentMonth, goMonth, goToNow } = useMonth()
  const { catMap } = useCategories()
  const showToast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const claimsOnly = searchParams.get('filter') === 'claims'
  const [search, setSearch] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const searchRef = useRef(null)
  const [editing, setEditing] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [viewerId, setViewerId] = useState(null)
  const listRef = useRef(null)
  const txTouchStart = useRef(null)
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)

  // Selectiemodus voor bulk-bewerken.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false)
  const [bulkTripOpen, setBulkTripOpen] = useState(false)

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  // Declaraties lopen over maandgrenzen heen; met de filterchip aan tonen we ze allemaal.
  const txs = useLiveQuery(async () => {
    const all = claimsOnly
      ? await db.transactions.where('claimStatus').anyOf(CLAIM_STATUSES).sortBy('date')
      : await db.transactions.where('date').startsWith(prefix).sortBy('date')
    return all.reverse()
  }, [prefix, claimsOnly])

  const filtered = (txs ?? []).filter(tx => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (tx.note ?? '').toLowerCase().includes(q) ||
      (tx.category ?? '').toLowerCase().includes(q)
    )
  })

  const filterActive = search.length > 0 || claimsOnly
  const totals = monthTotals(filtered)
  const groups = groupTransactionsByDay(filtered)

  // Andere maand of andere filterchip: de oude selectie slaat nergens meer op.
  // Tijdens het renderen afgeleid (het aanbevolen patroon voor "state afleiden
  // van een prop-wissel"), zie ook CategoryPicker.
  const scopeKey = `${prefix}|${claimsOnly}`
  const [selScope, setSelScope] = useState(scopeKey)
  if (selScope !== scopeKey) {
    setSelScope(scopeKey)
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  useMonthSwipe(listRef)

  const slideClass = animDir === 'left'
    ? 'animate-slide-in-left'
    : animDir === 'right'
    ? 'animate-slide-in-right'
    : ''

  function enterSelectMode(id) {
    setSelectMode(true)
    setSelectedIds(new Set(id != null ? [id] : []))
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /* -------------------- lang indrukken vs. tikken vs. vegen -------------------- */

  function handleRowTouchStart(e) {
    txTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, scrollY: window.scrollY }
    longPressFired.current = false
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    const txId = Number(e.currentTarget.dataset.txId)
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      longPressFired.current = true
      if (navigator.vibrate) navigator.vibrate(10)
      if (selectMode) toggleSelect(txId)
      else enterSelectMode(txId)
    }, LONG_PRESS_MS)
  }

  function handleRowTouchMove(e) {
    const s = txTouchStart.current
    if (!s || !longPressTimer.current) return
    if (Math.abs(e.touches[0].clientX - s.x) > LONG_PRESS_SLOP || Math.abs(e.touches[0].clientY - s.y) > LONG_PRESS_SLOP) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  function handleRowTouchEnd(e, tx) {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    if (longPressFired.current) { longPressFired.current = false; txTouchStart.current = null; return }
    const s = txTouchStart.current
    txTouchStart.current = null
    if (!s) return
    const moved = Math.abs(e.changedTouches[0].clientX - s.x) >= 8 ||
      Math.abs(e.changedTouches[0].clientY - s.y) >= 8 ||
      Math.abs(window.scrollY - s.scrollY) >= 3
    if (moved) return
    if (selectMode) toggleSelect(tx.id)
    else setEditing(tx)
  }

  function handleRowTouchCancel() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    txTouchStart.current = null
    longPressFired.current = false
  }

  /* -------------------- bulk-acties -------------------- */

  async function runBulkCategory(category, subcategory) {
    setBulkCategoryOpen(false)
    const ids = [...selectedIds]
    const n = await bulkSetCategory(ids, category, subcategory)
    exitSelectMode()
    showToast(`${n} ${n === 1 ? 'transactie' : 'transacties'} bijgewerkt`)
  }

  async function runBulkTrip(tripId) {
    setBulkTripOpen(false)
    const ids = [...selectedIds]
    const n = await bulkSetTrip(ids, tripId)
    exitSelectMode()
    showToast(`${n} ${n === 1 ? 'transactie' : 'transacties'} bijgewerkt`)
  }

  async function runBulkClaim() {
    const ids = [...selectedIds]
    const { updated, skipped } = await bulkMarkClaim(ids)
    exitSelectMode()
    showToast(
      skipped > 0
        ? `${updated} ${updated === 1 ? 'transactie' : 'transacties'} bijgewerkt · ${skipped} overgeslagen`
        : `${updated} ${updated === 1 ? 'transactie' : 'transacties'} bijgewerkt`
    )
  }

  async function runBulkDelete() {
    const ids = [...selectedIds]
    if (!ids.length) return
    const woord = ids.length === 1 ? 'transactie' : 'transacties'
    if (!window.confirm(`${ids.length} ${woord} verwijderen?`)) return
    const verwijderd = await bulkDeleteTransactions(ids)
    exitSelectMode()
    showToast(`${verwijderd.length} ${verwijderd.length === 1 ? 'transactie' : 'transacties'} verwijderd`, {
      actionLabel: 'Herstel',
      onAction: () => restoreTransactions(verwijderd),
    })
  }

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

        {selectMode ? (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-semibold">{selectedIds.size} geselecteerd</span>
            <button onClick={exitSelectMode} className="text-sm font-semibold text-accent">Klaar</button>
          </div>
        ) : (
          <>
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
            <div className="flex gap-2 mt-2.5">
              {[
                { id: 'all', label: 'Alles' },
                { id: 'claims', label: '💼 Declaraties' },
              ].map(chip => {
                const active = chip.id === (claimsOnly ? 'claims' : 'all')
                return (
                  <button
                    key={chip.id}
                    onClick={() => setSearchParams(chip.id === 'claims' ? { filter: 'claims' } : {}, { replace: true })}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${active ? 'btn-accent' : 'text-muted'}`}
                    style={active ? undefined : { background: 'var(--color-surface-2)' }}
                  >
                    {chip.label}
                  </button>
                )
              })}
              {claimsOnly && (
                <span className="text-[11px] self-center" style={{ color: 'var(--color-muted)' }}>alle maanden</span>
              )}
              <button
                onClick={() => enterSelectMode()}
                className="text-[11px] font-semibold self-center"
                style={{ color: 'var(--color-muted)' }}
              >
                Selecteer
              </button>
              <Link
                to="/declaraties"
                className="text-[11px] font-semibold self-center ml-auto"
                style={{ color: 'var(--color-accent)' }}
              >
                Beheer ›
              </Link>
            </div>
          </>
        )}

        {/* Maandtotaal: dezelfde meetel-regels als de rest van de app
            (countsInTotals) — lopende declaraties en uitbetalingen tellen niet mee. */}
        <div className="flex items-center gap-4 mt-3 px-0.5">
          <TotalRegel label="In" value={totals.in} tone="text-green" />
          <TotalRegel label="Uit" value={totals.out} tone="text-red" />
          <TotalRegel label="Netto" value={totals.net} />
          {filterActive && (
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 ml-auto" style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
              gefilterd
            </span>
          )}
        </div>
      </div>

      {/* List */}
      <div
        ref={listRef}
        className={`flex-1 min-h-[60vh] touch-pan-y ${slideClass}`}
        style={{ paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {filtered.length === 0 && (
          <div className="text-center text-muted py-12 text-sm">
            {claimsOnly ? 'Geen declaraties' : 'Geen transacties'}
          </div>
        )}
        {groups.map(group => (
          <div key={group.date}>
            <div
              className="sticky top-0 z-10 flex items-baseline justify-between px-4 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--color-bg)', color: 'var(--color-muted)' }}
            >
              <span>{group.label}</span>
              <span className="font-normal">{group.net > 0 ? '+' : ''}{euro(group.net)}</span>
            </div>
            <div className="divide-y divide-border">
              {group.transactions.map(tx => {
                const cat = catMap[tx.category]
                const selected = selectedIds.has(tx.id)
                return (
                  <button
                    key={tx.id}
                    data-tx-id={tx.id}
                    onTouchStart={handleRowTouchStart}
                    onTouchMove={handleRowTouchMove}
                    onTouchEnd={e => handleRowTouchEnd(e, tx)}
                    onTouchCancel={handleRowTouchCancel}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface"
                  >
                    {selectMode && (
                      <span
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs"
                        style={{
                          background: selected ? 'var(--color-accent)' : 'transparent',
                          boxShadow: selected ? 'none' : 'inset 0 0 0 1.5px var(--color-border)',
                          color: '#fff',
                        }}
                      >
                        {selected ? '✓' : ''}
                      </span>
                    )}
                    <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💸'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{tx.note || cat?.label || tx.category}</div>
                      <div className="text-xs text-muted flex items-center gap-1.5">
                        <span className="truncate">{fmtDate(tx.date)} · {cat?.label}</span>
                        {tx.receiptId != null && (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label="Bon bekijken"
                            title="Bon bekijken"
                            className="inline-block p-2 -m-2 leading-none shrink-0"
                            onClick={e => { e.stopPropagation(); e.preventDefault(); setViewerId(tx.receiptId) }}
                            onKeyDown={e => {
                              if (e.key !== 'Enter' && e.key !== ' ') return
                              e.stopPropagation(); e.preventDefault(); setViewerId(tx.receiptId)
                            }}
                            onTouchStart={e => e.stopPropagation()}
                            onTouchEnd={e => e.stopPropagation()}
                          >
                            🧾
                          </span>
                        )}
                        <ClaimBadge tx={tx} />
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold shrink-0 ${isOpenClaim(tx) ? 'text-muted' : tx.type === 'credit' ? 'text-green' : ''}`}
                      style={!isOpenClaim(tx) && tx.type !== 'credit' ? { color: 'var(--color-text)' } : {}}
                    >
                      {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* FAB */}
      {!selectMode && (
        <button
          onClick={() => setShowAdd(true)}
          className="fixed right-4 w-14 h-14 rounded-full bg-green text-white text-2xl flex items-center justify-center shadow-lg z-40 animate-scale-in"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px) + 1rem)', boxShadow: '0 4px 20px rgba(48, 209, 88, 0.35)' }}
        >
          +
        </button>
      )}

      {/* Bulk-actiebalk */}
      {selectMode && (
        <div
          className="fixed left-0 right-0 z-40 px-3 py-2"
          style={{
            bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
            background: 'var(--color-surface)',
            borderTop: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-nav)',
          }}
        >
          <div className="flex gap-1.5">
            <BulkActionButton icon="🏷️" label="Categorie" disabled={selectedIds.size === 0} onClick={() => setBulkCategoryOpen(true)} />
            <BulkActionButton icon="🧳" label="Vakantie" disabled={selectedIds.size === 0} onClick={() => setBulkTripOpen(true)} />
            <BulkActionButton icon="💼" label="Declaratie" disabled={selectedIds.size === 0} onClick={runBulkClaim} />
            <BulkActionButton icon="🗑️" label="Verwijder" disabled={selectedIds.size === 0} onClick={runBulkDelete} tone="text-red" />
          </div>
        </div>
      )}

      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
      {/* Een nieuwe transactie valt in de maand die je bekijkt: vandaag als dat
          de huidige maand is, anders de laatste dag van die maand. */}
      {showAdd && (
        <TransactionForm
          prefill={{ date: isCurrentMonth ? today() : `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` }}
          onClose={() => setShowAdd(false)}
        />
      )}
      {viewerId != null && <ReceiptViewer receiptId={viewerId} onClose={() => setViewerId(null)} />}

      {bulkCategoryOpen && (
        <CategoryPicker
          open
          value={{}}
          title={`Categorie voor ${selectedIds.size} ${selectedIds.size === 1 ? 'transactie' : 'transacties'}`}
          onSelect={(cat, sub) => runBulkCategory(cat, sub)}
          onClose={() => setBulkCategoryOpen(false)}
        />
      )}

      <TripKiezer
        open={bulkTripOpen}
        value={null}
        onSelect={id => runBulkTrip(id)}
        onClose={() => setBulkTripOpen(false)}
      />
    </PageWrapper>
  )
}

function TotalRegel({ label, value, tone }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted">{label}</span>
      <span className={`text-sm font-semibold ${tone ?? ''}`} style={!tone ? { color: 'var(--color-text)' } : undefined}>
        {euro(value)}
      </span>
    </div>
  )
}

function BulkActionButton({ icon, label, onClick, disabled, tone }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium disabled:opacity-35 ${tone ?? ''}`}
      style={{ background: 'var(--color-surface-2)', color: tone ? undefined : 'var(--color-text)' }}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </button>
  )
}
