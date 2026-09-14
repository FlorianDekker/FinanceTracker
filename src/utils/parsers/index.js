// Verzamelpunt voor alle bankparsers.
//
// Gedeelde transactievorm (alle parsers behalve de ABN-functies, die hun
// historische vorm houden):
//   { date: 'YYYY-MM-DD', amount: number > 0, type: 'debit' | 'credit',
//     merchant, remi, raw, account?, counterparty?, balance? }

export { parseCsv, sniffDelimiter, headerIndex, findCol, normHeader, stripBom } from './csv'
export { toIsoDate, parseAmount, cleanMerchantName, cleanRemi, makeTransaction, debitCreditFrom } from './common'

export { parseABNExport, parseABNExcel, parseABNExcelBuffer, parseABNDate, parseABNAmount, extractMerchant } from './abn'
export { parseIng, cleanIngDescription } from './ing'
export { parseRabobank } from './rabobank'
export { parseBunq } from './bunq'
export { parseRevolut } from './revolut'
export { parseN26 } from './n26'
export { parseGenericCsv, suggestMapping, guessDateFormat, DATE_FORMATS } from './genericCsv'
export { parseTransactionsCsv, parseCsvLine, toNum } from './internal'
export { detectFormat, parseBankFile, parseBankText, BANK_LABELS } from './detect'
