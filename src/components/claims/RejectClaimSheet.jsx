import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { CategoryPicker, CategoryIcon } from '../categories/CategoryPicker'
import { useCategories } from '../../hooks/useCategories'
import { euro, fmtDate } from '../../utils/formatters'
import { rejectClaims } from '../../hooks/useClaims'

/**
 * Eén rij "dit is de categorie, tik om te wijzigen". Wordt zowel in de losse
 * afkeur-sheet als in de afkeurstap van een uitbetaling gebruikt.
 */
export function CategoryChoiceRow({ category, subcategory, onOpen, label }) {
  const { catMap } = useCategories()
  const cat = catMap[category]
  const sub = cat?.subs?.find(s => s.key === subcategory)
  return (
    <button
      onClick={onOpen}
      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
      style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
    >
      <CategoryIcon cat={cat} size={28} />
      <span className="flex-1 text-sm truncate">
        {label && <span className="block text-[11px] text-muted truncate">{label}</span>}
        {cat?.label ?? category}
        {sub && <span className="text-muted"> › {sub.label}</span>}
      </span>
      <span className="text-muted text-xs">wijzigen ›</span>
    </button>
  )
}

/**
 * Afkeur-flow voor één uitgave: hij wordt niet (meer) vergoed, dus kiest de
 * gebruiker in welke categorie hij alsnog landt. Vanaf dat moment telt de
 * uitgave weer gewoon mee (dat regelt claims.js).
 */
export function RejectClaimSheet({ tx, onClose, onDone }) {
  const [category, setCategory] = useState(tx.category)
  const [subcategory, setSubcategory] = useState(tx.subcategory ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    await rejectClaims([{ tx, category, subcategory }])
    onDone?.()
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title="Waar hoort deze uitgave thuis?"
        subtitle={`${tx.note || ''} · ${fmtDate(tx.date)} · ${euro(tx.amount)}`}
        bodyClassName="p-4"
        maxHeight="70vh"
      >
        <p className="text-xs text-muted mb-3">
          Deze uitgave wordt niet vergoed en telt vanaf nu weer mee in je budget.
        </p>
        <CategoryChoiceRow
          category={category}
          subcategory={subcategory}
          onOpen={() => setPickerOpen(true)}
        />
        <div className="mt-5 pb-4">
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
          >
            {busy ? 'Bevestigen…' : 'Bevestigen'}
          </button>
        </div>
      </Sheet>

      <CategoryPicker
        open={pickerOpen}
        value={{ category, subcategory }}
        onSelect={(cat, sub) => { setCategory(cat); setSubcategory(sub); setPickerOpen(false) }}
        onClose={() => setPickerOpen(false)}
        title="Categorie wijzigen"
      />
    </>
  )
}
