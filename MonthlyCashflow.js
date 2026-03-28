// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: light-brown; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: yellow; icon-glyph: magic;
// Small Widget: Salary vs Savings (fixes left/right clipping WITHOUT shrinking visible chart)
// ✅ Avg savings rate header slightly lower
// ✅ Chart slightly less tall
// ✅ Header + chart centered
// ✅ Roundness = 0.25
// ✅ Fix: draw with BLEED canvas so edges never get cut
// ✅ Fix: only count SALARIS (and OVERIGE_KOSTEN) as earned income; other credits are treated as refunds (reduce expenses)
// CSV: iCloud Drive/Scriptable/Transactions.csv

//////////////////////
// SETTINGS
//////////////////////
const USE_ICLOUD = true
const CSV_PATH = "Transactions.csv"

const DELIMITER = ","
const DECIMAL_COMMA = false

const COL_DATE = "date"
const COL_AMOUNT = "amount"
const COL_TYPE = "type"

// Optional column used to detect salary/refunds (auto-detected if left null)
const COL_CATEGORY = null  // e.g. "category" or "omschrijving" (leave null to auto-detect)

// Credits that match these keywords are treated as "earned income"
const EARNED_INCOME_KEYWORDS = ["salaris", "salary", "loon", "overige_kosten"]

const TYPE_INCOME = "credit"
const TYPE_EXPENSE = "debit"

const MONTHS_TO_SHOW = 6

// Style
const BG = new Color("#111111")
const GREEN = new Color("#4CAF50")
const RED = new Color("#D32F2F")
const GRAY = new Color("#aaaaaa")

// Roundness of bars
const ROUNDNESS = 0.25

// Widget padding (symmetric!)
const PAD_T = 10, PAD_L = 12, PAD_B = 10, PAD_R = 12

// Desired visible chart size
const DESIRED_CHART_W = 160
const CHART_H = 128
const SCALE = 2

// IMPORTANT: extra invisible buffer on left/right inside the image (in POINTS)
const BLEED = 3  // try 2, 3, 4

//////////////////////
// WIDTH HELPERS
//////////////////////
function widgetWidthForFamily(fam) {
  if (fam === "small") return 155
  if (fam === "medium") return 329
  if (fam === "large") return 329
  return 155
}

//////////////////////
// MAIN
//////////////////////
const fm = FileManager[USE_ICLOUD ? "iCloud" : "local"]()
const dir = fm.documentsDirectory()
const path = fm.joinPath(dir, CSV_PATH)

if (!(await existsAndDownload(fm, path, USE_ICLOUD))) {
  const w = new ListWidget()
  w.backgroundColor = BG
  w.setPadding(PAD_T, PAD_L, PAD_B, PAD_R)
  centeredRow(w, "CSV not found", 11, GRAY)
  Script.setWidget(w)
  Script.complete()
  return
}

const csvText = fm.readString(path)
const rows = parseCSV(csvText, DELIMITER)

if (rows.length < 2) {
  const w = new ListWidget()
  w.backgroundColor = BG
  w.setPadding(PAD_T, PAD_L, PAD_B, PAD_R)
  centeredRow(w, "No data", 11, GRAY)
  Script.setWidget(w)
  Script.complete()
  return
}

const header = rows[0].map(s => String(s ?? "").trim().toLowerCase())
const idxDate = header.indexOf(COL_DATE)
const idxAmount = header.indexOf(COL_AMOUNT)
const idxType = header.indexOf(COL_TYPE)

// Try to find a category/description column to identify salary vs refunds
let idxCat = -1
if (COL_CATEGORY) {
  idxCat = header.indexOf(String(COL_CATEGORY).trim().toLowerCase())
} else {
  const candidates = ["category", "categorie", "omschrijving", "description", "name", "memo", "note"]
  for (const c of candidates) {
    const j = header.indexOf(c)
    if (j >= 0) { idxCat = j; break }
  }
}

if (idxDate < 0 || idxAmount < 0 || idxType < 0) {
  const w = new ListWidget()
  w.backgroundColor = BG
  w.setPadding(PAD_T, PAD_L, PAD_B, PAD_R)
  centeredRow(w, "Bad CSV header", 11, GRAY)
  Script.setWidget(w)
  Script.complete()
  return
}

function isEarnedIncomeRow(text) {
  const s = String(text ?? "").toLowerCase()
  return EARNED_INCOME_KEYWORDS.some(k => s.includes(k))
}

// Aggregate per month
const byMonth = new Map()

