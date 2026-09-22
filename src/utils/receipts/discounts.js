// Kortingen koppelen aan de productregel waar ze bij horen.
//
// De AI-uitlezer levert kortingen los aan (`receipt.discounts[] = { name, amount }`).
// Deze module koppelt zo'n korting aan de bijbehorende productregel (`itemIndex`
// in `receipt.items`) en rekent daarna de nettoprijs per product uit. Alles
// hier is puur (geen React, geen Dexie) zodat het los te testen is.

import { nameKey } from './extract'

function rond(n) {
  const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100
  return r === 0 ? 0 : r
}

// Woorden die in een kortingsnaam zelf niets over het product zeggen. "k" is
// de AH-notatie voor een kortingscode ("35% K FUSILLI SALS"), "2e"/"halve"/
// "prijs" komen uit "2E HALVE PRIJS".
const RUIS_WOORDEN = new Set([
  'bonus', 'korting', 'kortingen', 'voordeel', 'actie', 'discount', 'discounts',
  'kado', 'gratis', 'k', 'halve', 'prijs', '2e', 'promotie', 'aanbieding',
])

const DREMPEL = 2   // score die een koppeling minimaal moet halen

/** Kortingsnaam → bruikbare tokens: percentages en bedragen eruit, ruis eruit. */
function tokensVanKorting(naam) {
  let s = String(naam ?? '').toLowerCase()
  s = s.replace(/\d+([.,]\d+)?\s*%/g, ' ')        // percentages: 35%, 2,5%
  s = s.replace(/-?\d+[.,]\d{1,2}\b/g, ' ')        // bedragen: -2,40 / 2.4
  return nameKey(s).split(' ').filter(w => w.length >= 2 && !RUIS_WOORDEN.has(w) && !/^\d+$/.test(w))
}

function tokensVanItem(item) {
  const sleutel = item?.nameKey || nameKey(item?.name)
  return sleutel.split(' ').filter(Boolean)
}

/**
 * Score voor "hoort deze korting bij dit product": een exacte tokenmatch telt
 * zwaarder dan een afkorting. AH kort namen af ("DOUWE EGB" ↔ "DOUWE EGBERTS"),
 * dus een prefix van minstens 4 tekens telt ook mee (korter is te toevallig).
 */
function scoreTokens(dTokens, iTokens) {
  let score = 0
  for (const dt of dTokens) {
    if (iTokens.includes(dt)) { score += 2; continue }
    const prefixTreffer = iTokens.some(it =>
      (dt.length >= 4 && it.startsWith(dt)) || (it.length >= 4 && dt.startsWith(it)))
    if (prefixTreffer) score += 1
  }
  return score
}

/**
 * Vult `itemIndex` in op elke korting: de index van de productregel in `items`
 * waar de korting bij hoort, of `null` als er geen (goede genoeg) match is.
 *
 * Volgorde: 1) een geleerde koppeling (`learned[discountNameKey]`) wint, mits
 * het product met die `nameKey` nog op deze bon staat — staat het er niet
 * (andere bon, ander assortiment), dan valt de heuristiek terug op stap 2.
 * Een geleerde waarde van `null` betekent "expliciet los": dat blijft zo.
 * 2) de tokenheuristiek: de beste score boven een drempel wint; bij gelijk-
 * spel wint het product dat nog geen andere korting heeft, zodat kortingen
 * zich niet allemaal op hetzelfde eerste product stapelen.
 *
 * @param {Array<object>} items      `receipt.items`
 * @param {Array<object>} discounts  `receipt.discounts` ({ name, amount })
 * @param {{ learned?: Record<string, string|null> }} [opties]
 * @returns {Array<object>} discounts met `itemIndex` (number of null)
 */
export function matchDiscounts(items, discounts, { learned = {} } = {}) {
  const lijst = Array.isArray(items) ? items : []
  const kortingen = Array.isArray(discounts) ? discounts : []
  const bezet = new Set()   // items die al een korting hebben, voor de gelijkspel-regel

  return kortingen.map(d => {
    const dKey = nameKey(d?.name)
    const geleerd = dKey && Object.prototype.hasOwnProperty.call(learned, dKey) ? learned[dKey] : undefined

    if (geleerd !== undefined) {
      if (geleerd === null) return { ...d, itemIndex: null }
      const idx = lijst.findIndex(it => !it?.isDiscount && (it?.nameKey || nameKey(it?.name)) === geleerd)
      if (idx !== -1) {
        bezet.add(idx)
        return { ...d, itemIndex: idx }
      }
      // geleerd product staat niet op déze bon: val terug op de heuristiek
    }

    const dTokens = tokensVanKorting(d?.name)
    if (dTokens.length === 0) return { ...d, itemIndex: null }   // generieke "BONUS" zonder productnaam

    let beste = null
    let besteScore = 0
    lijst.forEach((it, idx) => {
      if (it?.isDiscount) return
      const score = scoreTokens(dTokens, tokensVanItem(it))
      if (score <= 0) return
      const beter = score > besteScore
        || (score === besteScore && beste != null && bezet.has(beste) && !bezet.has(idx))
      if (beter) { besteScore = score; beste = idx }
    })

    if (beste != null && besteScore >= DREMPEL) {
      bezet.add(beste)
      return { ...d, itemIndex: beste }
    }
    return { ...d, itemIndex: null }
  })
}

/**
 * Rekent per productregel de gekoppelde korting, nettoprijs en netto-
 * stuksprijs uit. Een korting mag de productprijs nooit onder 0 duwen; is de
 * gekoppelde korting groter dan de prijs, dan drukken we het overschot niet
 * door (het product kost dan gewoon €0, het teveel-gekoppelde bedrag wordt
 * simpelweg niet verrekend — dat blijft alleen zichtbaar in de kortingslijst
 * zelf, die immers los van deze functie het volledige bedrag toont).
 *
 * @param {Array<object>} items      `receipt.items`
 * @param {Array<object>} discounts  `receipt.discounts` (met `itemIndex`)
 * @returns {Array<object>} items + { discount, netPrice, netUnitPrice }
 */
export function netItems(items, discounts) {
  const lijst = Array.isArray(items) ? items : []
  const kortingen = Array.isArray(discounts) ? discounts : []

  const perItem = new Map()
  for (const d of kortingen) {
    if (d?.itemIndex == null || d.itemIndex < 0 || d.itemIndex >= lijst.length) continue
    perItem.set(d.itemIndex, (perItem.get(d.itemIndex) ?? 0) + Math.abs(Number(d.amount) || 0))
  }

  return lijst.map((item, idx) => {
    if (item?.isDiscount) {
      return { ...item, discount: 0, netPrice: item.price ?? null, netUnitPrice: item.unitPrice ?? null }
    }
    const prijs = Number(item?.price)
    const bruto = Number.isFinite(prijs) ? prijs : 0
    const discount = rond(Math.min(perItem.get(idx) ?? 0, bruto))
    const netPrice = Number.isFinite(prijs) ? rond(Math.max(bruto - discount, 0)) : null
    const qty = Number(item?.qty) > 0 ? Number(item.qty) : 1
    const netUnitPrice = netPrice == null ? null : rond(netPrice / qty)
    return { ...item, discount, netPrice, netUnitPrice }
  })
}
