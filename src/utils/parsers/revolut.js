// Revolut CSV-export.
// Kop: Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// Alleen State = COMPLETED telt mee; datums zijn 'YYYY-MM-DD HH:MM:SS'.
// De kosten (Fee) staan in een eigen kolom en worden niet bij het bedrag opgeteld.
import { parseCsv, sniffDelimiter, headerIndex, findCol, cell } from './csv'
import { toIsoDate, parseAmount, makeTransaction, cleanMerchantName } from './common'

export function parseRevolut(text) {
  const warnings = []
  const delimiter = sniffDelimiter(text, [',', ';'])
  const rows = parseCsv(text, delimiter)
  if (rows.length < 2) return { transactions: [], warnings: ['Geen regels gevonden in het Revolut-bestand.'] }

  const index = headerIndex(rows[0])
  const iCompleted = findCol(index, 'completed date')
  const iStarted = findCol(index, 'started date')
  const iDesc = findCol(index, 'description')
  const iAmount = findCol(index, 'amount')
  const iFee = findCol(index, 'fee')
  const iState = findCol(index, 'state')
  const iBalance = findCol(index, 'balance')
  const iProduct = findCol(index, 'product')

  if (iAmount < 0 || (iCompleted < 0 && iStarted < 0)) {
    return { transactions: [], warnings: ['Dit lijkt geen Revolut-export: kolommen Amount/Date ontbreken.'] }
  }

  const transactions = []
  let skipped = 0
  let pending = 0
  let fees = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const state = cell(row, iState).toUpperCase()
    if (iState >= 0 && state && state !== 'COMPLETED') { pending++; continue }

    const date = toIsoDate(cell(row, iCompleted) || cell(row, iStarted))
    const signed = parseAmount(cell(row, iAmount))
    if (parseAmount(cell(row, iFee)) !== 0) fees++
    const balanceRaw = iBalance >= 0 ? cell(row, iBalance) : ''

    const tx = makeTransaction({
      date,
      amount: signed,
      type: signed < 0 ? 'debit' : 'credit',
      merchant: cleanMerchantName(cell(row, iDesc)),
      remi: '',
      raw: row.join(delimiter),
      account: cell(row, iProduct),
      balance: balanceRaw ? parseAmount(balanceRaw) : undefined,
    })
    if (tx) transactions.push(tx); else skipped++
  }
  if (pending) warnings.push(`${pending} regel(s) overgeslagen omdat ze nog niet afgerond zijn (State ≠ COMPLETED).`)
  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)
  if (fees) warnings.push(`${fees} regel(s) hebben transactiekosten (Fee); die zijn niet bij het bedrag opgeteld.`)
  return { transactions, warnings }
}
