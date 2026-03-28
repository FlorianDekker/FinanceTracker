// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;
// UpdateTransaction (run from Shortcuts)
//
// Query params expected:
// index (required, 0-based after header)
// date (optional yyyy-MM-dd)
// amount (optional, "12,34" or "12.34")
// type (optional: debit|credit|transfer)
// category (optional, key like "boodschappen")
// subcategory (optional, key like "supermarkt" or empty)
// note (optional)
//
// If a field is omitted, the existing value is kept.
// It rewrites the CSV line at that index.

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const csvPath = fm.joinPath(dir, "Transactions.csv")

if (!fm.fileExists(csvPath)) throw new Error("Transactions.csv not found")
await fm.downloadFileFromiCloud(csvPath)

const qp = args.queryParameters ?? {}

function requireParam(name) {
  const v = (qp[name] ?? "").toString().trim()
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

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

function csvEscape(s) {
  s = (s ?? "").toString()
  s = s.replace(/\r?\n/g, " ").replace(/"/g, '""')
  return `"${s}"`
}

function normAmount(raw) {
  const s = (raw ?? "").toString().trim()
  if (!s) return null
  const n = Number(s.replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(n)) throw new Error("Invalid amount")
  return Math.abs(n)
}

function opt(name) {
  const v = (qp[name] ?? "").toString()
  // IMPORTANT: when parameter is absent, qp[name] is undefined -> "" after ??, but we need to know if it was provided.
  // We'll detect by checking if key exists in qp:
  if (!(name in qp)) return null
  return v.toString().trim()
}

// ---- required index
const indexStr = requireParam("index")
const index = Number(indexStr)
if (!Number.isInteger(index) || index < 0) throw new Error("Invalid index")

// ---- read all lines
const txt = fm.readString(csvPath) || ""
const lines = txt.split(/\r?\n/)

// Find header + data lines (keep exact structure)
let headerLineIndex = -1
for (let i = 0; i < lines.length; i++) {
  if ((lines[i] || "").startsWith("date,amount,type,category")) {
    headerLineIndex = i
    break
  }
}
if (headerLineIndex === -1) throw new Error("CSV header not found")

// Build list of actual transaction line indices (in the file) after header
const txLineIndices = []
for (let i = headerLineIndex + 1; i < lines.length; i++) {
  const l = (lines[i] ?? "")
  if (l.trim().length === 0) continue
  txLineIndices.push(i)
}

if (index >= txLineIndices.length) throw new Error("Index out of range")

const targetLineNo = txLineIndices[index]
const oldLine = lines[targetLineNo]
const cols = parseCsvLine(oldLine)

// Existing values
const oldDate = (cols[0] ?? "").trim()
const oldAmount = (cols[1] ?? "").trim()
const oldType = (cols[2] ?? "").trim()
const oldCategory = (cols[3] ?? "").trim()
const oldSubcategory = (cols[4] ?? "").trim()
let oldNote = (cols[5] ?? "").trim()
// Note might already include quotes removed by parser; keep as-is

// Incoming optional updates
const newDate = opt("date")
const newAmountRaw = opt("amount")
const newType = opt("type")
const newCategory = opt("category")
const newSubcategory = opt("subcategory")
const newNote = opt("note")

// Validate date format if provided
if (newDate !== null && newDate.length > 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) throw new Error("Invalid date format (yyyy-MM-dd)")
}

// Validate type if provided
if (newType !== null && newType.length > 0) {
  if (!["debit", "credit", "transfer"].includes(newType)) throw new Error("Invalid type")
}

// Amount normalization if provided
const newAmount = (newAmountRaw !== null && newAmountRaw.length > 0) ? normAmount(newAmountRaw) : null

// Apply updates (keep old if not provided)
const outDate = (newDate !== null && newDate.length > 0) ? newDate : oldDate
const outAmount = (newAmount !== null) ? String(newAmount) : oldAmount
const outType = (newType !== null && newType.length > 0) ? newType : oldType
const outCategory = (newCategory !== null && newCategory.length > 0) ? newCategory : oldCategory
const outSubcategory = (newSubcategory !== null) ? newSubcategory : oldSubcategory
oldNote = oldNote.replace(/^"(.*)"$/, "$1") // just in case
const outNoteVal = (newNote !== null) ? newNote : oldNote

// Build new CSV line (note must be quoted)
const newLine = `${outDate},${outAmount},${outType},${outCategory},${outSubcategory},${csvEscape(outNoteVal)}`

// Replace and write back
lines[targetLineNo] = newLine
fm.writeString(csvPath, lines.join("\n"))

Script.setShortcutOutput("OK")
Script.complete()