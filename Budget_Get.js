// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: magic;
// Budget_Get (called from Shortcuts)
// - Ensures Dictionary.json exists
// - Ensures wrapper { categories: {...} }
// - Ensures every main category exists with budget 0
// - Returns a flat object: { key: budgetNumber }

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const dictPath = fm.joinPath(dir, "Dictionary.json")

const MAIN_KEYS = [
  "woning",
  "abonnementen",
  "boodschappen",
  "reiskosten",
  "cadeaus_overig",
  "sterre",
  "gezondheid_verzorging",
  "vakantie",
  "afspreken_vrienden",
  "kleding",
  "overige_kosten",
  "hobbys",
  "investeren",
  "bankoverschrijving",
  "salaris",
]

// Ensure iCloud file is available if it exists
if (fm.fileExists(dictPath)) await fm.downloadFileFromiCloud(dictPath)

// Load (or init)
let data = {}
if (fm.fileExists(dictPath)) {
  try { data = JSON.parse(fm.readString(dictPath) || "{}") }
  catch (e) { data = {} }
}

// Preserve wrapper
const wrapped = true
const cats = (data.categories && typeof data.categories === "object") ? data.categories : {}

// Ensure all main categories exist with budget 0
for (const k of MAIN_KEYS) {
  if (!cats[k] || typeof cats[k] !== "object") cats[k] = {}
  if (cats[k].budget == null) cats[k].budget = 0
}

// Write back (this creates the file if missing)
data = { ...data, categories: cats }
fm.writeString(dictPath, JSON.stringify(data, null, 2))

// Return flat { key: budget }
const out = {}
for (const k of Object.keys(cats)) {
  const b = Number(cats[k]?.budget ?? 0)
  out[k] = Number.isFinite(b) ? b : 0
}

Script.setShortcutOutput(out)
Script.complete()