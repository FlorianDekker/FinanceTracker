import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { CategoryPicker, CategoryIcon } from '../categories/CategoryPicker'
import { useCategories } from '../../hooks/useCategories'
import { setTripItemMatch, updateTripItem } from '../../hooks/useTrips'
import { recordEvent } from '../../utils/merchantLearning'
import { euro, fmtDate } from '../../utils/formatters'

/**
 * Eén Splitser-regel: de categorie corrigeren (dat leert de app, net als bij
 * het importeren van een bankbestand) en aanwijzen welke banktransactie erbij
 * hoort. Die koppeling bepaalt of de bankregel nog los meetelt in de kosten.
 */
export function TripItemSheet({ item, transactions = [], myName, startIn = null, onClose }) {
  const { catMap } = useCategories()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)

  const cat = catMap[item.category]
  const sub = cat?.subs?.find(s => s.key === item.subcategory)
  const gekoppeld = transactions.find(tx => tx.id === item.matchedTxId) ?? null
  const ikBetaalde = myName && String(item.payer ?? '').toLowerCase() === String(myName).toLowerCase()

  async function kiesCategorie(category, subcategory) {
    setPickerOpen(false)
    const gewijzigd = item.category !== category
    await updateTripItem(item.id, { category, subcategory })
    // Zelfde leerlus als bij het importeren: de omschrijving is hier de "winkel".
    recordEvent(item.description, category, subcategory, item.amount, 'debit', null,
      gewijzigd ? { was: true, from: item.category } : null)
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={item.description}
        subtitle={`${fmtDate(item.date)} · ${item.payer} betaalde ${euro(item.amount)}`}
        maxHeight="85vh"
        bodyClassName="p-4"
      >
        <div className="card p-3 mb-3 flex items-center gap-3">
          <span className="text-2xl">🧾</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted">Jouw aandeel</div>
            <div className="text-lg font-bold tabular-nums">{euro(item.myShare ?? 0)}</div>
          </div>
          {ikBetaalde && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-accent-dim text-accent">
              jij schoot voor
            </span>
          )}
        </div>

        <button
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
          style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
        >
          {cat ? <CategoryIcon cat={cat} size={28} /> : <span className="text-lg">📦</span>}
          <span className="flex-1 text-sm truncate">
            {cat?.label ?? 'Kies categorie…'}
            {sub && <span className="text-muted"> › {sub.label}</span>}
          </span>
          <span className="text-muted">›</span>
        </button>

        <button
          onClick={() => setMatchOpen(v => !v)}
          className="w-full flex items-center gap-3 rounded-lg px-3 py-2 mt-2 text-left"
          style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
        >
          <span className="text-lg">🏦</span>
          <span className="flex-1 text-sm">
            {gekoppeld ? (gekoppeld.note || 'Banktransactie') : 'Welke banktransactie is dit?'}
            <span className="block text-[11px] text-muted">
              {gekoppeld
                ? `${fmtDate(gekoppeld.date)} · ${euro(gekoppeld.amount)} · telt niet dubbel mee`
                : 'Geen bankregel gekoppeld'}
            </span>
          </span>
          <span className="text-muted">{matchOpen ? '▾' : '›'}</span>
        </button>

        {matchOpen && (
          <div className="mt-2 rounded-xl overflow-hidden divide-y divide-border" style={{ background: 'var(--color-surface-2)' }}>
            <Keuze
              label="Geen"
              meta="Deze uitgave staat niet los op mijn rekening"
              checked={item.matchedTxId == null}
              onSelect={() => setTripItemMatch(item.id, null)}
            />
            {/* Beste kandidaten bovenaan: zelfde bedrag, datum dichtbij. */}
            {sorteerKandidaten(transactions, item).map(({ tx, voorstel, los }) => (
              <Keuze
                key={tx.id}
                label={`${voorstel ? '★ ' : ''}${tx.note || catMap[tx.category]?.label || tx.category}`}
                meta={`${fmtDate(tx.date)} · ${euro(tx.amount)}${voorstel ? ' · voorstel' : ''}${los ? ' · nog niet in deze vakantie' : ''}`}
                checked={item.matchedTxId === tx.id}
                onSelect={() => setTripItemMatch(item.id, tx.id)}
              />
            ))}
          </div>
        )}

        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Verdeling
          </div>
          <div className="card divide-y divide-border">
            {(item.participants ?? []).map(p => (
              <div key={p.name} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm truncate">
                  {p.name}
                  {myName && p.name.toLowerCase() === String(myName).toLowerCase() && (
                    <span className="text-muted"> · jij</span>
                  )}
                </span>
                <span className="text-sm tabular-nums">{euro(p.share)}</span>
              </div>
            ))}
          </div>
        </div>
      </Sheet>

      <CategoryPicker
        open={pickerOpen}
        value={{ category: item.category, subcategory: item.subcategory }}
        onSelect={kiesCategorie}
        onClose={() => setPickerOpen(false)}
        title="Categorie van deze regel"
        filterType="expense"
        startIn={startIn}
      />
    </>
  )
}

/**
 * Afschrijvingen gesorteerd op hoe goed ze bij de regel passen: eerst gelijk
 * bedrag (dichtste datum eerst, gemarkeerd als voorstel), dan de rest op datum.
 */
function sorteerKandidaten(transactions, item) {
  const dagen = (a, b) => Math.abs((Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`)) / 86400000)
  return (transactions ?? [])
    .filter(tx => tx.type === 'debit')
    .map(tx => {
      const gelijk = Math.abs((Number(tx.amount) || 0) - (Number(item.amount) || 0)) <= 0.01
      const afstand = dagen(item.date, tx.date)
      return { tx, afstand, voorstel: gelijk && afstand <= 3, los: tx.tripId == null }
    })
    .sort((a, b) => (a.voorstel !== b.voorstel ? (a.voorstel ? -1 : 1) : a.afstand - b.afstand))
}

function Keuze({ label, meta, checked, onSelect }) {
  return (
    <button onClick={onSelect} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
      <span
        className="shrink-0 w-[20px] h-[20px] rounded-full flex items-center justify-center text-[12px] text-white"
        style={checked ? { background: 'var(--color-accent)' } : { border: '1.5px solid var(--color-border)' }}
        role="radio"
        aria-checked={checked}
      >
        {checked ? '✓' : ''}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{label}</div>
        <div className="text-[11px] text-muted truncate">{meta}</div>
      </div>
    </button>
  )
}
