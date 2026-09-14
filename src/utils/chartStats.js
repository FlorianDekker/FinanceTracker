import { db } from '../db/db'

// Hoe lang een grafiek zichtbaar moet zijn voordat het als "bekeken" telt.
// Zonder deze drempel telt doorswipen naar tab 7 ook de tabs 2 t/m 6 mee.
export const VIEW_DELAY_MS = 2000

const DAG = 24 * 60 * 60 * 1000
const VENSTER_MS = 30 * DAG

/** Lege teller voor een grafiek die nog nooit bekeken is. */
export function leegStat() {
  return { views: 0, lastViewedAt: null, viewsLast30d: [] }
}

/**
 * Pure kern van de kijkteller: geeft het nieuwe `chartStats`-object terug.
 * Tijdstempels ouder dan 30 dagen vallen eruit, zodat de lijst niet groeit.
 */
export function tellView(stats, id, now = Date.now()) {
  const huidig = stats?.[id] ?? leegStat()
  const grens = now - VENSTER_MS
  const recent = (huidig.viewsLast30d ?? []).filter(t => t > grens)
  return {
    ...stats,
    [id]: {
      views: (huidig.views ?? 0) + 1,
      lastViewedAt: now,
      viewsLast30d: [...recent, now],
    },
  }
}

/**
 * Werkt de teller van één grafiek bij in één db.settings.put.
 * Wordt alleen aangeroepen nadat de tab ~2 s zichtbaar was.
 */
export async function recordChartView(id, now = Date.now()) {
  const rij = await db.settings.get('chartStats')
  await db.settings.put({ key: 'chartStats', value: tellView(rij?.value ?? {}, id, now) })
}

/**
 * Subtiele regel onder de naam in Instellingen, bijv.
 * "3× afgelopen 30 dagen · laatst 2 dagen geleden".
 */
export function beschrijfStat(stat, now = Date.now()) {
  const grens = now - VENSTER_MS
  const recent = (stat?.viewsLast30d ?? []).filter(t => t > grens).length
  if (!stat?.lastViewedAt) return 'nog niet bekeken'

  const dagen = Math.floor((now - stat.lastViewedAt) / DAG)
  const laatst = dagen <= 0 ? 'laatst vandaag'
    : dagen === 1 ? 'laatst gisteren'
    : `laatst ${dagen} dagen geleden`
  return recent > 0 ? `${recent}× afgelopen 30 dagen · ${laatst}` : `niet meer bekeken · ${laatst}`
}
