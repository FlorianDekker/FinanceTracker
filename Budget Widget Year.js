// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: magic;

// ===============================
// BIG Readable Budget Widget (2×2 / extraLarge)
// "Monthly Scoreboard"
//
// Update you asked now:
// ✅ Salaris (YTD) is shown on the SAME footer row, centered between YTD and Avg/mo
// (So footer is back to 1 row; no second row / no divider.)
// ===============================

if (!config.runsInWidget) Script.complete()

const fm = FileManager.iCloud()
const dir = fm.documentsDirectory()
const dictPath = fm.joinPath(dir, "Dictionary.json")
const csvPath = fm.joinPath(dir, "Transactions.csv")

await fm.downloadFileFromiCloud(dictPath)
if (fm.fileExists(csvPath)) await fm.downloadFileFromiCloud(csvPath)

const raw = JSON.parse(fm.readString(dictPath))
const cats = raw.categories ?? raw ?? {}

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

const SALARIS_CATEGORY = "salaris"
const IGNORE_FOR_BUDGET = new Set([SALARIS_CATEGORY])

const now = new Date()
const YEAR = now.getFullYear()
const CUR_MONTH = now.getMonth() + 1

function toNum(x) {
  if (typeof x === "string") x = x.replace(",", ".")
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}
function monthLabel(m) {
  const L = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return L[m - 1] ?? String(m)
}
function euro0(n) {
  return "€" + Math.round(n).toString()
}
function euroSigned(n) {
  const s = n < 0 ? "-" : "+"
  return s + euro0(Math.abs(n))
}
function clamp01(x) { return Math.max(0, Math.min(1, x)) }

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

// ===== Budget (MATCH Remaining widget): sum ALL dictionary categories except salaris =====
const ALL_KEYS = Object.keys(cats).filter(k => !IGNORE_FOR_BUDGET.has(k))
let totalMonthlyBudget = ALL_KEYS.reduce((sum, k) => sum + toNum(cats[k]?.budget), 0)
totalMonthlyBudget = Math.max(0, totalMonthlyBudget)

// ===== Aggregate spending per month/category (net credits) + salaris income =====
const spent = {}
for (const { key } of CATEGORY_ORDER) spent[key] = Array(13).fill(0)

const salarisIncome = Array(13).fill(0)

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

    const y = Number(date.slice(0, 4))
    const m = Number(date.slice(5, 7))
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue
    if (y !== YEAR) continue
    if (m < 1 || m > 12) continue

    const amt = toNum(amount)

    if (category === SALARIS_CATEGORY) {
      if (type === "credit") salarisIncome[m] += amt
      continue
    }

    if (!spent[category]) continue

    if (type === "debit") spent[category][m] += amt
    else if (type === "credit") spent[category][m] -= amt
  }
}

// Month totals + top icon
const monthTotal = Array(13).fill(0)
const monthTopIcon = Array(13).fill("")

for (let m = 1; m <= 12; m++) {
  let sum = 0
  let topV = -Infinity
  let topIcon = ""

  for (const { key, icon } of CATEGORY_ORDER) {
    const v = spent[key][m] ?? 0
    sum += v
    if (v > topV) { topV = v; topIcon = v > 0 ? icon : "" }
  }

  monthTotal[m] = sum
  monthTopIcon[m] = topIcon
}

// YTD spend + avg spend
let ytd = 0
for (let m = 1; m <= Math.min(CUR_MONTH, 12); m++) ytd += monthTotal[m]
const ytdMonths = Math.max(1, Math.min(CUR_MONTH, 12))
const avg = ytd / ytdMonths

// YTD salaris
let ytdSalaris = 0
for (let m = 1; m <= Math.min(CUR_MONTH, 12); m++) ytdSalaris += salarisIncome[m]

// ===== Widget =====
const widget = new ListWidget()
widget.backgroundColor = new Color("#111111")
widget.setPadding(10, 10, 10, 10)

const family = config.widgetFamily ?? "extraLarge"
const W = widget.contentSize?.width ?? (family === "extraLarge" ? 640 : 320)
const H = widget.contentSize?.height ?? (family === "extraLarge" ? 320 : 320)

const img = drawScoreboard(W, H)
const iv = widget.addImage(img)
iv.imageSize = new Size(W, H)

widget.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000)
Script.setWidget(widget)
Script.complete()