for (let i = 1; i < rows.length; i++) {
  const r = rows[i]
  if (!r || r.length === 0) continue

  const dateStr = String(r[idxDate] ?? "").trim()
  const typeStr = String(r[idxType] ?? "").trim().toLowerCase()
  let amountStr = String(r[idxAmount] ?? "").trim()

  if (!dateStr || !typeStr || !amountStr) continue
  if (DECIMAL_COMMA) amountStr = amountStr.replace(/\./g, "").replace(",", ".")
  const amount = Number(amountStr)
  if (!Number.isFinite(amount)) continue

  const ym = toMonthKey(dateStr)
  if (!ym) continue

  if (!byMonth.has(ym)) byMonth.set(ym, { income: 0, expense: 0, refund: 0 })
  const m = byMonth.get(ym)

  const catText = idxCat >= 0 ? r[idxCat] : ""
  const earnedIncome = idxCat >= 0 ? isEarnedIncomeRow(catText) : true
  // ^ If you don't have a category/description column, we can't detect it,
  // so we fall back to old behavior (all credits count as income).

  if (typeStr === TYPE_INCOME) {
    if (earnedIncome) {
      // Earned income (salary + allowed categories like overige_kosten)
      m.income += amount
    } else {
      // Other credits: refunds / reimbursements => reduce expenses
      m.refund += amount
    }
  } else if (typeStr === TYPE_EXPENSE) {
    m.expense += amount
  }
}

let months = Array.from(byMonth.keys()).sort()
if (months.length === 0) {
  const w = new ListWidget()
  w.backgroundColor = BG
  w.setPadding(PAD_T, PAD_L, PAD_B, PAD_R)
  centeredRow(w, "No usable tx", 11, GRAY)
  Script.setWidget(w)
  Script.complete()
  return
}

if (months.length > MONTHS_TO_SHOW)
  months = months.slice(months.length - MONTHS_TO_SHOW)

// Build arrays (expenses are net of non-earned credits/refunds)
const income = months.map(m => byMonth.get(m).income)
const expense = months.map(m => Math.max(0, byMonth.get(m).expense - (byMonth.get(m).refund || 0)))

const saved = months.map((_, i) => Math.max(0, income[i] - expense[i]))
const pct = months.map((_, i) => income[i] > 0 ? (saved[i] / income[i]) * 100 : 0)
const labels = months.map(monthLabelFromYYYYMM)

// Avg savings rate (weighted)
const totalIncome = income.reduce((s, x) => s + x, 0)
const totalSaved = saved.reduce((s, x) => s + x, 0)
const avgPct = totalIncome > 0 ? (totalSaved / totalIncome) * 100 : 0

//////////////////////
// WIDGET
//////////////////////
const widget = new ListWidget()
widget.backgroundColor = BG
widget.setPadding(PAD_T, PAD_L, PAD_B, PAD_R)

const fam = config.widgetFamily ?? "small"
const widgetW = widgetWidthForFamily(fam)
const contentW = widgetW - PAD_L - PAD_R

// Chart width must fit content area
const CHART_W = Math.min(DESIRED_CHART_W, contentW)

// Header a bit down
widget.addSpacer(4)

// Centered header
const headerRow = widget.addStack()
headerRow.layoutHorizontally()
headerRow.size = new Size(contentW, 0)
headerRow.addSpacer()

const headerText = headerRow.addText(`Avg savings rate: ${Math.round(avgPct)}%`)
headerText.font = Font.mediumSystemFont(10)
headerText.textColor = GRAY

headerRow.addSpacer()

widget.addSpacer(8)

// Centered chart (with BLEED canvas)
const chartImg = drawSalarySavedChartWithBleed(
  income,
  saved,
  pct,
  labels,
  CHART_W,
  CHART_H,
  SCALE,
  ROUNDNESS,
  BLEED
)

const chartRow = widget.addStack()
chartRow.layoutHorizontally()
chartRow.size = new Size(contentW, 0)
chartRow.addSpacer()

const imgView = chartRow.addImage(chartImg)
imgView.imageSize = new Size(CHART_W, CHART_H)
imgView.resizable = true
imgView.cornerRadius = 12

chartRow.addSpacer()

Script.setWidget(widget)
Script.complete()

