import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { addSub } from './useCategories'
import { clusterTrips, shiftDate, suggestTripTransactions, filterIgnored, ignoreEntriesFor } from '../utils/trips/suggest'
import { diffSplitserRows, round2, shareOf } from '../utils/trips/splitser'
import { suggestMatches, tripCosts } from '../utils/trips/costs'
import { findTripCategory, guessTripSub, needsTripCategory, tripSubKey, TRIP_SUBS } from '../utils/trips/subcategory'
import { recordEvent } from '../utils/merchantLearning'

/**
 * Vakanties: de Dexie-kant. Alle rekenregels staan puur in `src/utils/trips/*`;
 * hier alleen queries en mutaties (zelfde opzet als `useClaims.js`).
 */

export const SPLITSER_NAME_SETTING = 'splitserName'
export const DEFAULT_SPLITSER_NAME = 'Florian'

// Voorstellen zoeken we niet door de hele historie: twee jaar terug is ruim.
const VOORSTEL_JAREN = 2

/* ------------------------------------------------------------------ *
 * Instelling: hoe heet ik in Splitser?                                 *
 * ------------------------------------------------------------------ */

export async function getSplitserName() {
  const row = await db.settings.get(SPLITSER_NAME_SETTING)
  const naam = String(row?.value ?? '').trim()
  return naam || DEFAULT_SPLITSER_NAME
}

export async function setSplitserName(naam) {
  const waarde = String(naam ?? '').trim()
  if (!waarde) return getSplitserName()
  await db.settings.put({ key: SPLITSER_NAME_SETTING, value: waarde })
  return waarde
}

export function useSplitserName() {
  return useLiveQuery(getSplitserName, [], DEFAULT_SPLITSER_NAME)
}

/* ------------------------------------------------------------------ *
 * Queries                                                              *
 * ------------------------------------------------------------------ */

const nieuwsteEerst = (a, b) => String(b.from ?? '').localeCompare(String(a.from ?? ''))

export function useTrips() {
  return useLiveQuery(async () => (await db.trips.toArray()).sort(nieuwsteEerst), [])
}

export function useTrip(tripId) {
  return useLiveQuery(() => (tripId == null ? null : db.trips.get(tripId)), [tripId])
}

export function useTripItems(tripId) {
  return useLiveQuery(
    () => (tripId == null ? [] : db.tripItems.where('tripId').equals(tripId).sortBy('date')),
    [tripId],
  )
}

export function useTripTransactions(tripId) {
  return useLiveQuery(
    () => (tripId == null ? [] : db.transactions.where('tripId').equals(tripId).sortBy('date')),
    [tripId],
  )
}

/** Alle transacties die aan een vakantie hangen (voor de kaartjes-overzicht). */
export function useAllTripTransactions() {
  return useLiveQuery(() => db.transactions.where('tripId').above(0).toArray(), [])
}

export function useAllTripItems() {
  return useLiveQuery(() => db.tripItems.toArray(), [])
}

/**
 * De kaartjes op de vakantiepagina: per vakantie de kosten, in één keer
 * uitgerekend uit drie queries in plaats van drie per reis.
 */
export function useTripsOverview() {
  const trips = useTrips()
  const txs = useAllTripTransactions()
  const items = useAllTripItems()
  if (!trips || !txs || !items) return null
  return trips.map(trip => ({
    trip,
    costs: tripCosts({
      items: items.filter(i => i.tripId === trip.id),
      transactions: txs.filter(t => t.tripId === trip.id),
      from: trip.from,
      to: trip.to,
    }),
  }))
}

/* ------------------------------------------------------------------ *
 * Negeerlijst: betalingen en partijen die nooit een vakantie zijn      *
 * (bijv. een incasso van een bedrijf dat in het buitenland zit).       *
 * ------------------------------------------------------------------ */

export const TRIP_IGNORE_SETTING = 'tripIgnored'
const LEGE_NEGEERLIJST = { txIds: [], notes: [] }

export async function getTripIgnore() {
  const row = await db.settings.get(TRIP_IGNORE_SETTING)
  const v = row?.value
  return {
    txIds: Array.isArray(v?.txIds) ? v.txIds : [],
    notes: Array.isArray(v?.notes) ? v.notes : [],
  }
}

