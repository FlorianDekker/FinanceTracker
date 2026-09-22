/**
 * Wat kostte deze vakantie *jou*?
 *
 * Twee bronnen die elkaar overlappen: de bank (wat er van jouw rekening ging)
 * en Splitser (wie wat voorschoot en wie welk deel droeg). Een Splitser-regel
 * waar jíj de betaler bent, is meestal ook een bankregel — die zou anders
 * dubbel tellen. Daarom:
 *
 *   splitserShare   Σ item.myShare
 *   bankNotCovered  Σ trip-afschrijvingen die géén Splitser-regel dekt
 *   myCost          splitserShare + bankNotCovered
 *   bankOut         Σ trip-afschrijvingen
 *   bankIn          Σ trip-bijschrijvingen (verrekeningen van reisgenoten)
 *   bankNet         bankOut − bankIn
 *   reconcile       bankNet − myCost   (≈ 0 als alles verrekend is)
 *
 * Lopende declaraties (voorgeschoten werkkosten) mogen wél in een vakantie
 * zitten maar tellen nergens mee: `isOpenClaim` houdt ze buiten de sommen.
 * Zonder Splitser is `myCost` gewoon `bankNet`.
 *
 * Puur: geen db, geen React.
 */

import { isOpenClaim } from '../claims'
import { tripDays } from './suggest'

export const round2 = n => Math.round((Number(n) || 0) * 100) / 100

const bedrag = tx => Number(tx?.amount) || 0

/** Telt deze banktransactie mee in de vakantiekosten? */
export function countsInTrip(tx) {
  return !!tx && !isOpenClaim(tx)
}

/**
 * Welke banktransactie hoort bij welke Splitser-regel?
 *
 * Alleen regels die ík heb voorgeschoten kunnen een bankregel zijn. Match op
 * bedrag (± 1 cent) en datum (± 2 dagen); bij meerdere kandidaten wint de
 * dichtstbijzijnde datum. Elke banktransactie wordt hoogstens één keer gebruikt.
 *
 * @returns {Map<any, number>} itemId (of index) → transactie-id
 */
export function suggestMatches(items, transactions, myName, { dagen = 2 } = {}) {
  const vrij = (transactions ?? []).filter(tx => tx && tx.type === 'debit' && countsInTrip(tx))
  const gebruikt = new Set()
  const uit = new Map()
  const naam = String(myName ?? '').toLowerCase()

  ;(items ?? []).forEach((item, i) => {
    if (!item) return
    if (naam && String(item.payer ?? '').toLowerCase() !== naam) return
    let beste = null
    let besteAfstand = Infinity
    for (const tx of vrij) {
      if (gebruikt.has(tx.id)) continue
      if (Math.abs(bedrag(tx) - (Number(item.amount) || 0)) > 0.01) continue
      const afstand = Math.abs(dagenTussen(item.date, tx.date))
      if (afstand > dagen || afstand >= besteAfstand) continue
      beste = tx
      besteAfstand = afstand
    }
    if (beste) {
      gebruikt.add(beste.id)
      uit.set(item.id ?? i, beste.id)
    }
  })

  return uit
}

function dagenTussen(a, b) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Number.isNaN(ms) ? Infinity : Math.round(ms / 86400000)
}

function optellen(map, sleutel, waarde) {
  if (!sleutel) return
  map.set(sleutel, round2((map.get(sleutel) ?? 0) + waarde))
}

/**
 * Alle cijfers van één vakantie.
 *
 * @param {{ items?: Array, transactions?: Array, from?: string, to?: string }} invoer
 *        `items` zijn de Splitser-regels (tripItems), `transactions` de
 *        gekoppelde banktransacties.
 */
export function tripCosts({ items = [], transactions = [], from = null, to = null } = {}) {
  const regels = (items ?? []).filter(Boolean)
  const txs = (transactions ?? []).filter(Boolean)
  const meetellend = txs.filter(countsInTrip)

  const gedekt = new Set(regels.map(i => i.matchedTxId).filter(id => id != null))
  const splitserShare = round2(regels.reduce((s, i) => s + (Number(i.myShare) || 0), 0))

  const debits = meetellend.filter(tx => tx.type === 'debit')
  const credits = meetellend.filter(tx => tx.type === 'credit')
  const ongedekt = debits.filter(tx => !gedekt.has(tx.id))

  const bankOut = round2(debits.reduce((s, tx) => s + bedrag(tx), 0))
  const bankIn = round2(credits.reduce((s, tx) => s + bedrag(tx), 0))
  const bankNet = round2(bankOut - bankIn)
  const bankNotCovered = round2(ongedekt.reduce((s, tx) => s + bedrag(tx), 0))

  const hasSplitser = regels.length > 0
  const myCost = hasSplitser ? round2(splitserShare + bankNotCovered) : bankNet
  const reconcile = round2(bankNet - myCost)

  // Per categorie en per dag: Splitser-regels met hun eigen aandeel, niet-
  // gedekte bankregels met hun volle bedrag. Samen precies `myCost`.
  const perCategorieMap = new Map()
  const perDagMap = new Map()
  if (hasSplitser) {
    for (const i of regels) {
      optellen(perCategorieMap, i.category, Number(i.myShare) || 0)
      optellen(perDagMap, i.date, Number(i.myShare) || 0)
    }
  }
  for (const tx of (hasSplitser ? ongedekt : debits)) {
    optellen(perCategorieMap, tx.category, bedrag(tx))
    optellen(perDagMap, tx.date, bedrag(tx))
  }
  if (!hasSplitser) {
    for (const tx of credits) {
      optellen(perCategorieMap, tx.category, -bedrag(tx))
      optellen(perDagMap, tx.date, -bedrag(tx))
    }
  }

  const perCategory = [...perCategorieMap.entries()]
    .map(([key, amount]) => ({ key, amount }))
    .filter(r => Math.abs(r.amount) > 0.005)
    .sort((a, b) => b.amount - a.amount)
  const perDay = [...perDagMap.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const days = tripDays(from ?? perDay[0]?.date ?? null, to ?? perDay[perDay.length - 1]?.date ?? null)

  return {
    hasSplitser,
    splitserShare,
    bankNotCovered,
    myCost,
    bankOut,
    bankIn,
    bankNet,
    reconcile,
    days,
    perDayCost: round2(myCost / days),
    perCategory,
    perDay,
    coveredTxIds: [...gedekt],
    uncoveredTxIds: ongedekt.map(tx => tx.id),
    openClaimCount: txs.length - meetellend.length,
  }
}
