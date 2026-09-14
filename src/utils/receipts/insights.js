// Pure aggregaties over de bonregels (`receiptItems`) en de bonnen zelf.
//
// Alles hier is losgekoppeld van React en van Dexie: in gaan gewone arrays met
// rijen, uit komen kant-en-klare getallen voor de grafieken en het
// Bonnetjes-scherm. Zo is elke berekening te testen zonder browser
// (tests/unit/receipt-insights.test.mjs) en kunnen de schermen dom blijven.
//
// Conventies:
// - Een kortingsregel (`isDiscount`) heeft een negatieve prijs en de groep
//   `statiegeld_korting`. Die telt nergens mee in de groep-totalen; het bespaarde
//   bedrag rapporteren we apart als `korting` (positief).
// - Regels zonder datum (bon nog niet uitgelezen) vallen overal buiten de
//   maandindeling; ze zouden anders in een willekeurige maand landen.

import { groupColor, groupIcon, groupLabel, normalizeGroup } from './groups'

const pad = n => String(n).padStart(2, '0')

/* ------------------------------------------------------------------ *
 * Kleine helpers                                                       *
 * ------------------------------------------------------------------ */

/** Diakrieten weg, kleine letters, alleen letters/cijfers — zelfde recept als `nameKey`. */
export function normaliseerZoek(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** 'JJJJ-MM-DD' → 'JJJJ-MM'; alles wat geen datum is → ''. */
export function maandVan(date) {
  const s = String(date ?? '')
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : ''
}

/**
 * De laatste `aantal` maanden inclusief de lopende, oplopend.
 * Anders dan `volledigeMaanden` in budgetDrift telt de huidige maand hier wél
 * mee: bonnen zijn per definitie recent en een lege laatste kolom zou de
 * grafiek juist informatief maken ("deze maand nog niets gescand").
 */
export function laatsteMaanden(aantal, vanafYm) {
  const [jaar, maand] = String(vanafYm).split('-').map(Number)
  const uit = []
  for (let i = aantal - 1; i >= 0; i--) {
    const d = new Date(jaar, maand - 1 - i, 1)
    uit.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  return uit
}

/** Het bedrag van een regel, altijd positief; kortingen geven het bespaarde bedrag. */
export function regelBedrag(item) {
  const n = Number(item?.price)
  return Number.isFinite(n) ? Math.abs(n) : 0
}

/**
 * Prijs per stuk. `unitPrice` is leidend; ontbreekt die, dan `price / qty`.
 * Zonder bruikbare prijs: null (het punt valt dan uit de prijshistorie).
 */
export function eenheidsprijs(item) {
  const unit = Number(item?.unitPrice)
  if (Number.isFinite(unit) && unit !== 0) return Math.abs(Math.round(unit * 100) / 100)
  const prijs = Number(item?.price)
  if (!Number.isFinite(prijs) || prijs === 0) return null
  const qty = Number(item?.qty)
  const aantal = Number.isFinite(qty) && qty > 0 ? qty : 1
  return Math.abs(Math.round((prijs / aantal) * 100) / 100)
}

const isKorting = item => item?.isDiscount === true || Number(item?.price) < 0

/* ------------------------------------------------------------------ *
 * Boodschappen-verdeling: groepen per maand                            *
 * ------------------------------------------------------------------ */

/**
 * Bedrag per groep per maand, plus de korting per maand.
 *
 * @param items    rijen uit `receiptItems`
 * @param maanden  ['2026-04', …] oplopend; regels buiten dit venster vallen weg
 * @returns {{ maanden, groepen, perMaand, totalen, korting, totaal, kortingTotaal }}
 *   `groepen` bevat alleen groepen die in het venster voorkomen, aflopend op
 *   totaalbedrag — zo krijgt de stacked bar nooit zestien lege lagen.
 */
export function groepenPerMaand(items, { maanden } = {}) {
  const venster = Array.isArray(maanden) && maanden.length ? maanden : null
  const inVenster = venster ? new Set(venster) : null
  const perMaand = new Map((venster ?? []).map(m => [m, { ym: m, totaal: 0, korting: 0, perGroep: {} }]))
  const totalen = {}

  for (const item of items ?? []) {
    const ym = maandVan(item?.date)
    if (!ym) continue
    if (inVenster && !inVenster.has(ym)) continue
    if (!perMaand.has(ym)) perMaand.set(ym, { ym, totaal: 0, korting: 0, perGroep: {} })
    const rij = perMaand.get(ym)
    const bedrag = regelBedrag(item)

    if (isKorting(item)) {
      rij.korting += bedrag
      continue
    }
    const groep = normalizeGroup(item?.group)
    rij.perGroep[groep] = (rij.perGroep[groep] ?? 0) + bedrag
    rij.totaal += bedrag
    totalen[groep] = (totalen[groep] ?? 0) + bedrag
  }

  const rijen = (venster ?? [...perMaand.keys()].sort()).map(m => {
    const r = perMaand.get(m) ?? { ym: m, totaal: 0, korting: 0, perGroep: {} }
    return { ...r, totaal: rond(r.totaal), korting: rond(r.korting) }
  })

  const groepen = Object.entries(totalen).sort((a, b) => b[1] - a[1]).map(([key]) => key)
  return {
    maanden: rijen.map(r => r.ym),
    groepen,
    perMaand: rijen,
    totalen: Object.fromEntries(Object.entries(totalen).map(([k, v]) => [k, rond(v)])),
    korting: rond(rijen.reduce((s, r) => s + r.korting, 0)),
    totaal: rond(rijen.reduce((s, r) => s + r.totaal, 0)),
  }
}

/**
 * Groep-totalen van één set regels, met label/kleur/icoon en aandeel.
 * Gebruikt door de donut en de lijst eronder.
 */
export function groepTotalen(items) {
  const perGroep = new Map()
  let korting = 0
  for (const item of items ?? []) {
    const bedrag = regelBedrag(item)
    if (isKorting(item)) { korting += bedrag; continue }
    const key = normalizeGroup(item?.group)
    const huidig = perGroep.get(key) ?? { group: key, totaal: 0, aantal: 0 }
    huidig.totaal += bedrag
    huidig.aantal += 1
    perGroep.set(key, huidig)
  }
  const totaal = [...perGroep.values()].reduce((s, g) => s + g.totaal, 0)
  const rijen = [...perGroep.values()]
    .sort((a, b) => b.totaal - a.totaal)
    .map(g => ({
      ...g,
      totaal: rond(g.totaal),
      label: groupLabel(g.group),
      color: groupColor(g.group),
      icon: groupIcon(g.group),
      aandeel: totaal > 0 ? g.totaal / totaal : 0,
    }))
  return { rijen, totaal: rond(totaal), korting: rond(korting) }
}

/* ------------------------------------------------------------------ *
 * Dekking: welk deel van je boodschappen heeft een bon?                *
 * ------------------------------------------------------------------ */

/**
 * Aandeel (op bedrag) van de uitgaven in een maand waar een bon aan hangt.
 *
 * @param txs         transacties (ruwe rijen)
 * @param ym          'JJJJ-MM'; leeg = alle maanden
 * @param categorieKeys  array/Set van categorie-slugs die meetellen; null = alles
 *                       wat de aanroeper aanlevert (die filtert dan zelf op type)
 * @returns {{ totaal, metBon, ratio, bonnen, aantal }}
 */
/**
 * Welke categorieën tellen mee bij de dekking: de categorie `boodschappen` als
 * die bestaat, anders alle uitgavecategorieën. Vrienden met een eigen indeling
 * krijgen zo nog steeds een zinnig percentage.
 */
export function dekkingCategorieKeys(categories) {
  const bood = (categories ?? []).find(c => c?.key === 'boodschappen' && !c.archived)
  return bood ? [bood.key] : (categories ?? []).filter(c => c?.type === 'expense' && !c.archived).map(c => c.key)
}

export function berekenDekking(txs, { ym = null, categorieKeys = null } = {}) {
  const keys = categorieKeys == null ? null
    : categorieKeys instanceof Set ? categorieKeys : new Set(categorieKeys)
  let totaal = 0
  let metBon = 0
  let bonnen = 0
  let aantal = 0

  for (const tx of txs ?? []) {
    if (tx?.type !== 'debit') continue
    if (ym && maandVan(tx.date) !== ym) continue
    if (keys && !keys.has(tx.category)) continue
    const bedrag = Math.abs(Number(tx.amount) || 0)
    totaal += bedrag
    aantal += 1
    if (tx.receiptId != null) { metBon += bedrag; bonnen += 1 }
  }

  return {
    totaal: rond(totaal),
    metBon: rond(metBon),
    ratio: totaal > 0 ? metBon / totaal : 0,
    bonnen,
    aantal,
  }
}

/* ------------------------------------------------------------------ *
 * Prijshistorie per product                                            *
 * ------------------------------------------------------------------ */

/**
 * Alle aankopen van één `nameKey` in de tijd, met genormaliseerde stuksprijs.
 * Oplopend op datum, zodat de lijn van links naar rechts loopt.
 */
export function prijshistorie(items, nameKey) {
  const sleutel = String(nameKey ?? '').trim()
  if (!sleutel) return []
  return (items ?? [])
    .filter(i => i?.nameKey === sleutel && maandVan(i.date) && !isKorting(i))
    .map(i => ({
      date: String(i.date).slice(0, 10),
      prijs: eenheidsprijs(i),
      qty: Number(i.qty) > 0 ? Number(i.qty) : 1,
      merchant: i.merchant || '',
      merchantKey: i.merchantKey || '',
      name: i.name || '',
      receiptId: i.receiptId ?? null,
    }))
    .filter(p => p.prijs != null)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * "nu €X · was €Y (+Z%)" voor de kop boven de prijslijn.
 * Met één punt is er niets te vergelijken: dan alleen `nu`.
 */
export function prijsSamenvatting(punten) {
  const lijst = (punten ?? []).filter(p => p?.prijs != null)
  if (!lijst.length) return { nu: null, was: null, verschil: 0, pct: null, aantal: 0 }
  const nu = lijst[lijst.length - 1].prijs
  const was = lijst.length > 1 ? lijst[0].prijs : null
  const verschil = was == null ? 0 : rond(nu - was)
  return {
    nu,
    was,
    verschil,
    pct: was ? Math.round((verschil / was) * 1000) / 10 : null,
    aantal: lijst.length,
    laagste: Math.min(...lijst.map(p => p.prijs)),
    hoogste: Math.max(...lijst.map(p => p.prijs)),
  }
}

/* ------------------------------------------------------------------ *
 * Top producten                                                        *
 * ------------------------------------------------------------------ */

/**
 * Meest gekochte producten en de producten waar de meeste euro's heen gingen.
 *
 * @param prefix  'JJJJ-MM' voor een maand, 'JJJJ' voor een jaar, '' voor alles
 * @returns {{ vaakst, duurst, aantalProducten }}
 */
export function topProducten(items, { prefix = '', limiet = 10 } = {}) {
  const perKey = new Map()
  for (const item of items ?? []) {
    if (isKorting(item)) continue
    const datum = String(item?.date ?? '')
    if (prefix && !datum.startsWith(prefix)) continue
    const key = item?.nameKey
    if (!key) continue
    const huidig = perKey.get(key) ?? { nameKey: key, name: item.name || key, keer: 0, stuks: 0, totaal: 0, laatst: '', merchants: new Set() }
    huidig.keer += 1
    huidig.stuks += Number(item.qty) > 0 ? Number(item.qty) : 1
    huidig.totaal += regelBedrag(item)
    if (datum > huidig.laatst) { huidig.laatst = datum; huidig.name = item.name || huidig.name }
    if (item.merchant) huidig.merchants.add(item.merchant)
    perKey.set(key, huidig)
  }

  const rijen = [...perKey.values()].map(r => ({
    nameKey: r.nameKey,
    name: r.name,
    keer: r.keer,
    stuks: rond(r.stuks),
    totaal: rond(r.totaal),
    laatst: r.laatst,
    winkels: [...r.merchants],
  }))

  // Bij gelijk aantal wint het hoogste bedrag, zodat de volgorde stabiel is.
  const vaakst = [...rijen].sort((a, b) => b.keer - a.keer || b.totaal - a.totaal).slice(0, limiet)
  const duurst = [...rijen].sort((a, b) => b.totaal - a.totaal || b.keer - a.keer).slice(0, limiet)
  return { vaakst, duurst, aantalProducten: rijen.length }
}

/** De meest gekochte `nameKey`s, als chips voor de productkiezer. */
export function meestGekocht(items, limiet = 20) {
  return topProducten(items, { limiet }).vaakst
}

/* ------------------------------------------------------------------ *
 * Zoeken                                                               *
 * ------------------------------------------------------------------ */

/**
 * Zoekt op productnaam over `nameKey` én `name`, diakriet-ongevoelig en op
 * losse woorden: "olijf olie" vindt ook "Olijfolie extra vierge" niet — maar
 * "olijf" wel. Elk woord moet ergens in de genormaliseerde naam voorkomen.
 */
export function zoekItems(items, term, { limiet = 200 } = {}) {
  const q = normaliseerZoek(term)
  if (!q) return []
  const woorden = q.split(' ').filter(Boolean)
  const gevonden = []
  for (const item of items ?? []) {
    const hooiberg = `${normaliseerZoek(item?.nameKey)} ${normaliseerZoek(item?.name)}`
    if (woorden.every(w => hooiberg.includes(w))) gevonden.push(item)
  }
  gevonden.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
  return gevonden.slice(0, limiet)
}

/** "N keer gekocht · gem. €X · laatst op …" boven de zoekresultaten. */
export function zoekSamenvatting(gevonden) {
  const lijst = (gevonden ?? []).filter(i => !isKorting(i))
  const bedragen = lijst.map(regelBedrag).filter(b => b > 0)
  const totaal = bedragen.reduce((s, b) => s + b, 0)
  const datums = lijst.map(i => String(i.date ?? '')).filter(Boolean).sort()
  return {
    aantal: lijst.length,
    totaal: rond(totaal),
    gemiddeld: bedragen.length ? rond(totaal / bedragen.length) : 0,
    laatst: datums.length ? datums[datums.length - 1] : null,
  }
}

/* ------------------------------------------------------------------ *
 * Bonnen groeperen                                                     *
 * ------------------------------------------------------------------ */

/**
 * Bonnen per maand, nieuwste maand eerst en binnen een maand de nieuwste bon
 * eerst. Bonnen zonder datum komen in een eigen groep 'onbekend' bovenaan:
 * dat zijn precies de bonnen die nog aandacht nodig hebben.
 */
export function bonnenPerMaand(receipts) {
  const perMaand = new Map()
  for (const bon of receipts ?? []) {
    const ym = maandVan(bon?.date) || 'onbekend'
    if (!perMaand.has(ym)) perMaand.set(ym, [])
    perMaand.get(ym).push(bon)
  }
  const sorteer = (a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')) || (b.id ?? 0) - (a.id ?? 0)
  return [...perMaand.entries()]
    .sort((a, b) => (a[0] === 'onbekend' ? -1 : b[0] === 'onbekend' ? 1 : b[0].localeCompare(a[0])))
    .map(([ym, bonnen]) => ({ ym, bonnen: bonnen.sort(sorteer) }))
}

/** De N winkels met de meeste bonnen, voor de filterchips. */
export function topWinkels(receipts, limiet = 5) {
  const perKey = new Map()
  for (const bon of receipts ?? []) {
    const key = bon?.merchantKey
    if (!key) continue
    const huidig = perKey.get(key) ?? { merchantKey: key, merchant: bon.merchant || key, aantal: 0 }
    huidig.aantal += 1
    perKey.set(key, huidig)
  }
  return [...perKey.values()].sort((a, b) => b.aantal - a.aantal || a.merchant.localeCompare(b.merchant)).slice(0, limiet)
}

/* ------------------------------------------------------------------ */

function rond(n) {
  const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100
  return r === 0 ? 0 : r
}
