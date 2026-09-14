// Meetscript voor Fase 5, stap 1: hoe goed en hoe duur lezen echte modellen
// een echte bon uit? Draait ECHTE API-calls en kost dus geld — daarom bewust
// niet in `npm test`. Starten met:
//
//   npm run test:receipts                       # alles
//   npm run test:receipts -- --runs=1           # sneller/goedkoper
//   npm run test:receipts -- --model=Qwen/Qwen3.5-9B
//   npm run test:receipts -- --lang=nl --input=text
//   npm run test:receipts -- --dry               # geen netwerk, alleen plan
//
// De sleutel komt uit TOGETHER_API_KEY of uit <FT_DATA_DIR>/together.key en
// wordt nergens gelogd.
//
// LET OP: dit script schrijft tests/receipts/REPORT.md volledig opnieuw. De
// sectie "Conclusies en advies" onderaan dat rapport is met de hand geschreven
// en gaat bij een nieuwe run dus verloren — kopieer hem eerst als je hem wilt
// bewaren.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const SRC = new URL('../../src', import.meta.url).href
const { extractReceipt, ReceiptExtractError } = await import(`${SRC}/utils/receipts/extract.js`)
const { extractPdfText } = await import(`${SRC}/utils/receipts/pdfText.js`)

// ─── configuratie ────────────────────────────────────────────────

const DATA_DIR = process.env.FT_DATA_DIR ?? path.join(os.homedir(), 'Documents', 'FinanceTracker-data')
const SAMPLES = path.join(DATA_DIR, 'samples')
const HIER = path.dirname(new URL(import.meta.url).pathname)
const RENDER_DIR = path.join(HIER, '.render')
const RAPPORT = path.join(HIER, 'REPORT.md')

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/)
  return m ? [m[1], m[2] ?? true] : [a, true]
}))

const MODELLEN = args.model ? [String(args.model)] : ['Qwen/Qwen3.5-9B', 'MiniMaxAI/MiniMax-M3']
const TALEN = args.lang ? [String(args.lang)] : ['nl', 'en']
const RUNS = Number(args.runs ?? 2)
const BASE_URL = process.env.TOGETHER_BASE_URL ?? 'https://api.together.xyz/v1'
// Ruimer dan de 60 s van de app: mét "denken aan" doet Qwen3.5-9B er 70-80 s over.
const TIMEOUT_MS = Number(args.timeout ?? 180_000)

// $ per miljoen tokens (together.ai, gecontroleerd via /v1/models op 14-9-2026)
const PRIJZEN = {
  'Qwen/Qwen3.5-9B': { in: 0.17, out: 0.25 },
  'MiniMaxAI/MiniMax-M3': { in: 0.30, out: 1.20 },
}

// Verwachte uitkomsten, handmatig van de bonnen afgelezen (sleutel = bestandsnaam).
const VERWACHT = {
  'ah_bon_2026-09-10.pdf': {
    merchant: 'albert heijn',
    date: '2026-09-10',
    time: '17:51',
    total: 7.37,
    paymentMethod: 'pin',
    items: [
      { name: 'fusilli sals', price: 5.99 },
      { name: 'terra creme', price: 0.89 },
      { name: 'ah vvp hagel', price: 2.89 },
    ],
    discountTotal: 2.40,
  },
  // Lange schermafbeelding uit de Lidl Plus-app, met schuin watermerk
  // "KOPIE KASSABON" over de tekst en een barcode onderaan.
  'lidl_bon_a.jpeg': {
    merchant: 'lidl',
    date: '2026-02-11',
    time: '20:22',
    total: 3.24,
    paymentMethod: 'pin',
    items: [
      { name: 'chips great britain', price: 1.69 },
      { name: 'zakdoekjes balsem', price: 1.55 },
    ],
    discountTotal: 0,
  },
  'lidl_bon_b.jpeg': {
    merchant: 'lidl',
    date: '2026-03-13',
    time: '20:14',
    total: 8.79,
    paymentMethod: 'pin',
    items: [
      { name: 'veg proteine poeder', price: 8.79 },
    ],
    discountTotal: 0,
  },
}

