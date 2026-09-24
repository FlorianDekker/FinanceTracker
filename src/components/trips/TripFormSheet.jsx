import { useCallback, useMemo, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { CountryPickerSheet } from './CountryPickerSheet'
import { TripTransactionsSheet } from './TripTransactionsSheet'
import { useCategories } from '../../hooks/useCategories'
import { createTrip, recategorizeTripTransactions, updateTrip, useTripCandidates, useTripTransactions } from '../../hooks/useTrips'
import { EmojiPickerLite } from '../ui/EmojiPickerLite'
import { countryLabel, flagsOf } from '../../utils/trips/country'
import { findTripCategory } from '../../utils/trips/subcategory'
import { tripDays } from '../../utils/trips/suggest'
import { euro, today } from '../../utils/formatters'

/**
 * Vakantie aanmaken of bewerken: naam, periode, landen, notitie en de
 * banktransacties die erbij horen.
 *
 * Zolang je de landen of de selectie niet zelf aanraakt, lopen ze mee met de
 * periode: de app scant van − 1 dag t/m tot + 1 dag en vinkt de kandidaten
 * voor (buitenland, categorie Vakantie, bijschrijvingen die geen inkomen zijn).
 */
export function TripFormSheet({ trip = null, prefill = null, onClose, onSaved }) {
  const start = trip ?? prefill ?? {}
  const { catMap, allCategories } = useCategories()

  const [name, setName] = useState(start.name ?? '')
  const [from, setFrom] = useState(start.from ?? today())
  const [to, setTo] = useState(start.to ?? start.from ?? today())
  const [countries, setCountries] = useState(start.countries ?? [])
  const [note, setNote] = useState(start.note ?? '')
  const [icon, setIcon] = useState(start.icon ?? '')          // leeg = vlag
  const [iconOpen, setIconOpen] = useState(false)
  const [ids, setIds] = useState(() => start.transactionIds ?? [])
  const [landenOpen, setLandenOpen] = useState(false)
  const [kiezerOpen, setKiezerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Alleen bij een nieuwe vakantie: de gekozen uitgaven meteen op Vakantie
  // zetten, met een subcategorie per regel.
  const [opVakantie, setOpVakantie] = useState(true)

  // Zodra je zelf kiest, houdt de app op met voorstellen.
  const [zelfLanden, setZelfLanden] = useState((start.countries ?? []).length > 0)
  const [zelfTxs, setZelfTxs] = useState(!!trip || !!start.transactionIds)

  // Bij bewerken beginnen we bij de transacties die er nú aan hangen; anders
  // zou het opslaan van alleen een naamswijziging de selectie opnieuw bepalen.
  const huidige = useTripTransactions(trip?.id ?? null)
  const [huidigeGeladen, setHuidigeGeladen] = useState(false)
  if (trip && huidige && !huidigeGeladen) {
    // Afleiden tijdens de render (zoals CategoryPicker doet), niet in een
    // effect: dat zou een extra renderronde kosten.
    setHuidigeGeladen(true)
    setIds(huidige.map(tx => tx.id))
  }

  const vakantieCat = useMemo(() => findTripCategory(allCategories), [allCategories])
  const vakantieKeys = useMemo(() => (vakantieCat ? [vakantieCat.key] : []), [vakantieCat])
  const isIncomeKey = useCallback(key => catMap[key]?.type === 'income', [catMap])

  const kandidaten = useTripCandidates({ from, to, tripId: trip?.id ?? null, vakantieKeys, isIncomeKey })
  const suggested = kandidaten?.suggested ?? []
  const others = kandidaten?.others ?? []

  // Voorvinken en landen invullen zolang de gebruiker niets zelf koos. Ook dit
  // leiden we tijdens de render af: `kandidaten` is een nieuw object zodra de
  // periode wijzigt, dus één keer per uitkomst.
  const [verwerkt, setVerwerkt] = useState(null)
  if (kandidaten && kandidaten !== verwerkt) {
    setVerwerkt(kandidaten)
    if (!zelfTxs) setIds(kandidaten.suggested.map(tx => tx.id))
    if (!zelfLanden && kandidaten.countries.length) setCountries(kandidaten.countries)
  }

  const gekozenTxs = [...suggested, ...others].filter(tx => ids.includes(tx.id))
  const netto = gekozenTxs.reduce((s, tx) => s + (tx.type === 'credit' ? -tx.amount : tx.amount), 0)
  const dagen = tripDays(from, to)
  const geldig = !!from && !!to && from <= to

  async function opslaan() {
    setBusy(true)
    setError(null)
    try {
      const velden = { name, from, to, countries, note, icon, transactionIds: ids }
      const id = trip ? (await updateTrip(trip.id, velden), trip.id) : await createTrip(velden)
      // Ná het koppelen: pas dan weet `recategorizeTripTransactions` welke
      // transacties bij de reis horen.
      if (!trip && opVakantie) await recategorizeTripTransactions(id)
      onSaved?.(id)
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Opslaan is niet gelukt.')
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={trip ? 'Vakantie bewerken' : 'Nieuwe vakantie'}
        subtitle={geldig ? `${dagen} ${dagen === 1 ? 'dag' : 'dagen'}` : 'Kies een geldige periode'}
        maxHeight="90vh"
        bodyClassName="p-4"
      >
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted">Naam</span>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Bijv. Parijs"
              className="w-full rounded-lg px-3 py-2 mt-1"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
          </label>

          {/* Icoon: standaard de vlag(gen) van de landen, of een eigen emoji. */}
          <div>
            <button
              onClick={() => setIconOpen(o => !o)}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
              style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
            >
              <span className="text-lg">{icon || flagsOf(countries)}</span>
              <span className="flex-1 text-sm">
                Icoon
                <span className="block text-[11px] text-muted">{icon ? 'eigen keuze · tik om te wijzigen' : 'vlag van het land · tik voor een eigen icoon'}</span>
              </span>
              <span className="text-muted">{iconOpen ? '⌃' : '›'}</span>
            </button>
            {iconOpen && (
              <div className="mt-2 rounded-lg p-3" style={{ background: 'var(--color-surface-2)' }}>
                <EmojiPickerLite value={icon} onChange={e => { setIcon(e); setIconOpen(false) }} />
                {icon && (
                  <button onClick={() => { setIcon(''); setIconOpen(false) }} className="text-xs mt-2" style={{ color: 'var(--color-accent)' }}>
                    Vlag gebruiken
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-xs text-muted">Van</span>
              <input
                type="date"
                value={from}
                onChange={e => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value) }}
                className="w-full rounded-lg px-3 py-2 mt-1"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              />
            </label>
            <label className="flex-1">
              <span className="text-xs text-muted">Tot en met</span>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="w-full rounded-lg px-3 py-2 mt-1"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              />
            </label>
          </div>

          <button
            onClick={() => setLandenOpen(true)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
            style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
          >
            <span className="text-lg">🌍</span>
            <span className="flex-1 text-sm truncate">
              {countries.length ? countries.map(countryLabel).join(' · ') : 'Landen kiezen…'}
              <span className="block text-[11px] text-muted">
                {countries.length ? 'uit je betalingen; tik om aan te passen' : 'vult zichzelf uit "Land: XXX" bij je betalingen'}
              </span>
            </span>
            <span className="text-muted">›</span>
          </button>

          <button
            onClick={() => setKiezerOpen(true)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
            style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
          >
            <span className="text-lg">🏦</span>
            <span className="flex-1 text-sm">
              {ids.length} {ids.length === 1 ? 'transactie' : 'transacties'}
              <span className="block text-[11px] text-muted">
                {kandidaten ? `${euro(netto)} netto · ${others.length} andere in deze periode` : 'Laden…'}
              </span>
            </span>
            <span className="text-muted">›</span>
          </button>

          {!trip && vakantieCat && (
            <label className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: 'var(--color-surface-2)', minHeight: 44 }}>
              <input
                type="checkbox"
                checked={opVakantie}
                onChange={e => setOpVakantie(e.target.checked)}
                style={{ width: 20, height: 20, accentColor: 'var(--color-accent)' }}
              />
              <span className="flex-1 text-sm">
                Gekoppelde uitgaven op Vakantie zetten
                <span className="block text-[11px] text-muted">
                  met een subcategorie per regel; verrekeningen en declaraties blijven staan
                </span>
              </span>
            </label>
          )}

          <label className="block">
            <span className="text-xs text-muted">Notitie (optioneel)</span>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Bijv. met Dani en Yonathan"
              className="w-full rounded-lg px-3 py-2 mt-1"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
          </label>
        </div>

        {error && <p className="text-xs text-red mt-3">{error}</p>}

        <div className="mt-5 pb-4">
          <button
            onClick={opslaan}
            disabled={busy || !geldig}
            className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
          >
            {busy ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </Sheet>

      {landenOpen && (
        <CountryPickerSheet
          value={countries}
          onChange={next => { setZelfLanden(true); setCountries(next) }}
          onClose={() => setLandenOpen(false)}
        />
      )}

      {kiezerOpen && (
        <TripTransactionsSheet
          suggested={suggested}
          others={others}
          value={ids}
          loading={!kandidaten}
          onDone={next => { setZelfTxs(true); setIds(next); setKiezerOpen(false) }}
          onClose={() => setKiezerOpen(false)}
        />
      )}
    </>
  )
}
