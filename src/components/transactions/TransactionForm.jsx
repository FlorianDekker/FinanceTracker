import { useState } from 'react'
import { addTransaction, updateTransaction, deleteTransaction } from '../../hooks/useTransactions'
import { useCategories } from '../../hooks/useCategories'
import { today } from '../../utils/formatters'
import { Sheet } from '../ui/Sheet'
import { recordEvent } from '../../utils/merchantLearning'
import { CategoryPicker, CategoryIcon } from '../categories/CategoryPicker'
import { CLAIM_STATUS_LABELS, claimStatusOf } from '../../utils/claims'
import { useSubmittedBatches } from '../../hooks/useClaims'
import { LinkPayoutSheet } from '../claims/LinkPayoutSheet'

export function TransactionForm({ onClose, existing }) {
  const { catMap } = useCategories()
  const [date, setDate] = useState(existing?.date ?? today())
  const [amount, setAmount] = useState(existing?.amount ? String(existing.amount).replace('.', ',') : '')
  const [type, setType] = useState(existing?.type ?? 'debit')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [claimStatus, setClaimStatus] = useState(claimStatusOf(existing))
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const submittedBatches = useSubmittedBatches()

  // Alleen een nog niet ingediende declaratie mag je hier aan- en uitzetten;
  // vanaf 'Ingediend' loopt de status via het declaratiescherm.
  const claimEditable = claimStatus === null || claimStatus === 'open'
  const selectedCat = catMap[category]
  const selectedSub = selectedCat?.subs?.find(s => s.key === subcategory)

  async function handleSave() {
    const amt = parseFloat(String(amount).replace(',', '.'))
    if (!date || isNaN(amt) || !category) return
    setSaving(true)
    const tx = { date, amount: amt, type, category, subcategory, note, claimStatus }
    if (!existing) tx.claimBatchId = null
    if (existing) {
      await updateTransaction(existing.id, tx)
      // Learn from edits: record the category choice, with correction tracking
      if (note) {
        const catChanged = existing.category !== category
        recordEvent(note, category, subcategory, amt, type, null,
          catChanged ? { was: true, from: existing.category } : null
        )
      }
    } else {
      await addTransaction(tx)
      // Learn from new manual transactions too
      if (note) {
        recordEvent(note, category, subcategory, amt, type, null, null)
      }
    }
    setSaving(false)
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
                  onClick={() => setType('debit')}
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

          {/* Declaratie voor werk */}
          {type === 'debit' && (
            claimEditable ? (
              <button
                onClick={() => setClaimStatus(claimStatus === 'open' ? null : 'open')}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
                style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
              >
                <span className="text-lg">💼</span>
                <span className="flex-1 text-sm">
                  Declaratie voor werk
                  <span className="block text-[11px] text-muted">
                    {claimStatus === 'open' ? 'Telt niet mee in je budget' : 'Telt mee als gewone uitgave'}
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
          {type === 'credit' && existing && claimStatus !== 'payout' && submittedBatches?.length > 0 && (
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

      <CategoryPicker
        open={pickerOpen}
        value={{ category, subcategory }}
        onSelect={(cat, sub) => { setCategory(cat); setSubcategory(sub); setPickerOpen(false) }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}
