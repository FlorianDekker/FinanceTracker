import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { recordEvent } from '../utils/merchantLearning'
import {
  CLAIM_STATUSES,
  DEFAULT_CLAIM_EXPIRY_MONTHS,
  claimStatusOf,
  defaultBatchName,
  isPartialClaim,
  outstandingClaims,
  round2,
  sumAmount,
  VOORSCHOT_KEY,
} from '../utils/claims'

export { VOORSCHOT_KEY }

export const CLAIM_EXPIRY_SETTING = 'claimExpiryMonths'

/* ------------------------------------------------------------------ *
 * Instelling: hoe lang mag je een werkkost nog declareren?             *
 * Altijd via deze helpers lezen/schrijven, nooit rechtstreeks.         *
 * ------------------------------------------------------------------ */

export async function getClaimExpiryMonths() {
  const row = await db.settings.get(CLAIM_EXPIRY_SETTING)
  const value = Number(row?.value)
  return Number.isFinite(value) && value > 0 ? Math.round(value) : DEFAULT_CLAIM_EXPIRY_MONTHS
}

export async function setClaimExpiryMonths(months) {
  const value = Math.max(1, Math.min(60, Math.round(Number(months) || DEFAULT_CLAIM_EXPIRY_MONTHS)))
  await db.settings.put({ key: CLAIM_EXPIRY_SETTING, value })
  return value
}

export function useClaimExpiryMonths() {
  return useLiveQuery(getClaimExpiryMonths, [], DEFAULT_CLAIM_EXPIRY_MONTHS)
}

/* ------------------------------------------------------------------ *
 * Declaraties zelf                                                     *
 * ------------------------------------------------------------------ */

/** Alle declaraties met een van de gegeven statussen (index op claimStatus). */
export function useClaimsByStatus(statuses) {
  const key = statuses.join(',')
  return useLiveQuery(
    () => db.transactions.where('claimStatus').anyOf(statuses).sortBy('date'),
    [key],
  )
}

/** Wat staat er nog uit bij werk: open + ingediend. */
export function useOutstandingClaims() {
  const txs = useClaimsByStatus(['open', 'submitted'])
  return { ...outstandingClaims(txs), transactions: txs ?? null, loading: txs === undefined }
}

/** Markeert of ontmarkeert een bestaande transactie als declaratie. */
export async function setClaimStatus(id, status) {
  return db.transactions.update(id, { claimStatus: status ?? null })
}

/** Alles wat met declaraties te maken heeft (inclusief de uitbetalingen). */
export function useAllClaims() {
  return useLiveQuery(
    () => db.transactions.where('claimStatus').anyOf(CLAIM_STATUSES).sortBy('date'),
    [],
    null,
  )
}

/* ------------------------------------------------------------------ *
 * Batches                                                              *
 * ------------------------------------------------------------------ */

export function useClaimBatches() {
  return useLiveQuery(() => db.claimBatches.toArray(), [], null)
}

/** De batches waar nog een betaling voor kan binnenkomen. */
export function useSubmittedBatches() {
  return useLiveQuery(() => db.claimBatches.where('status').equals('submitted').toArray(), [], null)
}

// Er is geen index op claimBatchId (dat zou een schemawissel kosten voor een
// handvol rijen); filteren op de claimStatus-index is ruim snel genoeg.
export function batchItemsQuery(batchId) {
  return db.transactions
    .where('claimStatus').anyOf(['submitted', 'paid', 'rejected'])
    .filter(tx => tx.claimBatchId === batchId)
    .sortBy('date')
}

export function useBatchItems(batchId) {
  return useLiveQuery(() => (batchId == null ? [] : batchItemsQuery(batchId)), [batchId], null)
}

/** De bijschrijving die aan deze batch gekoppeld is (indien al gekoppeld). */
export function usePayoutForBatch(batchId) {
  return useLiveQuery(
    () => (batchId == null
      ? null
      : db.transactions.where('claimStatus').equals('payout')
          .filter(tx => tx.claimBatchId === batchId).first().then(tx => tx ?? null)),
    [batchId],
    undefined,
  )
}

/**
 * Wijzigt de categorie van een lopende declaratie. Het bedrag van een batch
 * verandert hier niet van, dus dit mag ook bij een ingediend item.
 * De correctie gaat naar de merchant-learning, net als in het transactieformulier.
 */
