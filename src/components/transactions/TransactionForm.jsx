import { useState } from 'react'
import { addTransaction, updateTransaction, deleteTransaction } from '../../hooks/useTransactions'
import { useCategories } from '../../hooks/useCategories'
import { today } from '../../utils/formatters'
import { Sheet } from '../ui/Sheet'
import { recordEvent } from '../../utils/merchantLearning'
import { CategoryPicker, CategoryIcon } from '../categories/CategoryPicker'
import { CLAIM_STATUS_LABELS, claimStatusOf, isPartialClaim } from '../../utils/claims'
import { useSubmittedBatches } from '../../hooks/useClaims'
import { LinkPayoutSheet } from '../claims/LinkPayoutSheet'
import { ReceiptRow } from '../receipts/ReceiptRow'
import { useTrip, useTrips } from '../../hooks/useTrips'
import { tripIcon } from '../../utils/trips/country'

/**
 * Props:
 *  - existing: bestaande transactie (bewerken)
 *  - prefill: beginwaarden voor een nieuwe transactie (bijv. vanuit een bon)
 *  - onSaved(id): na opslaan, met het id van de (nieuwe) transactie
 *  - pickerStartIn: categoriekiezer meteen op het subniveau van deze categorie
 *    openen (vanuit een vakantie: Vakantie)
 */
