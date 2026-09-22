import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { countsInTotals } from '../utils/claims'
import { cashflowMonths, cashflowPerMonth, monthKey } from '../utils/cashflow'
import { useCategories } from './useCategories'

/**
 * Inkomen, uitgaven en gespaard per maand.
 * Het rekenwerk zelf staat in `src/utils/cashflow.js` zodat Vermogen met
 * exact dezelfde cijfers werkt als de grafieken.
 *
 * @param window  aantal maanden terug t/m nu (bijv. 24 voor een trend);
 *                zonder `window` alle maanden van het lopende jaar.
 */
export function useCashflowData({ window: venster = null } = {}) {
  const { catMap, loading, getByRole } = useCategories()
  const transferKey = getByRole('transfer')?.key

  const data = useLiveQuery(async () => {
    if (loading) return null
    const months = cashflowMonths({ window: venster })

    // Per maand via de datum-index; dat is goedkoper dan de hele tabel lezen.
    const txs = []
    for (const { year, month } of months) {
      const rijen = await db.transactions
        .where('date').startsWith(monthKey(year, month))
        .filter(countsInTotals)
        .toArray()
      txs.push(...rijen)
    }

    return cashflowPerMonth(txs, catMap, transferKey, months)
  }, [catMap, loading, transferKey, venster])

  return data ?? []
}