export function useTripIgnore() {
  return useLiveQuery(getTripIgnore, [], LEGE_NEGEERLIJST)
}

/** "Geen vakantie": deze betalingen én deze partijen niet meer voorstellen. */
export async function ignoreTripCluster(cluster) {
  const huidig = await getTripIgnore()
  const extra = ignoreEntriesFor(cluster)
  await db.settings.put({
    key: TRIP_IGNORE_SETTING,
    value: {
      txIds: [...new Set([...huidig.txIds, ...extra.txIds])],
      notes: [...new Set([...huidig.notes, ...extra.notes])],
    },
  })
  return extra
}

export async function clearTripIgnore() {
  await db.settings.put({ key: TRIP_IGNORE_SETTING, value: { txIds: [], notes: [] } })
}

/** Reisvoorstellen uit losse buitenlandse betalingen zonder vakantie. */
export function useTripSuggestions({ gapDays = 3 } = {}) {
  return useLiveQuery(async () => {
    const vanaf = shiftDate(new Date().toISOString().slice(0, 10), -365 * VOORSTEL_JAREN)
    const txs = await db.transactions.where('date').above(vanaf).toArray()
    return clusterTrips(filterIgnored(txs, await getTripIgnore()), { gapDays })
  }, [gapDays])
}

/**
 * De transacties waaruit je kiest bij aanmaken/bewerken: van − 1 dag t/m
 * tot + 1 dag, met de kandidaten al voorgevinkt.
 *
 * @param opties { vakantieKeys, isIncomeKey } — zie suggestTripTransactions
 */
export function useTripCandidates({ from, to, tripId = null, vakantieKeys, isIncomeKey }) {
  const keys = (vakantieKeys ?? []).join(',')
  return useLiveQuery(async () => {
    if (!from || !to) return { suggested: [], others: [], countries: [] }
    const txs = await db.transactions
      .where('date')
      .between(shiftDate(from, -1), shiftDate(to, 1), true, true)
      .sortBy('date')
    return suggestTripTransactions(txs, { vakantieKeys, isIncomeKey, tripId })
    // `keys` staat in de lijst in plaats van `vakantieKeys`/`isIncomeKey`: die
    // zijn bij elke render een nieuwe waarde, de sleutels zijn de echte invoer.
  }, [from, to, tripId, keys])
}

/* ------------------------------------------------------------------ *
 * Mutaties                                                             *
 * ------------------------------------------------------------------ */

function schoonTrip(input = {}) {
  return {
    name: String(input.name ?? '').trim() || 'Vakantie',
    from: input.from ?? null,
    to: input.to ?? input.from ?? null,
    countries: (Array.isArray(input.countries) ? input.countries : []).filter(Boolean),
    note: String(input.note ?? ''),
    icon: String(input.icon ?? '').trim(),   // leeg = vlag(gen) van de landen
  }
}

/**
 * Maakt een vakantie en koppelt er meteen transacties aan.
 * @returns {Promise<number>} het nieuwe trip-id
 */
export async function createTrip(input = {}) {
  const rij = { ...schoonTrip(input), createdAt: Date.now(), splitser: null }
  let id
  await db.transaction('rw', db.trips, db.transactions, async () => {
    id = await db.trips.add(rij)
    await koppel(id, input.transactionIds ?? [])
  })
  return id
}

export async function updateTrip(tripId, patch = {}) {
  const bestaand = await db.trips.get(tripId)
  if (!bestaand) throw new Error('Deze vakantie bestaat niet meer.')
  const volgende = { ...bestaand, ...schoonTrip({ ...bestaand, ...patch }) }
  await db.transaction('rw', db.trips, db.transactions, async () => {
    await db.trips.put({ ...volgende, id: tripId })
    if (Array.isArray(patch.transactionIds)) await koppel(tripId, patch.transactionIds)
  })
}

/** Vakantie weg; de transacties blijven bestaan en verliezen alleen hun tripId. */
export async function deleteTrip(tripId) {
  await db.transaction('rw', db.trips, db.transactions, db.tripItems, async () => {
    await koppel(tripId, [])
    await db.tripItems.where('tripId').equals(tripId).delete()
    await db.trips.delete(tripId)
  })
}

/** Zet precies deze transacties op de vakantie; de rest laat hem los. */
export async function setTripTransactions(tripId, ids) {
  await db.transaction('rw', db.transactions, () => koppel(tripId, ids))
}

