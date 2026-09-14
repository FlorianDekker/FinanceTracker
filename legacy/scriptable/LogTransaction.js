// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: magic;
// LogTransaction (run from Shortcuts)
// Query params expected (display strings, not keys):
// amount, category, subcategory (optional), note (optional), date (optional yyyy-MM-dd), direction (optional: "af"|"bij")
//
// What it does:
// 1) Appends to Transactions.csv with columns: date,amount,type,category,subcategory,note
// 2) Updates Dictionary.json budgets/spent for MAIN categories (only when type = debit)

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()

const dictPath = fm.joinPath(dir, "Dictionary.json")
const csvPath = fm.joinPath(dir, "Transactions.csv")

if (fm.fileExists(dictPath)) await fm.downloadFileFromiCloud(dictPath)
if (fm.fileExists(csvPath)) await fm.downloadFileFromiCloud(csvPath)

// ---- Inputs
const qp = args.queryParameters ?? {}

const categoryDisplay = (qp.category ?? "").toString().trim()
const subcategoryDisplay = (qp.subcategory ?? "").toString().trim()
const noteRaw = (qp.note ?? "").toString().trim()
const dateStr = (qp.date ?? "").toString().trim()

// direction: "af" (spend) or "bij" (income). Optional.
const directionRaw = (qp.direction ?? "").toString().trim().toLowerCase()
const direction = (directionRaw === "af" || directionRaw === "bij") ? directionRaw : ""

// Amount: accept "23,45" or "23.45" (and ignore spaces)
const amountRaw = (qp.amount ?? "").toString().trim()
const amountNormStr = amountRaw.replace(/\s/g, "").replace(",", ".")
let amount = Number(amountNormStr)
if (!Number.isFinite(amount)) throw new Error("Invalid amount")
amount = Math.abs(amount) // user never needs to type minus

if (!categoryDisplay) throw new Error("Missing category")

// Date
const df = new DateFormatter()
df.dateFormat = "yyyy-MM-dd"
const date = dateStr ? dateStr : df.string(new Date())

// ---- Mapping: display -> keys
const CATEGORY = {
  main: {
    "Woning": "woning",
    "Abonnementen": "abonnementen",
    "Boodschappen": "boodschappen",
    "Reiskosten": "reiskosten",
    "Cadeau's overig": "cadeaus_overig",
    "Cadeau’s overig": "cadeaus_overig",
    "Sterre": "sterre",
    "Gezondheid & verzorging": "gezondheid_verzorging",
    "Vakantie": "vakantie",
    "Afspreken vrienden": "afspreken_vrienden",
    "Kleding": "kleding",
    "Overige kosten": "overige_kosten",
    "Hobby's": "hobbys",
    "Hobby’s": "hobbys",
    "Investeren": "investeren",
    "Bankoverschrijving": "bankoverschrijving",
    "Salaris": "salaris",
  },
  sub: {
    woning: {
      "Huur": "huur",
      "Energie": "energie",
      "Afvalstoffenheffing": "afvalstoffenheffing",
      "Waterschapbelasting": "waterschapbelasting",
      "Woning kopen": "woning_kopen",
    },
    abonnementen: {
      "Spotify": "spotify",
      "Sportabonnement": "sportabonnement",
      "Telefoon abonnement": "telefoonabonnement",
      "Zorgverzekering": "zorgverzekering",
      "Aansprakelijkheidsverzekering": "aansprakelijkheidsverzekering",
    },
    boodschappen: {
      "Supermarkt": "supermarkt",
      "Eten onderweg": "eten_onderweg",
      "Met vrienden": "met_vrienden",
    },
    sterre: {
      "Cadeau's Sterre": "cadeaus_sterre",
      "Cadeau’s Sterre": "cadeaus_sterre",
      "Dates Sterre": "dates_sterre",
    },
    gezondheid_verzorging: {
      "Kapper": "kapper",
      "Toilet": "toilet",
      "Wasserette": "wasserette",
    },
    afspreken_vrienden: {
      "Café": "cafe",
      "Concerten": "concerten",
      "Thuis": "thuis",
      "Uiteten & afhalen": "uiteten_afhalen",
    },
    overige_kosten: {
      "Boete": "boete",
      "Doneren": "doneren",
      "Belasting": "belasting",
      "Werkgerelateerde kosten": "werkgerelateerde_kosten",
    },
    hobbys: {
      "Hobby projecten": "hobby_projecten",
      "Gamen": "gamen",
      "Boeken": "boeken",
      "Planten": "planten",
      "Sporten": "sporten",
      "Interieur": "interieur",
    },
  },
}

// Main key
const mainKey = CATEGORY.main[categoryDisplay]
if (!mainKey) throw new Error(`Unknown category: ${categoryDisplay}`)

// Sub key (optional)
let subKey = ""
if (subcategoryDisplay) {
  subKey = (CATEGORY.sub[mainKey] && CATEGORY.sub[mainKey][subcategoryDisplay]) ? CATEGORY.sub[mainKey][subcategoryDisplay] : ""
  if (!subKey) throw new Error(`Unknown subcategory "${subcategoryDisplay}" for category "${categoryDisplay}"`)
}

// ---- Type logic
// Default: based on category
let type = "debit"
if (mainKey === "salaris") type = "credit"
if (mainKey === "investeren" || mainKey === "bankoverschrijving") type = "transfer"

// If user explicitly chose af/bij, override debit/credit (but keep transfers as transfer)
if (type !== "transfer" && direction) {
  type = (direction === "bij") ? "credit" : "debit"
}

// ---- Append to CSV
const header = "date,amount,type,category,subcategory,note\n"
if (!fm.fileExists(csvPath)) {
  fm.writeString(csvPath, header)
} else {
  const existing = fm.readString(csvPath)
  if (!existing || !existing.startsWith("date,amount,type,")) {
    fm.writeString(csvPath, header + existing)
  }
}

const safeAmount = String(amount) // normalized with dot
const safeNote = noteRaw.replace(/\r?\n/g, " ").replace(/"/g, '""')
const safeSub = subKey ? subKey : ""
const line = `${date},${safeAmount},${type},${mainKey},${safeSub},"${safeNote}"\n`

const currentCsv = fm.readString(csvPath)
fm.writeString(csvPath, currentCsv + line)

// ---- Update Dictionary.json (only for debit categories)
let data = {}
if (fm.fileExists(dictPath)) data = JSON.parse(fm.readString(dictPath))

const wrapped = !!data.categories
const catsObj = wrapped ? (data.categories ?? {}) : data

if (!catsObj[mainKey]) catsObj[mainKey] = { budget: 0, spent: 0 }

if (type === "debit") {
  const currentSpent = Number(catsObj[mainKey].spent ?? 0)
  catsObj[mainKey].spent = currentSpent + amount
}

// Write back
if (wrapped) data.categories = catsObj
else data = catsObj

fm.writeString(dictPath, JSON.stringify(data, null, 2))

Script.complete()