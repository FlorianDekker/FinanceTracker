// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: file-import;
// ImportTransactions
//
// How to use:
//   1. Export CSV from ABN AMRO internet banking
//   2. Share the file to Scriptable → ImportTransactions
//   3. Review the auto-categorized transactions
//   4. Tap any row to fix its category
//   5. Tap "Opslaan" to save everything

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const dictPath = fm.joinPath(dir, "Dictionary.json")
const csvPath  = fm.joinPath(dir, "Transactions.csv")

if (fm.fileExists(dictPath)) await fm.downloadFileFromiCloud(dictPath)
if (fm.fileExists(csvPath))  await fm.downloadFileFromiCloud(csvPath)

// ─── 1. LOAD INPUT ────────────────────────────────────────────────────────────

let inputText = ""

if (args.fileURLs && args.fileURLs.length > 0) {
  const data = Data.fromFile(args.fileURLs[0])
  if (data) inputText = data.toRawString()
}

// Fallback: read TestTransactions_ABN.csv from iCloud (for testing)
if (!inputText.trim()) {
  const testPath = fm.joinPath(dir, "TestTransactions_ABN.csv")
  if (fm.fileExists(testPath)) {
    await fm.downloadFileFromiCloud(testPath)
    inputText = fm.readString(testPath)
  }
}

if (!inputText.trim()) {
  const a = new Alert()
  a.title = "Geen bestand"
  a.message = "Deel een ABN AMRO CSV via de Share Sheet, of zet TestTransactions_ABN.csv in iCloud om te testen."
  a.addAction("OK")
  await a.present()
  Script.complete()
}

// ─── 2. PARSE ABN AMRO CSV ────────────────────────────────────────────────────

function parseSemicolonLine(line) {
  return line.split(";").map(f => f.trim().replace(/^"|"$/g, ""))
}

