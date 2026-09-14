// End-to-end regressietest voor FinanceTracker.
// Run A = build van BASE_REF (standaard main): verse installatie, import van de
//         testdata en een handmatige budgetwijziging.
// Run B = build van TARGET_REF (standaard HEAD) op HETZELFDE Chrome-profiel en
//         dus dezelfde origin: dat test de echte Dexie-upgrade, alle schermen,
//         het categorie-beheer (scenario D) en scenario E.
// Run C = verse installatie op de TARGET_REF-build: onboarding-wizard + de
//         bankimport met kolommapper (scenario G).
// Run C2 = nog een verse installatie, met "Probeer met voorbeelddata".
//
// Beide builds draaien op http://localhost:4173/FinanceTracker/ zodat IndexedDB
// tussen run A en B bewaard blijft. De service worker staat bewust uit (zie de
// statische server hieronder): anders serveert de precache van run A de oude
// build tijdens run B en testen we de upgrade helemaal niet.
//
//   npm run test:e2e                      # main -> HEAD, alle scenario's
//   TARGET_REF=v2/stap-6 npm run test:e2e # main -> branch
//   BASE_REF=v2/stap-5 TARGET_REF=v2/stap-6 npm run test:e2e
//   npm run test:e2e:import               # alleen run C + scenario G
//   npm run test:e2e:receipts             # alleen run R + scenario H (bonnetjes)
//   npm run test:e2e:demo                 # alleen run C2
import { chromium } from 'playwright'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beheerScenario } from './scenario-beheer.mjs'
import { scenarioE } from './scenario-e.mjs'
import { scenarioClaims } from './scenario-claims.mjs'
import { scenarioImport } from './scenario-import.mjs'
import { scenarioReceipts } from './scenario-receipts.mjs'
// Voor het verwachte aantal categorie-rijen: sinds de onboarding-wizard start
// elke run (ook run A) met de standaard-template, dus DEFAULT_CATEGORIES.
import { DEFAULT_CATEGORIES } from '../../src/constants/categories.js'
const AANTAL_CATEGORIEEN = DEFAULT_CATEGORIES.length

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')
const OUT = path.join(HERE, 'out')
const WT = path.join(HERE, '.wt')

const vlag = naam => process.argv.slice(2).find(a => a.startsWith(`--${naam}=`))?.slice(naam.length + 3)
const BASE_REF = process.env.BASE_REF || 'main'
const TARGET_REF = process.env.TARGET_REF || 'HEAD'
const SCENARIO = (vlag('scenario') || process.env.FT_E2E_SCENARIO || 'alle').toLowerCase()
const DATA = process.env.FT_DATA_DIR || path.join(os.homedir(), 'Documents', 'FinanceTracker-data')
const VERWACHTE_MAAND = process.env.FT_VERWACHTE_MAAND || 'Maart 2026'
const PORT = Number(process.env.FT_E2E_PORT || 4173)
const BASE = `http://localhost:${PORT}/FinanceTracker/`
const UDD_UPGRADE = path.join(HERE, 'profile-upgrade')
const UDD_FRESH = path.join(HERE, 'profile-fresh')
const UDD_DEMO = path.join(HERE, 'profile-demo')
const UDD_RECEIPTS = path.join(HERE, 'profile-receipts')
const DIST_BASE = path.join(WT, 'base', 'dist')
const DIST_TARGET = path.join(WT, 'target', 'dist')
const doeAlles = SCENARIO === 'alle'
const doeBeheer = doeAlles || SCENARIO === 'beheer'
const doeE = doeAlles || SCENARIO === 'e'
const doeClaims = doeAlles || SCENARIO === 'claims'
const doeImport = doeAlles || SCENARIO === 'import'
const doeDemo = doeAlles || SCENARIO === 'demo'
const doeBon = doeAlles || SCENARIO === 'bon'
// Run A + B draaien op Florians echte testdata; de verse scenario's (C/C2)
// hebben die niet nodig en slaan de migratieruns over.
const doeMigratie = doeAlles || doeBeheer || doeE || doeClaims
const doeVers = doeAlles || doeImport

if (!['alle', 'beheer', 'e', 'claims', 'import', 'demo', 'bon'].includes(SCENARIO)) {
  console.error(`onbekend scenario "${SCENARIO}"; kies alle | beheer | e | claims | import | demo | bon`)
  process.exit(2)
}
// De testdata staat bewust buiten de repo (persoonlijke transacties).
const ontbreekt = doeMigratie ? ['Transactions.csv'].filter(f => !fs.existsSync(path.join(DATA, f))) : []
if (ontbreekt.length) {
  console.error(`Testdata ontbreekt in ${DATA}: ${ontbreekt.join(', ')}`)
  console.error('Zet FT_DATA_DIR naar de map met Transactions.csv.')
  process.exit(2)
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })

/* ---------------- builds uit git-worktrees ---------------- */
const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim()
const worktrees = []

// Bouwt <ref> in een losse, detached worktree onder tests/e2e/.wt/ zodat de
// werkmap van de gebruiker ongemoeid blijft.
function bouwWorktree(naam, ref) {
  const dir = path.join(WT, naam)
  const sha = git('rev-parse', ref)
  fs.rmSync(dir, { recursive: true, force: true })
  git('worktree', 'prune')
  execFileSync('git', ['worktree', 'add', '--detach', dir, sha], { cwd: REPO, stdio: 'inherit' })
  worktrees.push(dir)
  // De worktree leent de node_modules van de repo: een npm install per ref duurt
  // minuten en levert voor deze refs dezelfde dependencies op.
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'), 'dir')
  execFileSync('npm', ['run', 'build'], { cwd: dir, stdio: 'inherit' })
  console.log(`build ${naam}: ${ref} -> ${sha.slice(0, 7)}`)
  return sha
}

// Wordt altijd aangeroepen (finally + signalen): een achtergebleven worktree
// blokkeert de volgende run met "already exists".
let opgeruimd = false
function ruimOp() {
  if (opgeruimd) return
  opgeruimd = true
  for (const dir of worktrees.splice(0)) {
    try { execFileSync('git', ['worktree', 'remove', '--force', '--force', dir], { cwd: REPO, stdio: 'ignore' }) }
    catch { fs.rmSync(dir, { recursive: true, force: true }) }
  }
  try { git('worktree', 'prune') } catch { /* niets aan te doen tijdens afbreken */ }
  fs.rmSync(UDD_UPGRADE, { recursive: true, force: true })
  fs.rmSync(UDD_FRESH, { recursive: true, force: true })
  fs.rmSync(UDD_DEMO, { recursive: true, force: true })
  fs.rmSync(UDD_RECEIPTS, { recursive: true, force: true })
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { ruimOp(); process.exit(130) })

// De grafiekenlijst wordt uit de bron van de TARGET-build gelezen in plaats van
// hier herhaald: zo hoeft deze test niet mee te veranderen als er een grafiek
// bijkomt of verdwijnt. CHART_IDS (label -> id) is alleen voor de bestandsnamen
// van de screenshots; VERWACHTE_TABS is het aantal standaard ingeschakelde
// grafieken en dus het aantal tabs dat de smoke-test moet zien.
let CHART_IDS = {}
let VERWACHTE_TABS = 0

