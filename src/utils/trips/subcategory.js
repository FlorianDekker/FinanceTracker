/**
 * Subcategorieën van Vakantie: vlucht, vervoer, overnachting, eten & drinken,
 * activiteiten, boodschappen en overig.
 *
 * Binnen een vakantie zegt "Vakantie" niets meer — de verdeling gebeurt op de
 * sub. `guessTripSub` raadt die uit de omschrijving (Splitser-regel of
 * bankomschrijving) met trefwoorden in NL/EN/FR/DE/ES.
 *
 * Let op het verschil tussen twee soorten sleutels:
 *  - de **kanonieke** sleutel uit `TRIP_SUBS` (wat deze module teruggeeft);
 *  - de sleutel die de subcategorie in de database écht heeft. `addSub` maakt
 *    die uit het label, dus bij een bestaande Vakantie-categorie zonder subs
 *    wordt 'Boodschappen' → `boodschappen` in plaats van
 *    `boodschappen_vakantie`. `tripSubKey(cat, kanoniek)` vertaalt daartussen:
 *    eerst op sleutel, dan op label, anders de kanonieke sleutel.
 *
 * Puur: geen db, geen React.
 */

import { isOpenClaim } from '../claims'

/**
 * Trefwoorden, in volgorde van voorrang bij gelijkspel. Kleine letters,
 * substring-match. Een trefwoord dat op een spatie eindigt ('ns ', 'db ')
 * matcht alleen aan het eind van een woord — zelfde truc als in
 * `src/constants/rules.js`. Trefwoorden van hoogstens twee tekens ('ov')
 * matchen alleen als heel woord, anders zit 'ov' in "overnachting".
 */
export const TRIP_SUBS = [
  {
    key: 'vlucht',
    label: 'Vlucht',
    kw: ['vlucht', 'flight', 'klm', 'transavia', 'ryanair', 'easyjet', 'vueling', 'wizz',
      'lufthansa', 'airline', 'airways', 'luchthaven', 'airport', 'schiphol'],
  },
  {
    key: 'vervoer',
    label: 'Vervoer',
    kw: ['trein', 'train', 'ns ', 'sncf', 'db ', 'thalys', 'eurostar', 'metro', 'tram', 'bus',
      'taxi', 'uber', 'bolt', 'huurauto', 'rental', 'hertz', 'sixt', 'avis', 'europcar',
      'tol', 'toll', 'parkeren', 'parking', 'benzine', 'tank', 'fuel', 'veerboot', 'ferry',
      'ov', 'fiets', 'bike'],
  },
  {
    key: 'overnachting',
    label: 'Overnachting',
    kw: ['hotel', 'hostel', 'airbnb', 'booking', 'b&b', 'camping', 'appartement', 'apartment',
      'verblijf', 'toeristenbelasting', 'city tax', 'overnacht'],
  },
  {
    key: 'eten_drinken',
    label: 'Eten & drinken',
    kw: ['eten', 'diner', 'dinner', 'lunch', 'ontbijt', 'breakfast', 'restaurant', 'cafe', 'café',
      'koffie', 'coffee', 'bar', 'bier', 'beer', 'wijn', 'wine', 'pizza', 'burger', 'frietje',
      'friet', 'ijs', 'gelato', 'bakker', 'boulangerie', 'pain', 'patisserie', 'tapas', 'snack',
      'brunch', 'borrel', 'cocktail', 'drank', 'proeverij', 'sushi', 'streetfood', 'food', 'eat'],
  },
  {
    key: 'activiteiten',
    label: 'Activiteiten',
    kw: ['museum', 'musea', 'ticket', 'entree', 'entrance', 'tour', 'rondleiding', 'excursie',
      'boot', 'kayak', 'kajak', 'klimmen', 'huur', 'concert', 'theater', 'show', 'zwembad',
      'strand', 'park', 'tuin', 'kasteel', 'castle', 'kathedraal', 'cathedral', 'toren', 'tower',
      'bezoek', 'attractie', 'zoo', 'aquarium', 'wellness', 'spa', 'sauna', 'ski', 'duik', 'surf'],
  },
  {
    key: 'boodschappen_vakantie',
    label: 'Boodschappen',
    kw: ['supermarkt', 'supermarket', 'albert heijn', 'jumbo', 'lidl', 'aldi', 'carrefour', 'spar',
      'monoprix', 'mercadona', 'delhaize', 'colruyt', 'tesco', 'sainsbury', 'rewe', 'edeka',
      'boodschappen', 'groceries'],
  },
  { key: 'overig_vakantie', label: 'Overig', kw: [] },
]