// Binnen een lopende Dexie-transactie: verschil bepalen en alleen dat schrijven.
async function koppel(tripId, ids) {
  const gewenst = new Set((ids ?? []).filter(id => id != null))
  const huidig = await db.transactions.where('tripId').equals(tripId).toArray()
  const losmaken = huidig.filter(tx => !gewenst.has(tx.id)).map(tx => tx.id)
  const bestaand = new Set(huidig.map(tx => tx.id))
  const vastmaken = [...gewenst].filter(id => !bestaand.has(id))
  if (losmaken.length) await db.transactions.where('id').anyOf(losmaken).modify({ tripId: null })
  if (vastmaken.length) await db.transactions.where('id').anyOf(vastmaken).modify({ tripId })
}

/* ------------------------------------------------------------------ *
 * Splitser                                                             *
 * ------------------------------------------------------------------ */

/**
 * Zet een ingelezen settlement in de database.
 *
 * Bestaande regels (zelfde datum + omschrijving + bedrag) blijven staan met hun
 * categorie en hun koppeling aan de bank; nieuwe komen erbij; regels die niet
 * meer in de PDF staan verdwijnen.
 *
 * @param tripId
 * @param rows        regels uit `parseSplitserPdf`
 * @param myName      mijn naam in Splitser
 * @param fileName    voor het importlogboek op de vakantie
 * @param categorize  async (row) => { category, subcategory } — de aanroeper
 *                    hangt hier `categorizeWithLearning` in.
 * @returns {Promise<{added:number, kept:number, removed:number}>}
 */
export async function importSplitserRows(tripId, { rows = [], myName, fileName = '', categorize } = {}) {
  const trip = await db.trips.get(tripId)
  if (!trip) throw new Error('Deze vakantie bestaat niet meer.')

  const bestaand = await db.tripItems.where('tripId').equals(tripId).toArray()
  const { toAdd, kept, toRemove } = diffSplitserRows(bestaand, rows)

  // Buiten de db-transactie: categoriseren leest zijn eigen tabellen.
  const nieuw = []
  for (const row of toAdd) {
    const gekozen = categorize ? await categorize(row) : {}
    nieuw.push({
      tripId,
      date: row.date,
      description: row.description,
      amount: round2(row.amount),
      payer: row.payer,
      participants: row.participants,
      myShare: shareOf(row, myName),
      category: gekozen.category ?? '',
      subcategory: gekozen.subcategory ?? '',
      matchedTxId: null,
      source: 'splitser',
    })
  }

  await db.transaction('rw', db.trips, db.tripItems, async () => {
    if (toRemove.length) await db.tripItems.bulkDelete(toRemove)
    if (nieuw.length) await db.tripItems.bulkAdd(nieuw)
    // Mijn naam kan gewijzigd zijn; de aandelen van bestaande regels lopen mee.
    for (const { id, row } of kept) await db.tripItems.update(id, { myShare: shareOf(row, myName) })
    const eerder = Array.isArray(trip.splitser?.imported) ? trip.splitser.imported : []
    await db.trips.update(tripId, {
      splitser: {
        imported: [...eerder, { fileName, at: Date.now(), rows: rows.length }],
        myName,
      },
    })
  })

  await autoMatchTripItems(tripId, myName)
  return { added: nieuw.length, kept: kept.length, removed: toRemove.length }
}

/**
 * Koppelt Splitser-regels die ík voorschoot aan hun banktransactie.
 * Bestaande (handmatige) koppelingen blijven met rust.
 */
export async function autoMatchTripItems(tripId, myName) {
  const naam = myName ?? (await db.trips.get(tripId))?.splitser?.myName ?? (await getSplitserName())
  const items = await db.tripItems.where('tripId').equals(tripId).toArray()
  const txs = await db.transactions.where('tripId').equals(tripId).toArray()

  const bezet = new Set(items.map(i => i.matchedTxId).filter(id => id != null))
  const open = items.filter(i => i.matchedTxId == null)
  const vrij = txs.filter(tx => !bezet.has(tx.id))

  const matches = suggestMatches(open, vrij, naam)
  if (!matches.size) return 0
  await db.transaction('rw', db.tripItems, async () => {
    for (const [itemId, txId] of matches) await db.tripItems.update(itemId, { matchedTxId: txId })
  })
  return matches.size
}