export async function changeClaimCategory(tx, category, subcategory = '') {
  if (!tx?.id || !category) return
  await db.transactions.update(tx.id, { category, subcategory: subcategory ?? '' })
  const gewijzigd = tx.category !== category || (tx.subcategory ?? '') !== (subcategory ?? '')
  // Een deeldeclaratie is een synthetische rij ("OV werk september 2026"),
  // geen herkenbare merchant — die notitie hoort niet in de learning.
  if (tx.note && !isPartialClaim(tx)) {
    recordEvent(tx.note, category, subcategory ?? '', tx.amount, tx.type, null,
      gewijzigd ? { was: true, from: tx.category } : null)
  }
}

/** Haalt de declaratiemarkering van een open transactie weg. */
export async function unmarkClaim(id) {
  return db.transactions.update(id, { claimStatus: null, claimBatchId: null })
}

/**
 * "Toch geen declaratie", ongeacht de fase: de markering gaat eraf en het item
 * verlaat zijn batch (de batch houdt zijn expectedTotal — dat is wat je destijds
 * indiende). Een deeldeclaratie heeft zonder markering geen bestaansrecht: die
 * zou als losse bijschrijving de categorie blijven verlagen, dus die verdwijnt.
 */
export async function discardClaim(tx) {
  if (!tx?.id) return
  if (isPartialClaim(tx)) return db.transactions.delete(tx.id)
  return unmarkClaim(tx.id)
}

/**
 * Bundelt open declaraties tot een ingediende batch.
 * @returns het id van de nieuwe batch
 */
export async function submitClaimBatch({ name, note = '', transactionIds }) {
  const ids = [...new Set(transactionIds ?? [])]
  if (!ids.length) throw new Error('Selecteer minstens één declaratie.')
  return db.transaction('rw', db.transactions, db.claimBatches, async () => {
    const txs = (await db.transactions.bulkGet(ids)).filter(tx => tx && claimStatusOf(tx) === 'open')
    if (!txs.length) throw new Error('Deze declaraties staan niet meer open.')
    const now = Date.now()
    const batchId = await db.claimBatches.add({
      name: String(name ?? '').trim() || defaultBatchName(),
      note: String(note ?? ''),
      status: 'submitted',
      createdAt: now,
      submittedAt: now,
      expectedTotal: sumAmount(txs),
      paidTransactionId: null,
      paidAmount: null,
      paidAt: null,
    })
    await db.transactions.where('id').anyOf(txs.map(t => t.id))
      .modify({ claimStatus: 'submitted', claimBatchId: batchId })
    return batchId
  })
}

/** Zet alles uit de batch terug op open en verwijdert de batch. */
export async function dissolveClaimBatch(batchId) {
  return db.transaction('rw', db.transactions, db.claimBatches, async () => {
    const items = await batchItemsQuery(batchId)
    if (items.length) {
      await db.transactions.where('id').anyOf(items.map(t => t.id))
        .modify({ claimStatus: 'open', claimBatchId: null })
    }
    await db.claimBatches.delete(batchId)
    return items.length
  })
}

/* ------------------------------------------------------------------ *
 * Afkeuren: de uitgave is alsnog van jou en landt in een categorie.    *
 * ------------------------------------------------------------------ */

// decisions: [{ tx, category, subcategory }]
function applyRejections(decisions) {
  return Promise.all((decisions ?? []).map(d => db.transactions.update(d.tx.id, {
    claimStatus: 'rejected',
    category: d.category ?? d.tx.category,
    subcategory: d.subcategory ?? '',
  })))
}

// Buiten de transactie: merchantHistory hoort niet in dezelfde scope en een
// mislukte leerstap mag de afhandeling nooit terugdraaien.
function learnFromRejections(decisions) {
  for (const d of decisions ?? []) {
    const note = d.tx?.note
    // Bij een deeldeclaratie verandert de categorie bij afkeuren juist niet
    // (zie RejectClaimSheet/LinkPayoutSheet) en is de notitie sowieso
    // synthetisch — niets om van te leren.
    if (!note || isPartialClaim(d.tx)) continue
    const changed = d.tx.category !== d.category || (d.tx.subcategory ?? '') !== (d.subcategory ?? '')
    recordEvent(note, d.category, d.subcategory ?? '', d.tx.amount, d.tx.type, null,
      changed ? { was: true, from: d.tx.category } : null)
  }
}

/** "Niet declareren" / afgekeurd, zonder dat er een betaling aan te pas komt. */
export async function rejectClaims(decisions) {
  await db.transaction('rw', db.transactions, () => applyRejections(decisions))
  learnFromRejections(decisions)
}

/* ------------------------------------------------------------------ *
 * Uitbetaling koppelen                                                 *
 * ------------------------------------------------------------------ */