function leesCharts(dir) {
  const kandidaten = ['src/components/charts/registry.js', 'src/pages/ChartsPage.jsx']
  const bron = kandidaten.map(f => path.join(dir, f)).find(f => fs.existsSync(f))
  if (!bron) throw new Error('geen grafiekenregistratie gevonden in ' + dir)
  const blok = fs.readFileSync(bron, 'utf8').match(/ALL_CHARTS = \[([\s\S]*?)\n\]/)
  if (!blok) throw new Error('ALL_CHARTS niet gevonden in ' + bron)
  return [...blok[1].matchAll(/\{[^}]*?id:\s*'([^']+)'[^}]*?label:\s*'([^']+)'([^}]*)\}/g)]
    .map(m => ({ id: m[1], label: m[2], defaultOn: !/defaultOn:\s*false/.test(m[3]) }))
}

/* ---------------- static server met verwisselbare root ---------------- */
let ROOT = DIST_BASE
const MIME = {
  // .mjs hoort er expliciet bij: de pdf.js-worker is een .mjs en Chrome weigert
  // een worker die als application/octet-stream binnenkomt.
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
}
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0])
  if (!p.startsWith('/FinanceTracker')) { res.writeHead(404); return res.end('nope') }
  const rel = p.slice('/FinanceTracker'.length) || '/'
  // Service worker uitgeschakeld: anders serveert de precache van run A de oude
  // build tijdens run B en testen we de migratie helemaal niet.
  if (rel === '/registerSW.js' || rel === '/sw.js') {
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' })
    return res.end('/* service worker uitgeschakeld in de test */')
  }
  let file = path.join(ROOT, rel)
  if (rel === '/' || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, 'index.html') // SPA-fallback
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  res.end(fs.readFileSync(file))
})
await new Promise(r => server.listen(PORT, '127.0.0.1', r))
console.log(`server op ${BASE}`)

/* ---------------- helpers ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms))

function attachDialogs(page, sink) {
  page.on('dialog', async d => { sink.push({ type: d.type(), message: d.message() }); await d.accept() })
}

function attachLogs(page, sink) {
  page.on('console', msg => {
    const t = msg.type()
    if (t === 'error' || t === 'warning') sink.push({ type: t, text: msg.text() })
  })
  page.on('pageerror', err => sink.push({ type: 'pageerror', text: String(err?.stack ?? err) }))
  page.on('requestfailed', req => sink.push({ type: 'requestfailed', text: `${req.url()} :: ${req.failure()?.errorText}` }))
}
const isError = l => l.type !== 'warning'

// Leest de Dexie-db rechtstreeks via de raw IndexedDB-API (de app exposeert `db` niet).
const DUMP = async () => {
  const db = await new Promise((resolve, reject) => {
    const rq = indexedDB.open('BudgetTracker')
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
    rq.onblocked = () => reject(new Error('blocked'))
  })
  const all = {}
  for (const name of [...db.objectStoreNames]) {
    all[name] = await new Promise((resolve, reject) => {
      const rq = db.transaction(name, 'readonly').objectStore(name).getAll()
      rq.onsuccess = () => resolve(rq.result)
      rq.onerror = () => reject(rq.error)
    })
  }
  const out = {
    version: db.version, stores: [...db.objectStoreNames],
    categories: all.categories ?? [], settings: all.settings ?? [],
    transactionCount: (all.transactions ?? []).length,
    merchantHistoryCount: (all.merchantHistory ?? []).length,
  }
  db.close()
  return out
}

const READ_CARDS = () => {
  const out = []
  for (const g of document.querySelectorAll('div.grid.grid-cols-3')) {
    for (const btn of g.querySelectorAll('button')) {
      const divs = [...btn.querySelectorAll('div')]
      out.push({
        icon: divs[0]?.textContent?.trim() ?? '',
        label: divs.find(d => d.className.includes('truncate'))?.textContent?.trim() ?? '',
        amount: btn.querySelector('.tabular-nums')?.textContent?.trim() ?? '',
      })
    }
  }
  return out
}
const READ_SUMMARY = () => document.querySelector('.card')?.innerText.replace(/\n+/g, ' | ').trim() ?? null
const READ_LIST = () => [...document.querySelectorAll('.card button')]
  .map(b => b.innerText.replace(/\n+/g, ' | ').trim()).filter(Boolean)

// De lijstrijen van het dashboard en de transactiepagina reageren uitsluitend op
// touch-events, dus dispatchen we echte TouchEvents (page.tap vereist hasTouch,
// wat de rendering zou kunnen beinvloeden en de screenshotvergelijking vertroebelt).
async function touchTap(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  const handle = await locator.elementHandle()
  await page.evaluate(el => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const touch = () => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [touch()], targetTouches: [touch()], changedTouches: [touch()] }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], targetTouches: [], changedTouches: [touch()] }))
  }, handle)
  await handle.dispose()
}

const MONTHS_LONG = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']
const MAAND_RE = new RegExp(`^(${MONTHS_LONG.join('|')}) \\d{4}$`)
const maandIndex = label => {
  const [m, y] = label.split(' ')
  return Number(y) * 12 + MONTHS_LONG.indexOf(m)
}

// Leest het zichtbare maandlabel (h1 op dashboard/transacties, span op de chartspagina).
async function leesMaand(page) {
  return page.evaluate(re => {
    for (const el of document.querySelectorAll('h1, span')) {
      const t = el.textContent.trim()
      if (new RegExp(re).test(t)) return t
    }
    return null
  }, MAAND_RE.source)
}

// De maand komt uit een gedeelde MonthProvider en blijft staan bij paginawissels,
// dus navigeren we absoluut naar de doelmaand i.p.v. een vast aantal klikken terug.
async function ensureMonth(page, target) {
  for (let i = 0; i < 40; i++) {
    const cur = await leesMaand(page)
    if (cur === null) return null                 // deze weergave heeft geen maandnavigatie
    if (cur === target) return cur
    const prev = maandIndex(cur) > maandIndex(target)
    await page.locator('button', { hasText: prev ? /^‹$/ : /^›$/ }).first().click()
    await sleep(420)
  }
  throw new Error(`kon niet naar ${target} navigeren`)
}

async function shot(page, name) {
  await sleep(500)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

// Sinds 78de13b zijn alle sheets portals op <body>; een openstaande sheet
// blokkeert de bottom-nav. Daarom eerst alles sluiten voordat we navigeren.
async function sluitSheets(page) {
  for (let k = 0; k < 6; k++) {
    const n = await page.locator('div.fixed.bottom-0.left-0.right-0').count()
    if (n === 0) return
    const knop = page.locator('button[aria-label="Sluiten"]').last()
    if (await knop.count() === 0) return
    await knop.click({ timeout: 5000 }).catch(() => {})
    await sleep(600)
  }
}

const nav = async (page, i) => { await sluitSheets(page); await page.locator('nav a').nth(i).click() }

async function newContext(userDataDir) {
  return chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome', headless: true,
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    hasTouch: true,            // nodig voor echte browser-touch via CDP (scroll/swipe)
    acceptDownloads: true,
    serviceWorkers: 'block', args: ['--disable-features=ServiceWorker'],
  })
}

/* ---------------- flows ---------------- */
async function dashboardFlow(page, prefix) {
  await page.waitForSelector('div.grid.grid-cols-3', { timeout: 15000 })
  await shot(page, `${prefix}-dashboard-huidige-maand`)
  await ensureMonth(page, VERWACHTE_MAAND)
  await sleep(800)
  const header = await page.locator('h1').first().innerText()
  const cards = await page.evaluate(READ_CARDS)
  const summary = await page.evaluate(READ_SUMMARY)
  await shot(page, `${prefix}-dashboard-kaarten`)
  await page.locator('button', { hasText: /^Lijst$/ }).first().click()
  await sleep(500)
  const list = await page.evaluate(READ_LIST)
  await shot(page, `${prefix}-dashboard-lijst`)
  await page.locator('button', { hasText: /^Kaarten$/ }).first().click()
  await sleep(300)
  return { header, summary, cards, list }
}

