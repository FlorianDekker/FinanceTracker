// N26 CSV-export. Twee varianten:
//   recent: Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,
//           Account Name,Amount (EUR),Original Amount,Original Currency,Exchange Rate
//   ouder:  Date,Payee,Account number,Transaction type,Payment reference,Amount (EUR),...
// Datum YYYY-MM-DD, bedrag getekend met punt als decimaalteken.
import { parseCsv, sniffDelimiter, headerIndex, findCol, cell } from './csv'
import { toIsoDate, parseAmount, makeTransaction, cleanMerchantName, cleanRemi } from './common'

export function parseN26(text) {
  const warnings = []
  const delimiter = sniffDelimiter(text, [',', ';'])
  const rows = parseCsv(text, delimiter)
  if (rows.length < 2) return { transactions: [], warnings: ['Geen regels gevonden in het N26-bestand.'] }

  const index = headerIndex(rows[0])
  const iDate = findCol(index, 'booking date', 'date')
  const iName = findCol(index, 'partner name', 'payee')
  const iIban = findCol(index, 'partner iban', 'account number')
  const iRef = findCol(index, 'payment reference')
  const iAmount = findCol(index, 'amount (eur)', 'amount')
  const iAccount = findCol(index, 'account name')

  if (iDate < 0 || iAmount < 0) {
    return { transactions: [], warnings: ['Dit lijkt geen N26-export: kolommen Date/Amount ontbreken.'] }
  }

  const transactions = []
  let skipped = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const date = toIsoDate(cell(row, iDate))
    const signed = parseAmount(cell(row, iAmount))
    const remi = cleanRemi(cell(row, iRef))
    const merchant = cleanMerchantName(cell(row, iName)) || remi

    const tx = makeTransaction({
      date,
      amount: signed,
      type: signed < 0 ? 'debit' : 'credit',
      merchant,
      remi,
      raw: row.join(delimiter),
      account: cell(row, iAccount),
      counterparty: cell(row, iIban),
    })
    if (tx) transactions.push(tx); else skipped++
  }
  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)
  return { transactions, warnings }
}
