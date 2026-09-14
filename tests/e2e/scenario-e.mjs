// Scenario E: gedeelde TransactionListSheet, chart-drilldowns, maand-swipe,
// backup/restore, herkenningsregels en contrast (v2-stap 6).
import fs from 'node:fs'
import path from 'node:path'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function scenarioE({ page, cdp, OUT, logs, DUMP, dialogs, ensureMonth, VERWACHTE_MAAND }) {
  const isError = l => l.type !== 'warning'
  const errsSinds = i => logs.slice(i).filter(isError)
  let n = 0
  const shot = async naam => {
    await sleep(450); n += 1
    const bestand = `E-${String(n).padStart(2, '0')}-${naam}`
    await page.screenshot({ path: path.join(OUT, `${bestand}.png`), fullPage: true })
    return `${bestand}.png`
  }
  const stappen = []
  const stap = (id, titel, pass, bewijs, screenshot) => {
    stappen.push({ id, titel, pass, bewijs, screenshot })
    console.log(`   ${pass ? 'PASS' : 'FAIL'} ${id} ${titel}: ${bewijs}`)
  }

  const nav = i => page.locator('nav a').nth(i).click()
  const sheets = () => page.evaluate(() => [...document.querySelectorAll('div.fixed.bottom-0.left-0.right-0')].length)
  const top = () => page.locator('div.fixed.bottom-0.left-0.right-0').last()
  const sluitTop = async () => { await page.locator('button[aria-label="Sluiten"]').last().click(); await sleep(650) }
  const sluitAlles = async () => { for (let i = 0; i < 6 && await sheets() > 0; i++) await sluitTop() }
  const maand = () => page.evaluate(() => {
    const re = /^(Januari|Februari|Maart|April|Mei|Juni|Juli|Augustus|September|Oktober|November|December) \d{4}$/
    for (const el of document.querySelectorAll('h1, span')) { const t = el.textContent.trim(); if (re.test(t)) return t }
    return null
  })

  /* ---- echte browser-touch via CDP: dit drijft ook scrollen en klik-synthese ---- */
  const touchDrag = async (x0, y0, x1, y1, steps = 12) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] })
    for (let i = 1; i <= steps; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }],
      })
      await sleep(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(600)
  }
  const touchTap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await sleep(60)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await sleep(700)
  }

  // Chart.js hit-test vereist een klik óp een element; de instantie is niet
  // globaal bereikbaar, dus zoeken we het eerste punt dat een sheet opent.
  const klikOpCanvas = async (canvas, soort) => {
    const box = await canvas.boundingBox()
    if (!box) return null
    const punten = []
    if (soort === 'donut') {
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2
      const R = Math.min(box.width, box.height) / 2
      for (const frac of [0.8, 0.7, 0.9, 0.6]) {
        for (let deg = -80; deg < 280; deg += 15) {
          const rad = deg * Math.PI / 180
          punten.push({ x: cx + Math.cos(rad) * R * frac, y: cy + Math.sin(rad) * R * frac })
        }
      }
    } else {
      for (const fy of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.92]) {
        for (let i = 1; i < 32; i++) punten.push({ x: box.x + box.width * i / 32, y: box.y + box.height * fy })
      }
    }
    const voor = await sheets()
    for (const p of punten) {
      await page.mouse.click(p.x, p.y)
      await sleep(280)
      if (await sheets() > voor) return p
    }
    return null
  }

  /* ================= E1: lijst-sheet + gestapelde sheets ================= */
  {
    const i = logs.length
    await nav(0); await sleep(900)
    await ensureMonth(page, VERWACHTE_MAAND); await sleep(600)
    await page.locator('div.grid.grid-cols-3 button').first().click(); await sleep(900)

    const kop = await top().locator('div.text-base.font-semibold, div.text-xs.truncate').allInnerTexts()
    const rijen = await top().evaluate(el => [...el.querySelectorAll('button')].slice(1).map(b => ({
      icoon: b.querySelector('span')?.textContent?.trim() ?? '',
      tekst: b.innerText.replace(/\n/g, ' | ').trim(),
    })))
    const sA = await shot('lijstsheet-open')

    // Scrollen in de sheet mag GEEN formulier openen (echte touch-drag)
    const box = await top().boundingBox()
    const sheetsVoor = await sheets()
    await touchDrag(box.x + box.width / 2, box.y + box.height * 0.75, box.x + box.width / 2, box.y + box.height * 0.35)
    const naScroll = await sheets()
    const formNaScroll = await page.locator('div.text-base.font-semibold', { hasText: 'Bewerken' }).count()

    // Rij aantikken -> formulier bovenop
    await top().locator('button').nth(1).click(); await sleep(900)
    const volgorde = await page.evaluate(() => {
      const kids = [...document.body.children]
      const idx = el => kids.findIndex(k => k === el || k.contains(el))
      const titels = [...document.querySelectorAll('div.fixed.bottom-0.left-0.right-0')]
        .map(el => ({ titel: el.querySelector('div.text-base.font-semibold')?.textContent?.trim() ?? '', bodyIndex: idx(el), z: getComputedStyle(el).zIndex }))
      return titels
    })
    const sB = await shot('formulier-boven-lijstsheet')
    const formIdx = volgorde.findIndex(v => v.titel === 'Bewerken')
    const lijstIdx = volgorde.findIndex(v => v.titel !== 'Bewerken')
    const formBoven = formIdx > lijstIdx && volgorde[formIdx].bodyIndex > volgorde[lijstIdx].bodyIndex

    // Categoriekiezer als derde sheet
    await page.locator('span:text-is("Categorie")').locator('xpath=following-sibling::button').first().click(); await sleep(900)
    const drie = await sheets()
    const sC = await shot('drie-sheets-gestapeld')
    await sluitTop()   // kiezer dicht

    // Swipe-down op het formulier sluit alleen het formulier
    const fBox = await top().boundingBox()
    await touchDrag(fBox.x + fBox.width / 2, fBox.y + 30, fBox.x + fBox.width / 2, fBox.y + 260, 14)
    await sleep(700)
    const naSwipe = await sheets()
    const lijstNog = await top().locator('div.text-base.font-semibold').innerText().catch(() => '')
    const sD = await shot('formulier-weggeswipet')
    await sluitAlles()

    stap('E1', 'lijst-sheet, stapeling en swipe-to-close',
      kop.length >= 1 && rijen.length >= 3 && rijen.every(r => r.icoon && /\d/.test(r.tekst))
      && naScroll === sheetsVoor && formNaScroll === 0
      && formBoven && drie === 3 && naSwipe === 1 && lijstNog === 'Woning' && errsSinds(i).length === 0,
      `kop=${JSON.stringify(kop)}; ${rijen.length} rijen (eerste: "${rijen[0]?.tekst}"); na touch-scroll ${naScroll} sheet(s) en ${formNaScroll} formulier; stapel na rij-tik ${JSON.stringify(volgorde)}; met kiezer ${drie} sheets; na swipe-down ${naSwipe} sheet over ("${lijstNog}"); errors=${errsSinds(i).length}`, sA + ', ' + sB + ', ' + sC + ', ' + sD)
  }

  /* ================= E2: drilldown vanuit de grafieken ================= */
  const e2 = []
  {
    const tabSel = 'div.flex.gap-2.py-3 button'
    const open = async (label, hoe) => {
      const i = logs.length
      await nav(2); await sleep(800)
      await ensureMonth(page, VERWACHTE_MAAND)
      await page.locator(tabSel, { hasText: new RegExp(`^${label}$`) }).first().click()
      await sleep(1400)
      let punt = null
      if (hoe === 'jaar') {
        // YearGrid-cellen zijn gewone knoppen
        const cellen = page.locator('div.flex.gap-1 > button')
        const aantal = await cellen.count()
        for (let k = 0; k < Math.min(aantal, 40); k++) {
          const t = (await cellen.nth(k).innerText()).trim()
          if (t && t !== '·') { await cellen.nth(k).click(); punt = `cel #${k} ("${t}")`; break }
        }
        await sleep(900)
      } else {
        // CashflowChart heeft geen [data-chart-area]; val terug op elke canvas in een kaart
        const inArea = page.locator('div[data-chart-area] canvas')
        const canvas = (await inArea.count()) ? inArea.first() : page.locator('div.card canvas').first()
        const p = await klikOpCanvas(canvas, hoe)
        punt = p ? `canvas @ ${Math.round(p.x)},${Math.round(p.y)}` : null
        await sleep(600)
      }
      const geopend = await sheets() > 0
      const titel = geopend ? await top().locator('div.text-base.font-semibold').innerText().catch(() => '') : ''
      const sub = geopend ? await top().locator('div.text-xs.truncate').innerText().catch(() => '') : ''
      const rijen = geopend ? await top().locator('button').count() - 1 : 0
      const s = await shot(`drilldown-${label.toLowerCase().replace(/\s+/g, '-')}`)
      await sluitAlles()
      const res = { label, geopend, titel, sub, rijen, punt, errors: errsSinds(i), screenshot: s }
      e2.push(res)
      return res
    }

    const verdeling = await open('Verdeling', 'donut')
    stap('E2a', 'Verdeling: donutsegment -> lijst-sheet', verdeling.geopend && verdeling.rijen > 0 && verdeling.errors.length === 0,
      `${verdeling.punt ?? 'geen treffer'}; titel="${verdeling.titel}", subtitel="${verdeling.sub}", ${verdeling.rijen} rijen; errors=${verdeling.errors.length}`, verdeling.screenshot)

    const jaar = await open('Jaar', 'jaar')
    stap('E2b', 'Jaar: maandcel -> lijst-sheet', jaar.geopend && jaar.rijen > 0 && jaar.errors.length === 0,
      `${jaar.punt ?? 'geen gevulde cel'}; titel="${jaar.titel}", subtitel="${jaar.sub}", ${jaar.rijen} rijen; errors=${jaar.errors.length}`, jaar.screenshot)

    const dagelijks = await open('Dagelijks', 'bar')
    stap('E2c', 'Dagelijks: staaf -> lijst-sheet', dagelijks.geopend && dagelijks.rijen > 0 && dagelijks.errors.length === 0,
      `${dagelijks.punt ?? 'geen treffer'}; titel="${dagelijks.titel}", subtitel="${dagelijks.sub}", ${dagelijks.rijen} rijen; errors=${dagelijks.errors.length}`, dagelijks.screenshot)

    const spaar = await open('Spaarpercentage', 'bar')
    const modusOk = /Inkomen|Uitgaven/.test(spaar.titel)
    stap('E2d', 'Spaarpercentage: staaf -> lijst-sheet met modus in de titel',
      spaar.geopend && modusOk && spaar.errors.length === 0,
      `${spaar.punt ?? 'geen treffer'}; titel="${spaar.titel}" (noemt modus=${modusOk}), subtitel="${spaar.sub}", ${spaar.rijen} rijen; errors=${spaar.errors.length}`, spaar.screenshot)
  }

  /* ================= E3: ExpectedSheet ================= */
  {
    const i = logs.length
    await nav(0); await sleep(900)
    await ensureMonth(page, VERWACHTE_MAAND); await sleep(500)
    await page.locator('button', { hasText: 'details' }).first().click(); await sleep(1000)
    const tekst = (await top().innerText()).replace(/\n+/g, ' | ').slice(0, 200)
    const s = await shot('verwacht-sheet')
    await sluitAlles()
    const ok = /€815,87/.test(tekst) && /NOG NIET BETAALD \(1\)/i.test(tekst) && /BETAALD \(8\)/i.test(tekst)
    stap('E3', 'details › toont dezelfde ExpectedSheet als ronde 3', ok && errsSinds(i).length === 0,
      `"${tekst}"; errors=${errsSinds(i).length}`, s)
  }

  /* ================= E4: maand-swipe ================= */
  {
    const i = logs.length
    const swipeTest = async (navIndex, naam) => {
      await nav(navIndex); await sleep(900)
      await ensureMonth(page, VERWACHTE_MAAND); await sleep(500)
      const voor = await maand()
      await touchDrag(300, 520, 180, 520)     // 120px naar links -> volgende maand
      const na = await maand()
      return { naam, voor, na, gewisseld: voor !== na }
    }
    const dash = await swipeTest(0, 'Dashboard')
    const tx = await swipeTest(1, 'Transacties')

    // Grafieken: midden in het chart-gebied -> maand; vanaf de rand -> tab
    await nav(2); await sleep(900)
    await ensureMonth(page, VERWACHTE_MAAND); await sleep(500)
    const chartBox = await page.locator('div[data-chart-area]').first().boundingBox()
    const maandVoor = await maand()
    const tabVoor = await page.locator('div.flex.gap-2.py-3 button.btn-accent').innerText().catch(() => '')
    await touchDrag(chartBox.x + chartBox.width - 40, chartBox.y + chartBox.height / 2, chartBox.x + 60, chartBox.y + chartBox.height / 2)
    const maandNa = await maand()
    const tabNa = await page.locator('div.flex.gap-2.py-3 button.btn-accent').innerText().catch(() => '')
    const sA = await shot('swipe-grafiek-midden')

    // vanaf de rechterrand (binnen 40px) -> tab wisselt
    const tabVoor2 = await page.locator('div.flex.gap-2.py-3 button.btn-accent').innerText().catch(() => '')
    const maandVoor2 = await maand()
    await touchDrag(378, 520, 258, 520)
    const tabNa2 = await page.locator('div.flex.gap-2.py-3 button.btn-accent').innerText().catch(() => '')
    const maandNa2 = await maand()
    const sB = await shot('swipe-grafiek-rand')

    stap('E4', 'maand-swipe op dashboard/transacties/grafieken + randswipe wisselt tab',
      dash.gewisseld && tx.gewisseld && maandVoor !== maandNa && tabVoor === tabNa
      && tabVoor2 !== tabNa2 && errsSinds(i).length === 0,
      `Dashboard ${dash.voor}->${dash.na}; Transacties ${tx.voor}->${tx.na}; Grafieken midden ${maandVoor}->${maandNa} (tab ${tabVoor}->${tabNa}); randswipe tab ${tabVoor2}->${tabNa2} (maand ${maandVoor2}->${maandNa2}); errors=${errsSinds(i).length}`, sA + ', ' + sB)
  }

  /* ================= E5: backup maken, wissen, terugzetten ================= */
  {
    const i = logs.length
    // geheim-achtige instellingen planten om de filter te toetsen
    await page.evaluate(async () => {
      const db = await new Promise(res => { const r = indexedDB.open('BudgetTracker'); r.onsuccess = () => res(r.result) })
      const store = db.transaction('settings', 'readwrite').objectStore('settings')
      store.put({ key: 'aiApiKey', value: 'geheim-123' })
      store.put({ key: 'aiModel', value: 'test' })
      await new Promise(res => setTimeout(res, 200))
      db.close()
    })
    await nav(4); await sleep(1000)

    const secties = await page.evaluate(() => [...document.querySelectorAll('h2')].map(h => h.textContent.trim()))
    const backupKnop = await page.locator('button', { hasText: 'Backup maken' }).count()
    const restoreKnop = await page.locator('text=Backup terugzetten…').count()
    // "Wis alle transacties" zit onder Geavanceerd
    await page.locator('button', { hasText: 'Geavanceerd' }).click(); await sleep(600)
    const wisKnop = await page.locator('button', { hasText: 'Wis alle transacties' }).count()
    const sA = await shot('instellingen-data-geavanceerd')

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('button', { hasText: 'Backup maken' }).click(),
    ])
    const bestand = path.join(OUT, 'backup.json')
    await download.saveAs(bestand)
    const backup = JSON.parse(fs.readFileSync(bestand, 'utf-8'))
    const settingKeys = backup.tables.settings.map(s => s.key)
    const geheimen = settingKeys.filter(k => k.toLowerCase().startsWith('ai') || k.toLowerCase().includes('apikey'))
    const budgetInBackup = Object.fromEntries(backup.tables.categories.map(c => [c.key, c.budget]))
    await sleep(600)
    const sB = await shot('backup-gemaakt')

    // schemaVersion groeit mee met Dexie (4 in Fase 1, 5 vanaf de declaraties)
    const backupOk = backup.app === 'FinanceTracker' && backup.schemaVersion >= 4
      && backup.tables.transactions.length === 253 && backup.tables.categories.length === 16
      && geheimen.length === 0
    stap('E5a', 'backup maken', backupOk,
      `bestand="${download.suggestedFilename()}"; app="${backup.app}", schemaVersion=${backup.schemaVersion}, exportedAt=${backup.exportedAt}; transactions=${backup.tables.transactions.length}, categories=${backup.tables.categories.length}, settings=${backup.tables.settings.length}, merchantHistory=${backup.tables.merchantHistory.length}, rules=${backup.tables.rules.length}; settings-keys=[${settingKeys}]; geheime keys in backup=${geheimen.length} (aiApiKey/aiModel stonden wél in de db); boodschappen-budget=${budgetInBackup.boodschappen}`, sB)

    // wissen
    await page.locator('button', { hasText: 'Wis alle transacties' }).click(); await sleep(1400)
    const naWis = await page.evaluate(DUMP)
    const sC = await shot('na-wissen')

    // terugzetten
    await page.locator('input[accept="application/json,.json"]').setInputFiles(bestand); await sleep(1200)
    const samenvatting = (await top().innerText()).replace(/\n+/g, ' | ').slice(0, 220)
    const sD = await shot('restore-samenvatting')
    await top().locator('button', { hasText: 'Alles vervangen' }).click(); await sleep(2500)
    await sluitAlles()
    const naHerstel = await page.evaluate(DUMP)
    const sE = await shot('na-terugzetten')
    const b = Object.fromEntries(naHerstel.categories.map(c => [c.key, c.budget]))
    const aiNa = naHerstel.settings.map(s => s.key).filter(k => k.toLowerCase().startsWith('ai'))

    stap('E5b', 'wissen en terugzetten',
      naWis.transactionCount === 0 && naHerstel.transactionCount === 253
      && naHerstel.categories.length === 16 && b.boodschappen === 333 && errsSinds(i).length === 0,
      `na wissen ${naWis.transactionCount} transacties (categorieen blijven: ${naWis.categories.length}); samenvattingssheet: "${samenvatting}"; na terugzetten ${naHerstel.transactionCount} transacties, ${naHerstel.categories.length} categorieen, boodschappen=${b.boodschappen}, woning=${b.woning}, reiskosten=${b.reiskosten}, hobbys=${b.hobbys}; ai-keys na replace-restore: ${aiNa.length}; errors=${errsSinds(i).length}`, sC + ', ' + sD + ', ' + sE)

    stappen.push({ id: 'E5-secties', titel: 'info', pass: true, bewijs: `secties=${JSON.stringify(secties)}, backupKnop=${backupKnop}, restoreKnop=${restoreKnop}, wisKnop=${wisKnop}`, screenshot: sA })
    stap('E5c', 'Instellingen-indeling (Data + Geavanceerd)',
      secties.includes('Data') && backupKnop === 1 && restoreKnop >= 1 && wisKnop === 1,
      `secties=${secties.join(' / ')}; "Backup maken"=${backupKnop}, "Backup terugzetten…"=${restoreKnop}, "Wis alle transacties" onder Geavanceerd=${wisKnop}`, sA)
  }

  /* ================= E6: herkenningsregels ================= */
  {
    const i = logs.length
    await nav(4); await sleep(900)
    await page.locator('button', { hasText: 'Herkenningsregels' }).click(); await sleep(900)
    await top().locator('input[placeholder="Trefwoorden, komma-gescheiden"]').fill('coffee company')
    await top().locator('button', { hasText: 'Kies categorie' }).click(); await sleep(800)
    await top().locator('button', { has: page.locator('span:text-is("Boodschappen")') }).first().click(); await sleep(700)
    await top().locator('button', { hasText: 'Geen subcategorie' }).click(); await sleep(800)
    await top().locator('button', { hasText: 'Regel toevoegen' }).click(); await sleep(1200)
    const naToevoegen = await page.evaluate(() => new Promise(res => {
      const r = indexedDB.open('BudgetTracker')
      r.onsuccess = () => { const db = r.result; const q = db.transaction('rules').objectStore('rules').getAll(); q.onsuccess = () => { res(q.result); db.close() } }
    }))
    const s = await shot('herkenningsregel')
    await top().locator('button[aria-label="Regel verwijderen"]').click(); await sleep(1200)
    const naVerwijderen = await page.evaluate(() => new Promise(res => {
      const r = indexedDB.open('BudgetTracker')
      r.onsuccess = () => { const db = r.result; const q = db.transaction('rules').objectStore('rules').getAll(); q.onsuccess = () => { res(q.result); db.close() } }
    }))
    await sluitAlles()
    stap('E6', 'herkenningsregel toevoegen en verwijderen',
      naToevoegen.length === 1 && naToevoegen[0].category === 'boodschappen'
      && JSON.stringify(naToevoegen[0].keywords) === JSON.stringify(['coffee company'])
      && naVerwijderen.length === 0 && errsSinds(i).length === 0,
      `na toevoegen ${naToevoegen.length} regel: ${JSON.stringify(naToevoegen[0])}; na verwijderen ${naVerwijderen.length}; errors=${errsSinds(i).length}`, s)
  }

  /* ================= E7: contrast licht thema ================= */
  {
    const i = logs.length
    await nav(4); await sleep(800)
    await page.locator('button', { hasText: /^Donker$/ }).click(); await sleep(700)
    await page.locator('button', { hasText: /^Licht$/ }).click(); await sleep(900)
    const c = await page.evaluate(() => {
      const parse = s => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100 }
      const muted = getComputedStyle(document.documentElement).getPropertyValue('--color-muted').trim()
      const surface = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim()
      const hex = h => {                       // ondersteunt #fff en #ffffff
        const v = h.replace('#', '')
        const f = v.length === 3 ? v.split('').map(c => c + c) : [v.slice(0, 2), v.slice(2, 4), v.slice(4, 6)]
        return f.map(x => parseInt(x, 16))
      }
      const el = [...document.querySelectorAll('div')].find(d => /transacties in de app$/.test(d.textContent.trim()) && d.children.length === 0)
      const elKleur = el ? parse(getComputedStyle(el).color) : null
      let bgEl = el, bg = [255, 255, 255]
      while (bgEl) { const b = getComputedStyle(bgEl).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { bg = parse(b); break } bgEl = bgEl.parentElement }
      return {
        muted, surface,
        variabeleRatio: ratio(hex(muted), hex(surface.startsWith('#') ? surface : '#ffffff')),
        surfaceRgb: hex(surface.startsWith('#') ? surface : '#ffffff'),
        elementTekst: el?.textContent.trim() ?? null, elementKleur: elKleur, elementBg: bg,
        elementRatio: elKleur ? ratio(elKleur, bg) : null,
      }
    })
    const s = await shot('contrast-licht-thema')
    stap('E7', 'contrast --color-muted in licht thema >= 4,5:1',
      c.elementRatio >= 4.5 && c.variabeleRatio >= 4.5,
      `--color-muted=${c.muted} op ${c.surface} => ${c.variabeleRatio}:1; "${c.elementTekst}" rgb(${c.elementKleur}) op rgb(${c.elementBg}) => ${c.elementRatio}:1 (was 2,54:1 in ronde 3); errors=${errsSinds(i).length}`, s)
  }

  return { stappen, e2 }
}
