import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useCategories } from './useCategories'
import { detecteerVasteLasten } from '../utils/recurring'

/**
 * Terugkerende posten (vaste lasten) uit alle transacties.
 *
 * Eén plek voor wat eerst los in DashboardPage stond en wat de grafiek
 * "Vaste lasten" nodig heeft. De categorieën die meedoen komen uit de
 * "vaste last"-vlag op de categorie zelf; staat er geen enkele aan, dan
 * kijken we naar alle categorieën.
 *
 * @param maand 'YYYY-MM' waarvoor betaald/gemist bepaald wordt (standaard
 *              de huidige maand)
 */
export function useRecurring(maand = null) {
  const { catMap, fixedKeys, getByRole } = useCategories()
  const transferKey = getByRole('transfer')?.key ?? null
  const txs = useLiveQuery(() => db.transactions.toArray(), [])

  return useMemo(() => {
    const loading = txs === undefined
    const posten = loading ? [] : detecteerVasteLasten(txs, {
      categoryKeys: fixedKeys,
      transferKey,
      maand,
      catMap,
    })
    const open = posten.filter(p => !p.paid)
    const betaald = posten.filter(p => p.paid)
    return {
      loading,
      posten,
      open,
      betaald,
      openTotaal: open.reduce((s, p) => s + p.amount, 0),
      maandTotaal: posten.reduce((s, p) => s + p.amount, 0),
    }
  }, [txs, fixedKeys, transferKey, maand, catMap])
}