function leesSleutel() {
  if (process.env.TOGETHER_API_KEY) return process.env.TOGETHER_API_KEY.trim()
  const p = path.join(DATA_DIR, 'together.key')
  if (!fs.existsSync(p)) {
    console.error(`Geen API-sleutel: zet TOGETHER_API_KEY of leg de sleutel in ${p}`)
    process.exit(1)
  }
  return fs.readFileSync(p, 'utf8').trim()
}

// ─── invoer klaarzetten ──────────────────────────────────────────

/**
 * PDF → PNG. Node heeft hier geen canvas voor (geen `canvas`-package in dit
 * project, dat compileert native), dus we gebruiken macOS' eigen `sips`, die
 * PDF via ImageIO rendert. `qlmanage -t -s 1600` is het alternatief maar levert
 * een thumbnail met afgeronde hoeken. In de browser doet
 * `pdfText.renderPdfPage()` precies hetzelfde met pdf.js + canvas.
 */
function pdfNaarAfbeelding(pdfPad, maxSide = 1600) {
  fs.mkdirSync(RENDER_DIR, { recursive: true })
  // JPEG, niet PNG: MiniMax-M3 antwoordt op een PNG-data-URL met 503.
  const uit = path.join(RENDER_DIR, path.basename(pdfPad).replace(/\.pdf$/i, '') + `-${maxSide}.jpg`)
  if (!fs.existsSync(uit)) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '--resampleHeightWidthMax', String(maxSide), pdfPad, '--out', uit], { stdio: 'pipe' })
  }
  return uit
}

function bestandNaarBlob(p) {
  const buf = fs.readFileSync(p)
  const ext = path.extname(p).toLowerCase()
  const type = ext === '.png' ? 'image/png' : ext === '.heic' ? 'image/heic' : 'image/jpeg'
  return new Blob([buf], { type })
}

function pixels(p) {
  const uit = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', p], { encoding: 'utf8' })
  return {
    w: Number(uit.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 0),
    h: Number(uit.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 0),
  }
}

/** Node-equivalent van `image.downscaleImage(file, { maxSide })` (canvas-loos). */
function verklein(bron, maxSide = 1600, achtervoegsel = '') {
  fs.mkdirSync(RENDER_DIR, { recursive: true })
  const uit = path.join(RENDER_DIR, path.basename(bron).replace(/\.[^.]+$/, '') + `${achtervoegsel}-${maxSide}.jpg`)
  if (!fs.existsSync(uit)) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '--resampleHeightWidthMax', String(maxSide), bron, '--out', uit], { stdio: 'pipe' })
  }
  return uit
}

/**
 * Lange kassabon in `n` overlappende stukken knippen. Dit is de "Nog een
 * stuk"-route uit het plan: elk stuk wordt apart tot maxSide geschaald, zodat
 * de tekst leesbaar blijft. Alle stukken gaan in één model-aanroep mee.
 *
 * `sips --cropOffset` bleek onbetrouwbaar (negeert de offset of vult met zwart),
 * dus knippen doen we met Pillow, dat standaard bij python3 op macOS zit.
 * Ontbreekt Pillow, dan slaan we deze variant over met een waarschuwing.
 * In de browser doet een canvas met `drawImage(bron, sx, sy, sw, sh, ...)`
 * hetzelfde.
 */
