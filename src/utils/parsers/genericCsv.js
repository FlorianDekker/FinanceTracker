// Vangnet voor banken zonder eigen parser: de gebruiker wijst zelf aan welke
// kolom de datum, het bedrag en de omschrijving is. `suggestMapping` doet op
// basis van de kopregel een voorstel dat de gebruiker kan bijstellen.
import { parseCsv, sniffDelimiter, headerIndex, normHeader, cell } from './csv'
import { toIsoDate, parseAmount, makeTransaction, cleanMerchantName, cleanRemi, collapse, debitCreditFrom } from './common'

export const DATE_FORMATS = ['YYYY-MM-DD', 'DD-MM-YYYY', 'YYYYMMDD', 'DD/MM/YYYY']

// Kolomverwijzingen mogen een index (0-based) of een kolomnaam zijn.
function resolveCol(col, index) {
  if (col === undefined || col === null || col === '') return -1
  if (typeof col === 'number') return Number.isInteger(col) && col >= 0 ? col : -1
  const key = normHeader(col)
  return key in index ? index[key] : -1
}

/**
 * @param text     ruwe CSV-tekst
 * @param mapping  { delimiter, dateCol, dateFormat, amountCol, signMode,
 *                   debitCreditCol, debitValue, descriptionCols, counterpartyCol, hasHeader }
 * @returns { transactions, warnings }
 */
export function parseGenericCsv(text, mapping = {}) {
  const warnings = []
  const {
    dateCol, dateFormat = '', amountCol,
    signMode = 'signed', debitCreditCol, debitValue = 'Af',
    descriptionCols = [], counterpartyCol, hasHeader = true,
  } = mapping
  const delimiter = mapping.delimiter || sniffDelimiter(text)

  const rows = parseCsv(text, delimiter)
  if (!rows.length) return { transactions: [], warnings: ['Leeg bestand.'] }

  const index = hasHeader ? headerIndex(rows[0]) : {}
  const iDate = resolveCol(dateCol, index)
  const iAmount = resolveCol(amountCol, index)
  const iDC = resolveCol(debitCreditCol, index)
  const iCounter = resolveCol(counterpartyCol, index)
  const iDesc = (Array.isArray(descriptionCols) ? descriptionCols : [descriptionCols])
    .map(c => resolveCol(c, index)).filter(i => i >= 0)

  if (iDate < 0 || iAmount < 0) {
    return { transactions: [], warnings: ['Kies eerst een datum- en een bedragkolom.'] }
  }
  if (signMode === 'debitCreditCol' && iDC < 0) {
    return { transactions: [], warnings: ['Kies de kolom die Af/Bij (debet/credit) aangeeft.'] }
  }

  const decimal = mapping.decimal ?? 'auto'
  const transactions = []
  let skipped = 0
  for (let r = hasHeader ? 1 : 0; r < rows.length; r++) {
    const row = rows[r]
    const date = toIsoDate(cell(row, iDate), dateFormat)
    const signed = parseAmount(cell(row, iAmount), decimal)
    const type = signMode === 'debitCreditCol'
      ? (debitCreditFrom(cell(row, iDC), debitValue) || 'debit')
      : (signed < 0 ? 'debit' : 'credit')

    const desc = cleanRemi(collapse(iDesc.map(i => cell(row, i)).join(' ')))
    const merchant = cleanMerchantName(iDesc.length ? cell(row, iDesc[0]) : '') || desc

    const tx = makeTransaction({
      date,
      amount: signed,
      type,
      merchant,
      remi: iDesc.length > 1 ? desc : '',
      raw: row.join(delimiter),
      counterparty: cell(row, iCounter),
    })
    if (tx) transactions.push(tx); else skipped++
  }
  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)
  return { transactions, warnings }
}

/* ── Voorstel op basis van de kopregel ────────────────────────────────── */

const DATE_HINTS = ['boekdatum', 'booking date', 'transactiedatum', 'datum', 'date']
const AMOUNT_HINTS = ['bedrag (eur)', 'amount (eur)', 'bedrag', 'amount', 'mutatie']
const DC_HINTS = ['af bij', 'af/bij', 'debet/credit', 'debit/credit', 'bij/af', 'dc', 'type']
const DESC_HINTS = ['naam / omschrijving', 'naam tegenpartij', 'omschrijving', 'description', 'name',
  'payee', 'partner name', 'mededelingen', 'payment reference', 'omschrijving-1', 'omschrijving-2', 'omschrijving-3']
const COUNTER_HINTS = ['tegenrekening iban/bban', 'tegenrekening', 'counterparty', 'partner iban', 'account number', 'iban']

const pick = (headers, hints) => {
  for (const hint of hints) {
    const i = headers.indexOf(hint)
    if (i >= 0) return i
  }
  for (const hint of hints) {
    const i = headers.findIndex(h => h.includes(hint))
    if (i >= 0) return i
  }
  return -1
}

// Raadt het datumformaat uit een voorbeeldwaarde.
export function guessDateFormat(sample = '') {
  const s = String(sample).trim()
  if (/^\d{4}\D\d{1,2}\D\d{1,2}/.test(s)) return 'YYYY-MM-DD'
  if (/^\d{8}$/.test(s.replace(/\D/g, '')) && /^(19|20)/.test(s)) return 'YYYYMMDD'
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return 'DD/MM/YYYY'
  if (/^\d{1,2}[-.]\d{1,2}[-.]\d{4}/.test(s)) return 'DD-MM-YYYY'
  return 'YYYY-MM-DD'
}

/**
 * Stelt een mapping voor op basis van de kopregel (en optioneel een
 * voorbeeldrij voor het datumformaat en het teken-gedrag).
 */
export function suggestMapping(headerRow = [], sampleRow = []) {
  const headers = (headerRow ?? []).map(normHeader)
  const dateCol = pick(headers, DATE_HINTS)
  const amountCol = pick(headers, AMOUNT_HINTS)
  const debitCreditCol = pick(headers, DC_HINTS)
  const counterpartyCol = pick(headers, COUNTER_HINTS)

  const descriptionCols = headers
    .map((h, i) => (DESC_HINTS.some(hint => h === hint || h.includes(hint)) ? i : -1))
    .filter(i => i >= 0 && i !== counterpartyCol)

  const sampleAmount = amountCol >= 0 ? String(sampleRow?.[amountCol] ?? '') : ''
  const hasSign = /[-+()]/.test(sampleAmount)
  const signMode = debitCreditCol >= 0 && !hasSign ? 'debitCreditCol' : 'signed'

  return {
    delimiter: undefined,
    hasHeader: true,
    dateCol: dateCol >= 0 ? dateCol : 0,
    dateFormat: guessDateFormat(dateCol >= 0 ? sampleRow?.[dateCol] : ''),
    amountCol: amountCol >= 0 ? amountCol : 1,
    signMode,
    debitCreditCol: debitCreditCol >= 0 ? debitCreditCol : undefined,
    debitValue: 'Af',
    descriptionCols: descriptionCols.length ? descriptionCols : [],
    counterpartyCol: counterpartyCol >= 0 ? counterpartyCol : undefined,
  }
}
