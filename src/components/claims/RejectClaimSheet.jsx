import { useMemo, useState } from 'react'
import { CategoryPicker, CategoryIcon } from '../categories/CategoryPicker'
import { Sheet } from '../ui/Sheet'
import { useCategories } from '../../hooks/useCategories'
import { euro, fmtDate } from '../../utils/formatters'
import { rejectClaims } from '../../hooks/useClaims'
import { useRejectSuggestions } from '../../hooks/useRejectSuggestions'

/**
 * Eén rij "dit is de categorie, tik om te wijzigen". Wordt zowel in de losse
 * afkeur-sheet als in de afkeurstap van een uitbetaling gebruikt.
 * `badge` toont een klein label achter de naam (bijv. "voorstel").
 */
export function CategoryChoiceRow({ category, subcategory, onOpen, label, badge }) {
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
        {badge && (
          <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-accent-dim text-accent align-middle">
            {badge}
          </span>
        )}
      </span>
      <span className="text-muted text-xs">wijzigen ›</span>
    </button>
  )
}

/**
 * Knopje "of laat hem op Voorschot staan": het alternatief naast het voorstel.
 */
export function KeepCategoryButton({ category, onKeep }) {
  const { catMap } = useCategories()
  const label = catMap[category]?.label ?? category
  return (
    <button onClick={onKeep} className="mt-2 text-xs text-muted underline underline-offset-2">
      Laat staan op {label}
    </button>
  )
}

/**
 * Afkeur-flow voor één uitgave: hij wordt niet (meer) vergoed, dus kiest de
 * gebruiker in welke categorie hij alsnog landt. Vanaf dat moment telt de
 * uitgave weer gewoon mee (dat regelt claims.js).
 *
 * Stond de uitgave nog op Voorschot (de oude werkwijze) of in de restbak, dan
 * doet de app een voorstel op basis van regels en geleerde historie.
 */
export function RejectClaimSheet({ tx, onClose, onDone }) {
  const [keuze, setKeuze] = useState(null)      // null = volg het voorstel
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const lijst = useMemo(() => [tx], [tx])
  const voorstel = useRejectSuggestions(lijst)[tx.id]
  const huidig = { category: tx.category, subcategory: tx.subcategory ?? '', isSuggestion: false }
  const gekozen = keuze ?? voorstel ?? huidig

  async function handleConfirm() {
    setBusy(true)
    await rejectClaims([{ tx, category: gekozen.category, subcategory: gekozen.subcategory }])
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
          category={gekozen.category}
          subcategory={gekozen.subcategory}
          badge={gekozen.isSuggestion ? 'voorstel' : null}
          onOpen={() => setPickerOpen(true)}
        />
        {gekozen.isSuggestion && (
          <KeepCategoryButton category={tx.category} onKeep={() => setKeuze(huidig)} />
        )}
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
        value={gekozen}
        onSelect={(cat, sub) => { setKeuze({ category: cat, subcategory: sub, isSuggestion: false }); setPickerOpen(false) }}
        onClose={() => setPickerOpen(false)}
        title="Categorie wijzigen"
      />
    </>
  )
}
