// De regels van een bon platgeslagen naar de tabel `receiptItems`.
//
// `receipts.items` is de waarheid (die komt uit het model en wordt daar ook
// gecorrigeerd); `receiptItems` is een afgeleide kopie waarop we kunnen zoeken
// en aggregeren ("wat kostte olijfolie vorig jaar", "hoeveel ging er naar
// zuivel"). Alles loopt via deze ene functie, zodat de twee nooit uit elkaar
// kunnen lopen.

import { nameKey } from './extract'
import { normalizeGroup } from './groups'
import { netItems } from './discounts'

/**
 * @returns {Array<object>} rijen voor `receiptItems` (zonder id)
 *
 * Elke rij krijgt naast de brutoprijs ook `discount`/`netPrice`/`netUnitPrice`
 * (via `netItems`): de gekoppelde korting (`receipt.discounts[].itemIndex`)
 * gaat zo mee de tabel in, zodat groepstotalen en prijshistorie er zonder
 * extra opzoekwerk mee kunnen rekenen. Bonnen zonder discounts leveren gewoon
 * netPrice = price op.
 */
export function receiptItemRows(receipt) {
  if (!receipt || receipt.id == null) return []
  const items = Array.isArray(receipt.items) ? receipt.items : []
  const genetto = netItems(items, receipt.discounts)
  return genetto.map(item => ({
    receiptId: receipt.id,
    name: String(item?.name ?? ''),
    nameKey: item?.nameKey || nameKey(item?.name),
    qty: Number.isFinite(Number(item?.qty)) && Number(item.qty) > 0 ? Number(item.qty) : 1,
    unitPrice: item?.unitPrice ?? null,
    price: item?.price ?? null,
    discount: item?.discount ?? 0,
    netPrice: item?.netPrice ?? item?.price ?? null,
    netUnitPrice: item?.netUnitPrice ?? item?.unitPrice ?? null,
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
