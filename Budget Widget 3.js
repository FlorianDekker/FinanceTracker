// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: teal; icon-glyph: magic;

// ===============================
// Budget Widget 3 (Hybrid, NO header)
// Categories: abonnementen, hobbys, woning, overige_kosten
//
// Added pace indicator (same as Widget 1/2):
// - Keeps rounded bars exactly the same
// - Shows a grey knob/pill inside the green at the pace buffer cutoff
// - No white line, no white highlight
// - Uses year-to-date pace: compares spend before current month vs budget*(months passed)
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

const ORDER = [
  { key: "abonnementen", icon: "📱" },
  { key: "hobbys", icon: "🧑‍🎨" },
  { key: "woning", icon: "🏠" },
  { key: "overige_kosten", icon: "🧾" },
]

const STACK_THRESHOLD = 0.12

function toNum(x) {
  if (typeof x === "string") x = x.replace(",", ".")
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}
function euro(n) {
  const v = Math.round(n * 100) / 100
  let s = String(v)
  if (s.includes(".")) {
    const [a, b] = s.split(".")
    s = a + "," + (b.length === 1 ? b + "0" : b.slice(0, 2))
  }
  return "€" + s
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

const now = new Date()
const CUR_YEAR = now.getFullYear()
const CUR_MONTH = now.getMonth() + 1 // 1..12
const TARGET_YM = `${CUR_YEAR}-${String(CUR_MONTH).padStart(2, "0")}`

// current month + months before current month (same year)
const spentByCategory = {}
const spentBeforeByCategory = {}

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
    if (y !== CUR_YEAR) continue

    const amt = toNum(amount)

    let sign = 0
    if (type === "debit") sign = 1
    else if (type === "credit") sign = -1
    else continue

    if (m === CUR_MONTH) {
      spentByCategory[category] = (spentByCategory[category] ?? 0) + sign * amt
    } else if (m < CUR_MONTH) {
      spentBeforeByCategory[category] = (spentBeforeByCategory[category] ?? 0) + sign * amt
    }
  }
}

const rows = ORDER.map(({ key, icon }) => {
  const budget = toNum(cats[key]?.budget)

  const spent = toNum(spentByCategory[key])             // current month spent
  const spentBefore = toNum(spentBeforeByCategory[key]) // earlier months spent (same year)

  const remaining = budget - spent
  const ratio = budget > 0 ? Math.max(0, Math.min(1, remaining / budget)) : 0
  const overspent = remaining < 0

  // Pace buffer based on overspend before this month:
  const paceOverspendBefore = spentBefore - budget * (CUR_MONTH - 1)
  const paceBuffer = Math.max(0, paceOverspendBefore)

  // Clamp buffer to remaining
  const bufferAmt = Math.min(Math.max(0, remaining), paceBuffer)
  const bufferRatio = budget > 0 ? Math.max(0, Math.min(1, bufferAmt / budget)) : 0

  return { icon, remaining, ratio, overspent, bufferRatio }
})

const widget = new ListWidget()
widget.backgroundColor = new Color("#111111")
widget.setPadding(10, 12, 10, 12)

const GREEN = new Color("#4CAF50")
const RED = new Color("#D32F2F")
const BAR_BG = new Color("#2a2a2a")

const family = config.widgetFamily ?? "small"
const contentW = widget.contentSize?.width ?? (family === "small" ? 155 : 300)

const iconW = 30
const gap = 8
const barH = 17
const rightMargin = 25
const barW = Math.max(60, Math.floor(contentW - iconW - gap - rightMargin))

for (let idx = 0; idx < rows.length; idx++) {
  const r = rows[idx]

  const row = widget.addStack()
  row.layoutHorizontally()
  row.centerAlignContent()

  const iconBox = row.addStack()
  iconBox.size = new Size(iconW, 0)
  iconBox.layoutHorizontally()
  iconBox.centerAlignContent()
  const ic = iconBox.addText(r.icon)
  ic.font = Font.systemFont(16)

  row.addSpacer(gap)

  const label = euro(r.remaining)

  // stacks can't draw the knob => only use stacks when no knob is needed
  const useStacks = (!r.overspent && r.bufferRatio === 0 && r.ratio <= STACK_THRESHOLD)

  if (useStacks) {
    const bar = row.addStack()
    bar.size = new Size(barW, barH)
    bar.backgroundColor = RED
    bar.cornerRadius = Math.floor(barH / 2)
    bar.clipsToBounds = true
    bar.layoutHorizontally()

    const fillW = Math.max(0, Math.min(barW, Math.round(barW * r.ratio)))
    const fill = bar.addStack()
    fill.size = new Size(fillW, barH)
    fill.backgroundColor = fillW > 0 ? GREEN : RED

    const labelStack = bar.addStack()
    labelStack.size = new Size(barW, barH)
    labelStack.backgroundColor = new Color("#000000", 0)
    labelStack.centerAlignContent()
    labelStack.layoutHorizontally()
    labelStack.addSpacer()
    const t = labelStack.addText(label)
    t.font = Font.semiboldSystemFont(10)
    t.textColor = new Color("#ffffff", 0.95)
    labelStack.addSpacer()
  } else {
    const img = drawBarImage(barW, barH, r.ratio, r.overspent, label, r.bufferRatio, GREEN, RED, BAR_BG)
    const imgView = row.addImage(img)
    imgView.imageSize = new Size(barW, barH)
  }

  if (idx < rows.length - 1) widget.addSpacer(6)
}

