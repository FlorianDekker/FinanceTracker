import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { CategoryPicker, CategoryIcon } from '../categories/CategoryPicker'
import { useCategories } from '../../hooks/useCategories'
import { clearTripItemMatches, setTripItemNoBank, toggleTripItemMatch, updateTripItem } from '../../hooks/useTrips'
import { matchedIdsOf, matchGroup } from '../../utils/trips/costs'
import { recordEvent } from '../../utils/merchantLearning'
import { euro, fmtDate } from '../../utils/formatters'

/**
 * Eén Splitser-regel: de categorie corrigeren (dat leert de app, net als bij
 * het importeren van een bankbestand) en aanwijzen welke banktransacties erbij
 * horen. Die koppeling bepaalt of een bankregel nog los meetelt in de kosten.
 * Meer bankregels bij één regel mag, en één bankregel bij meer regels ook;
 * `matchGroup` rekent dan de hele groep na.
 */
export function TripItemSheet({ item, items = [], transactions = [], myName, startIn = null, tripId = null, tripNames = {}, loading = false, onClose }) {
  const { catMap } = useCategories()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [matchOpen, setMatchOpen] = useState(false)

  const cat = catMap[item.category]
  const sub = cat?.subs?.find(s => s.key === item.subcategory)
  const ids = matchedIdsOf(item)
  const gekoppeld = transactions.filter(tx => ids.includes(tx.id))
  const alleItems = items.some(i => i.id === item.id) ? items : [...items, item]
  const groep = matchGroup(item.id, alleItems, transactions)
  const samenMet = groep.items.filter(i => i.id !== item.id)
  const sluitAan = Math.abs(groep.diff) <= 0.01
  // Andere regels aan dezelfde banktransactie: "ook bij Wijn".
  const ookBij = txId => alleItems.filter(i => i.id !== item.id && matchedIdsOf(i).includes(txId))
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

        {!ikBetaalde && (
          <div className="rounded-lg px-3 py-2 mt-2 text-[11px] text-muted" style={{ background: 'var(--color-surface-2)' }}>
            {item.payer} betaalde dit — er is geen bankregel van jou; alleen je aandeel telt.
          </div>
        )}

        {ikBetaalde && (
          <button
            onClick={() => setMatchOpen(v => !v)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 mt-2 text-left"
            style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
          >
            <span className="text-lg">🏦</span>
            <span className="flex-1 text-sm">
              {gekoppeld.length === 1 ? (gekoppeld[0].note || 'Banktransactie')
                : gekoppeld.length > 1 ? `${gekoppeld.length} banktransacties`
                : item.noBank ? 'Contant / niet via deze rekening' : 'Welke banktransacties horen hierbij?'}
              <span className="block text-[11px] text-muted">
                {gekoppeld.length === 1
                  ? `${fmtDate(gekoppeld[0].date)} · ${euro(gekoppeld[0].amount)} · telt niet dubbel mee`
                  : gekoppeld.length > 1
                    ? `samen ${euro(groep.txSum)} · tellen niet dubbel mee`
                    : item.noBank ? 'Bewust geen bankregel' : 'Nog geen bankregel gekoppeld'}
              </span>
            </span>
            <span className="text-muted">{matchOpen ? '▾' : '›'}</span>
          </button>
        )}

        {ikBetaalde && gekoppeld.length > 0 && (samenMet.length > 0 || !sluitAan) && (
          <div
            className="rounded-lg px-3 py-2 mt-2 text-[11px]"
            style={sluitAan
              ? { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }
              : { background: 'var(--color-orange-dim)', color: 'var(--color-orange)' }}
          >
            {samenMet.length > 0 && (
              <div>Samen met {samenMet.map(i => `${i.description} (${euro(i.amount)})`).join(', ')}.</div>
            )}
            <div>
              {sluitAan
                ? `✓ Splitser ${euro(groep.itemSum)} = bank ${euro(groep.txSum)}`
                : groep.diff < 0
                  ? `Splitser ${euro(groep.itemSum)}, bank ${euro(groep.txSum)}: nog ${euro(-groep.diff)} niet gekoppeld`
                  : `Splitser ${euro(groep.itemSum)}, bank ${euro(groep.txSum)}: ${euro(groep.diff)} meer gekoppeld dan in Splitser`}
            </div>
          </div>
        )}

        {ikBetaalde && matchOpen && (
          <div className="mt-2 rounded-xl overflow-hidden divide-y divide-border" style={{ background: 'var(--color-surface-2)' }}>
            <Keuze
              label="Contant / niet via deze rekening"
              meta="Bewust geen bankregel; telt als afgehandeld in de controle"
              checked={ids.length === 0 && !!item.noBank}
              onSelect={() => setTripItemNoBank(item.id, true)}
            />
            <Keuze
              label="Nog niet gekoppeld"
              meta="Later koppelen; blijft in de controle staan"
              checked={ids.length === 0 && !item.noBank}
              onSelect={async () => { await clearTripItemMatches(item.id); await setTripItemNoBank(item.id, false) }}
            />
            {loading && <div className="px-3 py-3 text-xs text-muted">Afschrijvingen zoeken…</div>}
            {!loading && transactions.some(tx => tx.type === 'debit') && (
              <div className="px-3 py-2 text-[11px] text-muted">
                Betaalde je in delen, vink dan meer aan. Hoort één betaling bij meer Splitser-regels, vink hem dan bij elk van die regels aan.
              </div>
            )}
            {!loading && sorteerKandidaten(transactions, item, groep).length === 0 && (
              <div className="px-3 py-3 text-xs text-muted">
                Geen afschrijvingen gevonden in de vakantieperiode (± 2 weken). Staat deze betaling al in de app?
                Importeer anders eerst je bankafschrift van die periode.
              </div>
            )}
            {/* Beste kandidaten bovenaan: zelfde bedrag (of precies wat nog open staat), datum dichtbij. */}
            {!loading && sorteerKandidaten(transactions, item, groep).map(({ tx, voorstel }) => {
              const elders = tx.tripId != null && tripId != null && tx.tripId !== tripId
              const waar = tx.tripId == null ? 'nog niet in deze vakantie' : elders ? `in ${tripNames[tx.tripId] ?? 'een andere vakantie'}` : ''
              const ook = ookBij(tx.id)
              return (
                <Keuze
                  key={tx.id}
                  vorm="vinkje"
                  label={`${voorstel ? '★ ' : ''}${tx.note || catMap[tx.category]?.label || tx.category}`}
                  meta={[
                    fmtDate(tx.date),
                    euro(tx.amount),
                    voorstel && 'voorstel',
                    ook.length > 0 && `ook bij ${ook.map(i => i.description).join(', ')}`,
                    waar,
                  ].filter(Boolean).join(' · ')}
                  checked={ids.includes(tx.id)}
                  onSelect={() => toggleTripItemMatch(item.id, tx.id)}
                />
              )
            })}
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
 * Afschrijvingen gesorteerd op hoe goed ze bij de regel passen: na de al
 * gekoppelde eerst álle
 * regels met exact hetzelfde bedrag (dichtste datum eerst; gemarkeerd als
 * voorstel — ook als de bank pas dagen later boekte), dan de rest op datum.
 * Is er al iets gekoppeld, dan is ook precies het bedrag dat nog open staat
 * een voorstel: de tweede helft van een betaling in delen.
 */
function sorteerKandidaten(transactions, item, groep) {
  const dagen = (a, b) => Math.abs((Date.parse(`${a}T00:00:00`) - Date.parse(`${b}T00:00:00`)) / 86400000)
  const open = groep && groep.transactions.length > 0 && groep.diff < -0.01 ? -groep.diff : null
  const past = (tx, bedrag) => bedrag != null && Math.abs((Number(tx.amount) || 0) - bedrag) <= 0.01
  return (transactions ?? [])
    .filter(tx => tx.type === 'debit')
    .map(tx => {
      const gelijk = past(tx, Number(item.amount) || 0) || past(tx, open)
      const afstand = dagen(item.date, tx.date)
      const gekozen = matchedIdsOf(item).includes(tx.id)
      return { tx, afstand, gekozen, voorstel: gelijk && !gekozen }
    })
    // Wat al gekoppeld is bovenaan, dan de voorstellen, dan de rest op datum.
    .sort((a, b) => (a.gekozen !== b.gekozen ? (a.gekozen ? -1 : 1)
      : a.voorstel !== b.voorstel ? (a.voorstel ? -1 : 1)
      : a.afstand - b.afstand))
}

// `vorm="vinkje"`: een vierkant hokje voor de bankregels (meer tegelijk mag);
// het rondje blijft voor de keuzes die elkaar uitsluiten.
function Keuze({ label, meta, checked, onSelect, vorm = 'rondje' }) {
  const vinkje = vorm === 'vinkje'
  return (
    <button onClick={onSelect} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
      <span
        className={`shrink-0 w-[20px] h-[20px] ${vinkje ? 'rounded-md' : 'rounded-full'} flex items-center justify-center text-[12px] text-white`}
        style={checked ? { background: 'var(--color-accent)' } : { border: '1.5px solid var(--color-border)' }}
        role={vinkje ? 'checkbox' : 'radio'}
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