async function chartsFlow(page, prefix) {
  await nav(page, 2)
  await sleep(900)
  await ensureMonth(page, VERWACHTE_MAAND)
  await shot(page, `${prefix}-charts-budgettempo`)
  const sel = 'div.p-4.overflow-hidden'
  const paceText = await page.locator(sel).first().innerText().catch(() => '')
  await page.locator('button', { hasText: /^Jaar$/ }).first().click()
  await sleep(1200)
  await shot(page, `${prefix}-charts-jaar`)
  const jaarText = await page.locator(sel).first().innerText().catch(() => '')
  return { paceText, jaarText }
}

async function settingsFlow(page, prefix, doShot = true) {
  await nav(page, 4)
  await sleep(900)
  if (doShot) await shot(page, `${prefix}-settings`)
  const budgets = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find(x => x.textContent.trim() === 'Maandbudget')
    return h ? [...h.parentElement.querySelectorAll('button')].map(b => b.innerText.replace(/\n+/g, ' ').trim()) : null
  })
  return { budgets }
}

/* ---- SMOKE 1: elke charttab ---- */
async function smokeAllCharts(page, prefix, logs) {
  await nav(page, 2)
  await sleep(1000)
  const tabSel = 'div.flex.gap-2.py-3 button'
  const labels = await page.locator(tabSel).allInnerTexts()
  await ensureMonth(page, VERWACHTE_MAAND)
  const results = []
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i].trim()
    const id = CHART_IDS[label] ?? `tab${i}`
    const before = logs.length
    await page.locator(tabSel).nth(i).click()
    await sleep(1300)
    const body = await page.locator('div.p-4.overflow-hidden').first().innerText().catch(() => '<geen render>')
    const canvases = await page.locator('div.p-4.overflow-hidden canvas').count()
    await shot(page, `${prefix}-chart-${id}`)
    const newLogs = logs.slice(before).filter(isError)
    results.push({ id, label, canvases, chars: body.length, snippet: body.slice(0, 90).replace(/\n/g, ' / '), errors: newLogs })
    console.log(`   tab ${String(i + 1).padStart(2)}/${labels.length} ${label.padEnd(16)} canvas=${canvases} tekst=${String(body.length).padStart(5)} errors=${newLogs.length}`)
  }
  return { labels, results }
}

/* ---- SMOKE 1b: categoriepicker van Subcategorieën / Sub trends ---- */
async function smokePicker(page, prefix, label, logs) {
  const tabSel = 'div.flex.gap-2.py-3 button'
  const before = logs.length
  await page.locator(tabSel, { hasText: new RegExp(`^${label}$`) }).first().click()
  await sleep(1400)
  const select = page.locator('select').first()
  if (await select.count() === 0) return { label, ok: false, reden: 'geen <select> gevonden' }
  const preselected = await select.inputValue()
  const options = await select.locator('option').evaluateAll(os => os.map(o => ({ value: o.value, text: o.textContent.trim() })))
  const statBefore = await page.locator('.card').first().innerText()
  // kies een andere categorie
  const other = options.find(o => o.value !== preselected)
  let after = null, statAfter = null
  if (other) {
    await select.selectOption(other.value)
    await sleep(1400)
    after = await select.inputValue()
    statAfter = await page.locator('.card').first().innerText()
    await shot(page, `${prefix}-picker-${CHART_IDS[label]}-gewisseld`)
  }
  const errors = logs.slice(before).filter(isError)
  return {
    label, preselected, optionCount: options.length,
    optionsSample: options.slice(0, 3).map(o => o.text),
    other: other?.value ?? null, after,
    statVeranderd: statBefore !== statAfter,
    statBefore: statBefore.replace(/\n/g, ' / ').slice(0, 70),
    statAfter: statAfter?.replace(/\n/g, ' / ').slice(0, 70) ?? null,
    errors,
    ok: !!preselected && options.length > 1 && after === other?.value && statBefore !== statAfter && errors.length === 0,
  }
}

/* ---- SMOKE 2: transactiepagina ---- */
async function smokeTransactions(page, prefix, logs, verwachteMaand) {
  const before = logs.length
  await nav(page, 1)
  await sleep(900)
  await ensureMonth(page, verwachteMaand)
  await sleep(500)
  const header = await page.locator('h1').first().innerText()
  const maandOk = header.trim() === verwachteMaand
  const rows = page.locator('div.divide-y > button')
  const rowCount = await rows.count()
  await shot(page, `${prefix}-transactions`)
  const sample = await rows.evaluateAll(bs => bs.slice(0, 5).map(b => ({
    icon: b.querySelector('span')?.textContent?.trim() ?? '',
    text: b.innerText.replace(/\n/g, ' | ').trim(),
  })))
  const zonderIcoon = sample.filter(s => !s.icon || s.icon === '💸').length
  const zonderLabel = sample.filter(s => / · $/.test(s.text) || s.text.includes('· undefined')).length

  let form = null
  if (rowCount > 0) {
    await touchTap(page, rows.first())
    await sleep(900)
    const sheet = page.locator('h2:has-text("Bewerken"), div.text-base.font-semibold:has-text("Bewerken")')
    if (await sheet.count() > 0) {
      // <= c0594d8: <select>; >= 76773b7: knop die de CategoryPicker opent.
      const select = page.locator('select')
      let value, selectedText, optionCount
      if (await select.count() > 0) {
        value = await select.first().inputValue()
        selectedText = await select.first().locator('option:checked').innerText().catch(() => '')
        optionCount = await select.first().locator('option').count()
      } else {
        const knop = page.locator('span:text-is("Categorie")').locator('xpath=following-sibling::button').first()
        selectedText = (await knop.innerText()).replace(/\n/g, ' ').trim()
        value = selectedText
        // aantal keuzes = rijen in de kiezer
        await knop.click(); await sleep(800)
        optionCount = await page.locator('div.fixed.bottom-0.left-0.right-0').last().locator('div.divide-y > button').count()
        await page.locator('button[aria-label="Sluiten"]').last().click(); await sleep(600)
      }
      await shot(page, `${prefix}-transactieformulier`)
      // sluiten zonder opslaan: oude markup had '×', de Sheet heeft aria-label
      const dicht = page.locator('button[aria-label="Sluiten"]').last()
      if (await dicht.count() > 0) await dicht.click()
      else await page.locator('button', { hasText: /^×$/ }).first().click()
      await sleep(700)
      const stillOpen = await page.locator('h2:has-text("Bewerken"), div.text-base.font-semibold:has-text("Bewerken")').count() > 0
      form = { geopend: true, value, selectedText, optionCount, geslotenZonderOpslaan: !stillOpen }
    } else {
      form = { geopend: false }
    }
  }
  const errors = logs.slice(before).filter(isError)
  return { header, maandOk, rowCount, sample, zonderIcoon, zonderLabel, form, errors }
}

