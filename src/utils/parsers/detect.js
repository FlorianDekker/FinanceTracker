// Herkent van welke bank een exportbestand komt en zet het om naar transacties.
import { firstLine, normHeader, sniffDelimiter, parseCsv, stripBom } from './csv'
import { parseABNExport, parseABNExcelBuffer } from './abn'
import { parseIng } from './ing'
import { parseRabobank } from './rabobank'
import { parseBunq } from './bunq'
import { parseRevolut } from './revolut'
import { parseN26 } from './n26'
import { parseTransactionsCsv } from './internal'

export const BANK_LABELS = {
  abn: 'ABN AMRO',
  ing: 'ING',
  rabobank: 'Rabobank',
  bunq: 'bunq',
  revolut: 'Revolut',
  n26: 'N26',
  internal: 'Eigen export van deze app',
  unknown: 'Onbekend',
}

const has = (header, ...needles) => needles.every(n => header.includes(n))

function textFrom(input) {
  if (typeof input === 'string') return input
  if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer)
    return new TextDecoder('utf-8').decode(bytes)
  }
  return String(input ?? '')
}

/**
 * @param input     CSV-/tab-tekst of een ArrayBuffer
 * @param filename  optioneel; alleen de extensie telt mee
 * @returns { bank, confidence }  confidence 0..1
 */
export function detectFormat(input, filename = '') {
  const ext = String(filename).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? ''

  // Alleen ABN AMRO levert (bij ons) een Excel-bestand.
  if (ext === 'xls' || ext === 'xlsx') return { bank: 'abn', confidence: 0.8 }

  const text = textFrom(input)
  const line = firstLine(text)
  if (!line) return { bank: 'unknown', confidence: 0 }
  const header = normHeader(line).replace(/"/g, '')

  // ABN AMRO tab-export: geen kopregel, eerste kolom rekeningnummer, tweede EUR.
  const tabCols = stripBom(line).split('\t')
  if (tabCols.length >= 7 && /^\d{6,}/.test(tabCols[0].trim()) && tabCols[1].trim().toUpperCase() === 'EUR') {
    return { bank: 'abn', confidence: 0.95 }
  }

  if (has(header, 'naam / omschrijving') || has(header, 'af bij', 'mutatiesoort')) return { bank: 'ing', confidence: 0.95 }
  if (has(header, 'iban/bban', 'saldo na trn') || has(header, 'volgnr', 'naam tegenpartij')) return { bank: 'rabobank', confidence: 0.95 }
  if (has(header, 'interest date', 'counterparty')) return { bank: 'bunq', confidence: 0.95 }
  if (has(header, 'started date', 'completed date')) return { bank: 'revolut', confidence: 0.95 }
  if (has(header, 'booking date', 'partner name')) return { bank: 'n26', confidence: 0.95 }
  if (has(header, 'payee', 'payment reference', 'amount (eur)')) return { bank: 'n26', confidence: 0.85 }
  if (has(header, 'date', 'amount', 'type', 'category')) return { bank: 'internal', confidence: 0.9 }

  // Zonder kopregel: het eigen CSV-formaat is date,amount,type,category,subcategory,note
  const delimiter = sniffDelimiter(text)
  const cols = parseCsv(line, delimiter)[0] ?? []
  if (delimiter === ',' && cols.length >= 3 &&
      /^\d{4}-\d{2}-\d{2}$/.test(cols[0].trim()) &&
      /^(debit|credit)$/i.test(cols[2].trim())) {
    return { bank: 'internal', confidence: 0.7 }
  }

  return { bank: 'unknown', confidence: 0 }
}

const TEXT_PARSERS = {
  ing: parseIng,
  rabobank: parseRabobank,
  bunq: parseBunq,
  revolut: parseRevolut,
  n26: parseN26,
}

/**
 * Leest tekst van een al herkende bank. ABN (tab) en het eigen formaat hebben
 * een afwijkende return-vorm en worden hier gelijkgetrokken.
 */
export function parseBankText(text, bank) {
  if (bank === 'abn') return { transactions: parseABNExport(text), warnings: [] }
  if (bank === 'internal') {
    return {
      transactions: parseTransactionsCsv(text),
      warnings: ['Dit is een export van deze app zelf: de rijen bevatten al een categorie.'],
    }
  }
  const parser = TEXT_PARSERS[bank]
  if (!parser) return { transactions: [], warnings: ['Onbekend bestandsformaat.'] }
  return parser(text)
}

/**
 * Eén ingang voor de import-UI.
 * @param file  File/Blob met .name (xls/xlsx gaat via SheetJS, de rest als tekst)
 * @returns { bank, transactions, warnings[] }
 */
export async function parseBankFile(file) {
  const name = file?.name ?? ''
  if (/\.(xls|xlsx)$/i.test(name)) {
    const buffer = await file.arrayBuffer()
    const transactions = parseABNExcelBuffer(buffer)
    return {
      bank: 'abn',
      transactions,
      warnings: transactions.length ? [] : ['Geen transacties gevonden in dit Excel-bestand.'],
    }
  }

  const text = await file.text()
  const { bank, confidence } = detectFormat(text, name)
  if (bank === 'unknown') {
    return {
      bank,
      transactions: [],
      warnings: ['Bestandsformaat niet herkend. Kies handmatig een bank of gebruik de kolommapper.'],
    }
  }

  const { transactions, warnings } = parseBankText(text, bank)
  const out = [...warnings]
  if (confidence < 0.9) out.push(`Formaat herkend als ${BANK_LABELS[bank]}, maar niet met zekerheid.`)
  if (!transactions.length) out.push('Geen transacties gevonden in dit bestand.')
  return { bank, transactions, warnings: out }
}
