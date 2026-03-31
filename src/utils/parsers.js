// CSV and data parsing utilities
import * as XLSX from 'xlsx'

export function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

export function toNum(x) {
  if (typeof x === 'string') x = x.replace(',', '.')
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

// Parse date from ABN AMRO format: YYYYMMDD or DD-MM-YYYY
export function parseABNDate(dateStr) {
  const s = dateStr.replace(/\D/g, '')
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  const parts = dateStr.split('-')
  if (parts.length === 3 && parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return dateStr
}

export function parseABNAmount(amountStr) {
  return parseFloat(String(amountStr).replace(/\./g, '').replace(',', '.')) || 0
}

// Extract a SEPA field value from a /TRTP/... structured description.
// Values can contain slashes (e.g. "Oplaaddatum/tijd:"), so we stop at
// the next ALL-CAPS tag like /IBAN/ /BIC/ /EREF/ etc.
function getSEPAField(desc, key) {
  const re = new RegExp(`/${key}/([\\s\\S]*?)(?=/[A-Z]{2,6}/|$)`)
  const m = desc.match(re)
  return m ? m[1].trim() : null
}

// Strip bank reference noise from ABN AMRO merchant descriptions
export function extractMerchant(descParts) {
  let desc = descParts.join(' ').trim()

  // XLS/SEPA structured format: /TRTP/TYPE/IBAN/.../NAME/Merchant/REMI/Details/...
  if (desc.startsWith('/TRTP/')) {
    const name = getSEPAField(desc, 'NAME')
    const remi = getSEPAField(desc, 'REMI')

    // OV-chipkaart top-up → always show as NS OV-Chipkaart
    if (remi && /OV-chipkaart/i.test(remi)) return 'NS OV-Chipkaart'

    // All SEPA: just the name (REMI shown separately in UI)
    if (name) return name

    // Fallback: return the payment type (e.g. "iDEAL")
    const typeMatch = desc.match(/^\/TRTP\/([^/]+)/)
    return typeMatch ? typeMatch[1].trim() : desc
  }

  // BEA / card terminal format
  // Strip "BEA, Apple Pay" or plain "BEA,"
  desc = desc.replace(/BEA,?\s*Apple Pay\s*/gi, '')
  desc = desc.replace(/^BEA,?\s*/gi, '')

  // Extract merchant name = everything before the terminal code (2 letters + 3+ digits + optional letter)
  const beaMatch = desc.match(/^(.*?)\s+[A-Z]{2}\d{3,}[A-Z]?\b/)
  if (beaMatch && beaMatch[1].trim()) return beaMatch[1].trim()

  desc = desc.replace(/^SEPA\s+\S+\s*/gi, '')
  desc = desc.replace(/,PAS\d+/gi, '')
  desc = desc.replace(/\bPAS\d+/gi, '')
  desc = desc.replace(/NR:[A-Z0-9]+,?\s*/gi, '')
  desc = desc.replace(/\d{2}\.\d{2}\.\d{2}\/\d{2}:\d{2}/g, '')
  desc = desc.replace(/\s{2,}/g, ' ').trim()
  return desc.split(/\t/)[0].trim() || desc
}

// Parse the transactions CSV format used by this app.
// Handles files with or without a header row.
export function parseTransactionsCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  if (lines.length < 1) return []

  const firstCols = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const hasHeader = firstCols.includes('date') || firstCols.includes('amount')

  // If no header, assume fixed order: date, amount, type, category, subcategory, note
  const iDate = hasHeader ? firstCols.indexOf('date') : 0
  const iAmt  = hasHeader ? firstCols.indexOf('amount') : 1
  const iType = hasHeader ? firstCols.indexOf('type') : 2
  const iCat  = hasHeader ? firstCols.indexOf('category') : 3
  const iSub  = hasHeader ? firstCols.indexOf('subcategory') : 4
  const iNote = hasHeader ? firstCols.indexOf('note') : 5

  const startRow = hasHeader ? 1 : 0
  const results = []
  for (let i = startRow; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i])
    const date = (cols[iDate] ?? '').trim()
    const amount = toNum(cols[iAmt])
    const type = (cols[iType] ?? '').trim()
    const category = (cols[iCat] ?? '').trim()
    const subcategory = (cols[iSub] ?? '').trim()
    const note = (cols[iNote] ?? '').trim()
    if (!date || !type || amount <= 0) continue
    results.push({ date, amount, type, category, subcategory, note })
  }
  return results
}

