// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-brown; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;
// Budget Pace vs Actual Spend (VARIABLE budget)
// - Ideal pace line (gray)
// - Actual line: green below ideal, red above ideal
// - Subtitle: Ahead = green, Behind = red
// - Wider chart (uses almost full widget width)

// Files (iCloud Scriptable folder):
// - Dictionary.json
// - Transactions.csv

//////////////////////
// SETTINGS
//////////////////////
const USE_ICLOUD = true
const DICT_FILE = "Dictionary.json"
const CSV_FILE = "Transactions.csv"

const FIXED_CATEGORIES = new Set(["woning", "abonnementen", "vakantie", "reiskosten"])

const COL_DATE = "date"
const COL_AMOUNT = "amount"
const COL_TYPE = "type"
const COL_CATEGORY = "category"
const COL_SUBCATEGORY = "subcategory"

// ✅ Exclude: category overige_kosten + subcategory belasting
// (robust: matches "belasting", "belasting_*", ".*belasting.*")
const EXCL_CATEGORY = "overige_kosten"
const EXCL_SUBCATEGORY = "belasting"

// Header alias support (different CSV exports)
const SUBCATEGORY_ALIASES = [
  "subcategory", "sub_category", "sub category",
  "subcategorie", "sub_categorie", "sub categorie",
  "subcategory_name", "subcategorie_naam"
]

const BG = new Color("#111111")
const GRAY = new Color("#aaaaaa")

const IDEAL = new Color("#aaaaaa", 0.65)
const GREEN = new Color("#4CAF50")
const RED = new Color("#D32F2F")

// Widget padding
const PAD_T = 15, PAD_L = 2, PAD_B = 15, PAD_R = 2

// Chart height (wider chart uses contentW)
const CHART_H = 115

// Crisp + anti-edge-clipping
const SCALE = 2
const BLEED = 3

// Inner chart padding (slightly tighter to enlarge plot area)
const INNER_PAD_L = 28
const INNER_PAD_R = 6
const INNER_PAD_T = 6
const INNER_PAD_B = 14

const Y_TICKS = 5

//////////////////////
// FILES
//////////////////////
const fm = FileManager[USE_ICLOUD ? "iCloud" : "local"]()
const dir = fm.documentsDirectory()
const dictPath = fm.joinPath(dir, DICT_FILE)
const csvPath = fm.joinPath(dir, CSV_FILE)

await downloadIfNeeded(dictPath)
await downloadIfNeeded(csvPath)

//////////////////////
// LOAD VARIABLE BUDGET
//////////////////////
let totalBudgetVariable = 0
try {
  const raw = JSON.parse(fm.readString(dictPath))
  const cats = raw.categories ?? raw ?? {}
  for (const key of Object.keys(cats)) {
    const k = String(key).trim().toLowerCase()
    const b = toNum(cats[key]?.budget)
    if (!FIXED_CATEGORIES.has(k)) totalBudgetVariable += b
  }
} catch {
  totalBudgetVariable = 0
}

//////////////////////
// LOAD CSV + DAILY VARIABLE SPEND (DEBIT ONLY)
//////////////////////
const now = new Date()
const year = now.getFullYear()
const month = now.getMonth() + 1
const daysInMonth = new Date(year, month, 0).getDate()
const todayDay = now.getDate()

const spendingByDay = Array(daysInMonth + 1).fill(0)

if (fm.fileExists(csvPath)) {
  const lines = (fm.readString(csvPath) || "").split(/\r?\n/).filter(Boolean)
  if (lines.length > 1) {
    const header = parseCsvLine(lines[0]).map(h => String(h).trim().toLowerCase())

    const iDate = header.indexOf(COL_DATE)
    const iAmt = header.indexOf(COL_AMOUNT)
    const iType = header.indexOf(COL_TYPE)
    const iCat = header.indexOf(COL_CATEGORY)

    // Detect subcategory column (supports multiple header names)
    let iSub = header.indexOf(COL_SUBCATEGORY)
    if (iSub === -1) {
      for (const name of SUBCATEGORY_ALIASES) {
        const idx = header.indexOf(name)
        if (idx !== -1) { iSub = idx; break }
      }
    }

    const ymPrefix = `${year}-${String(month).padStart(2, "0")}`

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i])

      const date = String(cols[iDate] ?? "").trim()
      if (!date.startsWith(ymPrefix)) continue

      const type = String(cols[iType] ?? "").trim().toLowerCase()
      if (type !== "debit") continue

      const amt = toNum(cols[iAmt])

      // Normalize to be tolerant of spaces/dashes/case
      const catRaw = String(cols[iCat] ?? "").trim().toLowerCase()
      const subRaw = iSub >= 0 ? String(cols[iSub] ?? "").trim().toLowerCase() : ""

      const cat = normKey(catRaw)
      const subcat = normKey(subRaw)

      if (FIXED_CATEGORIES.has(cat)) continue

      // ✅ Robust exclusion:
      // - exact match: overige_kosten + belasting
      // - also excludes: "belasting_*", "*_belasting_*", etc.
      // - also excludes if both words are embedded in category field
      const excludedByCatSub =
        cat.includes(EXCL_CATEGORY) && subcat.includes(EXCL_SUBCATEGORY)

      const excludedPackedInCategory =
        cat.includes(EXCL_CATEGORY) && cat.includes(EXCL_SUBCATEGORY)

      if (excludedByCatSub || excludedPackedInCategory) continue

      const day = parseInt(date.slice(8, 10), 10)
      if (!Number.isFinite(day) || day < 1 || day > daysInMonth) continue
      spendingByDay[day] += amt
    }
  }
}

