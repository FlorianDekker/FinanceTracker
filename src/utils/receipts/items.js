// De regels van een bon platgeslagen naar de tabel `receiptItems`.
//
// `receipts.items` is de waarheid (die komt uit het model en wordt daar ook
// gecorrigeerd); `receiptItems` is een afgeleide kopie waarop we kunnen zoeken
// en aggregeren ("wat kostte olijfolie vorig jaar", "hoeveel ging er naar
// zuivel"). Alles loopt via deze ene functie, zodat de twee nooit uit elkaar
// kunnen lopen.

import { nameKey } from './extract'
import { normalizeGroup } from './groups'

/** @returns {Array<object>} rijen voor `receiptItems` (zonder id) */
export function receiptItemRows(receipt) {
  if (!receipt || receipt.id == null) return []
  const items = Array.isArray(receipt.items) ? receipt.items : []
  return items.map(item => ({
    receiptId: receipt.id,
    name: String(item?.name ?? ''),
    nameKey: item?.nameKey || nameKey(item?.name),
    qty: Number.isFinite(Number(item?.qty)) && Number(item.qty) > 0 ? Number(item.qty) : 1,
    unitPrice: item?.unitPrice ?? null,
    price: item?.price ?? null,
    group: normalizeGroup(item?.group),
    isDiscount: item?.isDiscount === true,
    // Gekopieerd van de bon zodat een zoekopdracht op productnaam meteen datum,
    // winkel en transactie bij de hand heeft zonder join.
    date: receipt.date ?? '',
    merchantKey: receipt.merchantKey ?? '',
    merchant: receipt.merchant ?? '',
    transactionId: receipt.transactionId ?? null,
  }))
}
