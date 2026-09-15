import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useCategories } from './useCategories'
import { categorizeWithLearning } from '../utils/categorizer'
import { isVagueCategory, suggestRejectCategory } from '../utils/claims'

const EMPTY = {}
const EMPTY_RULES = []

/**
 * Voor elke meegegeven declaratie: welke categorie stellen we voor als hij
 * wordt afgekeurd? Alleen uitgaven zonder echte categorie (Voorschot of de
 * restbak) krijgen een voorstel; de rest houdt wat hij al had.
 *
 * Voorspellingen náár Voorschot of de restbak worden genegeerd — anders zou de
 * app zijn eigen verlegenheidscategorie blijven bevestigen.
 *
 * @param txs transacties (mag elke render een nieuwe array zijn)
 * @returns { [id]: { category, subcategory, isSuggestion } }
 */
export function useRejectSuggestions(txs) {
  const { catMap, getByRole } = useCategories()
  const rules = useLiveQuery(() => db.rules.toArray(), [], EMPTY_RULES)
  const [map, setMap] = useState(EMPTY)

  const uncategorizedKey = getByRole('uncategorized')?.key ?? 'overige_kosten'

  const byRole = useMemo(() => ({
    uncategorized: getByRole('uncategorized'),
    transfer: getByRole('transfer'),
    income: getByRole('income'),
  }), [getByRole])

  // Een voorstel mag alleen naar een bestaande, niet-gearchiveerde en niet-vage
  // categorie wijzen. Zolang catMap nog leeg is, doen we geen uitspraak.
  const suggestableKey = useCallback(key => {
    const cat = catMap[key]
    if (!cat || cat.archived) return false
    return !isVagueCategory(key, { uncategorizedKey })
  }, [catMap, uncategorizedKey])

  // De lijst mag per render een nieuwe array zijn (hij wordt vaak in de
  // render-body gefilterd). Daarom draait het effect op een serialisatie van
  // precies de velden die het nodig heeft, en niet op de array-identiteit.
  const invoer = JSON.stringify((txs ?? []).map(tx => ({
    id: tx?.id, note: tx?.note ?? '', amount: tx?.amount ?? 0,
    type: tx?.type ?? 'debit', category: tx?.category ?? '', subcategory: tx?.subcategory ?? '',
  })))
  const catsGeladen = Object.keys(catMap).length > 0

  useEffect(() => {
    let afgebroken = false
    // Zolang de categorieën nog laden zeggen we niets; het voorstel komt dan
    // een render later binnen en de rij toont tot die tijd de huidige categorie.
    const lijst = catsGeladen ? JSON.parse(invoer) : []
    const opties = { rules: rules ?? EMPTY_RULES, isActiveKey: suggestableKey }

    ;(async () => {
      const paren = await Promise.all(lijst.map(async tx => {
        const vaag = isVagueCategory(tx.category, { uncategorizedKey })
        const voorstel = vaag && tx.note
          ? await categorizeWithLearning(tx.note, tx.amount, tx.type, '', byRole, opties)
          : null
        return [tx.id, suggestRejectCategory(tx, { suggestion: voorstel, uncategorizedKey })]
      }))
      if (!afgebroken) setMap(paren.length ? Object.fromEntries(paren) : EMPTY)
    })()

    return () => { afgebroken = true }
  }, [invoer, catsGeladen, rules, byRole, suggestableKey, uncategorizedKey])

  return map
}
