// bunq CSV-export.
// Kop: Date;Interest Date;Amount;Account;Counterparty;Name;Description
// Bedrag is getekend; het decimaalteken verschilt per export-instelling, dus
// die laten we automatisch bepalen.
import { parseCsv, sniffDelimiter, headerIndex, findCol, cell } from './csv'
import { toIsoDate, parseAmount, makeTransaction, cleanMerchantName, cleanRemi } from './common'

export function parseBunq(text) {
  const warnings = []
  const delimiter = sniffDelimiter(text, [';', ','])
  const rows = parseCsv(text, delimiter)
  if (rows.length < 2) return { transactions: [], warnings: ['Geen regels gevonden in het bunq-bestand.'] }

  const index = headerIndex(rows[0])
  const iDate = findCol(index, 'date')
  const iAmount = findCol(index, 'amount')
  const iAccount = findCol(index, 'account')
  const iCounter = findCol(index, 'counterparty')
  const iName = findCol(index, 'name')
  const iDesc = findCol(index, 'description')

  if (iDate < 0 || iAmount < 0) {
    return { transactions: [], warnings: ['Dit lijkt geen bunq-export: kolommen Date/Amount ontbreken.'] }
  }

  const transactions = []
  let skipped = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const date = toIsoDate(cell(row, iDate))
    const signed = parseAmount(cell(row, iAmount))
    const remi = cleanRemi(cell(row, iDesc))
    const merchant = cleanMerchantName(cell(row, iName)) || cleanMerchantName(cell(row, iCounter)) || remi

    const tx = makeTransaction({
      date,
      amount: signed,
      type: signed < 0 ? 'debit' : 'credit',
      merchant,
      remi,
      raw: row.join(delimiter),
      account: cell(row, iAccount),
      counterparty: cell(row, iCounter),
    })
    if (tx) transactions.push(tx); else skipped++
  }
  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)
  return { transactions, warnings }
}
