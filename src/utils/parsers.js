// CSV and data parsing utilities

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

// Strip bank reference noise from ABN AMRO merchant descriptions
export function extractMerchant(descParts) {
  let desc = descParts.join(' ').trim()
  desc = desc.replace(/BEA,?\s*Apple Pay\s*/gi, '')
  desc = desc.replace(/^BEA,?\s*/gi, '')
  desc = desc.replace(/^SEPA\s+\S+\s*/gi, '')
  desc = desc.replace(/,PAS\d+/gi, '')
  desc = desc.replace(/\bPAS\d+/gi, '')
  desc = desc.replace(/NR:[A-Z0-9]+,?\s*/gi, '')
  desc = desc.replace(/\d{2}\.\d{2}\.\d{2}\/\d{2}:\d{2}/g, '')
  desc = desc.replace(/\s{2,}/g, ' ').trim()
  return desc.split(/\t/)[0].trim() || desc
}

// Parse the transactions CSV format used by this app
export function parseTransactionsCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  const iDate = header.indexOf('date')
  const iAmt = header.indexOf('amount')
  const iType = header.indexOf('type')
  const iCat = header.indexOf('category')
  const iSub = header.indexOf('subcategory')
  const iNote = header.indexOf('note')

  const results = []
  for (let i = 1; i < lines.length; i++) {
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
