// Rabobank CSV-export (particulier, formaat 2018+).
// Kop: "IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag",
//      "Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij",...,
//      "Omschrijving-1","Omschrijving-2","Omschrijving-3",...
// Alles gequote, scheidingsteken ',', datum YYYY-MM-DD, bedrag met komma en teken.
import { parseCsv, sniffDelimiter, headerIndex, findCol, cell } from './csv'
import { toIsoDate, parseAmount, makeTransaction, cleanMerchantName, cleanRemi, collapse } from './common'

export function parseRabobank(text) {
  const warnings = []
  const delimiter = sniffDelimiter(text, [',', ';'])
  const rows = parseCsv(text, delimiter)
  if (rows.length < 2) return { transactions: [], warnings: ['Geen regels gevonden in het Rabobank-bestand.'] }

  const index = headerIndex(rows[0])
  const iAccount = findCol(index, 'iban/bban')
  const iDate = findCol(index, 'datum')
  const iAmount = findCol(index, 'bedrag')
  const iSaldo = findCol(index, 'saldo na trn')
  const iCounter = findCol(index, 'tegenrekening iban/bban')
  const iName = findCol(index, 'naam tegenpartij')
  const iDesc = [
    findCol(index, 'omschrijving-1'),
    findCol(index, 'omschrijving-2'),
    findCol(index, 'omschrijving-3'),
  ].filter(i => i >= 0)

  if (iDate < 0 || iAmount < 0) {
    return { transactions: [], warnings: ['Dit lijkt geen Rabobank-export: kolommen Datum/Bedrag ontbreken.'] }
  }

  const transactions = []
  let skipped = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const date = toIsoDate(cell(row, iDate), 'YYYY-MM-DD')
    const signed = parseAmount(cell(row, iAmount), ',')
    const desc = cleanRemi(collapse(iDesc.map(i => cell(row, i)).join(' ')))
    const merchant = cleanMerchantName(cell(row, iName)) || desc
    const saldoRaw = iSaldo >= 0 ? cell(row, iSaldo) : ''

    const tx = makeTransaction({
      date,
      amount: signed,
      type: signed < 0 ? 'debit' : 'credit',
      merchant,
      remi: desc,
      raw: row.join(delimiter),
      account: cell(row, iAccount),
      counterparty: cell(row, iCounter),
      balance: saldoRaw ? parseAmount(saldoRaw, ',') : undefined,
    })
    if (tx) transactions.push(tx); else skipped++
  }
  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)
  return { transactions, warnings }
}