//////////////////////
// BUILD CUMULATIVE LINES
//////////////////////
const actualCum = []
let run = 0
for (let d = 1; d <= daysInMonth; d++) {
  run += spendingByDay[d]
  actualCum.push(run)
}

const idealCum = []
for (let d = 1; d <= daysInMonth; d++) {
  idealCum.push((d / daysInMonth) * totalBudgetVariable)
}

const maxY = Math.max(totalBudgetVariable, ...actualCum, 1)

// Today pace diff
const td = Math.max(1, Math.min(daysInMonth, todayDay))
const actualToday = actualCum[td - 1] ?? 0
const idealToday = idealCum[td - 1] ?? 0
const diff = idealToday - actualToday // positive => ahead
const isAhead = diff >= 0

// Current amount to show in brackets
const currentAmountLabel = `€${Math.round(actualToday)}`

//////////////////////
// WIDGET
//////////////////////
const widget = new ListWidget()
widget.backgroundColor = BG
widget.setPadding(PAD_T, PAD_L, PAD_B, PAD_R)

// Title
const headerRow = widget.addStack()
headerRow.layoutHorizontally()
headerRow.addSpacer()
const title = headerRow.addText("Budget pace (variable)")
title.font = Font.mediumSystemFont(10)
title.textColor = GRAY
headerRow.addSpacer()

// Subtitle (colored)
widget.addSpacer(2)
const subRow = widget.addStack()
subRow.layoutHorizontally()
subRow.addSpacer()

const subText = isAhead
  ? `Ahead €${Math.round(diff)} (${currentAmountLabel})`
  : `Behind €${Math.round(-diff)} (${currentAmountLabel})`

const sub = subRow.addText(subText)
sub.font = Font.semiboldSystemFont(10)
sub.textColor = isAhead ? GREEN : RED

subRow.addSpacer()

widget.addSpacer(4)

// Width clamp (wider chart uses almost full content width)
const family = config.widgetFamily ?? "small"
const widgetW = (family === "small" ? 155 : 329)
const contentW = widgetW - PAD_L - PAD_R

// Wider chart: nearly full content width
const chartW = Math.max(100, contentW - 1)
const chartH = CHART_H

const img = drawPaceChartWithBleed(
  chartW, chartH,
  idealCum, actualCum,
  daysInMonth, td,
  maxY
)

// Center chart
const chartRow = widget.addStack()
chartRow.layoutHorizontally()
chartRow.size = new Size(contentW, 0)
chartRow.addSpacer()

const iv = chartRow.addImage(img)
iv.imageSize = new Size(chartW, chartH)
iv.resizable = true
iv.cornerRadius = 12

chartRow.addSpacer()

Script.setWidget(widget)
Script.complete()

