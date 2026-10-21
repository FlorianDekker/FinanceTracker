// Revolut CSV-export.
// Kop: Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
// Alleen State = COMPLETED telt mee; datums zijn 'YYYY-MM-DD HH:MM:SS'.
// Het effectieve bedrag is Amount − Fee (Fee is positief en wordt afgeschreven;
// het Balance-veld rekent hem al mee — gecontroleerd op een echt Revolut-bestand).
import { parseCsv, sniffDelimiter, headerIndex, findCol, cell } from './csv'
import { toIsoDate, parseAmount, makeTransaction, cleanMerchantName } from './common'

export function parseRevolut(text) {
  const warnings = []
  const delimiter = sniffDelimiter(text, [',', ';'])
  const rows = parseCsv(text, delimiter)
  if (rows.length < 2) return { transactions: [], warnings: ['Geen regels gevonden in het Revolut-bestand.'] }

  const index = headerIndex(rows[0])
  const iType = findCol(index, 'type')
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
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const state = cell(row, iState).toUpperCase()
    if (iState >= 0 && state && state !== 'COMPLETED') { pending++; continue }

    const signed = parseAmount(cell(row, iAmount))
    const fee = iFee >= 0 ? parseAmount(cell(row, iFee)) : 0

    // "Closing transaction" bij het opheffen van een (sub)rekening: bedrag én
    // kosten zijn 0. Geen bruikbare mutatie, en geen waarschuwing nodig.
    if (signed === 0 && fee === 0) continue

    const effectief = signed - fee
    const dateRaw = cell(row, iCompleted) || cell(row, iStarted)
    const date = toIsoDate(dateRaw)
    const bankType = cell(row, iType)
    const balanceRaw = iBalance >= 0 ? cell(row, iBalance) : ''
    const product = cell(row, iProduct) || 'Current'

    const remi = fee > 0 ? `incl. €${fee.toFixed(2).replace('.', ',')} kosten` : ''

    const tx = makeTransaction({
      date,
      amount: effectief,
      type: effectief < 0 ? 'debit' : 'credit',
      merchant: cleanMerchantName(cell(row, iDesc)),
      remi,
      raw: row.join(delimiter),
      account: `Revolut ${product}`,
      balance: balanceRaw ? parseAmount(balanceRaw) : undefined,
    })
    if (!tx) { skipped++; continue }
    if (fee > 0) tx.fee = fee
    if (bankType) tx.bankType = bankType
    // Voor de volgorde-correctie hieronder: wordt vóór het terugsturen gesloopt.
    tx._sortKey = dateRaw
    transactions.push(tx)
  }

  // Het bestand is niet strikt op datum gesorteerd (regels van een ander
  // product — bijv. Savings — staan er soms tussendoor). Sorteer per rekening
  // op Completed/Started Date incl. tijd, zodat de laatste regel van een
  // rekening ook echt de laatste mutatie is (het saldo-anker, zie balance.js).
  transactions.sort((a, b) => {
    if (a.account !== b.account) return a.account < b.account ? -1 : 1
    return a._sortKey < b._sortKey ? -1 : a._sortKey > b._sortKey ? 1 : 0
  })
  for (const tx of transactions) delete tx._sortKey

  if (pending) warnings.push(`${pending} regel(s) overgeslagen omdat ze nog niet afgerond zijn (State ≠ COMPLETED).`)
  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)
  return { transactions, warnings }
}
