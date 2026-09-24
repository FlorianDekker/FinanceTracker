/**
 * Inkomen, uitgaven en gespaard per maand — los van Dexie en React zodat het
 * testbaar is (en zodat Vermogen dezelfde cijfers gebruikt als de grafieken).
 *
 * De regels, precies zoals ze altijd al waren in `useCashflowData`:
 *  - lopende declaraties en uitbetalingen tellen niet mee (`countsInTotals`);
 *  - overboekingen tussen eigen rekeningen (rol 'transfer') vallen weg;
 *  - 'voorschot' is een verlegenheidscategorie en telt hier niet mee;
 *  - een bijschrijving in een uitgavencategorie (retour, verkoop) is een
 *    *negatieve uitgave*, geen inkomen;
 *  - een bijschrijving in een inkomstencategorie is inkomen;
 *  - alle afschrijvingen zijn uitgaven.
 */
import { countsInTotals, VOORSCHOT_KEY } from './claims'

/** 'YYYY-MM' voor een jaar/maand-paar. */
export function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

/**
 * De maanden die een venster beslaat, oudste eerst.
 * @param window  aantal maanden terug t/m nu; zonder venster alle maanden van
 *                het lopende jaar (jan t/m de huidige maand).
 */
export function cashflowMonths({ window: venster = null, now = new Date() } = {}) {
  const jaar = now.getFullYear()
  const maand = now.getMonth() + 1
  const months = []
  if (venster) {
    for (let i = venster - 1; i >= 0; i--) {
      const d = new Date(jaar, maand - 1 - i, 1)
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }
  } else {
    for (let m = 1; m <= maand; m++) months.push({ year: jaar, month: m })
  }
  return months
}

/**
 * @param txs          transacties (mogen meer maanden beslaan dan gevraagd)
 * @param catMap       { [key]: { type: 'income' | 'expense' | ... } }
 * @param transferKey  sleutel van de categorie met rol 'transfer' (of null)
 * @param months       [{ year, month }] — bepaalt de rijen én hun volgorde
 * @returns [{ year, month, income, expenses, saved, savingsRate, rate }]
 *
 * `saved`/`savingsRate` zijn afgekapt op 0 voor de gestapelde balken;
 * `rate` is het eerlijke maandpercentage (negatief kan, null zonder inkomen).
 */
export function cashflowPerMonth(txs, catMap, transferKey, months) {
  const emmers = new Map()
  for (const { year, month } of months ?? []) {
    emmers.set(monthKey(year, month), { income: 0, expenses: 0 })
  }

  for (const tx of txs ?? []) {
    if (!countsInTotals(tx)) continue
    if (transferKey && tx.category === transferKey) continue
    // Overboekingen (sparen, investeren) zijn geen uitgave én geen inkomen:
    // het geld is er nog, het staat alleen ergens anders.
    if (catMap?.[tx.category]?.type === 'transfer') continue
    if (tx.category === VOORSCHOT_KEY) continue

    const emmer = emmers.get(String(tx.date ?? '').slice(0, 7))
    if (!emmer) continue

    const bedrag = Number(tx.amount) || 0
    const catType = catMap?.[tx.category]?.type
    if (tx.type === 'credit') {
      if (catType === 'income') emmer.income += bedrag
      else if (catType === 'expense') emmer.expenses -= bedrag   // retour/verkoop: minder uitgaven
    } else if (tx.type === 'debit') {
      emmer.expenses += bedrag
    }
  }

  return (months ?? []).map(({ year, month }) => {
    const emmer = emmers.get(monthKey(year, month))
    const income = emmer.income
    const expenses = Math.max(0, emmer.expenses)
    const saved = Math.max(0, income - expenses)
    return {
      year,
      month,
      income,
      expenses,
      saved,
      savingsRate: income > 0 ? saved / income : 0,
      rate: income > 0 ? (income - expenses) / income : null,
    }
  })
}
