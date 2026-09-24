import { useCallback, useMemo, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { TripCategoryDonut } from './TripCategoryDonut'
import { TripItemSheet } from './TripItemSheet'
import { TripFormSheet } from './TripFormSheet'
import { TripTransactionsSheet } from './TripTransactionsSheet'
import { SplitserImportSheet } from './SplitserImportSheet'
import { TransactionForm } from '../transactions/TransactionForm'
import { useCategories } from '../../hooks/useCategories'
import {
  deleteTrip,
  setTripTransactions,
  useTrip,
  useTripCandidates,
  useTripItems,
  useTripTransactions,
} from '../../hooks/useTrips'
import { tripCosts } from '../../utils/trips/costs'
import { tripIcon } from '../../utils/trips/country'
import { euro, euroParts, fmtDate } from '../../utils/formatters'
import { isOpenClaim } from '../../utils/claims'

const TABS = [
  { id: 'regels', label: 'Regels' },
  { id: 'bank', label: 'Bank' },
]

/**
 * Eén vakantie van dichtbij: wat kostte hij jou, waar ging het heen, en welke
 * regels zitten erachter. "Regels" mengt de Splitser-regels met de bankregels
 * die géén Splitser-regel dekt — samen zijn dat precies je kosten. "Bank" toont
 * gewoon alles wat aan deze reis hangt.
 */
export function TripDetailSheet({ tripId, onClose }) {
  const { catMap, allCategories } = useCategories()
  const trip = useTrip(tripId)
  const items = useTripItems(tripId)
  const txs = useTripTransactions(tripId)

  const [tab, setTab] = useState('regels')
  const [item, setItem] = useState(null)
  const [editTx, setEditTx] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [kiezerOpen, setKiezerOpen] = useState(false)
  const [splitserOpen, setSplitserOpen] = useState(false)

  const vakantieKeys = useMemo(
    () => allCategories.filter(c => c.key === 'vakantie' || c.label?.toLowerCase() === 'vakantie').map(c => c.key),
    [allCategories],
  )
  const isIncomeKey = useCallback(key => catMap[key]?.type === 'income', [catMap])
  const kandidaten = useTripCandidates({
    from: trip?.from, to: trip?.to, tripId: tripId, vakantieKeys, isIncomeKey,
  })

  const costs = useMemo(
    () => tripCosts({ items: items ?? [], transactions: txs ?? [], from: trip?.from, to: trip?.to }),
    [items, txs, trip],
  )

  const regels = useMemo(() => {
    const ongedekt = new Set(costs.uncoveredTxIds)
    const uit = [
      ...(items ?? []).map(i => ({ soort: 'splitser', sleutel: `i${i.id}`, date: i.date, item: i })),
      ...(txs ?? []).filter(tx => ongedekt.has(tx.id)).map(tx => ({ soort: 'bank', sleutel: `t${tx.id}`, date: tx.date, tx })),
    ]
    return uit.sort((a, b) => String(b.date).localeCompare(String(a.date)))
  }, [items, txs, costs.uncoveredTxIds])

  if (!trip) return null

  const laden = items == null || txs == null
  const gedekt = new Set(costs.coveredTxIds)

  async function verwijder() {
    if (!window.confirm(`"${trip.name}" verwijderen? De transacties blijven staan en verliezen alleen hun vakantie.`)) return
    await deleteTrip(trip.id)
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={`${tripIcon(trip)} ${trip.name}`}
        subtitle={`${fmtDate(trip.from)} – ${fmtDate(trip.to)} · ${costs.days} ${costs.days === 1 ? 'dag' : 'dagen'}`}
        maxHeight="92vh"
      >
        <div className="px-4 pt-3">
          <div className="card px-4 py-3">
            <div className="flex justify-around items-start">
              <Tegel label="Voor jou" value={costs.myCost} sub={costs.hasSplitser ? 'incl. Splitser' : 'bank netto'} />
              <Tegel label="Per dag" value={costs.perDayCost} sub={`${costs.days} dagen`} />
              <Tegel label="Bank netto" value={costs.bankNet} sub={`${euro(costs.bankOut)} af · ${euro(costs.bankIn)} bij`} />
            </div>
          </div>

          {costs.hasSplitser && Math.abs(costs.reconcile) > 0.5 && (
            <p className="text-[11px] text-muted mt-2 px-1">
              {costs.reconcile > 0
                ? `Er staat nog ${euro(costs.reconcile)} open: zoveel schoot je voor en kreeg je (nog) niet terug.`
                : `Je betaalde ${euro(-costs.reconcile)} minder via de bank dan je eigen deel — een reisgenoot schoot dat voor.`}
            </p>
          )}
          {costs.openClaimCount > 0 && (
            <p className="text-[11px] text-muted mt-1 px-1">
              💼 {costs.openClaimCount} lopende {costs.openClaimCount === 1 ? 'declaratie telt' : 'declaraties tellen'} niet mee in de kosten.
            </p>
          )}

          <div className="card p-4 mt-3">
            <TripCategoryDonut perCategory={costs.perCategory} />
          </div>

          <div className="flex gap-1 mt-3 p-1 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${tab === t.id ? 'btn-accent' : 'text-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {laden && <div className="text-center text-muted py-8 text-sm">Laden…</div>}

        {!laden && tab === 'regels' && (
          <div className="px-4 pt-3">
            {regels.length === 0 ? (
              <p className="text-center text-muted py-8 text-sm px-6">
                Nog geen regels. Kies transacties of importeer je Splitser-settlement.
              </p>
            ) : (
              <div className="card overflow-hidden divide-y divide-border">
                {regels.map(r => (r.soort === 'splitser' ? (
                  <Rij
                    key={r.sleutel}
                    icoon={catMap[r.item.category]?.icon ?? '🧾'}
                    label={r.item.description}
                    meta={`${fmtDate(r.item.date)} · ${r.item.payer} betaalde ${euro(r.item.amount)}`}
                    badge="Splitser"
                    amount={r.item.myShare ?? 0}
                    onClick={() => setItem(r.item)}
                  />
                ) : (
                  <Rij
                    key={r.sleutel}
                    icoon={catMap[r.tx.category]?.icon ?? '💸'}
                    label={r.tx.note || catMap[r.tx.category]?.label || r.tx.category}
                    meta={`${fmtDate(r.tx.date)} · ${catMap[r.tx.category]?.label ?? r.tx.category}`}
                    badge="bank"
                    amount={r.tx.amount}
                    onClick={() => setEditTx(r.tx)}
                  />
                )))}
              </div>
            )}
          </div>
        )}

        {!laden && tab === 'bank' && (
          <div className="px-4 pt-3">
            {txs.length === 0 ? (
              <p className="text-center text-muted py-8 text-sm px-6">
                Nog geen banktransacties gekoppeld.
              </p>
            ) : (
              <div className="card overflow-hidden divide-y divide-border">
                {[...txs].reverse().map(tx => (
                  <Rij
                    key={tx.id}
                    icoon={catMap[tx.category]?.icon ?? '💸'}
                    label={tx.note || catMap[tx.category]?.label || tx.category}
                    meta={`${fmtDate(tx.date)} · ${catMap[tx.category]?.label ?? tx.category}`}
                    badge={
                      isOpenClaim(tx) ? 'declaratie'
                      : tx.type === 'credit' ? 'verrekening'
                      : gedekt.has(tx.id) ? 'via Splitser'
                      : null
                    }
                    amount={tx.amount}
                    sign={tx.type === 'credit' ? '+' : ''}
                    gedimd={isOpenClaim(tx) || gedekt.has(tx.id)}
                    onClick={() => setEditTx(tx)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-4 pt-4 grid grid-cols-2 gap-2">
          <Knop onClick={() => setSplitserOpen(true)}>🧾 Splitser</Knop>
          <Knop onClick={() => setKiezerOpen(true)}>🏦 Transacties</Knop>
          <Knop onClick={() => setFormOpen(true)}>✏️ Bewerken</Knop>
          <button
            onClick={verwijder}
            className="rounded-xl py-2.5 text-xs font-semibold text-red bg-red-dim"
          >
            Verwijderen
          </button>
        </div>

        {trip.note && <p className="px-4 pt-3 text-xs text-muted">{trip.note}</p>}
      </Sheet>

      {item && (
        <TripItemSheet
          item={(items ?? []).find(i => i.id === item.id) ?? item}
          transactions={txs ?? []}
          myName={trip.splitser?.myName}
          onClose={() => setItem(null)}
        />
      )}
      {editTx && <TransactionForm existing={editTx} onClose={() => setEditTx(null)} />}
      {formOpen && <TripFormSheet trip={trip} onClose={() => setFormOpen(false)} />}
      {splitserOpen && <SplitserImportSheet trip={trip} onClose={() => setSplitserOpen(false)} />}
      {kiezerOpen && (
        <TripTransactionsSheet
          suggested={kandidaten?.suggested ?? []}
          others={kandidaten?.others ?? []}
          value={(txs ?? []).map(tx => tx.id)}
          loading={!kandidaten}
          onDone={async ids => { await setTripTransactions(trip.id, ids); setKiezerOpen(false) }}
          onClose={() => setKiezerOpen(false)}
        />
      )}
    </>
  )
}

function Tegel({ label, value, sub }) {
  const p = euroParts(value)
  return (
    <div className="text-center">
      <div className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
        {label}
      </div>
      <div className="tabular-nums" style={{ color: 'var(--color-text)' }}>
        <span className="text-sm font-bold">{p.sign}{p.whole}</span>
        <span className="text-[10px] font-medium" style={{ opacity: 0.4 }}>{p.dec}</span>
      </div>
      <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>{sub}</div>
    </div>
  )
}

function Knop({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl py-2.5 text-xs font-semibold"
      style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
    >
      {children}
    </button>
  )
}

function Rij({ icoon, label, meta, badge, amount, sign = '', gedimd = false, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 text-left">
      <span className="text-xl w-7 text-center shrink-0">{icoon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{label}</div>
        <div className="text-[11px] text-muted flex items-center gap-1.5">
          <span className="truncate">{meta}</span>
          {badge && (
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap shrink-0"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
              {badge}
            </span>
          )}
        </div>
      </div>
      <span className={`text-sm font-semibold shrink-0 tabular-nums ${gedimd ? 'text-muted' : ''}`}>
        {sign}{euro(amount)}
      </span>
    </button>
  )
}
