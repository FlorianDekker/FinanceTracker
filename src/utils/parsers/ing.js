// ING (Mijn ING particulier) CSV-export.
// Kop: "Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij",
//      "Bedrag (EUR)","Mutatiesoort","Mededelingen"[,"Saldo na mutatie","Tag"]
// Scheidingsteken is tegenwoordig ';' maar ',' komt in oudere exports voor.
// Datum = YYYYMMDD, bedrag met komma als decimaalteken, richting via Af/Bij.
import { parseCsv, sniffDelimiter, headerIndex, findCol, cell } from './csv'
import { toIsoDate, parseAmount, makeTransaction, cleanMerchantName, cleanRemi, collapse, debitCreditFrom } from './common'

const LABEL = '(?:Naam|Omschrijving|IBAN|BIC|Kenmerk|Machtiging ID|Incassant ID|Valutadatum|Betalingskenmerk|Pasvolgnr|Transactie|Term|Datum|Tijd)'

// ING propt bij SEPA-boekingen alles in Mededelingen:
// "Naam: Jan Bakker Omschrijving: Pizza IBAN: NL91INGB0001234567 Kenmerk: ..."
export function cleanIngDescription(value) {
  const s = collapse(value)
  if (!s) return ''

  const m = s.match(new RegExp(`Omschrijving:\\s*([\\s\\S]*?)(?=\\s*${LABEL}:|$)`, 'i'))
  if (m && m[1].trim()) return cleanRemi(m[1])

  // Geen expliciete omschrijving: label/waarde-paren eruit knippen.
  const stripped = s
    .replace(new RegExp(`${LABEL}:\\s*\\S+`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleanRemi(stripped)
}

export function parseIng(text) {
  const warnings = []
  const delimiter = sniffDelimiter(text, [';', ','])
  const rows = parseCsv(text, delimiter)
  if (rows.length < 2) return { transactions: [], warnings: ['Geen regels gevonden in het ING-bestand.'] }

  const index = headerIndex(rows[0])
  const iDate = findCol(index, 'datum')
  const iName = findCol(index, 'naam / omschrijving', 'naam/omschrijving', 'naam')
  const iAccount = findCol(index, 'rekening')
  const iCounter = findCol(index, 'tegenrekening')
  const iAfBij = findCol(index, 'af bij', 'af/bij')
  const iAmount = findCol(index, 'bedrag (eur)', 'bedrag')
  const iRemi = findCol(index, 'mededelingen')
  const iSaldo = findCol(index, 'saldo na mutatie')

  if (iDate < 0 || iAmount < 0 || iAfBij < 0) {
    return { transactions: [], warnings: ['Dit lijkt geen ING-export: kolommen Datum/Bedrag/Af Bij ontbreken.'] }
  }

  const transactions = []
  let skipped = 0
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const date = toIsoDate(cell(row, iDate), 'YYYYMMDD')
    const amount = parseAmount(cell(row, iAmount), ',')
    const type = debitCreditFrom(cell(row, iAfBij)) || (amount < 0 ? 'debit' : 'credit')
    const remi = cleanIngDescription(cell(row, iRemi))
    const merchant = cleanMerchantName(cell(row, iName)) || remi
    const saldo = iSaldo >= 0 ? parseAmount(cell(row, iSaldo), ',') : NaN

    const tx = makeTransaction({
      date, amount, type, merchant, remi,
      raw: row.join(delimiter),
      account: cell(row, iAccount),
      counterparty: cell(row, iCounter),
      balance: iSaldo >= 0 && cell(row, iSaldo) ? saldo : undefined,
    })
    if (tx) transactions.push(tx); else skipped++
  }
  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)
  return { transactions, warnings }
}