/** Alleen koppelen; de batch blijft ingediend tot je hem afsluit. */
export async function attachPayoutToBatch({ batchId, transactionId }) {
  return db.transactions.update(transactionId, { claimStatus: 'payout', claimBatchId: batchId })
}

/**
 * Sluit een batch af met de binnengekomen bulkbetaling.
 * @param rejections [{ tx, category, subcategory }] — de afgekeurde items
 * @param note       extra regel op de batch (bijv. een verschil dat niet paste)
 */
export async function closeBatchWithPayout({ batchId, transactionId, rejections = [], note = '' }) {
  return db.transaction('rw', db.transactions, db.claimBatches, async () => {
    const batch = await db.claimBatches.get(batchId)
    if (!batch) throw new Error('Deze declaratiebatch bestaat niet meer.')
    const payout = await db.transactions.get(transactionId)
    if (!payout) throw new Error('Deze transactie bestaat niet meer.')

    const items = await batchItemsQuery(batchId)
    const rejectedIds = new Set(rejections.map(r => r.tx.id))
    const paidIds = items.filter(t => !rejectedIds.has(t.id)).map(t => t.id)

    await applyRejections(rejections)
    if (paidIds.length) {
      await db.transactions.where('id').anyOf(paidIds).modify({ claimStatus: 'paid', claimBatchId: batchId })
    }
    await db.transactions.update(transactionId, { claimStatus: 'payout', claimBatchId: batchId })

    const extra = String(note ?? '').trim()
    await db.claimBatches.update(batchId, {
      status: 'closed',
      paidTransactionId: transactionId,
      paidAmount: round2(payout.amount),
      paidAt: Date.now(),
      note: [String(batch.note ?? '').trim(), extra].filter(Boolean).join(' · '),
    })
    return { paid: paidIds.length, rejected: rejections.length }
  }).then(result => {
    learnFromRejections(rejections)
    return result
  })
}

/**
 * Het omgekeerde van closeBatchWithPayout, voor als je te vroeg of verkeerd hebt
 * afgerond: de uitbetaling wordt weer een gewone bijschrijving, alle items gaan
 * terug naar 'submitted' en de batch wacht opnieuw op een betaling. De categorie
 * van afgekeurde items blijft staan — die keuze was misschien juist.
 * @returns het aantal items dat terug naar 'submitted' ging
 */
export async function reopenClaimBatch(batchId) {
  return db.transaction('rw', db.transactions, db.claimBatches, async () => {
    const batch = await db.claimBatches.get(batchId)
    if (!batch) throw new Error('Deze declaratiebatch bestaat niet meer.')
    if (batch.status !== 'closed') return 0
    const items = await batchItemsQuery(batchId)
    if (items.length) {
      await db.transactions.where('id').anyOf(items.map(t => t.id)).modify({ claimStatus: 'submitted' })
    }
    await db.transactions.where('claimStatus').equals('payout')
      .filter(tx => tx.claimBatchId === batchId)
      .modify({ claimStatus: null, claimBatchId: null })
    await db.claimBatches.update(batchId, {
      status: 'submitted', paidTransactionId: null, paidAmount: null, paidAt: null,
    })
    return items.length
  })
}

/* ------------------------------------------------------------------ *
 * Eenmalige actie: oude Voorschot-uitgaven worden declaraties.         *
 * ------------------------------------------------------------------ */

function convertibleVoorschot() {
  return db.transactions
    .where('category').equals(VOORSCHOT_KEY)
    .filter(tx => tx.type === 'debit' && claimStatusOf(tx) === null)
}

const EMPTY_SUMMARY = { count: 0, total: 0 }

/** Hoeveel (en voor hoeveel euro) staat er nog in Voorschot zonder status? */
export function useVoorschotSummary() {
  return useLiveQuery(
    () => convertibleVoorschot().toArray().then(txs => ({ count: txs.length, total: sumAmount(txs) })),
    [],
    EMPTY_SUMMARY,
  )
}

/**
 * Zet ze op 'open'. De categorie blijft bewust Voorschot: pas als je een item
 * afkeurt ("Niet declareren") komt de echte categorie aan bod — dan doet de app
 * een voorstel. Zo leert de app niets van de verlegenheidscategorie zelf.
 */
export async function convertVoorschotToClaims() {
  const ids = (await convertibleVoorschot().toArray()).map(tx => tx.id)
  if (!ids.length) return 0
  await db.transactions.where('id').anyOf(ids).modify({ claimStatus: 'open', claimBatchId: null })
  return ids.length
}