function knip(bron, stukken = 2, maxSide = 1600, overlap = 0.04) {
  fs.mkdirSync(RENDER_DIR, { recursive: true })
  const basis = path.basename(bron).replace(/\.[^.]+$/, '')
  const paden = []
  for (let i = 0; i < stukken; i++) {
    paden.push(path.join(RENDER_DIR, `${basis}-deel${i + 1}van${stukken}-${maxSide}.jpg`))
  }
  if (paden.every(p => fs.existsSync(p))) return paden

  const script = `
import sys
from PIL import Image
bron, n, maxSide, overlap = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4])
uit = sys.argv[5:]
im = Image.open(bron).convert('RGB')
w, h = im.size
for i in range(n):
    top = max(0, round(h / n * i - h * overlap))
    bot = min(h, round(h / n * (i + 1) + h * overlap))
    deel = im.crop((0, top, w, bot))
    f = min(1.0, maxSide / max(deel.size))
    if f < 1:
        deel = deel.resize((round(deel.size[0] * f), round(deel.size[1] * f)), Image.LANCZOS)
    deel.save(uit[i], 'JPEG', quality=80)
`
  execFileSync('python3', ['-c', script, bron, String(stukken), String(maxSide), String(overlap), ...paden], { stdio: 'pipe' })
  return paden
}

async function bouwVarianten() {
  const varianten = []
  if (!fs.existsSync(SAMPLES)) {
    console.error(`Geen samples-map gevonden op ${SAMPLES}`)
    process.exit(1)
  }
  const bestanden = fs.readdirSync(SAMPLES).sort()

  for (const f of bestanden.filter(f => /\.pdf$/i.test(f))) {
    const pad = path.join(SAMPLES, f)
    const { text, pages, isTextPdf } = await extractPdfText(fs.readFileSync(pad))
    if (isTextPdf) {
      varianten.push({ id: `${f} · tekst`, bestand: f, type: 'text', payload: { text }, verwacht: VERWACHT[f] ?? null, meta: `${pages} pagina('s), ${text.length} tekens` })
    }
    try {
      const jpg = pdfNaarAfbeelding(pad)
      const { w, h } = pixels(jpg)
      varianten.push({ id: `${f} · vision`, bestand: f, type: 'image', payload: { images: [bestandNaarBlob(jpg)] }, verwacht: VERWACHT[f] ?? null, meta: `${w}×${h}, ${Math.round(fs.statSync(jpg).size / 1024)} KB JPEG via sips` })
    } catch (err) {
      console.warn(`PDF→JPEG mislukt voor ${f}: ${err.message}`)
    }
    // Beide tegelijk: de gerenderde pagina geeft de layout en het logo, de
    // uitgelezen tekst geeft exacte tekens en bedragen. Dit is de kandidaat
    // voor de PDF-route in de app.
    if (isTextPdf) {
      try {
        const jpg = pdfNaarAfbeelding(pad)
        varianten.push({ id: `${f} · vision + tekst`, bestand: f, type: 'image', payload: { images: [bestandNaarBlob(jpg)], text }, verwacht: VERWACHT[f] ?? null, meta: 'gerenderde pagina + uitgelezen tekst in dezelfde aanroep' })
      } catch { /* al gemeld */ }
    }
  }

  for (const f of bestanden.filter(f => /\.(jpe?g|png|heic)$/i.test(f))) {
    const pad = path.join(SAMPLES, f)
    const origineel = pixels(pad)

    // (1) de huidige app-route: één afbeelding, langste zijde naar 1600
    const klein = verklein(pad, 1600)
    const kl = pixels(klein)
    varianten.push({
      id: `${f} · 1× maxSide1600`, bestand: f, type: 'image',
      payload: { images: [bestandNaarBlob(klein)] }, verwacht: VERWACHT[f] ?? null,
      meta: `origineel ${origineel.w}×${origineel.h} → ${kl.w}×${kl.h}, ${Math.round(fs.statSync(klein).size / 1024)} KB`,
    })

    // (2) lange bon in 2 overlappende stukken, elk apart naar 1600
    if (origineel.h > origineel.w * 1.8) {
      try {
        const delen = knip(pad, 2, 1600)
        const dp = delen.map(pixels)
        varianten.push({
          id: `${f} · 2 stukken maxSide1600`, bestand: f, type: 'image',
          payload: { images: delen.map(bestandNaarBlob) }, verwacht: VERWACHT[f] ?? null,
          meta: delen.map((d, i) => `${dp[i].w}×${dp[i].h} (${Math.round(fs.statSync(d).size / 1024)} KB)`).join(' + '),
        })
      } catch (err) {
        console.warn(`Knippen mislukt voor ${f}: ${err.message}`)
      }
    }
  }
  return varianten
}