/** Waar alles in belandt wat we niet herkennen. */
export const TRIP_SUB_FALLBACK = 'overig_vakantie'

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Trefwoorden van hoogstens twee tekens zijn te gulzig als substring.
function raakt(hooiberg, kw) {
  if (kw.length <= 2) return new RegExp(`\\b${escape(kw)}\\b`).test(hooiberg)
  return hooiberg.includes(kw)
}

/**
 * Raadt de subcategorie uit een omschrijving.
 *
 * De sub met de meeste treffers wint; bij gelijkspel het langste trefwoord
 * ("Spar" is boodschappen, niet 'spa'; "huurauto" is vervoer, niet 'huur') en
 * daarna de volgorde van `TRIP_SUBS`.
 *
 * @param {string} text  omschrijving of bankregel
 * @returns {string} kanonieke sub-sleutel, minimaal `overig_vakantie`
 */
export function guessTripSub(text) {
  const hooiberg = ` ${String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()} `
  let beste = null
  TRIP_SUBS.forEach((sub, volgorde) => {
    let treffers = 0
    let langste = 0
    for (const kw of sub.kw) {
      if (!raakt(hooiberg, kw)) continue
      treffers++
      langste = Math.max(langste, kw.trim().length)
    }
    if (!treffers) return
    const kandidaat = { key: sub.key, treffers, langste, volgorde }
    if (!beste
      || kandidaat.treffers > beste.treffers
      || (kandidaat.treffers === beste.treffers && kandidaat.langste > beste.langste)) {
      beste = kandidaat
    }
  })
  return beste?.key ?? TRIP_SUB_FALLBACK
}

/** De Vakantie-categorie: op sleutel `vakantie`, anders op label. */
export function findTripCategory(categories) {
  const rijen = Array.isArray(categories) ? categories : []
  return rijen.find(c => c?.key === 'vakantie')
    ?? rijen.find(c => String(c?.label ?? '').toLowerCase() === 'vakantie')
    ?? null
}

/** Het label dat bij een kanonieke sub hoort ('Eten & drinken'). */
export function tripSubLabel(key) {
  return TRIP_SUBS.find(s => s.key === key)?.label ?? key ?? ''
}

/**
 * Vertaalt een kanonieke sub-sleutel naar de sleutel die deze categorie in de
 * database gebruikt (zie de kop van dit bestand).
 */
export function tripSubKey(cat, kanoniek) {
  const subs = Array.isArray(cat?.subs) ? cat.subs : []
  if (subs.some(s => s.key === kanoniek)) return kanoniek
  const label = tripSubLabel(kanoniek).toLowerCase()
  const opLabel = subs.find(s => String(s.label ?? '').toLowerCase() === label)
  return opLabel ? opLabel.key : kanoniek
}

/** Het label van een sub zoals hij in de database staat, met vangnet. */
export function subLabelOf(cat, subKey) {
  if (!subKey) return ''
  const subs = Array.isArray(cat?.subs) ? cat.subs : []
  return subs.find(s => s.key === subKey)?.label ?? tripSubLabel(subKey)
}

/**
 * Moet deze banktransactie nog op Vakantie gezet worden? Alleen afschrijvingen:
 * bijschrijvingen zijn verrekeningen van reisgenoten en lopende declaraties
 * horen bij werk, niet bij de vakantie.
 */
export function needsTripCategory(tx, vakantieKey) {
  if (!tx || !vakantieKey) return false
  if (tx.type !== 'debit') return false
  if (isOpenClaim(tx)) return false
  return tx.category !== vakantieKey
}

/**
 * Categorie + sub voor een Splitser-regel.
 *
 * Wat de app geleerd heeft (`categorizeWithLearning`) gaat voor: koos de
 * gebruiker eerder bewust iets buiten Vakantie (bijv. Kleding), dan volgen we
 * dat. Anders is het Vakantie met de geleerde of geraden sub. De ingebouwde
 * regels (source 'rules') tellen hier niet als "geleerd": die kennen het
 * verschil tussen thuis en op reis niet.
 *
 * @param geleerd  resultaat van `categorizeWithLearning`, of null
 * @param opties   { cat: de Vakantie-categorierij, description }
 */
export function pickTripCategory(geleerd, { cat = null, description = '' } = {}) {
  const uitLeren = !!geleerd?.cat && geleerd.source !== 'rules' && geleerd.source !== 'unknown'
  if (!cat) return { category: geleerd?.cat ?? '', subcategory: geleerd?.sub ?? '' }
  if (uitLeren && geleerd.cat !== cat.key) return { category: geleerd.cat, subcategory: geleerd.sub ?? '' }
  const sub = uitLeren && geleerd.sub ? geleerd.sub : tripSubKey(cat, guessTripSub(description))
  return { category: cat.key, subcategory: sub }
}
