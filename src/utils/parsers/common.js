// Gedeelde bouwstenen voor alle bankparsers: datums, bedragen, merchant-schoonmaak
// en de vorm van één geparste transactie.

/* ── Datums ───────────────────────────────────────────────────────────── */

const MAAND = /^(0[1-9]|1[0-2])$/
const DAG = /^(0[1-9]|[12]\d|3[01])$/

const iso = (y, m, d) => `${y}-${m}-${d}`
const pad = v => String(v).padStart(2, '0')

/**
 * Zet een datum uit een bankbestand om naar 'YYYY-MM-DD'.
 * Herkent zonder hint: YYYY-MM-DD(THH:MM), YYYYMMDD, DD-MM-YYYY, DD/MM/YYYY,
 * DD.MM.YYYY en YYYY/MM/DD. Met `format` wordt die volgorde afgedwongen.
 * Geeft '' terug als er niets plausibels in zit.
 */
export function toIsoDate(value, format = '') {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  // Alleen het datumdeel; Revolut levert 'YYYY-MM-DD HH:MM:SS'.
  const s = raw.split(/[ T]/)[0]
  const digits = s.replace(/\D/g, '')

  if (format === 'YYYYMMDD') return fromCompact(digits)
  if (format === 'YYYY-MM-DD') {
    const m = s.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})$/)
    return m ? valid(m[1], pad(m[2]), pad(m[3])) : fromCompact(digits)
  }
  if (format === 'DD-MM-YYYY' || format === 'DD/MM/YYYY') {
    const m = s.match(/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/)
    return m ? valid(m[3], pad(m[2]), pad(m[1])) : ''
  }

  let m = s.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})$/)
  if (m) return valid(m[1], pad(m[2]), pad(m[3]))

  m = s.match(/^(\d{1,2})\D(\d{1,2})\D(\d{4})$/)
  if (m) return valid(m[3], pad(m[2]), pad(m[1]))

  if (digits.length === 8) return fromCompact(digits)
  return ''
}

function fromCompact(digits) {
  if (digits.length !== 8) return ''
  // 20260901 (YYYYMMDD) of 01092026 (DDMMYYYY)
  if (/^(19|20)\d{2}$/.test(digits.slice(0, 4))) {
    return valid(digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8))
  }
  return valid(digits.slice(4, 8), digits.slice(2, 4), digits.slice(0, 2))
}

function valid(y, m, d) {
  return MAAND.test(m) && DAG.test(d) ? iso(y, m, d) : ''
}

/* ── Bedragen ─────────────────────────────────────────────────────────── */

/**
 * Leest een bedrag uit tekst. Bepaalt zelf welk teken het decimaalteken is:
 * staan er een punt én een komma in, dan is de laatste het decimaalteken;
 * staat er één teken met drie cijfers erachter, dan is het een duizendtalteken.
 * `decimal: ','` of `'.'` dwingt de keuze af (ING/Rabobank zijn altijd komma).
 */
export function parseAmount(value, decimal = 'auto') {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  let s = String(value ?? '').trim()
  if (!s) return 0

  // (12,50) = negatief, '12,50-' idem (sommige exports zetten het teken achteraan)
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (/-\s*$/.test(s)) { negative = true; s = s.replace(/-\s*$/, '') }

  s = s.replace(/[^\d,.\-+]/g, '')
  if (s.startsWith('-')) { negative = true }
  s = s.replace(/[-+]/g, '')

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let dec = decimal
  if (dec === 'auto') {
    if (lastComma >= 0 && lastDot >= 0) dec = lastComma > lastDot ? ',' : '.'
    else if (lastComma >= 0) dec = s.length - lastComma - 1 === 3 && lastComma > 0 ? '.' : ','
    else dec = '.'
  }

  const thousand = dec === ',' ? '.' : ','
  s = s.split(thousand).join('')
  if (dec === ',') s = s.replace(',', '.')

  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

/* ── Merchant / omschrijving ──────────────────────────────────────────── */

const IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g

export const collapse = s => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * Ruimt een tegenpartij-/omschrijvingsveld op: dubbele spaties, pas- en
 * terminalnummers, Tikkie-ID's en losse IBAN's.
 */
export function cleanMerchantName(value) {
  let s = collapse(value)
  if (!s) return ''
  s = s.replace(/^Tikkie ID \d+,?\s*/i, '')
  s = s.replace(/,?\s*PAS\d+\b/gi, '')
  s = s.replace(/\bNR:[A-Z0-9]+,?\s*/gi, '')
  s = s.replace(/\b\d{2}[-.]\d{2}[-.]\d{2,4}\/\d{2}[:.]\d{2}\b/g, '')
  s = collapse(s).replace(/^[,;:\-\s]+|[,;:\-\s]+$/g, '')
  return collapse(s)
}

/**
 * Ruimt een mededelingen-/omschrijvingsveld op tot iets leesbaars:
 * Tikkie-ID eraf, losse IBAN aan het eind eraf.
 */
export function cleanRemi(value) {
  let s = collapse(value)
  if (!s) return ''
  s = s.replace(/^Tikkie ID \d+,?\s*/i, '')
  s = s.replace(/,\s*NL\d{2}[A-Z]{4}\d{10}\s*$/i, '')
  return collapse(s)
}

// Haalt losse IBAN's uit tekst (gebruikt om ze uit de omschrijving te knippen).
export const stripIbans = s => collapse(String(s ?? '').replace(IBAN, ''))

/* ── Transactie-vorm ──────────────────────────────────────────────────── */

/**
 * Bouwt één transactie in de gedeelde vorm. Retourneert null als de rij geen
 * bruikbare datum of bedrag heeft (de aanroeper telt die als overgeslagen).
 *
 * Vorm: { date, amount (>0), type: 'debit'|'credit', merchant, remi, raw,
 *         account?, counterparty?, balance? }
 */
export function makeTransaction({ date, amount, type, merchant, remi = '', raw = '', account, counterparty, balance }) {
  if (!date) return null
  const abs = Math.abs(Number(amount) || 0)
  if (!(abs > 0)) return null

  const tx = {
    date,
    amount: abs,
    type: type === 'credit' ? 'credit' : 'debit',
    merchant: collapse(merchant) || 'Onbekend',
    remi: collapse(remi),
    raw: String(raw ?? ''),
  }
  if (account) tx.account = collapse(account)
  if (counterparty) tx.counterparty = collapse(counterparty)
  if (Number.isFinite(balance)) tx.balance = balance
  return tx
}

// 'Af'/'Bij', 'D'/'C', 'Debet'/'Credit' -> 'debit' | 'credit'
export function debitCreditFrom(value, debitValue = '') {
  const s = String(value ?? '').trim().toLowerCase()
  if (debitValue) return s === String(debitValue).trim().toLowerCase() ? 'debit' : 'credit'
  if (!s) return ''
  if (/^(af|a|d|debet|debit|uit|-)$/.test(s)) return 'debit'
  if (/^(bij|b|c|credit|in|\+)$/.test(s)) return 'credit'
  return ''
}