// ─── scoren ──────────────────────────────────────────────────────

function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreBon(bon, verwacht) {
  if (!verwacht) return { punten: null, max: null, details: ['geen verwachte waarden bekend'] }
  const details = []
  let punten = 0
  const check = (label, gehaald, gewicht, gezien) => {
    punten += gehaald * gewicht
    details.push(`${gehaald >= 1 ? '✓' : gehaald > 0 ? '~' : '✗'} ${label}${gehaald >= 1 ? '' : ` (kreeg: ${gezien})`}`)
  }

  check('winkel', norm(bon.merchant).includes(verwacht.merchant) ? 1 : 0, 1, JSON.stringify(bon.merchant))
  check('datum', bon.date === verwacht.date ? 1 : 0, 1, JSON.stringify(bon.date))
  check('tijd', bon.time === verwacht.time ? 1 : 0, 0.5, JSON.stringify(bon.time))
  check('totaal', Math.abs((bon.total ?? -1) - verwacht.total) < 0.005 ? 1 : 0, 2, JSON.stringify(bon.total))

  const regels = (bon.items ?? []).filter(i => !i.isDiscount)
  check('aantal regels', regels.length === verwacht.items.length ? 1 : 0, 1, regels.length)

  const namenGoed = verwacht.items.filter(v => regels.some(r => norm(r.name).includes(v.name) || v.name.includes(norm(r.name)))).length
  check('productnamen', namenGoed / verwacht.items.length, 1, `${namenGoed}/${verwacht.items.length}`)

  const prijzenGoed = verwacht.items.filter(v => regels.some(r => Math.abs((r.price ?? -1) - v.price) < 0.005)).length
  check('regelprijzen', prijzenGoed / verwacht.items.length, 1, `${prijzenGoed}/${verwacht.items.length}`)

  const kortingTotaal = (bon.discounts ?? []).reduce((s, d) => s + Math.abs(d.amount), 0)
  check('korting', Math.abs(kortingTotaal - verwacht.discountTotal) < 0.005 ? 1 : 0, 1, kortingTotaal.toFixed(2))
  check('betaalwijze', bon.paymentMethod === verwacht.paymentMethod ? 1 : 0, 0.5, JSON.stringify(bon.paymentMethod))
  check('validatie', bon.validation?.ok ? 1 : 0, 1, `diff ${bon.validation?.diff}`)

  const max = 1 + 1 + 0.5 + 2 + 1 + 1 + 1 + 1 + 0.5 + 1
  return { punten: Math.round(punten * 100) / 100, max, details }
}

function kosten(model, usage) {
  const p = PRIJZEN[model]
  if (!p || !usage) return null
  const inTok = usage.prompt_tokens ?? 0
  const uitTok = usage.completion_tokens ?? 0
  return (inTok * p.in + uitTok * p.out) / 1_000_000
}

// ─── uitvoeren ───────────────────────────────────────────────────

const varianten = await bouwVarianten()
const plan = []
for (const v of varianten) for (const model of MODELLEN) for (const lang of TALEN) for (let r = 1; r <= RUNS; r++) plan.push({ v, model, lang, r })

console.log(`Varianten: ${varianten.length} · modellen: ${MODELLEN.length} · talen: ${TALEN.length} · runs: ${RUNS} → ${plan.length} API-calls\n`)
for (const v of varianten) console.log(`  • ${v.id} — ${v.meta}`)
console.log('')

