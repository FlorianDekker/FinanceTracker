// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: cyan; icon-glyph: magic;
// GetTransactions
// Reads Transactions.csv and returns JSON array to Shortcuts.
// Each item: { index, date, amount, type, category, subcategory, note }
//
// index = 0-based row number (first transaction row after header is index 0)

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const csvPath = fm.joinPath(dir, "Transactions.csv")

if (!fm.fileExists(csvPath)) {
  Script.setShortcutOutput("[]")
  Script.complete()
}

await fm.downloadFileFromiCloud(csvPath)

function parseCsvLine(line) {
  const out = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === "," && !inQuotes) {
      out.push(cur); cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}

function toNum(x) {
  if (typeof x === "string") x = x.replace(",", ".").trim()
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

const txt = fm.readString(csvPath) || ""
const lines = txt.split(/\r?\n/).filter(l => l.trim().length > 0)

const result = []
let idx = 0

for (const line of lines) {
  if (line.startsWith("date,amount,type,category")) continue

  const cols = parseCsvLine(line)
  const date = (cols[0] ?? "").trim()
  const amountStr = (cols[1] ?? "").trim()
  const type = (cols[2] ?? "").trim()
  const category = (cols[3] ?? "").trim()
  const subcategory = (cols[4] ?? "").trim()
  const note = (cols[5] ?? "").trim()

  // Skip garbage rows
  if (!date || !category || !type) continue

  result.push({
    index: idx,
    date,
    amount: toNum(amountStr),
    type,
    category,
    subcategory,
    note: note
  })

  idx++
}

Script.setShortcutOutput(JSON.stringify(result))
Script.complete()