export function TransactionForm({ onClose, existing, prefill, onSaved, pickerStartIn = null }) {
  const { catMap } = useCategories()
  const start = existing ?? prefill ?? {}
  const [date, setDate] = useState(start.date ?? today())
  const [amount, setAmount] = useState(start.amount != null && start.amount !== '' ? String(start.amount).replace('.', ',') : '')
  const [type, setType] = useState(start.type ?? 'debit')
  const [category, setCategory] = useState(start.category ?? '')
  const [subcategory, setSubcategory] = useState(start.subcategory ?? '')
  const [note, setNote] = useState(start.note ?? '')
  const [claimStatus, setClaimStatus] = useState(claimStatusOf(existing))
  const [tripId, setTripId] = useState(start.tripId ?? null)   // vakantie waar deze transactie bij hoort
  const [tripOpen, setTripOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const submittedBatches = useSubmittedBatches()

  // Alleen een nog niet ingediende declaratie mag je hier aan- en uitzetten;
  // vanaf 'Ingediend' loopt de status via het declaratiescherm.
  const claimEditable = claimStatus === null || claimStatus === 'open'
  // Een deeldeclaratie (credit + declaratiestatus) is zelf al een declaratie —
  // die zet je hier nooit aan/uit, dat loopt altijd via Declaraties.
  const partial = isPartialClaim({ type, claimStatus })
  const selectedCat = catMap[category]
  const selectedSub = selectedCat?.subs?.find(s => s.key === subcategory)

  async function handleSave() {
    const amt = parseFloat(String(amount).replace(',', '.'))
    if (!date || isNaN(amt) || !category) return
    setSaving(true)
    const tx = { date, amount: amt, type, category, subcategory, note, claimStatus, tripId }
    if (!existing) tx.claimBatchId = null
    let savedId = existing?.id ?? null
    if (existing) {
      await updateTransaction(existing.id, tx)
      // Learn from edits: record the category choice, with correction tracking.
      // Een deeldeclaratie heeft een synthetische notitie ("OV werk september
      // 2026"), geen merchant — die hoort niet in de learning.
      if (note && !isPartialClaim(existing)) {
        const catChanged = existing.category !== category
        recordEvent(note, category, subcategory, amt, type, null,
          catChanged ? { was: true, from: existing.category } : null
        )
      }
    } else {
      savedId = await addTransaction(tx)
      // Learn from new manual transactions too
      if (note) {
        recordEvent(note, category, subcategory, amt, type, null, null)
      }
    }
    setSaving(false)
    onSaved?.(savedId)
    onClose()
  }

  async function handleDelete() {
    if (!existing) return
    await deleteTransaction(existing.id)
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={existing ? 'Bewerken' : 'Transactie toevoegen'}
        maxHeight="90vh"
        bodyClassName="p-4"
      >
        <div className="space-y-3">
          {/* Date */}
          <label className="block">
            <span className="text-xs text-muted">Datum</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 mt-1"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
          </label>

          {/* Amount + Direction */}
          <div className="flex gap-2 items-end">
            <label className="flex-1">
              <span className="text-xs text-muted">Bedrag</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full rounded-lg px-3 mt-1"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)', height: 40 }}
              />
            </label>
            <div>
              <span className="text-xs text-muted block">Richting</span>
              <div className="flex rounded-lg overflow-hidden mt-1" style={{ height: 40 }}>
                <button
                  onClick={() => { setType('debit'); if (claimStatus === 'open') setClaimStatus(null) }}
                  className={`px-4 text-sm font-medium ${type === 'debit' ? 'bg-red text-white' : ''}`}
                  style={type !== 'debit' ? { background: 'var(--color-surface-2)', color: 'var(--color-muted)' } : undefined}
                >
                  Af
                </button>
                <button
                  onClick={() => { setType('credit'); if (claimStatus === 'open') setClaimStatus(null) }}
                  className={`px-4 text-sm font-medium ${type === 'credit' ? 'bg-green text-white' : ''}`}
                  style={type !== 'credit' ? { background: 'var(--color-surface-2)', color: 'var(--color-muted)' } : undefined}
                >
                  Bij
                </button>
              </div>
            </div>
          </div>

          {/* Category */}
          <div className="block">
            <span className="text-xs text-muted">Categorie</span>
            <button
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 mt-1 text-left"
              style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
            >
              {selectedCat ? (
                <>
                  <CategoryIcon cat={selectedCat} size={28} />
                  <span className="flex-1 text-sm truncate">
                    {selectedCat.label}
                    {selectedSub && <span className="text-muted"> › {selectedSub.label}</span>}
                    {selectedCat.archived && <span className="text-xs text-muted"> · gearchiveerd</span>}
                  </span>
                </>
              ) : (
                <span className="flex-1 text-sm text-muted">Kies categorie…</span>
              )}
              <span className="text-muted">›</span>
            </button>
          </div>

          {/* Declaratie voor werk. Een bijschrijving in een uitgavencategorie kan
              een deeldeclaratie zijn: "€X van deze categorie was werk" (zie
              utils/claims.js). Zo maak je ook oude, handmatige correcties alsnog
              tot declaratie. */}
          {(type === 'debit' || (type === 'credit' && selectedCat?.type === 'expense')) && (
            claimEditable ? (
              <button
                onClick={() => setClaimStatus(claimStatus === 'open' ? null : 'open')}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
                style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
              >
                <span className="text-lg">{type === 'credit' ? '↩' : '💼'}</span>
                <span className="flex-1 text-sm">
                  {type === 'credit' ? 'Deeldeclaratie' : 'Declaratie voor werk'}
                  <span className="block text-[11px] text-muted">
                    {type === 'credit'
                      ? (claimStatus === 'open' ? 'Werkdeel van deze categorie; gaat mee in je volgende declaratie' : 'Gewone correctie op deze categorie')
                      : (claimStatus === 'open' ? 'Telt niet mee in je budget' : 'Telt mee als gewone uitgave')}
                  </span>
                </span>
                <span
                  className="rounded-full transition-colors duration-200 shrink-0"
                  style={{
                    width: 44, height: 26, padding: 3,
                    background: claimStatus === 'open' ? 'var(--color-accent)' : 'var(--color-border)',
                  }}
                >
                  <span
                    className="block rounded-full bg-white transition-transform duration-200"
                    style={{ width: 20, height: 20, transform: claimStatus === 'open' ? 'translateX(18px)' : 'none' }}
                  />
                </span>
              </button>
            ) : (
              <div
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
              >
                <span className="text-lg">💼</span>
                <span className="flex-1 text-sm">
                  Declaratie · {CLAIM_STATUS_LABELS[claimStatus]}
                  <span className="block text-[11px] text-muted">wijzigen via Declaraties</span>
                </span>
              </div>
            )
          )}

          {/* Declaratie-uitbetaling van werk */}
          {type === 'credit' && existing && !partial && claimStatus !== 'payout' && submittedBatches?.length > 0 && (
            <button
              onClick={() => setLinkOpen(true)}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
              style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
            >
              <span className="text-lg">💼</span>
              <span className="flex-1 text-sm">
                Koppel aan declaratie-batch
                <span className="block text-[11px] text-muted">
                  {submittedBatches.length} {submittedBatches.length === 1 ? 'batch wacht' : 'batches wachten'} op betaling
                </span>
              </span>
              <span className="text-muted">›</span>
            </button>
          )}
          {type === 'credit' && claimStatus === 'payout' && (
            <div
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2"
              style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
            >
              <span className="text-lg">💼</span>
              <span className="flex-1 text-sm">
                Declaratie-uitbetaling
                <span className="block text-[11px] text-muted">Telt niet mee als inkomen</span>
              </span>
            </div>
          )}

          {/* Bonnetje */}
          {existing && <ReceiptRow transaction={existing} />}

          {/* Vakantie: alleen tonen. Koppelen doe je bij Vakanties, want daar
              staat de hele selectie van transacties bij elkaar. */}
          {/* Vakantie: elke transactie kan bij één (bestaande) vakantie horen. */}
          <TripRegel tripId={tripId} onClick={() => setTripOpen(true)} />

          {/* Note */}
          <label className="block">
            <span className="text-xs text-muted">Omschrijving</span>
            <input
              type="text"
              placeholder="Bijv. Albert Heijn"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full rounded-lg px-3 py-2 mt-1"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
          </label>
        </div>

        <div className="mt-5 space-y-2 pb-4">
          <button
            onClick={handleSave}
            disabled={saving || !date || !amount || !category}
            className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
          >
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
          {existing && (
            <button
              onClick={handleDelete}
              className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5"
            >
              Verwijderen
            </button>
          )}
        </div>
      </Sheet>

      {linkOpen && (
        <LinkPayoutSheet
          transaction={existing}
          onClose={() => setLinkOpen(false)}
          onDone={onClose}
        />
      )}

      <TripKiezer
        open={tripOpen}
        value={tripId}
        onClose={() => setTripOpen(false)}
        onSelect={async id => {
          setTripId(id)
          setTripOpen(false)
          // Bestaande transactie: meteen bewaren, ook als je het formulier daarna sluit.
          if (existing?.id != null) await updateTransaction(existing.id, { tripId: id })
        }}
      />

      <CategoryPicker
        open={pickerOpen}
        value={{ category, subcategory }}
        onSelect={(cat, sub) => { setCategory(cat); setSubcategory(sub); setPickerOpen(false) }}
        onClose={() => setPickerOpen(false)}
        // Een deeldeclaratie moet in een uitgavencategorie blijven staan: anders
        // zou hij als inkomen gaan meetellen in plaats van als negatieve uitgave.
        filterType={partial ? 'expense' : undefined}
        startIn={pickerStartIn}
      />
    </>
  )
}

function TripRegel({ tripId, onClick }) {
  const trip = useTrip(tripId)
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
      style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
    >
      <span className="text-lg">{trip ? tripIcon(trip) : '🧳'}</span>
      <span className="flex-1 text-sm truncate">
        {trip ? trip.name : 'Vakantie'}
        <span className="block text-[11px] text-muted">
          {trip ? 'telt mee in wat deze vakantie je kostte · tik om te wijzigen' : 'hoort deze bij een vakantie? tik om te koppelen'}
        </span>
      </span>
      <span className="text-muted">›</span>
    </button>
  )
}

