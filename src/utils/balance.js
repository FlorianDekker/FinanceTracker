/**
 * Saldocontrole: klopt wat er in de app staat met wat de bank zegt?
 *
 * De bankimport (ABN, ING) bewaart per regel het saldo ná die mutatie
 * (`tx.balance`) en de rekening (`tx.account`). De laatste zo'n regel is het
 * *anker*: op die datum wist de bank het saldo zeker. Alles wat je daarna
 * handmatig hebt ingevoerd (rijen zónder `balance`) verschuift het verwachte
 * saldo. Vul je dan in wat je bank nu toont, dan is het verschil precies wat
 * er ontbreekt of dubbel staat.
 *
 * Declaraties spelen hier geen rol: dit rekent met de kale transacties, niet
 * met wat "meetelt" in je budget. Een voorgeschoten bon is echt van je
 * rekening af, ongeacht of werk hem nog vergoedt.
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */

export const BALANCE_CHECKS_SETTING = 'balanceChecks'
export const MAX_CHECKS = 20

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Bijschrijving positief, afschrijving negatief. */
export function signed(tx) {
  const a = Number(tx?.amount) || 0
  return tx?.type === 'credit' ? a : -a
}

function hasBalance(tx) {
  return tx?.balance != null && Number.isFinite(Number(tx.balance))
}

/**
 * Per rekening de laatste regel met banksaldo. Zonder rekeningnummer op de
 * regel (oudere imports) landt hij onder ''.
 * Volgorde: datum, daarna importvolgorde (id) — twee regels op dezelfde dag
 * staan in de export chronologisch en krijgen oplopende id's.
 * @returns {{ [account]: { account, date, balance, id } }}
 */
export function anchorsPerAccount(txs) {
  const per = {}
  for (const tx of txs ?? []) {
    if (!hasBalance(tx)) continue
    const account = String(tx.account ?? '')
    const cur = per[account]
    const later = !cur
      || tx.date > cur.date
      || (tx.date === cur.date && (tx.id ?? 0) > (cur.id ?? 0))
    if (later) per[account] = { account, date: tx.date, balance: round2(tx.balance), id: tx.id }
  }
  return per
}

/**
 * Handmatige transacties (zonder banksaldo) op of na de ankerdatum. Een
 * handmatige regel op de ankerdag zelf kán vóór het anker vallen — daarom
 * tonen we ze en laten we jou oordelen.
 */
export function manualSince(txs, anchor) {
  if (!anchor) return []
  return (txs ?? [])
    .filter(tx => !hasBalance(tx) && String(tx.date ?? '') >= anchor.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id ?? 0) - (b.id ?? 0)))
}

/** Verwacht saldo nu: anker + netto van de handmatige regels sindsdien. */
export function expectedBalance(anchor, manual) {
  if (!anchor) return null
  const netto = (manual ?? []).reduce((s, tx) => s + signed(tx), 0)
  return round2(anchor.balance + netto)
}

/**
 * Vergelijking met wat de bank nu toont.
 * diff > 0: de bank heeft méér dan de app verwacht (er ontbreekt een
 * bijschrijving, of er staat een uitgave dubbel); diff < 0: andersom.
 */
export function compareBalance(expected, actual) {
  if (expected == null || actual == null || !Number.isFinite(Number(actual))) return null
  const diff = round2(Number(actual) - expected)
  return { expected, actual: round2(actual), diff, ok: Math.abs(diff) < 0.005 }
}

/** Komma en punt allebei goed; leeg → null. */
export function parseBalanceInput(value) {
  const s = String(value ?? '').trim().replace(/\s|€/g, '')
  if (!s) return null
  // "1.234,56" → 1234.56; "1234.56" → 1234.56; "1234,56" → 1234.56
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(norm)
  return Number.isFinite(n) ? n : null
}

/** Nieuwe controle vooraan, nooit meer dan MAX_CHECKS bewaren. */
export function appendCheck(list, check) {
  return [check, ...(list ?? [])].slice(0, MAX_CHECKS)
}