if (args.dry) { console.log('--dry: geen API-calls gedaan.'); process.exit(0) }

const apiKey = leesSleutel()
const resultaten = []

const pauze = ms => new Promise(r => setTimeout(r, ms))

for (const { v, model, lang, r } of plan) {
  await pauze(Number(args.pause ?? 1500))   // together.ai wordt anders onder belasting instabiel
  const label = `${model.padEnd(22)} ${lang}  ${v.id}  run ${r}`
  try {
    const bon = await extractReceipt({ ...v.payload, ai: { baseUrl: BASE_URL, apiKey, model }, language: lang, timeoutMs: TIMEOUT_MS })
    const score = scoreBon(bon, v.verwacht)
    const kost = kosten(model, bon.raw.usage)
    resultaten.push({ model, lang, variant: v.id, type: v.type, run: r, ok: true, bon, score, kost })
    console.log(`${label} → score ${score.punten ?? '-'}/${score.max ?? '-'} · ${bon.raw.latencyMs} ms · ` +
      `${bon.raw.usage?.prompt_tokens ?? '?'}/${bon.raw.usage?.completion_tokens ?? '?'} tok · ` +
      `$${kost != null ? kost.toFixed(5) : '?'} · validatie ${bon.validation.ok ? 'ok' : `diff ${bon.validation.diff}`} · json_object ${bon.raw.jsonMode}`)
    if (score.details?.length) {
      const mis = score.details.filter(d => !d.startsWith('✓'))
      if (mis.length) console.log(`    ${mis.join(' · ')}`)
    }
  } catch (err) {
    const code = err instanceof ReceiptExtractError ? err.code : 'onbekend'
    resultaten.push({ model, lang, variant: v.id, type: v.type, run: r, ok: false, code, message: err.message, detail: err.detail ?? null })
    console.log(`${label} → FOUT [${code}] ${err.message}`)
  }
}

// ─── denkstand-vergelijking ──────────────────────────────────────
// Qwen3.x is een redeneermodel. De app zet het denken standaard uit
// (`chat_template_kwargs: { enable_thinking: false }`); hier meten we wat dat
// scheelt op dezelfde invoer.

const denkMetingen = []
if (!args['skip-thinking']) {
  const ijk = varianten.find(v => v.type === 'text') ?? varianten[0]
  console.log(`\nDenkstand-vergelijking op "${ijk.id}" (taal nl):`)
  for (const model of MODELLEN) {
    for (const thinking of [false, true]) {
      try {
        const bon = await extractReceipt({ ...ijk.payload, ai: { baseUrl: BASE_URL, apiKey, model }, language: 'nl', thinking, timeoutMs: TIMEOUT_MS })
        const score = scoreBon(bon, ijk.verwacht)
        const kost = kosten(model, bon.raw.usage)
        denkMetingen.push({ model, thinking, ok: true, score: score.punten, max: score.max, latency: bon.raw.latencyMs, usage: bon.raw.usage, kost })
        console.log(`  ${model.padEnd(22)} denken ${thinking ? 'aan' : 'uit'} → score ${score.punten}/${score.max} · ${bon.raw.latencyMs} ms · ${bon.raw.usage?.completion_tokens ?? '?'} uit-tokens · $${kost != null ? kost.toFixed(5) : '?'}`)
      } catch (err) {
        denkMetingen.push({ model, thinking, ok: false, code: err.code ?? 'onbekend', message: err.message })
        console.log(`  ${model.padEnd(22)} denken ${thinking ? 'aan' : 'uit'} → FOUT [${err.code ?? '?'}] ${err.message}`)
      }
    }
  }
}

// ─── rapport ─────────────────────────────────────────────────────

function gem(arr) { return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null }
function f(n, d = 2) { return n == null ? '–' : Number(n).toFixed(d) }

