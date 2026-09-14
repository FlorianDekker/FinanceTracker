import { mediaan } from './recurring'
import { countsInTotals } from './claims'

const pad = n => String(n).padStart(2, '0')

/**
 * De laatste `aantal` volledig verstreken maanden, oplopend.
 * De lopende maand telt niet mee: die is per definitie nog niet af en zou
 * elke categorie te laag laten lijken.
 */
export function volledigeMaanden(aantal, vanafYm) {
  const [jaar, maand] = vanafYm.split('-').map(Number)
  const uit = []
  for (let i = aantal; i >= 1; i--) {
    const d = new Date(jaar, maand - 1 - i, 1)
    uit.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  return uit
}

/** Voorstel voor een nieuw budget: de mediaan, afgerond op hele euro's van 5. */
export function budgetVoorstel(medianeUitgave) {
  return Math.max(0, Math.round(medianeUitgave / 5) * 5)
}

/**
 * Vergelijkt per uitgavecategorie met budget het mediane maandbedrag over de
 * meegegeven maanden met dat budget.
 *
 * Maanden zonder uitgave tellen als 0 mee, anders zou een categorie waarin je
 * maar af en toe iets uitgeeft een veel te hoge mediaan krijgen.
 * Gearchiveerde categorieen en categorieen zonder budget doen niet mee.
 *
 * @returns array gesorteerd op grootste afwijking (budget - mediaan)
 */
export function berekenDrift(txs, categories, { maanden, transferKey = null } = {}) {
  const kandidaten = (categories ?? []).filter(c => !c.archived && c.type === 'expense' && (c.budget ?? 0) > 0)
  const inVenster = new Set(maanden)
  const perCat = new Map(kandidaten.map(c => [c.key, new Map(maanden.map(m => [m, 0]))]))

  for (const tx of txs ?? []) {
    // Alleen eigen afschrijvingen: geen bijschrijvingen, geen lopende
    // declaraties of hun uitbetaling, en niet de overboekingscategorie.
    if (tx.type !== 'debit' || !countsInTotals(tx)) continue
    if (transferKey && tx.category === transferKey) continue
    const ym = tx.date.slice(0, 7)
    if (!inVenster.has(ym)) continue
    const rij = perCat.get(tx.category)
    if (!rij) continue
    rij.set(ym, rij.get(ym) + tx.amount)
  }

  return kandidaten.map(c => {
    const bedragen = maanden.map(m => perCat.get(c.key).get(m))
    const mediaanBedrag = mediaan(bedragen)
    const afwijking = mediaanBedrag - c.budget
    return {
      key: c.key,
      label: c.label,
      icon: c.icon,
      budget: c.budget,
      mediaanBedrag,
      bedragen,
      afwijking,
      voorstel: budgetVoorstel(mediaanBedrag),
    }
  }).sort((a, b) => Math.abs(b.afwijking) - Math.abs(a.afwijking))
}
