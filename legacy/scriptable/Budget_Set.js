// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: gray; icon-glyph: magic;
// Budget_Set (called from Shortcuts as TEXT parameter)
// Expected input (two lines):
// key=bankoverschrijving
// budget=200
//
// Writes Dictionary.json budgets only (wrapper: { categories: {...} })

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const dictPath = fm.joinPath(dir, "Dictionary.json")

if (fm.fileExists(dictPath)) await fm.downloadFileFromiCloud(dictPath)

const raw = (args.shortcutParameter ?? "").toString()
if (!raw.trim()) throw new Error("No input received")

// Parse key=value lines
const params = {}
for (const line of raw.split(/\r?\n/)) {
  const t = line.trim()
  if (!t) continue
  const i = t.indexOf("=")
  if (i === -1) continue
  const k = t.slice(0, i).trim()
  const v = t.slice(i + 1).trim()
  params[k] = v
}

const key = (params.key ?? "").toString().trim()
const budgetRaw = (params.budget ?? "").toString().trim()

if (!key) throw new Error("Missing key")

const budget = Number(budgetRaw.replace(",", "."))
if (!Number.isFinite(budget)) throw new Error("Invalid budget")

// Load or init Dictionary.json (always wrapper)
let data = {}
if (fm.fileExists(dictPath)) {
  try { data = JSON.parse(fm.readString(dictPath) || "{}") }
  catch (e) { data = {} }
}

const cats =
  (data.categories && typeof data.categories === "object")
    ? data.categories
    : {}

if (!cats[key] || typeof cats[key] !== "object") cats[key] = {}
cats[key].budget = budget

data.categories = cats
fm.writeString(dictPath, JSON.stringify(data, null, 2))


Script.complete()