const groepen = new Map()
for (const res of resultaten) {
  const sleutel = `${res.variant}|${res.model}|${res.lang}`
  if (!groepen.has(sleutel)) groepen.set(sleutel, [])
  groepen.get(sleutel).push(res)
}

const regels = []
for (const [sleutel, rs] of groepen) {
  const [variant, model, lang] = sleutel.split('|')
  const goed = rs.filter(x => x.ok)
  regels.push({
    variant, model, lang,
    runs: rs.length,
    fouten: rs.length - goed.length,
    score: gem(goed.map(x => x.score.punten).filter(x => x != null)),
    max: goed[0]?.score.max ?? null,
    latency: gem(goed.map(x => x.bon.raw.latencyMs)),
    tokIn: gem(goed.map(x => x.bon.raw.usage?.prompt_tokens ?? 0)),
    tokUit: gem(goed.map(x => x.bon.raw.usage?.completion_tokens ?? 0)),
    kost: gem(goed.map(x => x.kost).filter(x => x != null)),
    valOk: goed.filter(x => x.bon.validation.ok).length,
    diffs: goed.map(x => x.bon.validation.diff),
    codes: rs.filter(x => !x.ok).map(x => x.code),
  })
}

const totaalKosten = resultaten.filter(r => r.ok).reduce((s, r) => s + (r.kost ?? 0), 0) +
  denkMetingen.filter(d => d.ok).reduce((s, d) => s + (d.kost ?? 0), 0)

const md = []
md.push('# Meetrapport bonnetjes uitlezen (Fase 5, stap 1)')
md.push('')
md.push(`Gegenereerd door \`npm run test:receipts\` op ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.`)
md.push(`Provider: \`${BASE_URL}\` · ${resultaten.length} API-calls · geschatte kosten van deze run: **$${totaalKosten.toFixed(4)}**.`)
md.push('')
md.push('Prijzen per miljoen tokens: ' + Object.entries(PRIJZEN).map(([m, p]) => `\`${m}\` $${p.in}/$${p.out}`).join(' · ') + '.')
md.push('')
md.push('## Invoervarianten')
md.push('')
for (const v of varianten) md.push(`- **${v.id}** — ${v.meta}${v.verwacht ? '' : ' (geen verwachte waarden, alleen plausibiliteit)'}`)
md.push('')
// Hoeveel prompt-tokens kost een afbeelding? Vision-modellen tegelen het beeld
// in blokken van ~560 px; een lange smalle bon kost daardoor veel meer dan een
// vierkante foto van dezelfde bestandsgrootte.
const beeld = varianten.filter(v => v.type === 'image')
if (beeld.length) {
  const tekstBasis = gem(resultaten.filter(r => r.ok && r.type === 'text' && r.model === MODELLEN[0]).map(r => r.bon.raw.usage?.prompt_tokens ?? 0))
  md.push('## Beeldformaat en prompt-tokens')
  md.push('')
  md.push('De prompt zelf is ongeveer 700 tokens; de rest is beeld. Ter vergelijking: de hele AH-bon als tékst kost ' + f(tekstBasis, 0) + ' prompt-tokens.')
  md.push('')
  md.push('| Invoer | Afmetingen en grootte | Gem. prompt-tokens |')
  md.push('|---|---|---:|')
  for (const v of beeld) {
    const t = gem(resultaten.filter(r => r.ok && r.variant === v.id).map(r => r.bon.raw.usage?.prompt_tokens ?? 0))
    md.push(`| ${v.id} | ${v.meta} | ${f(t, 0)} |`)
  }
  md.push('')
}

