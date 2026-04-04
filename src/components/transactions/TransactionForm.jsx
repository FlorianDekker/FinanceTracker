import { useState } from 'react'
import { addTransaction, updateTransaction, deleteTransaction } from '../../hooks/useTransactions'
import { CATEGORIES } from '../../constants/categories'
import { today } from '../../utils/formatters'
import { useSheetGestures } from '../../hooks/useSheetGestures'
import { recordEvent } from '../../utils/merchantLearning'

export function TransactionForm({ onClose, existing }) {
  const [date, setDate] = useState(existing?.date ?? today())
  const [amount, setAmount] = useState(existing?.amount ? String(existing.amount).replace('.', ',') : '')
  const [type, setType] = useState(existing?.type ?? 'debit')
  const [category, setCategory] = useState(existing?.category ?? '')
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [saving, setSaving] = useState(false)
  const sheetRef = useSheetGestures(onClose)

  const selectedCat = CATEGORIES.find(c => c.key === category)

  async function handleSave() {
    const amt = parseFloat(String(amount).replace(',', '.'))
    if (!date || isNaN(amt) || !category) return
    setSaving(true)
    const tx = { date, amount: amt, type, category, subcategory, note }
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
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50 animate-fade-in" onClick={onClose} style={{ backdropFilter: 'blur(4px)' }} />

      {/* Sheet */}
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-50 glass-heavy rounded-t-3xl p-4 pb-24 max-h-[90vh] overflow-y-auto animate-slide-up sheet-handle">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-base font-semibold">{existing ? 'Bewerken' : 'Transactie toevoegen'}</h2>
          <button onClick={onClose} className="text-muted text-2xl leading-none w-8 h-8 flex items-center justify-center">×</button>
        </div>

        <div className="space-y-3">
          {/* Date */}
          <label className="block">
            <span className="text-xs text-muted">Datum</span>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-border rounded-lg px-3 py-2 mt-1 text-white text-sm"
            />
          </label>

          {/* Amount + Direction */}
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-xs text-muted">Bedrag</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full bg-border rounded-lg px-3 py-2 mt-1 text-white text-sm"
              />
            </label>
            <div>
              <span className="text-xs text-muted block mb-1">Richting</span>
              <div className="flex rounded-lg overflow-hidden mt-1">
                <button
                  onClick={() => setType('debit')}
                  className={`px-4 py-2 text-sm font-medium ${type === 'debit' ? 'bg-red text-white' : 'bg-border text-muted'}`}
                >
                  Af
                </button>
                <button
                  onClick={() => setType('credit')}
                  className={`px-4 py-2 text-sm font-medium ${type === 'credit' ? 'bg-green text-white' : 'bg-border text-muted'}`}
                >
                  Bij
                </button>
              </div>
            </div>
          </div>

          {/* Category */}
          <label className="block">
            <span className="text-xs text-muted">Categorie</span>
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setSubcategory('') }}
              className="w-full bg-border rounded-lg px-3 py-2 mt-1 text-white text-sm appearance-none"
            >
              <option value="">Kies categorie…</option>
              {CATEGORIES.map(c => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </label>

          {/* Subcategory */}
          {selectedCat?.subs?.length > 0 && (
            <label className="block">
              <span className="text-xs text-muted">Subcategorie</span>
              <select
                value={subcategory}
                onChange={e => setSubcategory(e.target.value)}
                className="w-full bg-border rounded-lg px-3 py-2 mt-1 text-white text-sm appearance-none"
              >
                <option value="">Geen subcategorie</option>
                {selectedCat.subs.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </label>
          )}

          {/* Note */}
          <label className="block">
            <span className="text-xs text-muted">Omschrijving</span>
            <input
              type="text"
              placeholder="Bijv. Albert Heijn"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-border rounded-lg px-3 py-2 mt-1 text-white text-sm"
            />
          </label>
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={handleSave}
            disabled={saving || !date || !amount || !category}
            className="w-full btn-gradient-green rounded-2xl py-3.5 text-base disabled:opacity-40"
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
      </div>
    </>
  )
}
