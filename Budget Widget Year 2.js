// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;

// ===============================
// BIG Budget Grid Widget (2x2 / "extraLarge")
//
// Update you asked NOW:
// ✅ Decrease the outer box a bit from LEFT + RIGHT only
// (more margin left/right, same top/bottom)
// ===============================

if (!config.runsInWidget) Script.complete()

// ===== Files =====
const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const dictPath = fm.joinPath(dir, "Dictionary.json")
const csvPath = fm.joinPath(dir, "Transactions.csv")

await fm.downloadFileFromiCloud(dictPath)
if (fm.fileExists(csvPath)) await fm.downloadFileFromiCloud(csvPath)

const raw = JSON.parse(fm.readString(dictPath))
const cats = raw.categories ?? raw ?? {}

// ===== Time =====
const now = new Date()
const YEAR = now.getFullYear()
const CUR_MONTH = now.getMonth() + 1

const MIN_MONTHS = 6
const MONTHS_SHOWN = Math.min(12, Math.max(MIN_MONTHS, CUR_MONTH))

// ===== Display categories (rows) =====
const CATEGORY_ORDER = [
  { key: "boodschappen", icon: "🛒" },
  { key: "sterre", icon: "🥰" },
  { key: "gezondheid_verzorging", icon: "⚕️" },
  { key: "reiskosten", icon: "🚅" },

  { key: "afspreken_vrienden", icon: "👬" },
  { key: "kleding", icon: "👕" },
  { key: "vakantie", icon: "✈️" },
  { key: "cadeaus_overig", icon: "🎁" },

  { key: "abonnementen", icon: "📱" },
  { key: "hobbys", icon: "🧑‍🎨" },
  { key: "woning", icon: "🏠" },
  { key: "overige_kosten", icon: "🧾" },
]

// Ignore income categories completely
const IGNORE_CATEGORIES = new Set(["salaris"])

// Match Remaining widget behavior (net credits)
const CREDIT_MODE = "net"

// ===== Label formatting (manual wraps) =====
// Second line will be forced to start lowercase automatically.
const LABEL_MAP = {
  boodschappen: "Bood-\nSchappen",
  sterre: "Sterre",
  gezondheid_verzorging: "Gezond-\nHeid",
  reiskosten: "Reis-\nKosten",

  afspreken_vrienden: "Afspreken\nVrienden",
  kleding: "Kleding",
  vakantie: "Vakantie",
  cadeaus_overig: "Cadeaus\nOverig",

  abonnementen: "Abonne-\nMent(en)",
  hobbys: "Hobby’s",
  woning: "Woning",
  overige_kosten: "Overige\nKosten",
}