/* ---- SMOKE 3: dashboard-sheets ---- */
async function smokeDashboardSheets(page, prefix, logs, verwachteMaand) {
  const before = logs.length
  await nav(page, 0)
  await sleep(900)
  await ensureMonth(page, verwachteMaand)
  await sleep(500)
  const header = await page.locator('h1').first().innerText()
  const maandOk = header.trim() === verwachteMaand
  // categoriekaart -> sheet met transacties
  const card = page.locator('div.grid.grid-cols-3 button').first()
  await card.click()
  await sleep(900)
  const sheet = page.locator('div.fixed.bottom-0')
  const sheetOpen = await sheet.count() > 0
  const sheetText = sheetOpen ? (await sheet.first().innerText()).replace(/\n+/g, ' | ').slice(0, 160) : null
  const sheetTxRows = sheetOpen
    ? Number((sheetText.match(/(\d+) transacties/) ?? [])[1] ?? -1)
    : -1
  if (sheetOpen) await shot(page, `${prefix}-dashboard-categoriesheet`)
  if (sheetOpen) await sluitSheets(page)
  // "details ›" bij Verwacht -> ExpectedSheet
  const details = page.locator('button', { hasText: 'details' })
  let expected = null
  if (await details.count() > 0) {
    await details.first().click()
    await sleep(900)
    const es = page.locator('div.fixed.bottom-0')
    const open = await es.count() > 0
    const txt = open ? (await es.first().innerText()).replace(/\n+/g, ' | ').slice(0, 200) : null
    if (open) await shot(page, `${prefix}-dashboard-verwacht`)
    if (open) await sluitSheets(page)
    expected = { open, txt }
  }
  const errors = logs.slice(before).filter(isError)
  return { header, maandOk, sheetOpen, sheetText, sheetTxRows, expected, errors }
}

/* ---- SMOKE 4: importpagina ---- */
async function smokeImport(page, prefix, logs) {
  const before = logs.length
  await nav(page, 3)
  await sleep(1200)
  await shot(page, `${prefix}-import`)
  const text = (await page.locator('#root').innerText()).replace(/\n+/g, ' | ').slice(0, 200)
  const errors = logs.slice(before).filter(isError)
  return { text, errors }
}

/* ---- Onboarding-wizard (vervangt de oude MigrationPage) ---- */
// Welkom -> Aan de slag -> template -> Sla over -> <slotknop>
async function doorlopOnboarding(page, prefix, slotknop, template = 'Standaard') {
  const stappen = []
  await page.waitForSelector('text=Aan de slag', { timeout: 15000 })
  const welkom = await page.locator('#root').innerText()
  await shot(page, `${prefix}-onb-1-welkom`)
  stappen.push({
    id: 'welkom',
    pass: /Alles blijft op dit apparaat/.test(welkom) && /Backup terugzetten/.test(welkom),
    bewijs: welkom.replace(/\n+/g, ' | ').slice(0, 120),
  })

  await page.locator('button', { hasText: /^Aan de slag$/ }).click()
  await sleep(700)
  const templates = await page.locator('button[aria-pressed]').allInnerTexts()
  await page.locator('button[aria-pressed]', { hasText: new RegExp(`^${template}`) }).first().click()
  await sleep(400)
  await shot(page, `${prefix}-onb-2-categorieen`)
  stappen.push({
    id: 'templates',
    pass: templates.length === 3 && templates.some(t => t.startsWith(template)),
    bewijs: templates.map(t => t.split('\n')[0]).join(' / '),
  })

  await page.locator('button', { hasText: /^Volgende$/ }).click()
  await sleep(600)
  const budgetTekst = await page.locator('#root').innerText()
  await shot(page, `${prefix}-onb-3-budgetten`)
  await page.locator('button', { hasText: /^Sla over$/ }).click()
  await sleep(600)
  stappen.push({
    id: 'budgetten',
    pass: /Maandbudget/.test(budgetTekst) && (await page.locator('button', { hasText: /^Sla over$/ }).count()) === 0,
    bewijs: 'budgetstap overgeslagen',
  })

  const keuzes = await page.locator('#root').innerText()
  await shot(page, `${prefix}-onb-4-data`)
  await page.locator('button', { hasText: slotknop }).first().click()
  await sleep(2000)
  stappen.push({
    id: 'data',
    pass: ['Bankbestand importeren', 'Probeer met voorbeelddata', 'Begin leeg'].every(k => keuzes.includes(k)),
    bewijs: `gekozen: ${slotknop}`,
  })
  return { stappen }
}