// Parse ABN AMRO tab-delimited export (tab format, no header)
export function parseABNExport(text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/^\xFF\xFE/, '').replace(/^\xFE\xFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim())
  const results = []

  for (const line of lines) {
    const cols = line.split('\t')
    if (cols.length < 7) continue
    if (!/^\d{6,}/.test(cols[0].trim())) continue
    if (cols[1].trim().toUpperCase() !== 'EUR') continue

    const date = parseABNDate(cols[2].trim())
    const amtRaw = parseABNAmount(cols[6].trim())
    const amount = Math.abs(amtRaw)
    const type = amtRaw >= 0 ? 'credit' : 'debit'
    const merchant = extractMerchant(cols.slice(7))

    if (!date || amount <= 0) continue
    results.push({ date, merchant: merchant || 'Onbekend', amount, type })
  }
  return results
}

// Convert an Excel serial date number to YYYY-MM-DD string
function excelSerialToDate(serial) {
  // Excel serial: days since Jan 0 1900 (with 1900 leap year bug)
  const ms = (serial - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (isNaN(d)) return null
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// Parse ABN AMRO XLS/XLSX export using SheetJS
// Columns: accountNumber, mutationcode(EUR), transactiondate(YYYYMMDD),
//          valuedate, startsaldo, endsaldo, amount, description
export async function parseABNExcel(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })

  const results = []
  for (const cols of rows) {
    if (cols.length < 7) continue

    // Skip header row — account number is always a long digit string
    const acct = String(cols[0] ?? '').trim()
    if (!/^\d{6,}/.test(acct)) continue

    const curr = String(cols[1] ?? '').trim().toUpperCase()
    if (curr !== 'EUR') continue

    // Col 2: transactiondate stored as YYYYMMDD integer (e.g. 20260228)
    const rawDate = cols[2]
    let date
    if (typeof rawDate === 'number') {
      const s = String(Math.round(rawDate))
      date = s.length === 8 && s.startsWith('20')
        ? parseABNDate(s)
        : excelSerialToDate(rawDate)
    } else {
      date = parseABNDate(String(rawDate ?? '').trim())
    }

    // Col 6: amount — negative = debit, positive = credit
    // Excel stores as actual number, but may show with comma (Dutch locale)
    const rawAmt = cols[6]
    const amtRaw = typeof rawAmt === 'number'
      ? rawAmt
      : parseABNAmount(String(rawAmt ?? ''))
    const amount = Math.abs(amtRaw)
    const type = amtRaw >= 0 ? 'credit' : 'debit'

    // Col 7: single description column (all info concatenated)
    const description = String(cols[7] ?? '').replace(/\n/g, ' ').trim()
    const merchant = extractMerchant([description])
    const remi = description.startsWith('/TRTP/') ? getSEPAField(description, 'REMI') : null

    if (!date || amount <= 0) continue
    const row = { date, merchant: merchant || 'Onbekend', amount, type }
    if (remi && !/OV-chipkaart/i.test(remi)) {
      // Strip Tikkie ID prefix and trailing IBAN noise
      let cleanRemi = remi.replace(/^Tikkie ID \d+,\s*/i, '')
      cleanRemi = cleanRemi.replace(/,\s*NL\d{2}[A-Z]{4}\d{10}\s*$/, '').trim()
      row.remi = cleanRemi
    }
    results.push(row)
  }
  return results
}
