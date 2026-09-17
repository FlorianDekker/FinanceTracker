import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { CategoryIcon, CategoryPicker } from '../categories/CategoryPicker'
import { CategoryChoiceRow } from './RejectClaimSheet'
import { useCategories } from '../../hooks/useCategories'
import { euro, fmtDate } from '../../utils/formatters'
import { CLAIM_STATUS_LABELS, claimAgeLabel, claimStatusOf, isPartialClaim } from '../../utils/claims'
import { changeClaimCategory, discardClaim, resubmitClaim } from '../../hooks/useClaims'

// Zolang de declaratie loopt mag de categorie nog wisselen: een ingediende bon
// van de NS blijft even veel waard, hij hoort alleen thuis bij Reiskosten.
// Afgekeurde items gaan via het gewone formulier, uitbetaalde liggen vast.
const CATEGORIE_WIJZIGBAAR = new Set(['open', 'submitted'])

// Een ingediend item haal je niet los uit zijn batch (ontbind dan de batch);
// in elke andere fase mag "toch geen declaratie".
const WEGHAALBAAR = new Set(['open', 'paid', 'rejected'])

// Wat gebeurt er als je de markering weghaalt? Verschilt per fase.
const WEGHAAL_TEKST = {
  open: 'Markering weghalen? Deze uitgave telt daarna weer gewoon mee in je budget.',
  paid: 'Toch geen declaratie? De uitgave telt daarna weer gewoon mee in je budget en verdwijnt uit de batch.',
  rejected: 'Markering weghalen? De uitgave telt al mee; alleen het label en de plek in de batch verdwijnen.',
}
const WEGHAAL_TEKST_DEEL = 'Deeldeclaratie verwijderen? De uitgaven in deze categorie tellen daarna weer volledig mee.'

/**
 * Detail van één declaratie. Bij een open item kun je hem hier alsnog uit de
 * declaraties halen of hem afkeuren (dan landt de uitgave in een categorie).
 * Ook een per ongeluk uitbetaalde of afgekeurde markering haal je hier weg.
 */
export function ClaimItemSheet({ tx, onClose, onReject }) {
  const { catMap } = useCategories()
  // De sheet krijgt een momentopname mee; na een wijziging tonen we die lokaal.
  const [category, setCategory] = useState(tx.category)
  const [subcategory, setSubcategory] = useState(tx.subcategory ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const cat = catMap[category]
  const sub = cat?.subs?.find(s => s.key === subcategory)
  const status = claimStatusOf(tx)
  const wijzigbaar = CATEGORIE_WIJZIGBAAR.has(status)
  const partial = isPartialClaim(tx)

  async function handleUnmark() {
    if (!window.confirm(partial ? WEGHAAL_TEKST_DEEL : WEGHAAL_TEKST[status])) return
    await discardClaim(tx)
    onClose()
  }

  async function handleResubmit() {
    if (!window.confirm('Opnieuw indienen? Deze declaratie gaat terug naar Open en telt weer als werkkosten.')) return
    await resubmitClaim(tx.id)
    onClose()
  }

  const weghaalLabel = partial ? 'Deeldeclaratie verwijderen' : status === 'open' ? 'Markering weghalen' : 'Toch geen declaratie'
  const weghaalKnop = WEGHAALBAAR.has(status) && (
    <button onClick={handleUnmark} className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5">
      {weghaalLabel}
    </button>
  )

  async function kiesCategorie(nieuweCat, nieuweSub) {
    setPickerOpen(false)
    await changeClaimCategory({ ...tx, category, subcategory }, nieuweCat, nieuweSub)
    setCategory(nieuweCat)
    setSubcategory(nieuweSub)
  }

  return (
    <>
      <Sheet open onClose={onClose} title={tx.note || cat?.label || 'Declaratie'} subtitle={fmtDate(tx.date)} bodyClassName="p-4">
        <div className="flex items-center gap-3 rounded-xl px-3 py-3" style={{ background: 'var(--color-surface-2)' }}>
          <CategoryIcon cat={cat} size={32} />
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">
              {cat?.label ?? category}
              {sub && <span className="text-muted"> › {sub.label}</span>}
            </div>
            <div className="text-[11px] text-muted">
              {partial && '↩ Deel · '}{CLAIM_STATUS_LABELS[status] ?? 'Geen declaratie'} · {claimAgeLabel(tx)} oud
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums">{euro(tx.amount)}</span>
        </div>

        {wijzigbaar && (
          <div className="mt-3">
            <CategoryChoiceRow
              label="Categorie"
              category={category}
              subcategory={subcategory}
              onOpen={() => setPickerOpen(true)}
            />
            <p className="text-[11px] text-muted mt-2">
              {partial
                ? 'Dit bedrag verlaagt de uitgaven in deze categorie; alleen de categorie verandert.'
                : 'De declaratie blijft even veel waard; alleen de categorie verandert.'}
            </p>
          </div>
        )}

        {status === 'open' && (
          <div className="mt-4 space-y-2 pb-2">
            {onReject && (
              <button
                onClick={() => onReject({ ...tx, category, subcategory })}
                className="w-full rounded-2xl py-3 text-sm font-semibold"
                style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              >
                Niet declareren
              </button>
            )}
            {weghaalKnop}
          </div>
        )}

        {status === 'submitted' && (
          <p className="text-xs text-muted mt-4">
            Deze declaratie is ingediend. Ontbind de batch als je hem toch wil intrekken.
          </p>
        )}
        {status === 'rejected' && (
          <div className="mt-4 space-y-2 pb-2">
            <p className="text-xs text-muted">
              Afgekeurd — deze uitgave telt gewoon mee in {cat?.label ?? category}. Wijzigen doe je in het transactieformulier.
              Betaalt werk hem toch nog (of later)? Dien hem dan opnieuw in.
            </p>
            <button
              onClick={handleResubmit}
              className="w-full rounded-2xl py-3 text-sm font-semibold"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              Opnieuw indienen
            </button>
            {weghaalKnop}
          </div>
        )}
        {status === 'paid' && (
          <div className="mt-4 space-y-2 pb-2">
            <p className="text-xs text-muted">
              Terugbetaald door werk. Hoort dit toch niet bij een declaratie? Dan haal je de markering hier weg;
              de batch zelf heropen je vanuit Afgehandeld.
            </p>
            {weghaalKnop}
          </div>
        )}
      </Sheet>

      <CategoryPicker
        open={pickerOpen}
        value={{ category, subcategory }}
        onSelect={kiesCategorie}
        onClose={() => setPickerOpen(false)}
        title="Categorie wijzigen"
        // Een deeldeclaratie moet in een uitgavencategorie blijven staan: anders
        // zou hij als inkomen gaan meetellen in plaats van als negatieve uitgave.
        filterType={partial ? 'expense' : undefined}
      />
    </>
  )
}