widget.refreshAfterDate = new Date(Date.now() + 60 * 1000)
Script.setWidget(widget)
Script.complete()

function drawBarImage(w, h, ratio, overspent, label, bufferRatio, GREEN, RED, BAR_BG) {
  const ctx = new DrawContext()
  ctx.size = new Size(w, h)
  ctx.opaque = false
  ctx.respectScreenScale = true

  const radius = 6
  function roundedRectPath(rect, r) {
    const p = new Path()
    p.addRoundedRect(rect, r, r)
    return p
  }

  const bgPath = roundedRectPath(new Rect(0, 0, w, h), radius)

  ctx.setFillColor(BAR_BG)
  ctx.addPath(bgPath)
  ctx.fillPath()

  ctx.setFillColor(RED)
  ctx.addPath(bgPath)
  ctx.fillPath()

  let gw = 0
  if (!overspent && ratio > 0) {
    let gwCalc = Math.floor(w * ratio)
    gw = Math.max(1, Math.min(w, gwCalc))
    ctx.setFillColor(GREEN)

    if (gw < radius * 2) {
      const tinyPath = roundedRectPath(new Rect(0, 0, gw, h), radius)
      ctx.addPath(tinyPath)
      ctx.fillPath()
    } else {
      const capW = radius * 2

      const leftCap = roundedRectPath(new Rect(0, 0, capW, h), radius)
      ctx.addPath(leftCap)
      ctx.fillPath()

      const rightCapX = Math.max(0, gw - capW)
      const rightCap = roundedRectPath(new Rect(rightCapX, 0, capW, h), radius)
      ctx.addPath(rightCap)
      ctx.fillPath()

      const rectX = radius
      const rectW = Math.max(0, gw - 2 * radius)
      if (rectW > 0) ctx.fillRect(new Rect(rectX, 0, rectW, h))
    }

    // ===== Grey knob/pill indicator (no white line, no highlight) =====
    if (bufferRatio > 0) {
      let mx = Math.floor(w * bufferRatio)
      mx = Math.max(2, Math.min(gw - 2, mx))

      if (typeof ctx.clip === "function") {
        ctx.addPath(bgPath)
        ctx.clip()
      }

      const knobW = 6
      const knobH = h - 4
      const kx = Math.max(1, Math.min(w - knobW - 1, mx - Math.floor(knobW / 2)))
      const ky = 2

      const knobPath = roundedRectPath(new Rect(kx, ky, knobW, knobH), 3)

      // subtle shadow
      ctx.setFillColor(new Color("#000000", 0.14))
      const shadowPath = roundedRectPath(new Rect(kx, ky + 0.6, knobW, knobH), 3)
      ctx.addPath(shadowPath)
      ctx.fillPath()

      // knob face
      ctx.setFillColor(new Color("#bdbdbd", 0.92))
      ctx.addPath(knobPath)
      ctx.fillPath()
    }
  }

  if (overspent) {
    if (typeof ctx.clip === "function") {
      ctx.addPath(bgPath)
      ctx.clip()
    }
    ctx.setStrokeColor(new Color("#ffffff", 0.18))
    ctx.setLineWidth(2)
    for (let x = -h; x < w + h; x += 9) {
      const p = new Path()
      p.move(new Point(x, h))
      p.addLine(new Point(x + h, 0))
      ctx.addPath(p)
      ctx.strokePath()
    }
  }

  ctx.setFont(Font.semiboldSystemFont(10))
  ctx.setTextAlignedCenter()

  ctx.setTextColor(new Color("#000000", 0.35))
  ctx.drawTextInRect(label, new Rect(1, 3, w, h))

  ctx.setTextColor(new Color("#ffffff", 0.95))
  ctx.drawTextInRect(label, new Rect(0, 2, w, h))

  return ctx.getImage()
}