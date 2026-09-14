// Gedeelde, afhankelijkheidsvrije CSV-lezer.
//
// Waarom niet SheetJS (`XLSX.read(text, { type: 'string' })`)? Getest: die
// interpreteert celwaarden (BOM blijft staan, "20260901" wordt het getal
// 20260901, "12,50" wordt 1250 en "2026-09-01" een Excel-serienummer). Voor
// bankbestanden hebben we de ruwe tekst nodig, dus lezen we zelf.

export function stripBom(text) {
  return String(text ?? '').replace(/^\uFEFF/, '')
}

/**
 * Splitst CSV-tekst in rijen met cellen. Ondersteunt quotes, verdubbelde
 * quotes ("" -> "), CRLF/CR/LF en newlines binnen een gequote cel.
 */
export function parseCsv(text, delimiter = ',') {
  const s = stripBom(text).replace(/\r\n?/g, '\n')
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === delimiter) { row.push(cur); cur = '' }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += ch
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }

  // Lege regels (ook die met alleen scheidingstekens) vallen af.
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''))
}

const CANDIDATES = [';', ',', '\t', '|']

// Telt scheidingstekens buiten quotes in de eerste regel(s) en kiest de winnaar.
export function sniffDelimiter(text, candidates = CANDIDATES) {
  const line = firstLine(text)
  let best = candidates[0]
  let bestCount = -1
  for (const d of candidates) {
    const count = countOutsideQuotes(line, d)
    if (count > bestCount) { best = d; bestCount = count }
  }
  return bestCount > 0 ? best : ','
}

export function firstLine(text) {
  const s = stripBom(text).replace(/\r\n?/g, '\n')
  for (const line of s.split('\n')) {
    if (line.trim()) return line
  }
  return ''
}

function countOutsideQuotes(line, ch) {
  let n = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (!inQuotes && c === ch) n++
  }
  return n
}

// Normaliseert een kolomnaam: quotes weg, spaties samen, kleine letters.
export function normHeader(value) {
  return stripBom(value).replace(/"/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

// Map van genormaliseerde kolomnaam -> index.
export function headerIndex(headerRow = []) {
  const map = {}
  headerRow.forEach((name, i) => {
    const key = normHeader(name)
    if (key && !(key in map)) map[key] = i
  })
  return map
}

// Zoekt een kolomindex op één of meer (genormaliseerde) namen; -1 als niets past.
export function findCol(index, ...names) {
  for (const name of names) {
    const key = normHeader(name)
    if (key in index) return index[key]
  }
  return -1
}

export const cell = (row, i) => (i >= 0 ? String(row[i] ?? '').trim() : '')