/** Kies een bestaande vakantie (nieuwste eerst) of "geen". */
function TripKiezer({ open, value, onSelect, onClose }) {
  const trips = useTrips()
  if (!open) return null
  const lijst = [...(trips ?? [])].sort((a, b) => String(b.from ?? '').localeCompare(String(a.from ?? '')))
  return (
    <Sheet open onClose={onClose} title="Bij welke vakantie hoort dit?" maxHeight="70vh">
      <div className="divide-y divide-border">
        <button onClick={() => onSelect(null)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-xl w-7 text-center">—</span>
          <span className="flex-1 text-sm text-muted">Geen vakantie</span>
          {value == null && <span className="text-sm" style={{ color: 'var(--color-accent)' }}>✓</span>}
        </button>
        {lijst.map(t => (
          <button key={t.id} onClick={() => onSelect(t.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <span className="text-xl w-7 text-center">{tripIcon(t)}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{t.name}</span>
              <span className="block text-[11px] text-muted">{t.from} – {t.to}</span>
            </span>
            {value === t.id && <span className="text-sm" style={{ color: 'var(--color-accent)' }}>✓</span>}
          </button>
        ))}
        {lijst.length === 0 && <p className="text-center text-muted py-8 text-sm px-6">Nog geen vakanties. Maak er eerst een aan via Budget → Vakanties.</p>}
      </div>
    </Sheet>
  )
}
