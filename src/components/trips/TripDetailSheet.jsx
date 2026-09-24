import { useCallback, useEffect, useMemo, useState } from 'react'
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
  recategorizeTripTransactions,
  setTripTransactions,
  useTrip,
  useTripCandidates,
  useTripItems,
  useTripTransactions,
  autoMatchTripItems,
  useTripCandidateTransactions,
  useTrips,
  DEFAULT_SPLITSER_NAME,
  setTripItemNoBank,
} from '../../hooks/useTrips'
import { tripCosts } from '../../utils/trips/costs'
import { findTripCategory, needsTripCategory, subLabelOf } from '../../utils/trips/subcategory'
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
  const bankKandidaten = useTripCandidateTransactions(trip)
  const [alleenOpen, setAlleenOpen] = useState(false)
  const [catKeuze, setCatKeuze] = useState(null)   // rij uit de donut: toon de regels erachter
  const alleTrips = useTrips()
  const tripNamen = Object.fromEntries((alleTrips ?? []).map(t => [t.id, t.name]))

  // Bij openen: Splitser-regels die jij betaalde alsnog aan bankregels
  // koppelen — ook aan betalingen die pas later zijn geïmporteerd.
  useEffect(() => { autoMatchTripItems(tripId).catch(() => {}) }, [tripId])

  const [tab, setTab] = useState('regels')
  const [item, setItem] = useState(null)
  const [editTx, setEditTx] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [kiezerOpen, setKiezerOpen] = useState(false)
  const [splitserOpen, setSplitserOpen] = useState(false)

  const vakantieCat = useMemo(() => findTripCategory(allCategories), [allCategories])
  const vakantieKeys = useMemo(() => (vakantieCat ? [vakantieCat.key] : []), [vakantieCat])
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
  // Binnen een vakantie zegt "Vakantie" niets; de sub wel.
  const vakLabel = (category, subcategory) => (
    vakantieCat && category === vakantieCat.key && subcategory
      ? subLabelOf(vakantieCat, subcategory)
      : catMap[category]?.label ?? category
  )
  const teDoen = (txs ?? []).filter(tx => needsTripCategory(tx, vakantieCat?.key)).length

  async function zetOpVakantie() {
    if (!window.confirm(
      `${teDoen} ${teDoen === 1 ? 'uitgave' : 'uitgaven'} van deze reis op Vakantie zetten, `
      + 'met een subcategorie per regel? De verrekeningen en lopende declaraties blijven zoals ze zijn.'
    )) return
    await recategorizeTripTransactions(trip.id)
  }

  async function verwijder() {
    if (!window.confirm(`"${trip.name}" verwijderen? De transacties blijven staan en verliezen alleen hun vakantie.`)) return
    await deleteTrip(trip.id)
    onClose()
  }

  // Controle: elke Splitser-regel die ík betaalde hoort een bankregel te
  // hebben — of is bewust contant.
  const mijnNaam = String(trip.splitser?.myName ?? DEFAULT_SPLITSER_NAME).toLowerCase()
  const isMijn = it => String(it?.payer ?? '').toLowerCase() === mijnNaam
  const statusVan = it => (!isMijn(it) ? 'ander' : it.matchedTxId != null ? 'gekoppeld' : it.noBank ? 'contant' : 'open')
  const mijnItems = (items ?? []).filter(isMijn)
  const controle = {
    totaal: mijnItems.length,
    gekoppeld: mijnItems.filter(i => statusVan(i) === 'gekoppeld').length,
    contant: mijnItems.filter(i => statusVan(i) === 'contant').length,
    open: mijnItems.filter(i => statusVan(i) === 'open').length,
  }
  const sleutelVan = r => (r.soort === 'splitser'
    ? `${r.item.category ?? ''}|${r.item.subcategory ?? ''}`
    : `${r.tx.category ?? ''}|${r.tx.subcategory ?? ''}`)
  const regelsVanCat = catKeuze ? regels.filter(r => sleutelVan(r) === catKeuze.key) : []

  const zichtbaar = alleenOpen
    ? regels.filter(r => r.soort === 'splitser' && statusVan(r.item) === 'open')
    : regels
  // Rustige kleuren: wie betaalde, en voor mijn betalingen de bankstatus.
  const pillsVoor = it => {
    const status = statusVan(it)
    const pills = [status === 'ander' ? { text: it.payer, tone: 'neutral' } : { text: 'jij', tone: 'accent' }]
    if (status === 'gekoppeld') pills.push({ text: 'bank ✓', tone: 'green' })
    if (status === 'contant') pills.push({ text: 'contant', tone: 'neutral' })
    if (status === 'open') pills.push({ text: 'nog koppelen', tone: 'orange' })
    return pills
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
                ? `Via de bank ging ${euro(costs.reconcile)} méér af dan je eigen deel. Dat is wat je voorschoot en (nog) niet terugkreeg — of een verrekening die nog niet gekoppeld is.`
                : `Via de bank ging ${euro(-costs.reconcile)} minder af dan je eigen deel. Dat klopt als een reisgenoot voorschoot en jij contant of buiten deze rekening terugbetaalde — of je eigen pinbetalingen zijn nog niet aan deze vakantie gekoppeld.`}
            </p>
          )}
          {costs.openClaimCount > 0 && (
            <p className="text-[11px] text-muted mt-1 px-1">
              💼 {costs.openClaimCount} lopende {costs.openClaimCount === 1 ? 'declaratie telt' : 'declaraties tellen'} niet mee in de kosten.
            </p>
          )}

          <div className="card p-4 mt-3">
            <TripCategoryDonut perCategory={costs.perCategory} showBank={costs.hasSplitser} onSelect={r => setCatKeuze(r)} />
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
            {controle.totaal > 0 && (
              <div className="card px-4 py-3 mb-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">
                    {controle.open === 0 ? '✓ Alles wat jij betaalde is gekoppeld' : `${controle.open} eigen ${controle.open === 1 ? 'betaling' : 'betalingen'} nog te koppelen`}
                  </div>
                  <div className="text-[11px] text-muted">
                    {controle.gekoppeld} gekoppeld · {controle.contant} contant · {controle.totaal} betaalde jij in totaal
                  </div>
                </div>
                {controle.open > 0 && (
                  <button
                    onClick={() => setAlleenOpen(v => !v)}
                    className="rounded-full px-3 py-1.5 text-[11px] font-semibold shrink-0"
                    style={alleenOpen
                      ? { background: 'var(--color-accent)', color: 'white' }
                      : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
                  >
                    Alleen open
                  </button>
                )}
              </div>
            )}
            {zichtbaar.length === 0 ? (
              <p className="text-center text-muted py-8 text-sm px-6">
                Nog geen regels. Kies transacties of importeer je Splitser-settlement.
              </p>
            ) : (
              <div className="card overflow-hidden divide-y divide-border">
                {zichtbaar.map(r => (r.soort === 'splitser' ? (
                  <Rij
                    key={r.sleutel}
                    icoon={catMap[r.item.category]?.icon ?? '🧾'}
                    label={r.item.description}
                    meta={`${fmtDate(r.item.date)} · ${euro(r.item.amount)} totaal`}
                    pills={pillsVoor(r.item)}
                    trailing={statusVan(r.item) === 'open' && (
                      <button
                        onClick={e => { e.stopPropagation(); setTripItemNoBank(r.item.id, true) }}
                        className="rounded-full px-2 py-1 text-[10px] font-semibold shrink-0"
                        style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
                        title="Contant of niet via deze rekening"
                      >
                        contant
                      </button>
                    )}
                    amount={r.item.myShare ?? 0}
                    onClick={() => setItem(r.item)}
                  />
                ) : (
                  <Rij
                    key={r.sleutel}
                    icoon={catMap[r.tx.category]?.icon ?? '💸'}
                    label={r.tx.note || catMap[r.tx.category]?.label || r.tx.category}
                    meta={`${fmtDate(r.tx.date)} · ${vakLabel(r.tx.category, r.tx.subcategory)}`}
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
                    meta={`${fmtDate(tx.date)} · ${vakLabel(tx.category, tx.subcategory)}`}
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

        {teDoen > 0 && (
          <div className="px-4 pt-4">
            <button
              onClick={zetOpVakantie}
              className="w-full rounded-xl py-2.5 text-xs font-semibold bg-accent-dim text-accent"
            >
              ✈️ Zet {teDoen} gekoppelde {teDoen === 1 ? 'uitgave' : 'uitgaven'} op Vakantie
            </button>
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

      {catKeuze && (
        <Sheet
          open
          onClose={() => setCatKeuze(null)}
          title={vakLabel(catKeuze.category ?? catKeuze.key, catKeuze.subcategory)}
          subtitle={`Voor jou ${euro(catKeuze.amount ?? 0)}${costs.hasSplitser ? ` · bank ${euro(catKeuze.bank ?? 0)}` : ''}`}
        >
          {regelsVanCat.length === 0 ? (
            <p className="text-center text-muted py-8 text-sm px-6">Geen regels met een eigen aandeel in deze categorie.</p>
          ) : (
            <div className="divide-y divide-border">
              {regelsVanCat.map(r => (r.soort === 'splitser' ? (
                <Rij
                  key={r.sleutel}
                  icoon={catMap[r.item.category]?.icon ?? '🧾'}
                  label={r.item.description}
                  meta={`${fmtDate(r.item.date)} · ${euro(r.item.amount)} totaal`}
                  pills={pillsVoor(r.item)}
                  amount={r.item.myShare ?? 0}
                  onClick={() => setItem(r.item)}
                />
              ) : (
                <Rij
                  key={r.sleutel}
                  icoon={catMap[r.tx.category]?.icon ?? '💸'}
                  label={r.tx.note || catMap[r.tx.category]?.label || r.tx.category}
                  meta={fmtDate(r.tx.date)}
                  badge="bank"
                  amount={r.tx.amount}
                  onClick={() => setEditTx(r.tx)}
                />
              )))}
            </div>
          )}
        </Sheet>
      )}
      {item && (
        <TripItemSheet
          item={(items ?? []).find(i => i.id === item.id) ?? item}
          transactions={bankKandidaten ?? txs ?? []}
          loading={bankKandidaten == null}
          tripId={trip.id}
          tripNames={tripNamen}
          myName={trip.splitser?.myName}
          startIn={vakantieCat?.key ?? null}
          onClose={() => setItem(null)}
        />
      )}
      {/* Vanuit een vakantie opent de kiezer meteen in Vakantie › … */}
      {editTx && <TransactionForm existing={editTx} pickerStartIn={vakantieCat?.key ?? null} onClose={() => setEditTx(null)} />}
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

const PILL_TONES = {
  neutral: { background: 'var(--color-surface-2)', color: 'var(--color-muted)' },
  accent: { background: 'var(--color-accent-dim)', color: 'var(--color-accent)' },
  green: { background: 'var(--color-green-dim)', color: 'var(--color-green)' },
  orange: { background: 'var(--color-orange-dim)', color: 'var(--color-orange)' },
}

function Pill({ text, tone = 'neutral' }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold whitespace-nowrap shrink-0" style={PILL_TONES[tone] ?? PILL_TONES.neutral}>
      {text}
    </span>
  )
}

function Rij({ icoon, label, meta, badge, pills = [], trailing = null, amount, sign = '', gedimd = false, onClick }) {
  return (
    <div className="w-full flex items-center gap-3 px-4 py-3">
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 text-left">
        <span className="text-xl w-7 text-center shrink-0">{icoon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm truncate">{label}</div>
          <div className="text-[11px] text-muted flex items-center gap-1.5 flex-wrap">
            <span className="truncate">{meta}</span>
            {badge && <Pill text={badge} />}
            {pills.map((p, i) => <Pill key={i} text={p.text} tone={p.tone} />)}
          </div>
        </div>
        <span className={`text-sm font-semibold shrink-0 tabular-nums ${gedimd ? 'text-muted' : ''}`}>
          {sign}{euro(amount)}
        </span>
      </button>
      {trailing || null}
    </div>
  )
}