// ===== Helpers =====
function toNum(x) {
  if (typeof x === "string") x = x.replace(",", ".")
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

function euroCell(n) {
  const abs = Math.abs(n)
  if (abs >= 100) return "€" + Math.round(n).toString()
  const v = Math.round(n * 100) / 100
  let s = String(v)
  if (s.includes(".")) {
    const parts = s.split(".")
    const a = parts[0]
    const b = parts[1] ?? ""
    s = a + "," + (b.length === 1 ? b + "0" : b.slice(0, 2))
  } else {
    s = s + ",00"
  }
  return "€" + s
}

function euroDiff(n) {
  const sign = n < 0 ? "-" : "+"
  return sign + euroCell(Math.abs(n))
}

function monthLabel(m) {
  const L = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return L[m - 1] ?? String(m)
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

function clamp01(x) { return Math.max(0, Math.min(1, x)) }

function titleCaseWord(w) {
  if (!w) return ""
  return w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase()
}

function defaultTwoLineLabel(key) {
  const parts = key.split("_").map(titleCaseWord)
  if (parts.length <= 1) return parts[0] ?? ""
  const mid = Math.ceil(parts.length / 2)
  const a = parts.slice(0, mid).join(" ")
  const b = parts.slice(mid).join(" ")
  return a + "\n" + b
}

function labelForKey(key) {
  return LABEL_MAP[key] ?? defaultTwoLineLabel(key)
}

// Force any 2nd line to start lowercase
function lowerStart(s) {
  if (!s || s.length === 0) return s
  const c = s.charAt(0)
  return c.toLowerCase() + s.slice(1)
}

// ===== Total monthly budget (ALL Dictionary categories excluding salaris) =====
const ALL_KEYS = Object.keys(cats).filter(k => !IGNORE_CATEGORIES.has(k))
const totalMonthlyBudgetAll = ALL_KEYS.reduce((sum, k) => sum + toNum(cats[k]?.budget), 0)

// ===== Spend aggregation =====
const spent = {}
for (const { key } of CATEGORY_ORDER) spent[key] = Array(13).fill(0)

const monthTotalAll = Array(13).fill(0)

if (fm.fileExists(csvPath)) {
  const lines = (fm.readString(csvPath) || "").split(/\r?\n/).filter(Boolean)

  for (const line of lines) {
    if (line.startsWith("date,amount,type,category")) continue

    const cols = parseCsvLine(line)
    const date = (cols[0] ?? "").trim()
    const amount = (cols[1] ?? "").trim()
    const type = (cols[2] ?? "").trim()
    const category = (cols[3] ?? "").trim()

    if (!date || !category) continue
    if (IGNORE_CATEGORIES.has(category)) continue

    const y = Number(date.slice(0, 4))
    const m = Number(date.slice(5, 7))
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue
    if (y !== YEAR) continue
    if (m < 1 || m > 12) continue
    if (m > CUR_MONTH) continue

    const amt = toNum(amount)

    let sign = 0
    if (type === "debit") sign = 1
    else if (type === "credit") sign = (CREDIT_MODE === "net" ? -1 : 0)
    else continue

    monthTotalAll[m] += sign * amt
    if (spent[category]) spent[category][m] += sign * amt
  }
}

// Per-row max for heat intensity
const rowMax = {}
for (const { key } of CATEGORY_ORDER) {
  let mx = 0
  for (let m = 1; m <= CUR_MONTH; m++) mx = Math.max(mx, spent[key][m] ?? 0)
  rowMax[key] = mx
}

// ===== Widget =====
const widget = new ListWidget()
widget.backgroundColor = new Color("#111111")
widget.setPadding(0, 0, 0, 0)

const family = config.widgetFamily ?? "extraLarge"
const contentSize = widget.contentSize
let W = contentSize?.width
let H = contentSize?.height

if (!W || !H) {
  if (family === "extraLarge") { W = 640; H = 320 }
  else if (family === "large") { W = 340; H = 340 }
  else { W = 320; H = 320 }
}

const img = drawGridImage(W, H)

const s = widget.addStack()
s.size = new Size(W, H)
s.layoutHorizontally()
s.centerAlignContent()

const iv = s.addImage(img)
iv.resizable = true
iv.imageSize = new Size(W, H)
iv.applyFillingContentMode()

widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000)
Script.setWidget(widget)
Script.complete()

// ===== Drawing =====
function drawGridImage(W, H) {
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = false
  ctx.respectScreenScale = true

  const BG = new Color("#111111")
  const PANEL_TOP = new Color("#161616")
  const PANEL_BOT = new Color("#1b1b1b")
  const STROKE = new Color("#ffffff", 0.06)
  const TEXT = new Color("#ffffff", 0.92)
  const MUTED = new Color("#ffffff", 0.55)
  const MUTED2 = new Color("#ffffff", 0.35)
  const GREEN = new Color("#4CAF50")
  const RED = new Color("#D32F2F")

  ctx.setFillColor(BG)
  ctx.fillRect(new Rect(0, 0, W, H))

  // ✅ Horizontal padding increased (smaller outer box left/right)
  // Keep vertical padding as before.
  const padX = 10
  const padY = 2

  const ox = padX
  const oy = padY
  const usedW = W - padX * 2
  const usedH = H - padY * 2

  const topHeaderH = 22
  const bottomTotalsH = 26

  // Wider month columns by shrinking label column
  const leftLabelW = 88

  const panelRect = new Rect(ox, oy, usedW, usedH)

  ctx.setFillColor(new Color("#ffffff", 0.03))
  fillRounded(ctx, new Rect(panelRect.x - 2, panelRect.y - 2, panelRect.width + 4, panelRect.height + 4), 18)
  fillVerticalGradient(ctx, panelRect, PANEL_TOP, PANEL_BOT, 18)

  // Column widths (spread remainder so no right gap)
  const usableMonthW = Math.max(1, usedW - leftLabelW)
  const baseCellW = Math.floor(usableMonthW / MONTHS_SHOWN)
  const extraW = usableMonthW - baseCellW * MONTHS_SHOWN

  const monthX = Array(MONTHS_SHOWN + 1).fill(0)
  const monthW = Array(MONTHS_SHOWN + 1).fill(0)
  let xCursor = ox + leftLabelW
  for (let m = 1; m <= MONTHS_SHOWN; m++) {
    const wCol = baseCellW + (m <= extraW ? 1 : 0)
    monthX[m] = xCursor
    monthW[m] = wCol
    xCursor += wCol
  }

  // Row heights (spread remainder so no bottom gap)
  const ROWS = CATEGORY_ORDER.length
  const usableRowsH = Math.max(1, usedH - topHeaderH - bottomTotalsH)
  const baseRowH = Math.floor(usableRowsH / ROWS)
  const extraH = usableRowsH - baseRowH * ROWS

  const rowY = Array(ROWS).fill(0)
  const rowH = Array(ROWS).fill(0)
  let yCursor = oy + topHeaderH
  for (let r = 0; r < ROWS; r++) {
    const hRow = baseRowH + (r < extraH ? 1 : 0)
    rowY[r] = yCursor
    rowH[r] = hRow
    yCursor += hRow
  }
  const totalsY = yCursor

  // Month header
  ctx.setFont(Font.semiboldSystemFont(11))
  ctx.setTextColor(MUTED)
  ctx.setTextAlignedCenter()
  for (let m = 1; m <= MONTHS_SHOWN; m++) {
    ctx.drawTextInRect(monthLabel(m), new Rect(monthX[m], oy + 2, monthW[m], topHeaderH))
  }

  const cellPad2 = 1
  const corner = 8

  // Keep category font size (do not reduce)
  const labelFont = Font.semiboldSystemFont(10)
  const iconFont = Font.semiboldSystemFont(12)
  const cellFont = Font.semiboldSystemFont(10)
  const diffFont = Font.mediumSystemFont(9)

  const labelLineH = 13
  const cellLineH = 12
  const diffLineH = 11

  // Rows
  for (let r = 0; r < ROWS; r++) {
    const { key, icon } = CATEGORY_ORDER[r]
    const y = rowY[r]
    const hRow = rowH[r]

    // Icon
    ctx.setTextAlignedLeft()
    ctx.setFont(iconFont)
    ctx.setTextColor(TEXT)
    ctx.drawTextInRect(icon, new Rect(ox + 6, y + Math.floor((hRow - 14) / 2), 18, hRow))

    // Label
    ctx.setFont(labelFont)
    ctx.setTextColor(MUTED)

    const label = labelForKey(key)
    const lines = label.split("\n")
    const line1 = lines[0] ?? ""
    const line2raw = lines[1] ?? ""
    const line2 = line2raw ? lowerStart(line2raw) : ""

    const labelX = ox + 26
    const labelW = leftLabelW - 30

    if (!line2) {
      const ly = y + Math.floor((hRow - labelLineH) / 2)
      ctx.drawTextInRect(line1, new Rect(labelX, ly, labelW, labelLineH))
    } else {
      const blockH = labelLineH * 2
      const topY = y + Math.floor((hRow - blockH) / 2)
      ctx.drawTextInRect(line1, new Rect(labelX, topY, labelW, labelLineH))
      ctx.drawTextInRect(line2, new Rect(labelX, topY + labelLineH, labelW, labelLineH))
    }

    const mx = rowMax[key] || 0

    for (let m = 1; m <= MONTHS_SHOWN; m++) {
      const x = monthX[m]
      const wCol = monthW[m]
      const baseRect = new Rect(x + cellPad2, y + cellPad2, wCol - cellPad2 * 2, hRow - cellPad2 * 2)

      if (m > CUR_MONTH) {
        ctx.setFillColor(new Color("#ffffff", 0.03))
        fillRounded(ctx, baseRect, corner)
        ctx.setStrokeColor(new Color("#ffffff", 0.04))
        ctx.setLineWidth(1)
        strokeRounded(ctx, baseRect, corner)
        continue
      }

      const v = spent[key][m] ?? 0
      const t = mx > 0 ? clamp01(v / mx) : 0

      ctx.setFillColor(new Color("#000000", 0.18))
      fillRounded(ctx, baseRect, corner)

      if (t > 0) {
        const redA = 0.08 + 0.30 * t
        const greenA = 0.22 + 0.22 * (1 - t)

        ctx.setFillColor(new Color("#4CAF50", greenA))
        fillRounded(ctx, baseRect, corner)

        ctx.setFillColor(new Color("#D32F2F", redA))
        fillRounded(ctx, baseRect, corner)
      }

      ctx.setStrokeColor(STROKE)
      ctx.setLineWidth(1)
      strokeRounded(ctx, baseRect, corner)

      ctx.setTextAlignedCenter()
      ctx.setFont(cellFont)
      ctx.setTextColor(TEXT)
      const ty = y + Math.floor((hRow - cellLineH) / 2)
      ctx.drawTextInRect(euroCell(v), new Rect(x, ty, wCol, cellLineH))
    }
  }

  // Bottom totals strip
  ctx.setFillColor(new Color("#000000", 0.12))
  ctx.fillRect(new Rect(ox, totalsY, usedW, bottomTotalsH))

  ctx.setTextAlignedLeft()
  ctx.setFont(Font.semiboldSystemFont(11))
  ctx.setTextColor(TEXT)
  ctx.drawTextInRect("Total", new Rect(ox + 8, totalsY + Math.floor((bottomTotalsH - 14) / 2), leftLabelW - 10, 14))

  for (let m = 1; m <= MONTHS_SHOWN; m++) {
    const x = monthX[m]
    const wCol = monthW[m]
    const baseRect = new Rect(x + cellPad2, totalsY + cellPad2, wCol - cellPad2 * 2, bottomTotalsH - cellPad2 * 2)

    if (m > CUR_MONTH) {
      ctx.setFillColor(new Color("#ffffff", 0.03))
      fillRounded(ctx, baseRect, corner)
      ctx.setStrokeColor(new Color("#ffffff", 0.04))
      ctx.setLineWidth(1)
      strokeRounded(ctx, baseRect, corner)
      continue
    }

    const v = monthTotalAll[m]
    const diff = totalMonthlyBudgetAll - v
    const over = diff < 0

    ctx.setFillColor(over ? new Color("#D32F2F", 0.20) : new Color("#4CAF50", 0.18))
    fillRounded(ctx, baseRect, corner)

    ctx.setStrokeColor(STROKE)
    ctx.setLineWidth(1)
    strokeRounded(ctx, baseRect, corner)

    const blockH = cellLineH + diffLineH
    const topY = totalsY + Math.floor((bottomTotalsH - blockH) / 2)

    ctx.setTextAlignedCenter()
    ctx.setFont(cellFont)
    ctx.setTextColor(TEXT)
    ctx.drawTextInRect(euroCell(v), new Rect(x, topY, wCol, cellLineH))

    ctx.setFont(diffFont)
    ctx.setTextColor(over ? RED : GREEN)
    ctx.drawTextInRect(euroDiff(diff), new Rect(x, topY + cellLineH, wCol, diffLineH))
  }

  // Year label
  ctx.setTextAlignedLeft()
  ctx.setFont(Font.semiboldSystemFont(11))
  ctx.setTextColor(MUTED2)
  ctx.drawTextInRect(String(YEAR), new Rect(ox + 6, oy + 2, leftLabelW - 10, topHeaderH))

  return ctx.getImage()
}

// ---- Drawing helpers ----
function fillRounded(ctx, rect, r) {
  const p = new Path()
  p.addRoundedRect(rect, r, r)
  ctx.addPath(p)
  ctx.fillPath()
}

function strokeRounded(ctx, rect, r) {
  const p = new Path()
  p.addRoundedRect(rect, r, r)
  ctx.addPath(p)
  ctx.strokePath()
}

function fillVerticalGradient(ctx, rect, topColor, bottomColor, radius) {
  const steps = 18
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1)
    const a = 0.92 - 0.25 * t
    const c = t < 0.5 ? topColor : bottomColor
    ctx.setFillColor(new Color(c.hex, a))
    const y = rect.y + Math.floor(rect.height * (i / steps))
    const h = Math.ceil(rect.height / steps) + 1
    const band = new Rect(rect.x, y, rect.width, h)
    if (i === 0) fillRounded(ctx, band, radius)
    else ctx.fillRect(band)
  }
  ctx.setFillColor(new Color("#ffffff", 0.03))
  fillRounded(ctx, new Rect(rect.x, rect.y, rect.width, Math.floor(rect.height * 0.25)), radius)
}