export async function updateTripItem(itemId, patch = {}) {
  await db.tripItems.update(itemId, patch)
}

/** "Welke banktransactie is dit?" — of null voor 'geen'. */
export async function setTripItemMatch(itemId, txId) {
  const item = await db.tripItems.get(itemId)
  if (!item) return
  await db.transaction('rw', db.tripItems, async () => {
    // Eén banktransactie hoort bij hoogstens één Splitser-regel.
    if (txId != null) {
      const anderen = await db.tripItems.where('tripId').equals(item.tripId).toArray()
      for (const a of anderen) {
        if (a.id !== itemId && a.matchedTxId === txId) await db.tripItems.update(a.id, { matchedTxId: null })
      }
    }
    await db.tripItems.update(itemId, { matchedTxId: txId ?? null })
  })
}

/* ------------------------------------------------------------------ *
 * Subcategorieën van Vakantie                                          *
 * ------------------------------------------------------------------ */

/**
 * Zorgt dat de categorie Vakantie de vaste subs heeft (Vlucht, Vervoer, …).
 *
 * Eén keer per installatie genoeg: een Vakantie-categorie die al subs heeft
 * laten we met rust — die heeft de gebruiker zelf ingericht. `addSub` maakt de
 * sleutel uit het label, dus in een bestaande database kan 'Boodschappen'
 * `boodschappen` heten in plaats van `boodschappen_vakantie`; `tripSubKey`
 * vertaalt daartussen.
 *
 * @returns {Promise<{ok: boolean, key: string|null, added: number}>}
 *          `ok: false` = er is helemaal geen categorie Vakantie.
 */
export async function ensureTripSubcategories() {
  const cat = findTripCategory(await db.categories.toArray())
  if (!cat) return { ok: false, key: null, added: 0 }
  if (Array.isArray(cat.subs) && cat.subs.length) return { ok: true, key: cat.key, added: 0 }
  for (const sub of TRIP_SUBS) await addSub(cat.key, sub.label)
  return { ok: true, key: cat.key, added: TRIP_SUBS.length }
}

// Module-variabele: de Vakanties-pagina vraagt dit bij elke render, maar de
// controle hoeft maar één keer per app-sessie te draaien.
let subsBelofte = null

export function ensureTripSubcategoriesOnce() {
  subsBelofte ??= ensureTripSubcategories()
  return subsBelofte
}

/**
 * Zet de gekoppelde uitgaven van een vakantie in één keer op Vakantie + sub.
 *
 * Alleen afschrijvingen die er nog niet in staan; bijschrijvingen
 * (verrekeningen) en lopende declaraties blijven zoals ze zijn. De sub komt
 * van de gematchte Splitser-regel als die er een heeft, anders geraden uit de
 * bankomschrijving. Elke wijziging gaat als correctie de merchant-learning in,
 * zodat dezelfde partij de volgende keer meteen goed staat.
 *
 * @returns {Promise<number>} aantal gewijzigde transacties
 */
export async function recategorizeTripTransactions(tripId) {
  const cat = findTripCategory(await db.categories.toArray())
  if (!cat) return 0

  const txs = await db.transactions.where('tripId').equals(tripId).toArray()
  const items = await db.tripItems.where('tripId').equals(tripId).toArray()
  const perTx = new Map(items.filter(i => i.matchedTxId != null).map(i => [i.matchedTxId, i]))

  const wijzigingen = txs
    .filter(tx => needsTripCategory(tx, cat.key))
    .map(tx => {
      const item = perTx.get(tx.id)
      // De Splitser-regel wint: daar heeft de gebruiker de sub al gezien.
      const sub = item && item.category === cat.key && item.subcategory
        ? item.subcategory
        : tripSubKey(cat, guessTripSub(tx.note))
      return { tx, sub }
    })
  if (!wijzigingen.length) return 0

  await db.transaction('rw', db.transactions, async () => {
    for (const { tx, sub } of wijzigingen) {
      await db.transactions.update(tx.id, { category: cat.key, subcategory: sub })
    }
  })
  for (const { tx, sub } of wijzigingen) {
    if (!tx.note) continue
    await recordEvent(tx.note, cat.key, sub, tx.amount, 'debit', null, { was: true, from: tx.category })
  }
  return wijzigingen.length
}
