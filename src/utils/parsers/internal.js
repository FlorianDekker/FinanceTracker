// Het eigen CSV-formaat van de app: date,amount,type,category,subcategory,note.
// Gebruikt door de legacy-import (MigrationPage) en de CSV-restore in Instellingen.

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