function drawScoreboard(W, H) {
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = false
  ctx.respectScreenScale = true

  const BG = new Color("#111111")
  const PANEL = new Color("#151515")
  const BORDER = new Color("#ffffff", 0.10)
  const TEXT = new Color("#ffffff", 0.92)
  const MUTED = new Color("#ffffff", 0.55)
  const GREEN = new Color("#4CAF50")
  const RED = new Color("#D32F2F")

  ctx.setFillColor(BG)
  ctx.fillRect(new Rect(0, 0, W, H))

  const pad = 10
  const titleH = 28
  const footerH = 34

  const titleRect = new Rect(pad, pad, W - pad * 2, titleH)
  const gridRect = new Rect(pad, pad + titleH + 6, W - pad * 2, H - pad * 2 - titleH - footerH - 10)
  const footerRect = new Rect(pad, H - pad - footerH, W - pad * 2, footerH)

  // Title
  ctx.setTextAlignedLeft()
  ctx.setFont(Font.semiboldSystemFont(15))
  ctx.setTextColor(TEXT)
  ctx.drawTextInRect(`Monthly Budget ${YEAR}`, new Rect(titleRect.x, titleRect.y + 4, titleRect.width, titleRect.height))

  ctx.setTextAlignedRight()
  ctx.setFont(Font.mediumSystemFont(11))
  ctx.setTextColor(MUTED)
  ctx.drawTextInRect(`Budget/mo ${euro0(totalMonthlyBudget)}`, new Rect(titleRect.x, titleRect.y + 6, titleRect.width, titleRect.height))

  // Grid background
  ctx.setFillColor(PANEL)
  ctx.fillRect(gridRect)

  // Tiles layout (4×3)
  const cols = 4
  const rows = 3
  const gap = 8

  const tileW = Math.floor((gridRect.width - gap * (cols + 1)) / cols)
  const tileH = Math.floor((gridRect.height - gap * (rows + 1)) / rows)

  const cap = Math.max(1, totalMonthlyBudget)
  function tileTint(diff) {
    const t = clamp01(Math.abs(diff) / cap)
    const alpha = 0.10 + 0.35 * t
    return diff >= 0 ? new Color("#4CAF50", alpha) : new Color("#D32F2F", alpha)
  }

  for (let i = 0; i < 12; i++) {
    const m = i + 1
    const rr = Math.floor(i / cols)
    const cc = i % cols

    const x = gridRect.x + gap + cc * (tileW + gap)
    const y = gridRect.y + gap + rr * (tileH + gap)
    const rect = new Rect(x, y, tileW, tileH)

    const isFuture = m > CUR_MONTH
    const spentM = monthTotal[m]
    const diff = totalMonthlyBudget - spentM

    ctx.setFillColor(new Color("#0f0f0f", 0.25))
    fillRounded(ctx, rect, 12)

    if (!isFuture) {
      ctx.setFillColor(tileTint(diff))
      fillRounded(ctx, new Rect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2), 11)
    } else {
      ctx.setFillColor(new Color("#ffffff", 0.03))
      fillRounded(ctx, new Rect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2), 11)
    }

    ctx.setStrokeColor(BORDER)
    ctx.setLineWidth(1)
    strokeRounded(ctx, rect, 12)

    // Month label
    ctx.setTextAlignedLeft()
    ctx.setFont(Font.semiboldSystemFont(11))
    ctx.setTextColor(MUTED)
    ctx.drawTextInRect(monthLabel(m), new Rect(rect.x + 10, rect.y + 8, rect.width - 20, 14))

    // Top icon
    const icon = (!isFuture ? (monthTopIcon[m] || "") : "")
    if (icon) {
      ctx.setTextAlignedRight()
      ctx.setFont(Font.systemFont(14))
      ctx.setTextColor(new Color("#ffffff", 0.85))
      ctx.drawTextInRect(icon, new Rect(rect.x + 10, rect.y + 6, rect.width - 20, 16))
    }

    // Big spent
    ctx.setTextAlignedCenter()
    ctx.setFont(Font.boldSystemFont(16))
    ctx.setTextColor(isFuture ? new Color("#ffffff", 0.35) : TEXT)
    const big = isFuture ? "—" : euro0(spentM)
    ctx.drawTextInRect(big, new Rect(rect.x + 6, rect.y + Math.floor(rect.height * 0.34), rect.width - 12, 20))

    // +/- diff
    ctx.setFont(Font.semiboldSystemFont(11))
    const over = diff < 0
    const smallColor = isFuture ? new Color("#ffffff", 0.30) : (over ? RED : GREEN)
    ctx.setTextColor(smallColor)
    const small = isFuture ? "" : `${euroSigned(diff)}`
    ctx.drawTextInRect(small, new Rect(rect.x + 6, rect.y + rect.height - 22, rect.width - 12, 14))
  }

  // Footer background
  ctx.setFillColor(PANEL)
  ctx.fillRect(footerRect)
  ctx.setStrokeColor(BORDER)
  ctx.setLineWidth(1)
  ctx.strokeRect(footerRect)

  // Footer: 3 columns (YTD | Salaris | Avg)
  const leftW = Math.floor(footerRect.width * 0.34)
  const midW = Math.floor(footerRect.width * 0.32)
  const rightW = footerRect.width - leftW - midW

  // Left: YTD spend
  ctx.setTextAlignedLeft()
  ctx.setFont(Font.semiboldSystemFont(12))
  ctx.setTextColor(TEXT)
  ctx.drawTextInRect(`YTD: ${euro0(ytd)}`, new Rect(footerRect.x + 10, footerRect.y + 8, leftW - 10, footerRect.height))

  // Middle: Salaris YTD (centered)
  ctx.setTextAlignedCenter()
  ctx.setFont(Font.mediumSystemFont(12))
  ctx.setTextColor(new Color("#ffffff", 0.78))
  ctx.drawTextInRect(`Salaris: ${euro0(ytdSalaris)}`, new Rect(footerRect.x + leftW, footerRect.y + 8, midW, footerRect.height))

  // Right: Avg/mo
  ctx.setTextAlignedRight()
  ctx.setFont(Font.mediumSystemFont(12))
  ctx.setTextColor(MUTED)
  ctx.drawTextInRect(`Avg/mo: ${euro0(avg)}`, new Rect(footerRect.x + leftW + midW, footerRect.y + 8, rightW - 10, footerRect.height))

  return ctx.getImage()
}

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