import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { CategoryPicker, CategoryIcon } from '../categories/CategoryPicker'
import { useCategories } from '../../hooks/useCategories'
import { addTransaction } from '../../hooks/useTransactions'
import { MONTHS_LONG } from '../../constants/categories'
import { partialClaimDate, partialClaimNote } from '../../utils/claims'

/**
 * "Bedrag uit categorie declareren": maakt een deeldeclaratie aan — een
 * synthetische bijschrijving die een deel van een uitgavencategorie meteen
 * als werkkosten aanmerkt (zie de uitleg bovenaan utils/claims.js). Geen
 * merchant-learning: dit is geen echte aankoop.
 */
export function PartialClaimSheet({ onClose, onSaved }) {
  const { catMap } = useCategories()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [noteTouched, setNoteTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const cat = catMap[category]
  const defaultNote = cat ? partialClaimNote(cat.label, year, month) : ''
  const displayNote = noteTouched ? note : defaultNote
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  function goMonth(dir) {
    let y = year
    let m = month + dir
    if (m < 1) { m = 12; y -= 1 }
    if (m > 12) { m = 1; y += 1 }
    // Niet verder dan de huidige maand: je declareert geen uitgaven die nog moeten gebeuren.
    if (y > now.getFullYear() || (y === now.getFullYear() && m > now.getMonth() + 1)) return
    setYear(y)
    setMonth(m)
  }

  function kiesCategorie(catKey, subKey) {
    setCategory(catKey)
    setSubcategory(subKey)
    setPickerOpen(false)
  }

  async function handleSave() {
    const amt = parseFloat(String(amount).replace(',', '.'))
    if (!category || isNaN(amt) || amt <= 0) return
    setBusy(true)
    await addTransaction({
      date: partialClaimDate(year, month),
      amount: amt,
      type: 'credit',
      category,
      subcategory,
      note: (displayNote || defaultNote).trim(),
      claimStatus: 'open',
      claimBatchId: null,
    })
    setBusy(false)
    onSaved?.()
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title="Bedrag uit categorie declareren"
        bodyClassName="p-4"
        maxHeight="85vh"
      >
        <p className="text-xs text-muted mb-3">
          Een deel van de uitgaven in deze categorie was voor werk. Dit bedrag telt vanaf nu
          niet meer als jouw uitgave en gaat mee in je volgende declaratie.
        </p>

        <label className="block">
          <span className="text-xs text-muted">Maand</span>
          <div
            className="flex items-center gap-2 mt-1 rounded-lg px-1 py-1"
            style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
          >
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label="Vorige maand"
              className="w-9 h-9 shrink-0 text-lg text-muted"
            >
              ‹
            </button>
            <span className="flex-1 text-center text-sm font-medium">
              {MONTHS_LONG[month - 1]} {year}
            </span>
            <button
              type="button"
              onClick={() => goMonth(1)}
              disabled={isCurrentMonth}
              aria-label="Volgende maand"
              className="w-9 h-9 shrink-0 text-lg text-muted disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </label>

        <label className="block mt-3">
          <span className="text-xs text-muted">Categorie</span>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 mt-1 text-left"
            style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
          >
            {cat ? (
              <>
                <CategoryIcon cat={cat} size={28} />
                <span className="flex-1 text-sm truncate">{cat.label}</span>
              </>
            ) : (
              <span className="flex-1 text-sm text-muted">Kies categorie…</span>
            )}
            <span className="text-muted">›</span>
          </button>
        </label>

        <label className="block mt-3">
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

        <label className="block mt-3">
          <span className="text-xs text-muted">Omschrijving</span>
          <input
            type="text"
            value={displayNote}
            onChange={e => { setNote(e.target.value); setNoteTouched(true) }}
            className="w-full rounded-lg px-3 py-2 mt-1"
            style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          />
        </label>

        <div className="mt-5 pb-4">
          <button
            onClick={handleSave}
            disabled={busy || !category || !amount}
            className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
          >
            {busy ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </Sheet>

      <CategoryPicker
        open={pickerOpen}
        value={{ category, subcategory }}
        onSelect={kiesCategorie}
        onClose={() => setPickerOpen(false)}
        filterType="expense"
        title="Categorie kiezen"
      />
    </>
  )
}