/* ---- RUN C2: onboarding met voorbeelddata, daarna weer wissen ---- */
async function demoFlow(page, logs, dialogs) {
  const stappen = []
  const stap = (id, titel, pass, bewijs) => {
    stappen.push({ id, titel, pass, bewijs })
    console.log(`   ${pass ? 'PASS' : 'FAIL'} ${id} ${titel}: ${bewijs}`)
  }
  const start = logs.length

  const onboarding = await doorlopOnboarding(page, 'C2', 'Probeer met voorbeelddata')
  stap('C2-1', 'onboarding doorlopen', onboarding.stappen.every(st => st.pass),
    onboarding.stappen.map(st => `${st.id}=${st.pass ? 'ok' : 'FOUT'}`).join(' '))

  await page.waitForSelector('div.grid.grid-cols-3', { timeout: 20000 })
  await sleep(1200)
  // De lopende maand kan pas net begonnen zijn; dan tellen we de vorige maand.
  let cards = await page.evaluate(READ_CARDS)
  let metBedrag = cards.filter(c => /[1-9]/.test(c.amount))
  if (metBedrag.length === 0) {
    await page.locator('button', { hasText: /^‹$/ }).first().click()
    await sleep(900)
    cards = await page.evaluate(READ_CARDS)
    metBedrag = cards.filter(c => /[1-9]/.test(c.amount))
  }
  await shot(page, 'C2-dashboard')
  const dump = await page.evaluate(DUMP)
  stap('C2-2', 'dashboard toont tegels met bedragen',
    metBedrag.length >= 3 && dump.transactionCount > 200,
    `${dump.transactionCount} transacties, ${metBedrag.length}/${cards.length} tegels met bedrag (${metBedrag.slice(0, 3).map(c => `${c.label} ${c.amount}`).join(', ')})`)

  await page.goto(`${BASE}declaraties`, { waitUntil: 'networkidle' })
  await sleep(1200)
  const claimsTekst = (await page.locator('#root').innerText()).replace(/\n+/g, ' | ')
  await shot(page, 'C2-declaraties')
  const openRijen = await page.locator('button', { hasText: /zakelijke reis|Hotel Zakelijk/ }).count()
  stap('C2-3', 'drie open declaraties',
    openRijen === 3 && /3×/.test(claimsTekst) && /3 indienen/.test(claimsTekst),
    `${openRijen} open rijen; kop: ${claimsTekst.slice(0, 90)}`)

  await page.goto(BASE, { waitUntil: 'networkidle' })
  await sleep(900)
  await nav(page, 4)
  await sleep(1000)
  const demoRegel = await page.locator('text=Voorbeelddata actief').count()
  await shot(page, 'C2-instellingen')
  stap('C2-4', 'gele demo-regel in Instellingen', demoRegel > 0, `${demoRegel} regel(s) "Voorbeelddata actief"`)

  await page.locator('button', { hasText: 'Wis en begin opnieuw' }).click()
  await sleep(1500)
  const naWissen = await page.evaluate(DUMP)
  await shot(page, 'C2-na-wissen')
  stap('C2-5', 'wissen laat 0 transacties en de categorieen achter',
    naWissen.transactionCount === 0 && naWissen.categories.length === dump.categories.length
      && (await page.locator('text=Voorbeelddata actief').count()) === 0,
    `${naWissen.transactionCount} transacties, ${naWissen.categories.length} categorieen, demo-regel weg`)

  stap('C2-6', 'geen console-errors', logs.slice(start).filter(isError).length === 0,
    JSON.stringify(logs.slice(start).filter(isError)).slice(0, 200))

  return { stappen, dump, naWissen, dialogs, logs }
}

async function smokeAll(page, prefix, logs) {
  console.log(` -- smoke ${prefix}: charts --`)
  const charts = await smokeAllCharts(page, prefix, logs)
  const pickerSub = await smokePicker(page, prefix, 'Subcategorieën', logs)
  const pickerTrends = await smokePicker(page, prefix, 'Sub trends', logs)
  console.log(` -- smoke ${prefix}: transacties --`)
  const transactions = await smokeTransactions(page, prefix, logs, VERWACHTE_MAAND)
  console.log(` -- smoke ${prefix}: dashboard-sheets --`)
  const sheets = await smokeDashboardSheets(page, prefix, logs, VERWACHTE_MAAND)
  console.log(` -- smoke ${prefix}: import --`)
  const importPage = await smokeImport(page, prefix, logs)
  return { charts, pickerSub, pickerTrends, transactions, sheets, importPage }
}