//////////////////////
// DRAWING
//////////////////////
function drawPaceChartWithBleed(visibleW, visibleH, idealArr, actualArr, days, today, maxY) {
  const bleed = BLEED * SCALE
  const w = visibleW * SCALE
  const h = visibleH * SCALE

  const ctx = new DrawContext()
  ctx.size = new Size(w + 2 * bleed, h)
  ctx.respectScreenScale = true
  ctx.opaque = false

  ctx.setFillColor(BG)
  ctx.fillRect(new Rect(0, 0, ctx.size.width, ctx.size.height))

  const offsetX = bleed

  const padL = INNER_PAD_L * SCALE
  const padR = INNER_PAD_R * SCALE
  const padT = INNER_PAD_T * SCALE
  const padB = INNER_PAD_B * SCALE

  const plotX = offsetX + padL
  const plotY = padT
  const plotW = w - padL - padR
  const plotH = h - padT - padB

  // axes
  ctx.setStrokeColor(new Color("#ffffff", 0.10))
  ctx.setLineWidth(1 * SCALE)
  strokeLine(ctx, plotX, plotY, plotX, plotY + plotH, 1)
  strokeLine(ctx, plotX, plotY + plotH, plotX + plotW, plotY + plotH, 1)

  // y ticks + grid + labels
  ctx.setFont(Font.systemFont(8 * SCALE))
  ctx.setTextAlignedRight()

  for (let i = 0; i < Y_TICKS; i++) {
    const t = i / (Y_TICKS - 1)
    const yVal = (1 - t) * maxY
    const y = plotY + t * plotH

    ctx.setStrokeColor(new Color("#ffffff", 0.06))
    ctx.setLineWidth(1 * SCALE)
    strokeLine(ctx, plotX, y, plotX + plotW, y, 1)

    ctx.setTextColor(new Color("#ffffff", 0.35))
    ctx.drawTextInRect(
      euroCompact(yVal),
      new Rect(offsetX + 2, y - 6 * SCALE, padL - 6, 12 * SCALE)
    )
  }

  const xForDay = (d) => plotX + ((d - 1) / Math.max(1, (days - 1))) * plotW
  const yForVal = (v) => plotY + plotH - (v / maxY) * plotH

  // Ideal line
  strokePolyline(ctx, idealArr, IDEAL, 2, xForDay, yForVal)

  // Actual segmented line
  strokeSegmentedLine(ctx, actualArr, idealArr, xForDay, yForVal)

  // Today marker
  const tValA = actualArr[today - 1] ?? 0
  const tValI = idealArr[today - 1] ?? 0
  const isBelow = tValA <= tValI

  const tx = xForDay(today)
  const ty = yForVal(tValA)

  ctx.setFillColor(new Color("#000000", 0.35))
  ctx.fillEllipse(new Rect(tx - 5 * SCALE + 1, ty - 5 * SCALE + 1, 10 * SCALE, 10 * SCALE))
  ctx.setFillColor(new Color("#ffffff", 0.95))
  ctx.fillEllipse(new Rect(tx - 5 * SCALE, ty - 5 * SCALE, 10 * SCALE, 10 * SCALE))

  ctx.setFillColor(isBelow ? GREEN : RED)
  ctx.fillEllipse(new Rect(tx - 2.5 * SCALE, ty - 2.5 * SCALE, 5 * SCALE, 5 * SCALE))

  // x labels
  ctx.setTextAlignedCenter()
  ctx.setTextColor(new Color("#ffffff", 0.35))
  ctx.setFont(Font.systemFont(8 * SCALE))
  ctx.drawTextInRect("1", new Rect(plotX - 6 * SCALE, plotY + plotH + 1 * SCALE, 12 * SCALE, 12 * SCALE))
  ctx.drawTextInRect(String(days), new Rect(plotX + plotW - 10 * SCALE, plotY + plotH + 1 * SCALE, 20 * SCALE, 12 * SCALE))

  return ctx.getImage()
}

function strokeSegmentedLine(ctx, actual, ideal, xMap, yMap) {
  ctx.setLineWidth(3 * SCALE)

  for (let i = 0; i < actual.length - 1; i++) {
    const a1 = actual[i], a2 = actual[i + 1]
    const b1 = ideal[i],  b2 = ideal[i + 1]

    const x1 = xMap(i + 1), x2 = xMap(i + 2)
    const y1 = yMap(a1),    y2 = yMap(a2)

    const below1 = a1 <= b1
    const below2 = a2 <= b2

    if (below1 === below2) {
      ctx.setStrokeColor(below1 ? GREEN : RED)
      strokeLine(ctx, x1, y1, x2, y2, 3)
    } else {
      const denom = ((a2 - a1) - (b2 - b1))
      const t = denom === 0 ? 0.5 : (b1 - a1) / denom

      const xi = x1 + t * (x2 - x1)
      const yi = y1 + t * (y2 - y1)

      ctx.setStrokeColor(below1 ? GREEN : RED)
      strokeLine(ctx, x1, y1, xi, yi, 3)

      ctx.setStrokeColor(below1 ? RED : GREEN)
      strokeLine(ctx, xi, yi, x2, y2, 3)
    }
  }
}

function strokePolyline(ctx, arr, color, lwPts, xMap, yMap) {
  const p = new Path()
  for (let i = 0; i < arr.length; i++) {
    const x = xMap(i + 1)
    const y = yMap(arr[i])
    if (i === 0) p.move(new Point(x, y))
    else p.addLine(new Point(x, y))
  }
  ctx.setStrokeColor(color)
  ctx.setLineWidth(lwPts * SCALE)
  ctx.addPath(p)
  ctx.strokePath()
}

function strokeLine(ctx, x1, y1, x2, y2, lwPts) {
  const p = new Path()
  p.move(new Point(x1, y1))
  p.addLine(new Point(x2, y2))
  ctx.setLineWidth(lwPts * SCALE)
  ctx.addPath(p)
  ctx.strokePath()
}

//////////////////////
// HELPERS
//////////////////////
async function downloadIfNeeded(p) {
  try {
    if (!fm.fileExists(p)) return
    if (USE_ICLOUD) await fm.downloadFileFromiCloud(p)
  } catch {}
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
    } else cur += ch
  }
  out.push(cur)
  return out
}

function toNum(x) {
  if (typeof x === "string") x = x.replace(",", ".")
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

function euroCompact(n) {
  const v = Math.round(n)
  if (v >= 10000) return `${Math.round(v / 1000)}k`
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`
  return String(v)
}

function normKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[–—-]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/__+/g, "_")
}