function parseABNDate(dateStr) {
  const s = dateStr.replace(/\D/g, "")
  // YYYYMMDD
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  // DD-MM-YYYY
  const parts = dateStr.split("-")
  if (parts.length === 3 && parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return dateStr
}

function parseABNAmount(amountStr) {
  return parseFloat(amountStr.replace(/\./g, "").replace(",", ".")) || 0
}

const lines = inputText.split(/\r?\n/).filter(l => l.trim())

if (lines.length < 2) {
  const a = new Alert()
  a.title = "Leeg bestand"
  a.message = "Het bestand bevat geen transacties."
  a.addAction("OK")
  await a.present()
  Script.complete()
}

const headerCols = parseSemicolonLine(lines[0]).map(h => h.toLowerCase())

// Detect new format: Datum;Naam / Omschrijving;...;Af Bij;Bedrag (EUR);...
const isNewFormat = headerCols.some(h => h.includes("af bij") || h === "datum")
// Detect old format: Rekeningnummer;Muntsoort;Transactiedatum;Beginsaldo;Eindsaldo;...
const isOldFormat = !isNewFormat && headerCols.some(h => h.includes("transactiedatum"))

const colDate   = headerCols.findIndex(h => h === "datum" || h.includes("transactiedatum"))
const colName   = headerCols.findIndex(h => h.includes("naam") || h.includes("omschrijving"))
const colAfBij  = headerCols.findIndex(h => h.includes("af bij"))
const colBedrag = headerCols.findIndex(h => h.includes("bedrag"))
const colBegin  = headerCols.findIndex(h => h.includes("beginsaldo"))
const colEind   = headerCols.findIndex(h => h.includes("eindsaldo"))

if (!isNewFormat && !isOldFormat) {
  const a = new Alert()
  a.title = "Onbekend formaat"
  a.message = "Dit ziet er niet uit als een ABN AMRO export. Probeer een ander bestand."
  a.addAction("OK")
  await a.present()
  Script.complete()
}

const parsed = []
for (let i = 1; i < lines.length; i++) {
  const cols = parseSemicolonLine(lines[i])
  if (cols.length < 3) continue

  let date, merchant, amount, type

  if (isNewFormat) {
    date     = parseABNDate(cols[colDate] || "")
    merchant = (cols[colName] || "").trim()
    amount   = parseABNAmount(cols[colBedrag] || "0")
    type     = (cols[colAfBij] || "").toLowerCase() === "bij" ? "credit" : "debit"
  } else {
    date     = parseABNDate(cols[colDate] || "")
    merchant = (cols[colName] || "").trim()
    const begin = parseABNAmount(cols[colBegin] || "0")
    const eind  = parseABNAmount(cols[colEind]  || "0")
    amount   = Math.abs(eind - begin)
    type     = eind >= begin ? "credit" : "debit"
  }

  if (!date || !merchant || amount <= 0) continue
  parsed.push({ date, merchant, amount, type })
}

if (parsed.length === 0) {
  const a = new Alert()
  a.title = "Geen transacties"
  a.message = "Kon geen geldige transacties lezen uit het bestand."
  a.addAction("OK")
  await a.present()
  Script.complete()
}

// ─── 3. DEDUPLICATION ────────────────────────────────────────────────────────

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

const existingCsv = fm.fileExists(csvPath) ? fm.readString(csvPath) : ""
const existingKeys = new Set()
for (const l of existingCsv.split(/\r?\n/)) {
  if (!l.trim() || l.startsWith("date,")) continue
  const cols = parseCsvLine(l)
  const d = (cols[0]||"").trim()
  const a = (cols[1]||"").trim()
  const t = (cols[2]||"").trim()
  if (d && a && t) existingKeys.add(`${d}|${a}|${t}`)
}

const newTx = parsed.filter(tx => !existingKeys.has(`${tx.date}|${tx.amount}|${tx.type}`))

if (newTx.length === 0) {
  const a = new Alert()
  a.title = "Niets nieuws"
  a.message = "Alle transacties staan al in je CSV."
  a.addAction("OK")
  await a.present()
  Script.complete()
}

// ─── 4. CATEGORY SETUP ───────────────────────────────────────────────────────

const CATEGORY = {
  main: {
    "Woning":                   "woning",
    "Abonnementen":             "abonnementen",
    "Boodschappen":             "boodschappen",
    "Reiskosten":               "reiskosten",
    "Cadeau's overig":          "cadeaus_overig",
    "Sterre":                   "sterre",
    "Gezondheid & verzorging":  "gezondheid_verzorging",
    "Vakantie":                 "vakantie",
    "Afspreken vrienden":       "afspreken_vrienden",
    "Kleding":                  "kleding",
    "Overige kosten":           "overige_kosten",
    "Hobby's":                  "hobbys",
    "Investeren":               "investeren",
    "Bankoverschrijving":       "bankoverschrijving",
    "Salaris":                  "salaris",
  },
  sub: {
    woning: {
      "Huur":                     "huur",
      "Energie":                  "energie",
      "Afvalstoffenheffing":      "afvalstoffenheffing",
      "Waterschapbelasting":      "waterschapbelasting",
      "Woning kopen":             "woning_kopen",
    },
    abonnementen: {
      "Spotify":                  "spotify",
      "Sportabonnement":          "sportabonnement",
      "Telefoon abonnement":      "telefoonabonnement",
      "Zorgverzekering":          "zorgverzekering",
      "Aansprakelijkheidsverzekering": "aansprakelijkheidsverzekering",
    },
    boodschappen: {
      "Supermarkt":               "supermarkt",
      "Eten onderweg":            "eten_onderweg",
      "Met vrienden":             "met_vrienden",
    },
    sterre: {
      "Cadeau's Sterre":          "cadeaus_sterre",
      "Dates Sterre":             "dates_sterre",
    },
    gezondheid_verzorging: {
      "Kapper":                   "kapper",
      "Toilet":                   "toilet",
      "Wasserette":               "wasserette",
    },
    afspreken_vrienden: {
      "Café":                     "cafe",
      "Concerten":                "concerten",
      "Thuis":                    "thuis",
      "Uiteten & afhalen":        "uiteten_afhalen",
    },
    overige_kosten: {
      "Boete":                    "boete",
      "Doneren":                  "doneren",
      "Belasting":                "belasting",
      "Werkgerelateerde kosten":  "werkgerelateerde_kosten",
    },
    hobbys: {
      "Hobby projecten":          "hobby_projecten",
      "Gamen":                    "gamen",
      "Boeken":                   "boeken",
      "Planten":                  "planten",
      "Sporten":                  "sporten",
      "Interieur":                "interieur",
    },
  }
}

const DISPLAY_MAIN = Object.fromEntries(Object.entries(CATEGORY.main).map(([k,v]) => [v,k]))
const DISPLAY_SUB = {}
for (const [mk, subs] of Object.entries(CATEGORY.sub)) {
  DISPLAY_SUB[mk] = Object.fromEntries(Object.entries(subs).map(([k,v]) => [v,k]))
}

// ─── 5. AUTO-CATEGORIZATION ──────────────────────────────────────────────────

// Rules are checked top to bottom; first match wins.
// possiblySterre = true means the row gets a "Sterre?" warning (Sterre is user's girlfriend)
const RULES = [
  // Salaris (credit + high amount checked in function)
  // Woning
  { kw: ["huur", "hypotheek"],                                          cat: "woning",               sub: "huur" },
  { kw: ["vattenfall","eneco","nuon","essent","greenchoice","energie"],  cat: "woning",               sub: "energie" },
  { kw: ["afvalstoffenheffing"],                                         cat: "woning",               sub: "afvalstoffenheffing" },
  { kw: ["waterschapbelasting","waterschap"],                            cat: "woning",               sub: "waterschapbelasting" },
  // Abonnementen
  { kw: ["spotify"],                                                     cat: "abonnementen",         sub: "spotify" },
  { kw: ["basic-fit","basicfit","basic fit","sportschool","fitness"],    cat: "abonnementen",         sub: "sportabonnement" },
  { kw: ["t-mobile","kpn","vodafone","tele2","odido","simpel"],          cat: "abonnementen",         sub: "telefoonabonnement" },
  { kw: ["zorgverzekering","zilveren kruis","vgz","menzis","achmea"],    cat: "abonnementen",         sub: "zorgverzekering" },
  { kw: ["aansprakelijkheids"],                                          cat: "abonnementen",         sub: "aansprakelijkheidsverzekering" },
  // Boodschappen
  { kw: ["albert heijn","ah to go","jumbo","lidl","aldi","vomar","plus supermarkt","boons","spar","dirk","hoogvliet"], cat: "boodschappen", sub: "supermarkt" },
  { kw: ["thuisbezorgd","uber eats","deliveroo","mcdonalds","subway","burger king","dominos","bakker"], cat: "boodschappen", sub: "eten_onderweg" },
  // Gezondheid
  { kw: ["kruidvat","etos","apotheek","da drogist","rituals","drogist"], cat: "gezondheid_verzorging", sub: "" },
  { kw: ["kapper","haircut"],                                            cat: "gezondheid_verzorging", sub: "kapper" },
  { kw: ["wasserette","laundry"],                                        cat: "gezondheid_verzorging", sub: "wasserette" },
  // Reiskosten
  { kw: ["ns reizen","ns ","ov-chipkaart","ov chipkaart","gvb","ret","htm","arriva","connexxion","parkeer","anwb"], cat: "reiskosten", sub: "" },
  // Kleding
  { kw: ["uniqlo","zara","h&m","primark","wehkamp","zalando","cos ","monki","weekday"], cat: "kleding", sub: "" },
  // Vakantie
  { kw: ["booking","airbnb","hotels.com","ryanair","easyjet","klm","transavia","corendon","tui","sunweb"], cat: "vakantie", sub: "" },
  // Afspreken vrienden / possibly Sterre
  { kw: ["cafe ","café","bar ","brouwerij","pub ","restaurant","eetcafe","eetcafé","brasserie","bistro","eten"], cat: "afspreken_vrienden", sub: "uiteten_afhalen", possiblySterre: true },
  { kw: ["cinema","bioscoop","pathe","pathé","vue ","museum","theater","concert"],                               cat: "afspreken_vrienden", sub: "",              possiblySterre: true },
  // Cadeau's
  { kw: ["bol.com","coolblue","mediamarkt","hema","action ","blokker","xenos"],  cat: "cadeaus_overig", sub: "" },
  // Hobby / interieur
  { kw: ["ikea","kwantum","praxis","gamma","hornbach","karwei"],         cat: "hobbys",               sub: "interieur" },
  { kw: ["steam","playstation","xbox","nintendo"],                       cat: "hobbys",               sub: "gamen" },
  // Belasting
  { kw: ["belastingdienst","belasting","cjib"],                          cat: "overige_kosten",       sub: "belasting" },
  // Bankoverschrijving / sparen
  { kw: ["spaarrekening","sparen","oranje spaar"],                       cat: "bankoverschrijving",   sub: "" },
]

function categorize(merchant, amount, type) {
  const m = merchant.toLowerCase()

  // Salaris: credit + amount ≥ 2000
  if (type === "credit" && amount >= 2000) {
    return { cat: "salaris", sub: "", confidence: "high", possiblySterre: false }
  }

  // Other credits (refunds, transfers) → bankoverschrijving
  if (type === "credit") {
    return { cat: "bankoverschrijving", sub: "", confidence: "low", possiblySterre: false }
  }

  for (const rule of RULES) {
    if (rule.kw.some(kw => m.includes(kw))) {
      return {
        cat: rule.cat,
        sub: rule.sub || "",
        confidence: "high",
        possiblySterre: rule.possiblySterre && amount < 150 ? true : false,
      }
    }
  }

  return { cat: "overige_kosten", sub: "", confidence: "low", possiblySterre: false }
}

// Build pending list
const pending = newTx.map(tx => {
  const { cat, sub, confidence, possiblySterre } = categorize(tx.merchant, tx.amount, tx.type)
  return { ...tx, cat, sub, confidence, possiblySterre, note: tx.merchant }
})

// ─── 6. REVIEW UI ─────────────────────────────────────────────────────────────

const MONTHS = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"]

function fmtDate(d) {
  const p = d.split("-")
  if (p.length !== 3) return d
  return `${parseInt(p[2])} ${MONTHS[parseInt(p[1]) - 1]}`
}

function fmtAmount(amount, type) {
  const sign = type === "credit" ? "+" : "-"
  return `${sign}€${amount.toFixed(2).replace(".", ",")}`
}

function mainDisplay(key)       { return DISPLAY_MAIN[key] || key }
function subDisplay(mKey, sKey) { return sKey && DISPLAY_SUB[mKey] ? (DISPLAY_SUB[mKey][sKey] || sKey) : "" }

// NOTE: We never use addCancelAction — it dismisses the UITable in Scriptable.
// All "cancel/back" options are regular addAction entries checked by index.

async function pickMainCat() {
  const displays = Object.keys(CATEGORY.main)
  const a = new Alert()
  a.title = "Kies categorie"
  for (const d of displays) a.addAction(d)
  a.addAction("✕  Annuleren")
  const i = await a.present()
  if (i < 0 || i === displays.length) return null
  return { key: CATEGORY.main[displays[i]] }
}

async function pickSubCat(mainKey) {
  const subs = CATEGORY.sub[mainKey]
  if (!subs || Object.keys(subs).length === 0) return { key: "" }
  const displays = Object.keys(subs)
  const a = new Alert()
  a.title = "Kies subcategorie"
  a.addAction("Geen subcategorie")
  for (const d of displays) a.addAction(d)
  a.addAction("← Terug")
  const i = await a.present()
  const backIdx = displays.length + 1
  if (i < 0 || i === backIdx) return null  // Terug → caller loops
  if (i === 0) return { key: "" }
  return { key: subs[displays[i - 1]] }
}

// Full picker: choosing a main category then subcategory.
// "← Terug" in subcategory loops back to main category picker.
async function pickCategoryFull() {
  while (true) {
    const main = await pickMainCat()
    if (!main) return null
    const sub = await pickSubCat(main.key)
    if (sub !== null) return { cat: main.key, sub: sub.key }
    // sub === null → "Terug" → loop back to main category
  }
}

// Only pick subcategory for an already-chosen main category.
async function pickSubOnly(mainKey) {
  const subs = CATEGORY.sub[mainKey]
  if (!subs || Object.keys(subs).length === 0) {
    const a = new Alert()
    a.title = "Geen subcategorieën"
    a.message = `${mainDisplay(mainKey)} heeft geen subcategorieën.`
    a.addAction("OK")
    await a.present()
    return null
  }
  const sub = await pickSubCat(mainKey)
  if (sub === null) return null
  return { cat: mainKey, sub: sub.key }
}

// ─── COLORS & TABLE ──────────────────────────────────────────────────────────

const C = {
  green:      new Color("#34C759"),
  orange:     new Color("#FF9500"),
  red:        new Color("#FF3B30"),
  blue:       new Color("#007AFF"),
  gray:       new Color("#8E8E93"),
  lightGray:  new Color("#F2F2F7"),
  rowBg:      Color.white(),
  catBg:      new Color("#F9F9FB"),
  headerBg:   new Color("#1C1C1E"),
  white:      Color.white(),
  dark:       new Color("#1C1C1E"),
  label:      new Color("#3C3C43"),
}

const table = new UITable()
table.showSeparators = true

function buildTable() {
  table.removeAllRows()

  // ── Header / save row
  const hRow = new UITableRow()
  hRow.height = 56
  hRow.backgroundColor = C.headerBg
  const hLeft = UITableCell.text("💾  Opslaan", `${pending.length} transacties`)
  hLeft.widthWeight = 70
  hLeft.titleColor    = C.white
  hLeft.subtitleColor = C.gray
  hLeft.titleFont     = Font.boldSystemFont(15)
  hLeft.subtitleFont  = Font.systemFont(12)
  const hRight = UITableCell.text("Alles controleren ↓", "tik een rij om te wijzigen")
  hRight.widthWeight   = 30
  hRight.rightAligned()
  hRight.titleColor    = C.blue
  hRight.subtitleColor = C.gray
  hRight.titleFont     = Font.systemFont(12)
  hRight.subtitleFont  = Font.systemFont(10)
  hRow.addCell(hLeft)
  hRow.addCell(hRight)
  hRow.onSelect = async () => { await saveAll() }
  table.addRow(hRow)

  for (let i = 0; i < pending.length; i++) {
    const tx = pending[i]
    const isCredit = tx.type === "credit"
    const highConf = tx.confidence === "high" && !tx.possiblySterre
    const idx = i

    // ── ROW A: merchant + flag  →  tap to change main category
    const rowA = new UITableRow()
    rowA.height = 52
    rowA.backgroundColor = C.rowBg

    // Amount (left, colored)
    const amtCell = UITableCell.text(fmtAmount(tx.amount, tx.type))
    amtCell.widthWeight  = 28
    amtCell.titleFont    = Font.boldSystemFont(15)
    amtCell.titleColor   = isCredit ? C.green : C.dark

    // Merchant + flag (right)
    const merch     = tx.merchant.length > 24 ? tx.merchant.slice(0,22) + "…" : tx.merchant
    const flagHint  = tx.possiblySterre ? "⚠️ Mogelijk Sterre" : fmtDate(tx.date)
    const merchCell = UITableCell.text(merch, flagHint)
    merchCell.widthWeight    = 72
    merchCell.titleFont      = Font.mediumSystemFont(14)
    merchCell.subtitleFont   = Font.systemFont(11)
    merchCell.titleColor     = C.dark
    merchCell.subtitleColor  = tx.possiblySterre ? C.orange : C.gray

    rowA.addCell(amtCell)
    rowA.addCell(merchCell)
    rowA.onSelect = async () => {
      const result = await pickCategoryFull()
      if (result) {
        pending[idx].cat            = result.cat
        pending[idx].sub            = result.sub
        pending[idx].confidence     = "high"
        pending[idx].possiblySterre = false
        buildTable()
      }
    }
    table.addRow(rowA)

    // ── ROW B: category + subcategory  →  tap to change subcategory
    const rowB = new UITableRow()
    rowB.height = 34
    rowB.backgroundColor = C.catBg

    const indentCell = UITableCell.text("  ↳")
    indentCell.widthWeight = 10
    indentCell.titleFont   = Font.systemFont(11)
    indentCell.titleColor  = C.gray

    const catLabel = mainDisplay(tx.cat)
    const subLabel = subDisplay(tx.cat, tx.sub)
    const catCell  = UITableCell.text(catLabel)
    catCell.widthWeight = 45
    catCell.titleFont   = Font.mediumSystemFont(12)
    catCell.titleColor  = highConf ? C.green : C.orange

    const subCell = UITableCell.text(subLabel || "geen subcategorie")
    subCell.widthWeight = 45
    subCell.rightAligned()
    subCell.titleFont   = Font.systemFont(11)
    subCell.titleColor  = subLabel ? C.label : C.gray

    rowB.addCell(indentCell)
    rowB.addCell(catCell)
    rowB.addCell(subCell)
    rowB.onSelect = async () => {
      const result = await pickSubOnly(pending[idx].cat)
      if (result) {
        pending[idx].sub            = result.sub
        pending[idx].confidence     = "high"
        pending[idx].possiblySterre = false
        buildTable()
      }
    }
    table.addRow(rowB)
  }
}

async function saveAll() {
  const confirm = new Alert()
  confirm.title   = `${pending.length} transacties opslaan?`
  confirm.message = "Dit voegt alle transacties toe aan je CSV en werkt je budget bij."
  confirm.addAction("✓  Opslaan")
  confirm.addAction("✕  Annuleren")
  const r = await confirm.present()
  if (r !== 0) return

  // Load dictionary
  let data = {}
  if (fm.fileExists(dictPath)) data = JSON.parse(fm.readString(dictPath))
  const wrapped  = !!data.categories
  const catsObj  = wrapped ? (data.categories ?? {}) : data

  // Load / init CSV
  const header = "date,amount,type,category,subcategory,note\n"
  let currentCsv = fm.fileExists(csvPath) ? fm.readString(csvPath) : header
  if (!currentCsv.startsWith("date,amount,type,")) currentCsv = header + currentCsv

  for (const tx of pending) {
    const safeNote = tx.note.replace(/\r?\n/g, " ").replace(/"/g, '""')
    currentCsv += `${tx.date},${tx.amount},${tx.type},${tx.cat},${tx.sub},"${safeNote}"\n`

    if (tx.type === "debit") {
      if (!catsObj[tx.cat]) catsObj[tx.cat] = { budget: 0, spent: 0 }
      catsObj[tx.cat].spent = (Number(catsObj[tx.cat].spent) || 0) + tx.amount
    }
  }

  fm.writeString(csvPath, currentCsv)
  if (wrapped) data.categories = catsObj
  else data = catsObj
  fm.writeString(dictPath, JSON.stringify(data, null, 2))

  const done = new Alert()
  done.title   = "Opgeslagen!"
  done.message = `${pending.length} transacties toegevoegd aan je CSV.`
  done.addAction("OK")
  await done.present()

  Script.complete()
}

buildTable()
await table.present()
Script.complete()