async function main() {
  /* ================= RUN A: BASE_REF ================= */
  const report = { runA: {}, runB: {}, fresh: {}, demo: null, receipts: null }

  if (doeMigratie) {
  console.log(`\n=== RUN A (${BASE_REF} @ ${shaBase.slice(0, 7)}, verse installatie + import) ===`)
  ROOT = DIST_BASE
  fs.rmSync(UDD_UPGRADE, { recursive: true, force: true })
  {
    const logs = []
    const ctx = await newContext(UDD_UPGRADE)
    const page = ctx.pages()[0] ?? await ctx.newPage()
    attachLogs(page, logs)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    // De MigrationPage (met Dictionary.json + Transactions.csv) is in Fase 3
    // vervangen door de onboarding-wizard. Florians testdata komt nu binnen via
    // de gewone import: `detectFormat` herkent Transactions.csv als "eigen
    // export van deze app" en behoudt de categorieen uit het bestand.
    await doorlopOnboarding(page, 'A', 'Bankbestand importeren')
    await page.locator('input[type=file]').first().setInputFiles(path.join(DATA, 'Transactions.csv'))
    await page.waitForSelector('text=nieuwe transacties', { timeout: 30000 })
    await page.locator('button', { hasText: /^Opslaan$/ }).click()
    await page.waitForSelector('text=transacties opgeslagen', { timeout: 30000 })
    await sleep(1500)

    // handmatige wijziging: Boodschappen -> 333
    const voor = await settingsFlow(page, 'A-voor-wijziging', false)
    await page.locator('button', { hasText: /Boodschappen/ }).first().click()
    await sleep(500)
    // Scope naar de openstaande sheet: sinds de declaraties staat er ook een
    // number-input ("Declareren kan tot") op de Instellingen-pagina zelf.
    await page.locator('div.fixed.bottom-0.left-0.right-0').last().locator('input[type=number]').fill('333')
    await page.locator('button', { hasText: /^Opslaan$/ }).click()
    await sleep(800)
    console.log('Boodschappen:', voor.budgets?.find(b => b.includes('Boodschappen')), '-> 333')

    const settings = await settingsFlow(page, 'A')
    await nav(page, 0)
    await sleep(900)
    const dash = await dashboardFlow(page, 'A')
    const charts = await chartsFlow(page, 'A')
    const dump = await page.evaluate(DUMP)
    report.runA = { dump, dash, charts, settings, logs }
    fs.writeFileSync(path.join(OUT, 'A-dump.json'), JSON.stringify(report.runA, null, 2))
    await ctx.close()
    console.log(`RUN A klaar. dbVersion=${dump.version} categorieen=${dump.categories.length} transacties=${dump.transactionCount}`)
  }

  /* ================= RUN B: TARGET_REF op hetzelfde profiel ================= */
  console.log(`\n=== RUN B (${TARGET_REF} @ ${shaTarget.slice(0, 7)}, zelfde userDataDir) ===`)
  ROOT = DIST_TARGET
  {
    const logs = [], dialogs = []
    const ctx = await newContext(UDD_UPGRADE)
    const page = ctx.pages()[0] ?? await ctx.newPage()
    attachLogs(page, logs)
    attachDialogs(page, dialogs)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await sleep(2500) // ruimte voor de Dexie-upgrade van BASE_REF naar TARGET_REF
    const dash = await dashboardFlow(page, 'B')
    const charts = await chartsFlow(page, 'B')
    const settings = await settingsFlow(page, 'B')
    const smoke = doeAlles ? await smokeAll(page, 'B', logs) : null
    const dump = await page.evaluate(DUMP)   // vóór de beheer-mutaties: basis voor de migratievergelijking

    let beheer = []
    if (doeBeheer) {
      console.log(' -- scenario D: categorie-beheer --')
      beheer = await beheerScenario({ page, OUT, logs, DUMP, dialogs, aantalCategorieen: AANTAL_CATEGORIEEN })
    }

    let e = { stappen: [] }
    if (doeE) {
      console.log(' -- scenario E: lijst-sheets, charts, swipe, backup, regels --')
      const cdp = await ctx.newCDPSession(page)
      e = await scenarioE({ page, cdp, OUT, logs, DUMP, dialogs, ensureMonth, VERWACHTE_MAAND, aantalCategorieen: AANTAL_CATEGORIEEN })
    }

    let chartsNa = null, dashNa = null, dumpNa = null
    if (doeAlles) {
      console.log(' -- D12: alle charttabs opnieuw na de mutaties --')
      chartsNa = await smokeAllCharts(page, 'D12', logs)
      await nav(page, 0); await sleep(900)
      dashNa = await dashboardFlow(page, 'D12')
      dumpNa = await page.evaluate(DUMP)
    }

    // Declaraties bewust ná D12: dit scenario voegt transacties toe en zou de
    // eindstandcheck van het beheer-scenario anders verschuiven.
    let claims = { stappen: [] }
    if (doeClaims) {
      console.log(' -- scenario F: declaraties indienen, koppelen en afkeuren --')
      claims = await scenarioClaims({ page, OUT, logs, ensureMonth })
    }

    report.runB = { dump, dumpNa, dash, dashNa, charts, chartsNa, settings, smoke, beheer, e, claims, dialogs, logs }
    fs.writeFileSync(path.join(OUT, 'B-dump.json'), JSON.stringify(report.runB, null, 2))
    await ctx.close()
    console.log(`RUN B klaar. dbVersion=${dump.version} categorieen=${dump.categories.length} transacties=${dump.transactionCount}`)
  }
  }

  /* ================= RUN C: verse installatie op TARGET_REF ================= */
  if (doeVers) {
  console.log(`\n=== RUN C (${TARGET_REF} @ ${shaTarget.slice(0, 7)}, onboarding -> "Begin leeg") ===`)
  ROOT = DIST_TARGET
  fs.rmSync(UDD_FRESH, { recursive: true, force: true })
    const logs = [], dialogs = []
    const ctx = await newContext(UDD_FRESH)
    const page = ctx.pages()[0] ?? await ctx.newPage()
    attachLogs(page, logs)
    attachDialogs(page, dialogs)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    const onboarding = await doorlopOnboarding(page, 'C', 'Begin leeg')
    await page.waitForSelector('div.grid.grid-cols-3', { timeout: 15000 })
    await shot(page, 'C-fresh-dashboard')
    const cards = await page.evaluate(READ_CARDS)
    const settings = await settingsFlow(page, 'C-fresh')
    await nav(page, 0); await sleep(700)
    const smoke = doeAlles ? await smokeAll(page, 'C', logs) : null
    const dump = await page.evaluate(DUMP)

    let importScenario = { stappen: [] }
    if (doeImport) {
      console.log(' -- scenario G: bankimport en kolommapper --')
      importScenario = await scenarioImport({ page, OUT, logs })
    }

    report.fresh = { dump, cards, settings, smoke, onboarding, importScenario, logs }
    fs.writeFileSync(path.join(OUT, 'C-fresh-dump.json'), JSON.stringify(report.fresh, null, 2))
    await ctx.close()
    console.log(`RUN C klaar. dbVersion=${dump.version} categorieen=${dump.categories.length}`)
  }

  /* ================= RUN C2: verse installatie met voorbeelddata ================= */
  if (doeDemo) {
    console.log(`\n=== RUN C2 (${TARGET_REF} @ ${shaTarget.slice(0, 7)}, onboarding -> voorbeelddata) ===`)
    ROOT = DIST_TARGET
    fs.rmSync(UDD_DEMO, { recursive: true, force: true })
    const logs = [], dialogs = []
    const ctx = await newContext(UDD_DEMO)
    const page = ctx.pages()[0] ?? await ctx.newPage()
    attachLogs(page, logs)
    attachDialogs(page, dialogs)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    report.demo = await demoFlow(page, logs, dialogs)
    fs.writeFileSync(path.join(OUT, 'C2-demo.json'), JSON.stringify(report.demo, null, 2))
    await ctx.close()
    console.log(`RUN C2 klaar. ${report.demo.stappen.filter(st => st.pass).length}/${report.demo.stappen.length} stappen PASS`)
  }

  /* ================= RUN R: verse installatie, bonnetjes ================= */
  if (doeBon) {
    console.log(`\n=== RUN R (${TARGET_REF} @ ${shaTarget.slice(0, 7)}, bonnetjes met een nagebootste AI-dienst) ===`)
    ROOT = DIST_TARGET
    fs.rmSync(UDD_RECEIPTS, { recursive: true, force: true })
    const logs = [], dialogs = []
    const ctx = await newContext(UDD_RECEIPTS)
    const page = ctx.pages()[0] ?? await ctx.newPage()
    attachLogs(page, logs)
    attachDialogs(page, dialogs)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await doorlopOnboarding(page, 'H0', 'Begin leeg')
    await page.waitForSelector('div.grid.grid-cols-3', { timeout: 15000 })
    console.log(' -- scenario H: bonnetjes toevoegen, uitlezen, koppelen en corrigeren --')
    const scenario = await scenarioReceipts({ page, OUT, logs, BASE, DATA })
    report.receipts = { ...scenario, logs, dialogs }
    fs.writeFileSync(path.join(OUT, 'scenario-receipts.json'), JSON.stringify(report.receipts, null, 2))
    await ctx.close()
    console.log(`RUN R klaar. ${scenario.stappen.filter(st => st.pass).length}/${scenario.stappen.length} stappen PASS`)
  }

  /* ================= CHECKS ================= */
  const A = report.runA.dump, B = report.runB.dump, C = report.fresh.dump
  const checks = []
  const add = (id, pass, detail) => { checks.push({ id, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id}: ${detail}`) }
  const FIELDS = ['key', 'label', 'icon', 'color', 'type', 'order', 'isFixed', 'archived', 'role', 'subs', 'budget']

  if (doeMigratie) {
  console.log('\n=== CHECKS: migratie ===')
  {
    const aB = Object.fromEntries(A.categories.map(c => [c.key, c.budget ?? 0]))
    const bB = Object.fromEntries(B.categories.map(c => [c.key, c.budget ?? 0]))
    const diffs = Object.entries(aB).filter(([k, v]) => (bB[k] ?? null) !== v).map(([k, v]) => `${k}: A=${v} B=${bB[k]}`)
    const nieuw = Object.keys(bB).filter(k => !(k in aB)).map(k => `${k}=${bB[k]}`)
    add('a-budgetten', diffs.length === 0, diffs.length ? `verschillen: ${diffs.join(', ')}`
      : `alle ${Object.keys(aB).length} budgetten identiek (Boodschappen A=${aB.boodschappen} B=${bB.boodschappen}); nieuw in B: ${nieuw.join(', ') || '-'}`)
  }
  {
    const missing = B.categories.map(r => [r.key, FIELDS.filter(f => !(f in r))]).filter(([, g]) => g.length)
    const roleExp = { overige_kosten: 'uncategorized', bankoverschrijving: 'transfer', salaris: 'income' }
    const roleBad = Object.entries(roleExp).filter(([k, v]) => B.categories.find(c => c.key === k)?.role !== v)
      .map(([k, v]) => `${k}: verwacht ${v}, kreeg ${B.categories.find(c => c.key === k)?.role}`)
    const otherRoles = B.categories.filter(c => c.role && !(c.key in roleExp)).map(c => `${c.key}=${c.role}`)
    const fixedExp = ['abonnementen', 'reiskosten', 'vakantie', 'woning']
    const fixedGot = B.categories.filter(c => c.isFixed).map(c => c.key).sort()
    add('b-velden', missing.length === 0, missing.length ? missing.map(([k, g]) => `${k} mist ${g}`).join(' | ') : `alle ${B.categories.length} rijen hebben ${FIELDS.length} velden`)
    add('b-rollen', roleBad.length === 0 && otherRoles.length === 0, roleBad.length || otherRoles.length
      ? `${roleBad.join('; ')} ${otherRoles.length ? `extra: ${otherRoles}` : ''}`
      : 'overige_kosten=uncategorized, bankoverschrijving=transfer, salaris=income, rest null')
    add('b-isFixed', JSON.stringify(fixedGot) === JSON.stringify(fixedExp), `isFixed=true: ${fixedGot.join(', ')}`)
  }
  add('c-transacties', A.transactionCount === B.transactionCount, `A=${A.transactionCount}, B=${B.transactionCount}`)
  {
    const norm = arr => arr.map(c => `${c.icon} ${c.label} ${c.amount}`)
    const a = norm(report.runA.dash.cards), b = norm(report.runB.dash.cards)
    const same = JSON.stringify(a) === JSON.stringify(b)
    add('d-dashboard-dom', same || JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()),
      same ? `${a.length} tegels identiek incl. volgorde (${report.runA.dash.header} / ${report.runB.dash.header})`
        : `zelfde set, andere volgorde:\n     A=${a.join(' / ')}\n     B=${b.join(' / ')}`)
    add('d-samenvatting', report.runA.dash.summary === report.runB.dash.summary, `A="${report.runA.dash.summary}"`)
    add('d-lijst', JSON.stringify(report.runA.dash.list) === JSON.stringify(report.runB.dash.list), `A=${report.runA.dash.list.length} rijen, B=${report.runB.dash.list.length} rijen`)
    add('d-settings-budgetlijst', JSON.stringify(report.runA.settings.budgets) === JSON.stringify(report.runB.settings.budgets), `${report.runA.settings.budgets?.length} regels`)
    add('d-charts-tekst', report.runA.charts.paceText === report.runB.charts.paceText && report.runA.charts.jaarText === report.runB.charts.jaarText,
      `budgettempo ${report.runA.charts.paceText === report.runB.charts.paceText ? 'gelijk' : 'VERSCHIL'}, jaar ${report.runA.charts.jaarText === report.runB.charts.jaarText ? 'gelijk' : 'VERSCHIL'}`)
  }
  add('e-console-B', report.runB.logs.filter(isError).length === 0,
    report.runB.logs.filter(isError).length ? JSON.stringify(report.runB.logs.filter(isError), null, 2) : 'geen errors/pageerrors in de hele run B')
  }

  console.log('\n=== CHECKS: smoke ===')
  for (const [run, s] of [['B', report.runB.smoke], ['C', report.fresh.smoke]].filter(([, s]) => s)) {
    const tabsMetError = s.charts.results.filter(r => r.errors.length)
    const leeg = s.charts.results.filter(r => r.chars === 0 || r.snippet === '<geen render>')
    add(`${run}-charts-alle-tabs`, s.charts.results.length === VERWACHTE_TABS && tabsMetError.length === 0 && leeg.length === 0,
      `${s.charts.results.length}/${VERWACHTE_TABS} tabs geklikt, ${s.charts.results.filter(r => r.canvases > 0).length} met canvas, ${leeg.length} leeg, ${tabsMetError.length} met errors` +
      (tabsMetError.length ? `: ${tabsMetError.map(t => t.label + ' -> ' + JSON.stringify(t.errors)).join(' | ')}` : ''))
    add(`${run}-picker-subcategorie`, s.pickerSub.ok,
      `voorgeselecteerd="${s.pickerSub.preselected}", ${s.pickerSub.optionCount} opties, gewisseld naar "${s.pickerSub.after}", statkaart veranderd=${s.pickerSub.statVeranderd}, errors=${s.pickerSub.errors.length}`)
    add(`${run}-picker-subtrends`, s.pickerTrends.ok,
      `voorgeselecteerd="${s.pickerTrends.preselected}", ${s.pickerTrends.optionCount} opties, gewisseld naar "${s.pickerTrends.after}", statkaart veranderd=${s.pickerTrends.statVeranderd}, errors=${s.pickerTrends.errors.length}`)
    const t = s.transactions
    const txOk = run === 'C'
      ? t.maandOk && t.rowCount === 0 && t.errors.length === 0
      : t.maandOk && t.rowCount > 0 && t.zonderIcoon === 0 && t.zonderLabel === 0 && t.form?.geopend && !!t.form.value && t.form.geslotenZonderOpslaan && t.errors.length === 0
    add(`${run}-transacties`, txOk, run === 'C'
      ? `${t.header}: ${t.rowCount} rijen (leeg verwacht), errors=${t.errors.length}`
      : `${t.header}: ${t.rowCount} rijen, ${t.zonderIcoon} zonder icoon / ${t.zonderLabel} zonder label; formulier categorie="${t.form?.value}" (${t.form?.selectedText}), ${t.form?.optionCount} opties, gesloten zonder opslaan=${t.form?.geslotenZonderOpslaan}, errors=${t.errors.length}`)
    const sheetOk = s.sheets.maandOk && s.sheets.sheetOpen && s.sheets.expected?.open && s.sheets.errors.length === 0
      && (run === 'C' ? s.sheets.sheetTxRows === 0 : s.sheets.sheetTxRows > 0)
    add(`${run}-dashboard-sheets`, sheetOk,
      `${s.sheets.header}: categoriesheet open=${s.sheets.sheetOpen} met ${s.sheets.sheetTxRows} transacties, verwacht-sheet open=${s.sheets.expected?.open}, errors=${s.sheets.errors.length}`)
    add(`${run}-import`, s.importPage.errors.length === 0 && s.importPage.text.length > 0,
      `pagina rendert (${s.importPage.text.length} tekens), errors=${s.importPage.errors.length}`)
  }

  console.log('\n=== CHECKS: scenario D (categorie-beheer) ===')
  for (const st of report.runB.beheer ?? []) {
    add(`D${st.nr}-${st.titel.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`, st.pass, st.bewijs)
  }
  if (report.runB.chartsNa) {
    const nb = report.runB.chartsNa
    const metError = nb.results.filter(r => r.errors.length)
    const leeg = nb.results.filter(r => r.chars === 0)
    add('D12-charts-na-mutaties', nb.results.length === VERWACHTE_TABS && metError.length === 0 && leeg.length === 0,
      `${nb.results.length}/${VERWACHTE_TABS} tabs opnieuw geklikt, ${leeg.length} leeg, ${metError.length} met errors` +
      (metError.length ? `: ${metError.map(t => t.label + ' -> ' + JSON.stringify(t.errors)).join(' | ')}` : ''))
    const dn = report.runB.dumpNa
    const n1 = report.runB.dash.cards.map(c => `${c.icon} ${c.label} ${c.amount}`)
    const n2 = report.runB.dashNa.cards.map(c => `${c.icon} ${c.label} ${c.amount}`)
    add('D12-dashboard-na-mutaties', JSON.stringify(n1) === JSON.stringify(n2),
      `maart 2026 onveranderd na het beheer-scenario (${n2.length} tegels); de handmatige transactie staat in sep 2026`)
    add('D12-db-eindstand', dn.categories.length === AANTAL_CATEGORIEEN && dn.transactionCount === report.runA.dump.transactionCount + 1,
      `${dn.categories.length} categorieen (${AANTAL_CATEGORIEEN} verwacht, Huisdier verwijderd), ${dn.transactionCount} transacties (A=${report.runA.dump.transactionCount} + 1 handmatige)`)
    add('D12-console-heleronde', report.runB.logs.filter(isError).length === 0,
      report.runB.logs.filter(isError).length ? JSON.stringify(report.runB.logs.filter(isError), null, 2) : 'geen errors in run B inclusief het hele beheer-scenario')
  }

  console.log('\n=== CHECKS: scenario E ===')
  for (const st of report.runB.e?.stappen ?? []) {
    if (st.id === 'E5-secties') continue
    add(`${st.id}-${st.titel.replace(/[^a-z0-9]+/gi, '-').slice(0, 44)}`, st.pass, st.bewijs)
  }

  console.log('\n=== CHECKS: scenario declaraties ===')
  for (const st of report.runB.claims?.stappen ?? []) {
    add(`${st.id}-${st.titel.replace(/[^a-z0-9]+/gi, '-').slice(0, 44)}`, st.pass, st.bewijs)
  }

  console.log('\n=== CHECKS: verse installatie ===')
  if (C) {
    const gaps = C.categories.flatMap(r => FIELDS.filter(f => !(f in r)).map(f => `${r.key}.${f}`))
    const verwachtVers = DEFAULT_CATEGORIES.length
    add('vers-standaard-rijen', C.categories.length === verwachtVers, `${C.categories.length} categorie-rijen (verwacht ${verwachtVers} = DEFAULT_CATEGORIES)`)
    add('vers-velden', gaps.length === 0, gaps.length ? gaps.join(', ') : 'alle rijen volledig')
    add('vers-dashboard', report.fresh.cards.length > 0, `${report.fresh.cards.length} tegels gerenderd`)
    add('vers-console', report.fresh.logs.filter(isError).length === 0,
      report.fresh.logs.filter(isError).length ? JSON.stringify(report.fresh.logs.filter(isError), null, 2) : 'geen errors in de hele run C')
  }

  if (report.fresh.onboarding) {
    console.log('\n=== CHECKS: onboarding ===')
    for (const st of report.fresh.onboarding.stappen) {
      add(`onb-${st.id}`, st.pass, st.bewijs)
    }
  }

  if (report.fresh.importScenario?.stappen?.length) {
    console.log('\n=== CHECKS: scenario import ===')
    for (const st of report.fresh.importScenario.stappen) {
      add(`${st.id}-${st.titel.replace(/[^a-z0-9]+/gi, '-').slice(0, 44)}`, st.pass, st.bewijs)
    }
  }

  if (report.demo) {
    console.log('\n=== CHECKS: voorbeelddata (run C2) ===')
    for (const st of report.demo.stappen) {
      add(`${st.id}-${st.titel.replace(/[^a-z0-9]+/gi, '-').slice(0, 44)}`, st.pass, st.bewijs)
    }
    fs.writeFileSync(path.join(OUT, 'C2-demo.json'), JSON.stringify(report.demo, null, 2))
  }

  if (report.receipts) {
    console.log('\n=== CHECKS: scenario bonnetjes (run R) ===')
    for (const st of report.receipts.stappen) {
      add(`${st.id}-${st.titel.replace(/[^a-z0-9]+/gi, '-').slice(0, 44)}`, st.pass, st.bewijs)
    }
    add('H-console', report.receipts.logs.filter(isError).length === 0,
      report.receipts.logs.filter(isError).length ? JSON.stringify(report.receipts.logs.filter(isError), null, 2) : 'geen errors in de hele run R')
  }

  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(checks, null, 2))
  fs.writeFileSync(path.join(OUT, 'console-logs.json'), JSON.stringify({ A: report.runA.logs ?? [], B: report.runB.logs ?? [], C: report.fresh.logs ?? [], demo: report.demo?.logs ?? [] }, null, 2))
  fs.writeFileSync(path.join(OUT, 'categories-A-vs-B.json'), JSON.stringify({ A: A?.categories ?? [], B: B?.categories ?? [], fresh: C?.categories ?? [] }, null, 2))
  fs.writeFileSync(path.join(OUT, 'smoke.json'), JSON.stringify({ B: report.runB.smoke ?? null, C: report.fresh.smoke ?? null }, null, 2))
  fs.writeFileSync(path.join(OUT, 'scenario-e.json'), JSON.stringify(report.runB.e ?? {}, null, 2))
  fs.writeFileSync(path.join(OUT, 'scenario-claims.json'), JSON.stringify(report.runB.claims ?? {}, null, 2))
  fs.writeFileSync(path.join(OUT, 'beheer-scenario.json'), JSON.stringify({ stappen: report.runB.beheer ?? [], dialogs: report.runB.dialogs ?? [], dumpNa: report.runB.dumpNa ?? null }, null, 2))

  const failed = checks.filter(c => !c.pass)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks PASS${failed.length ? ` — FAIL: ${failed.map(f => f.id).join(', ')}` : ''}`)
  console.log(`screenshots en dumps: ${OUT}`)
  return failed.length ? 1 : 0
}

/* ================= driver: bouwen, draaien, altijd opruimen ================= */
let shaBase, shaTarget, code = 1
try {
  if (doeMigratie) shaBase = bouwWorktree('base', BASE_REF)
  shaTarget = bouwWorktree('target', TARGET_REF)
  const charts = leesCharts(path.join(WT, 'target'))
  CHART_IDS = Object.fromEntries(charts.map(c => [c.label, c.id]))
  VERWACHTE_TABS = charts.filter(c => c.defaultOn).length
  console.log(`grafieken in ${TARGET_REF}: ${charts.length} geregistreerd, ${VERWACHTE_TABS} standaard aan`)
  if (shaBase && shaBase === shaTarget) console.log('let op: BASE_REF en TARGET_REF wijzen naar dezelfde commit')
  code = await main()
} catch (err) {
  console.error('\nE2E afgebroken:', err?.stack ?? err)
  code = 1
} finally {
  server.close()
  ruimOp()
}
process.exit(code)