md.push('## Resultaten')
md.push('')
md.push('| Invoer | Model | Taal | Score | Latency | Tokens in/uit | $/bon | Validatie | Fouten |')
md.push('|---|---|---|---:|---:|---:|---:|:--:|---|')
for (const r of regels.sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) {
  md.push(`| ${r.variant} | \`${r.model}\` | ${r.lang} | ${r.score == null ? '–' : `${f(r.score)} / ${r.max}`} | ${f(r.latency, 0)} ms | ${f(r.tokIn, 0)} / ${f(r.tokUit, 0)} | ${r.kost == null ? '–' : '$' + r.kost.toFixed(5)} | ${r.valOk}/${r.runs - r.fouten} | ${r.fouten ? r.codes.join(', ') : '–'} |`)
}
md.push('')
if (denkMetingen.length) {
  md.push('## Denkstand (redeneermodellen)')
  md.push('')
  md.push('Zelfde invoer, alleen `chat_template_kwargs: { enable_thinking: false }` aan/uit.')
  md.push('')
  md.push('| Model | Denken | Score | Latency | Uit-tokens | $/bon |')
  md.push('|---|:--:|---:|---:|---:|---:|')
  for (const d of denkMetingen) {
    md.push(d.ok
      ? `| \`${d.model}\` | ${d.thinking ? 'aan' : 'uit'} | ${f(d.score)} / ${d.max} | ${d.latency} ms | ${d.usage?.completion_tokens ?? '?'} | ${d.kost == null ? '–' : '$' + d.kost.toFixed(5)} |`
      : `| \`${d.model}\` | ${d.thinking ? 'aan' : 'uit'} | FOUT (${d.code}) | – | – | – |`)
  }
  md.push('')
}

md.push('## Per run')
md.push('')
const getoond = new Set()
for (const res of resultaten) {
  const groep = `${res.variant}|${res.model}|${res.lang}`
  md.push(`### ${res.variant} · \`${res.model}\` · ${res.lang} · run ${res.run}`)
  if (!res.ok) {
    md.push('')
    md.push(`**FOUT** \`${res.code}\`: ${res.message}`)
    if (res.detail) md.push('\n```\n' + String(res.detail).slice(0, 500) + '\n```')
    md.push('')
    continue
  }
  const b = res.bon
  md.push('')
  md.push(`Score **${res.score.punten}/${res.score.max}** · ${b.raw.latencyMs} ms · ${b.raw.usage?.prompt_tokens ?? '?'} in / ${b.raw.usage?.completion_tokens ?? '?'} uit · $${res.kost != null ? res.kost.toFixed(5) : '?'} · json_object: ${b.raw.jsonMode} · finish: ${b.raw.finishReason}`)
  md.push('')
  if (res.score.details) md.push(res.score.details.join(' · '))
  md.push('')
  const kort = {
    merchant: b.merchant, date: b.date, time: b.time, total: b.total, currency: b.currency,
    paymentMethod: b.paymentMethod,
    items: b.items.map(i => ({ name: i.name, qty: i.qty, unitPrice: i.unitPrice, price: i.price, group: i.group, ...(i.isDiscount ? { isDiscount: true } : {}) })),
    discounts: b.discounts,
    validation: b.validation,
  }
  if (getoond.has(groep)) {
    const eerste = resultaten.find(r => r.ok && `${r.variant}|${r.model}|${r.lang}` === groep)
    const gelijk = JSON.stringify(kort) === eerste?.kortJson
    md.push(gelijk ? '_JSON identiek aan run 1 van deze combinatie._' : '```json\n' + JSON.stringify(kort, null, 1) + '\n```')
  } else {
    getoond.add(groep)
    res.kortJson = JSON.stringify(kort)
    md.push('```json')
    md.push(JSON.stringify(kort, null, 1))
    md.push('```')
  }
  md.push('')
}

md.push('## Conclusies en advies')
md.push('')
md.push('_Deze sectie wordt met de hand geschreven op basis van de tabellen hierboven en wordt door een nieuwe run overschreven._')
md.push('')

fs.writeFileSync(RAPPORT, md.join('\n'))
console.log(`\nRapport geschreven naar ${RAPPORT}`)
console.log(`Geschatte kosten van deze run: $${totaalKosten.toFixed(4)}`)
