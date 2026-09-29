import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { claimStatusOf, isPartialClaim } from '../utils/claims'
import { recordEvent } from '../utils/merchantLearning'

export function useTransactions(year, month) {
  return useLiveQuery(async () => {
    if (!year || !month) return db.transactions.orderBy('date').reverse().toArray()
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    return db.transactions
      .where('date')
      .startsWith(prefix)
      .reverse()
      .sortBy('date')
  }, [year, month])
}

export async function addTransaction(tx) {
  return db.transactions.add({ ...tx, importedAt: Date.now() })
}

export async function updateTransaction(id, changes) {
  return db.transactions.update(id, changes)
}

/* ------------------------------------------------------------------ *
 * Verwijderen + ongedaan maken                                         *
 *                                                                       *
 * Een verwijderde transactie kan een bon gekoppeld hebben (`receiptId`);*
 * die bon moet zijn koppeling kwijtraken, anders wijst hij naar een     *
 * transactie die niet meer bestaat. `claimBatchId`/`tripId` staan op de *
 * rij zelf en komen dus vanzelf terug zodra je de hele rij herstelt.    *
 * ------------------------------------------------------------------ */

// Zelfde statusbepaling als (niet-geëxporteerd) statusVoor() in useReceipts.js:
// zonder gekoppelde transactie is een bon 'new' (nog niet uitgelezen), 'review'
// (uitgelezen maar niet kloppend) of 'extracted'.
function statusZonderTransactie(receipt) {
  if (receipt.extractedAt == null) return 'new'
  return receipt.validation?.ok === false ? 'review' : 'extracted'
}

async function unlinkReceiptFor(tx) {
  if (tx?.receiptId == null) return
  const bon = await db.receipts.get(tx.receiptId)
  if (!bon) return
  await db.receipts.update(bon.id, { transactionId: null, status: statusZonderTransactie(bon) })
  await db.receiptItems.where('receiptId').equals(bon.id).modify({ transactionId: null })
}

async function relinkReceiptFor(tx) {
  if (tx?.receiptId == null) return
  const bon = await db.receipts.get(tx.receiptId)
  if (!bon) return
  await db.receipts.update(bon.id, { transactionId: tx.id, status: 'linked' })
  await db.receiptItems.where('receiptId').equals(bon.id).modify({ transactionId: tx.id })
}

/** Verwijdert de transactie en geeft de volledige rij terug (voor de undo-toast). */
export async function deleteTransaction(id) {
  return db.transaction('rw', db.transactions, db.receipts, db.receiptItems, async () => {
    const tx = await db.transactions.get(id)
    if (!tx) return null
    await unlinkReceiptFor(tx)
    await db.transactions.delete(id)
    return tx
  })
}

/** Zet een eerder verwijderde transactie terug, met hetzelfde id en dezelfde koppelingen. */
export async function restoreTransaction(tx) {
  if (!tx) return
  await restoreTransactions([tx])
}

/** Verwijdert meerdere transacties in één keer; geeft de volledige rijen terug. */
export async function bulkDeleteTransactions(ids) {
  return db.transaction('rw', db.transactions, db.receipts, db.receiptItems, async () => {
    const txs = (await db.transactions.bulkGet(ids)).filter(Boolean)
    for (const tx of txs) await unlinkReceiptFor(tx)
    if (txs.length) await db.transactions.bulkDelete(txs.map(tx => tx.id))
    return txs
  })
}

/** Zet meerdere eerder verwijderde transacties terug, met hun oorspronkelijke id's. */
export async function restoreTransactions(txs) {
  if (!txs?.length) return
  await db.transaction('rw', db.transactions, db.receipts, db.receiptItems, async () => {
    await db.transactions.bulkPut(txs)
    for (const tx of txs) await relinkReceiptFor(tx)
  })
}

// `allKeys` zodat de aanroeper de nieuwe id's kan gebruiken (de import koppelt
// er bijvoorbeeld meteen een declaratie-uitbetaling aan).
export async function bulkAddTransactions(txs) {
  return db.transactions.bulkAdd(txs.map(t => ({ ...t, importedAt: Date.now() })), { allKeys: true })
}

/* ------------------------------------------------------------------ *
 * Bulk-bewerken (selectiemodus op het Transacties-scherm)              *
 * ------------------------------------------------------------------ */

/**
 * Zet de gekozen categorie/subcategorie op alle geselecteerde transacties.
 * Leert per transactie van de wijziging, met correctie-tracking zoals
 * TransactionForm dat ook doet bij een handmatige categoriewijziging.
 * @returns {Promise<number>} aantal bijgewerkte transacties
 */
export async function bulkSetCategory(ids, category, subcategory = '') {
  const txs = (await db.transactions.bulkGet(ids)).filter(Boolean)
  if (!txs.length) return 0
  await db.transactions.where('id').anyOf(txs.map(tx => tx.id)).modify({ category, subcategory })
  for (const tx of txs) {
    // Een deeldeclaratie heeft een synthetische notitie, geen merchant — die
    // hoort niet in de learning (zie TransactionForm.handleSave).
    if (!tx.note || isPartialClaim(tx)) continue
    const catChanged = tx.category !== category
    await recordEvent(tx.note, category, subcategory, tx.amount, tx.type, null,
      catChanged ? { was: true, from: tx.category } : null)
  }
  return txs.length
}

/** Zet alle geselecteerde transacties op deze vakantie (of `null` voor "geen"). */
export async function bulkSetTrip(ids, tripId) {
  if (!ids?.length) return 0
  await db.transactions.where('id').anyOf(ids).modify({ tripId })
  return ids.length
}

/**
 * Markeert de geselecteerde afschrijvingen als open declaratie. Alleen
 * transacties zonder claimStatus of met 'open' komen in aanmerking; de rest
 * (al ingediend/uitbetaald, of een bijschrijving) slaan we over.
 * @returns {Promise<{updated: number, skipped: number}>}
 */
export async function bulkMarkClaim(ids) {
  const txs = (await db.transactions.bulkGet(ids)).filter(Boolean)
  const eligible = txs.filter(tx => {
    const status = claimStatusOf(tx)
    return tx.type === 'debit' && (status === null || status === 'open')
  })
  if (eligible.length) {
    await db.transactions.where('id').anyOf(eligible.map(tx => tx.id)).modify({ claimStatus: 'open' })
  }
  return { updated: eligible.length, skipped: txs.length - eligible.length }
}