//////////////////////
// DRAWING (with BLEED)
//////////////////////
function drawSalarySavedChartWithBleed(incomeArr, savedArr, pctArr, labels, visibleW, visibleH, scale, roundness, bleedPts) {
  const bleed = bleedPts * scale

  // Make canvas slightly wider, but keep SAME visible size in widget
  const canvasW = visibleW * scale + 2 * bleed
  const canvasH = visibleH * scale

  const ctx = new DrawContext()
  ctx.size = new Size(canvasW, canvasH)
  ctx.respectScreenScale = true
  ctx.opaque = false

  // Background
  ctx.setFillColor(BG)
  ctx.fillRect(new Rect(0, 0, canvasW, canvasH))

  // We draw the chart in a "viewport" that starts at x = bleed
  const offsetX = bleed
  const width = visibleW * scale
  const height = visibleH * scale

  const padTop = 6 * scale
  const padBottom = 20 * scale
  const padSide = 8 * scale

  const plotW = width - padSide * 2
  const plotH = height - padTop - padBottom

  const maxIncome = Math.max(...incomeArr, 1)
  const n = incomeArr.length
  const gap = 10 * scale
  const barW = Math.max(14 * scale, Math.floor((plotW - gap * (n - 1)) / n))
  const usedW = barW * n + gap * (n - 1)
  const startX = offsetX + padSide + Math.floor((plotW - usedW) / 2)

  ctx.setTextAlignedCenter()

  for (let i = 0; i < n; i++) {
    const inc = incomeArr[i]
    const sav = Math.min(savedArr[i], inc)
    const p = pctArr[i]

    const barH = Math.max(2 * scale, Math.round((inc / maxIncome) * plotH))
    const savH = Math.round((sav / maxIncome) * plotH)

    const x = startX + i * (barW + gap)
    const y = padTop + (plotH - barH)

    drawRounded(ctx, new Rect(x, y, barW, barH), RED, roundness)

    if (savH > 0) {
      const gy = padTop + (plotH - savH)
      drawRounded(ctx, new Rect(x, gy, barW, savH), GREEN, roundness)
    }

    if (barH >= 18 * scale) {
      const t = `${Math.round(p)}%`
      ctx.setFont(Font.semiboldSystemFont(9 * scale))

      // shadow (this is a common cause of “edge clipping”)
      ctx.setTextColor(new Color("#000000", 0.35))
      ctx.drawTextInRect(t, new Rect(x, y + barH / 2 - 7 * scale + 1 * scale, barW, 14 * scale))

      ctx.setTextColor(new Color("#ffffff", 0.95))
      ctx.drawTextInRect(t, new Rect(x, y + barH / 2 - 7 * scale, barW, 14 * scale))
    }

    ctx.setFont(Font.systemFont(9 * scale))
    ctx.setTextColor(new Color("#aaaaaa", 0.85))
    ctx.drawTextInRect(labels[i], new Rect(x, padTop + plotH + 3 * scale, barW, 14 * scale))
  }

  return ctx.getImage()
}

function drawRounded(ctx, rect, color, roundness) {
  const r = Math.max(1, Math.floor(Math.min(rect.width, rect.height) * roundness))
  const p = new Path()
  p.addRoundedRect(rect, r, r)
  ctx.setFillColor(color)
  ctx.addPath(p)
  ctx.fillPath()
}

//////////////////////
// HELPERS
//////////////////////
async function existsAndDownload(fm, path, icloud) {
  if (!fm.fileExists(path)) return false
  if (icloud) await fm.downloadFileFromiCloud(path)
  return true
}

function parseCSV(text, delimiter = ",") {
  const rows = []
  let row = [], cur = "", inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (c === '"') {
      if (inQuotes && n === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (!inQuotes && c === delimiter) {
      row.push(cur); cur = ""
    } else if (!inQuotes && (c === "\n" || c === "\r")) {
      if (c === "\r" && n === "\n") i++
      row.push(cur); rows.push(row)
      row = []; cur = ""
    } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(c => String(c).trim() !== ""))
}

function toMonthKey(dateStr) {
  const m = dateStr.match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  const d = new Date(dateStr)
  return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function monthLabelFromYYYYMM(ym) {
  return {
    "01":"jan","02":"feb","03":"mar","04":"apr","05":"mei","06":"jun",
    "07":"jul","08":"aug","09":"sep","10":"okt","11":"nov","12":"dec"
  }[ym.slice(5,7)]
}

function centeredRow(widget, text, size, color) {
  const r = widget.addStack()
  r.layoutHorizontally()
  r.addSpacer()
  const t = r.addText(text)
  t.font = Font.mediumSystemFont(size)
  t.textColor = color
  r.addSpacer()
}