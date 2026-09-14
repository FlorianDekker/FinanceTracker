// Scenario H: bonnetjes (Fase 5, stap 5B).
//
// De AI-dienst wordt onderschept met `page.route('**/chat/completions')` en
// geeft een vast antwoord terug — letterlijk de JSON die Qwen op
// `lidl_bon_a.jpeg` teruggaf tijdens de meetronde van 14 september 2026
// (tests/receipts/REPORT.md). Zo draait de test zonder API-sleutel, zonder
// netwerk en zonder kosten, maar wel over de echte keten:
// bestand -> verkleinen -> uitlezen -> opslaan -> koppelen -> corrigeren.
import fs from 'node:fs'
import path from 'node:path'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Exact het antwoord uit de meting; alleen het omhulsel van de API is nagemaakt.
const BON_JSON = {
  merchant: 'Lidl',
  date: '2026-02-11',
  time: '20:22',
  currency: 'EUR',
  total: 3.24,
  payment_method: 'pin',
  items: [
    { name: 'Chips Great Britain', qty: 1, unit_price: 1.69, price: 1.69, group: 'snacks_snoep' },
    { name: 'Zakdoekjes balsem', qty: 1, unit_price: 1.55, price: 1.55, group: 'huishouden' },
  ],
  discounts: [],
}

const API_ANTWOORD = {
  id: 'mock-1',
  model: 'Qwen/Qwen3.5-9B',
  usage: { prompt_tokens: 1760, completion_tokens: 184, total_tokens: 1944 },
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(BON_JSON) } }],
}

// Leest de bonnetjes-kant van de database uit. Blobs laten we bewust liggen:
// die zijn niet serialiseerbaar naar Node, dus we tellen alleen de pagina's.
const DUMP_BON = async () => {
  const db = await new Promise((resolve, reject) => {
    const rq = indexedDB.open('BudgetTracker')
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
  const lees = naam => new Promise((resolve, reject) => {
    const rq = db.transaction(naam, 'readonly').objectStore(naam).getAll()
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
  const receipts = await lees('receipts')
  const receiptItems = await lees('receiptItems')
  const transactions = await lees('transactions')
  const settings = await lees('settings')
  db.close()
  return {
    version: db.version,
    receipts: receipts.map(r => ({
      id: r.id, transactionId: r.transactionId, status: r.status, merchant: r.merchant,
      merchantKey: r.merchantKey, date: r.date, time: r.time, total: r.total, model: r.model,
      pages: (r.pages ?? []).length, heeftThumb: !!r.thumb, items: r.items ?? [], source: r.source,
      heeftPdf: !!r.pdf, rawTextLen: (r.rawText ?? '').length,
    })),
    receiptItems: receiptItems.map(i => ({ id: i.id, receiptId: i.receiptId, nameKey: i.nameKey, group: i.group, price: i.price, date: i.date, transactionId: i.transactionId })),
    transactions: transactions.map(t => ({ id: t.id, date: t.date, amount: t.amount, note: t.note, receiptId: t.receiptId ?? null })),
    groupOverrides: settings.find(s => s.key === 'receiptGroupOverrides')?.value ?? null,
    stats: settings.find(s => s.key === 'receiptStats')?.value ?? null,
    heeftSleutel: !!settings.find(s => s.key === 'aiApiKey')?.value,
  }
}

const MONTHS_LONG = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']

export async function scenarioReceipts({ page, OUT, logs, BASE, DATA }) {
  const isError = l => l.type !== 'warning'
  const errsSinds = i => logs.slice(i).filter(isError)
  let n = 0
  const shot = async naam => {
    await sleep(450); n += 1
    const bestand = `H-${String(n).padStart(2, '0')}-${naam}`
    await page.screenshot({ path: path.join(OUT, `${bestand}.png`), fullPage: true })
    return `${bestand}.png`
  }
  const stappen = []
  const stap = (id, titel, pass, bewijs, screenshot) => {
    stappen.push({ id, titel, pass, bewijs, screenshot })
    console.log(`   ${pass ? 'PASS' : 'FAIL'} ${id} ${titel}: ${bewijs}`)
  }

  const sheets = () => page.evaluate(() => document.querySelectorAll('div.fixed.bottom-0.left-0.right-0').length)
  const top = () => page.locator('div.fixed.bottom-0.left-0.right-0').last()
  const sluitTop = async () => { await page.locator('button[aria-label="Sluiten"]').last().click(); await sleep(650) }
  const sluitAlles = async () => { for (let i = 0; i < 6 && await sheets() > 0; i++) await sluitTop() }
  const nav = async i => { await sluitAlles(); await page.locator('nav a').nth(i).click(); await sleep(900) }

  // De rijen van de transactielijst reageren alleen op echte touch-events.
  async function touchTap(locator) {
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

  async function naarMaand(label) {
    for (let i = 0; i < 24; i++) {
      const kop = await page.locator('h1').first().innerText()
      if (kop.trim() === label) return true
      const [maand, jaar] = kop.trim().split(' ')
      const nu = Number(jaar) * 12 + MONTHS_LONG.indexOf(maand)
      const [dm, dj] = label.split(' ')
      const doel = Number(dj) * 12 + MONTHS_LONG.indexOf(dm)
      await page.locator('button', { hasText: nu > doel ? /^‹$/ : /^›$/ }).first().click()
      await sleep(380)
    }
    return false
  }

  /* ---------------- de AI-dienst nabootsen ---------------- */
  const aanroepen = []
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  await page.route('**/chat/completions', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    let body = null
    try { body = JSON.parse(route.request().postData() ?? '{}') } catch { /* niet erg */ }
    aanroepen.push({
      model: body?.model,
      denkenUit: body?.chat_template_kwargs?.enable_thinking === false,
      beelden: (Array.isArray(body?.messages?.[1]?.content) ? body.messages[1].content : []).filter(c => c.type === 'image_url').length,
      tekstDelen: (Array.isArray(body?.messages?.[1]?.content) ? body.messages[1].content : []).filter(c => c.type === 'text').length,
      auth: (route.request().headers().authorization ?? '').slice(0, 12),
    })
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(API_ANTWOORD) })
  })

  /* ================= H1: sleutel invullen + test verbinding ================= */
  {
    const i = logs.length
    await nav(4)
    await page.locator('text=AI & bonnetjes').first().scrollIntoViewIfNeeded()
    await page.locator('input[type="password"]').fill('sk-test-nep-sleutel')
    await page.locator('input[type="password"]').blur()
    await sleep(500)
    await page.locator('button', { hasText: /^Test verbinding$/ }).click()
    await page.waitForSelector('text=Verbinding gelukt', { timeout: 15000 })
    const testTekst = await page.locator('text=Verbinding gelukt').innerText()
    const dump = await page.evaluate(DUMP_BON)
    const s = await shot('instellingen-ai')
    stap('H1', 'API-sleutel opslaan en verbinding testen',
      dump.heeftSleutel && /Verbinding gelukt/.test(testTekst) && aanroepen.length === 1 && errsSinds(i).length === 0,
      `db=v${dump.version}, sleutel opgeslagen=${dump.heeftSleutel}, test="${testTekst}", aanroepen=${aanroepen.length}; errors=${errsSinds(i).length}`, s)
  }

  /* ================= H2: de banktransactie van €3,24 ================= */
  {
    const i = logs.length
    await nav(1)
    await page.locator('button.fixed.right-4').click(); await sleep(900)
    await top().locator('input[type=date]').fill('2026-02-11')
    await top().locator('input[inputmode="decimal"]').fill('3,24')
    await page.locator('span:text-is("Categorie")').locator('xpath=following-sibling::button').first().click()
    await sleep(800)
    await top().locator('button', { has: page.locator('span:text-is("Boodschappen")') }).first().click()
    await sleep(700)
    await top().locator('button', { hasText: 'Geen subcategorie' }).click(); await sleep(600)
    await top().locator('input[placeholder="Bijv. Albert Heijn"]').fill('Lidl Utrecht')
    // Een nog niet opgeslagen transactie heeft geen id om een bon aan te hangen;
    // de bon-rij hoort hier dus nog niet te staan (die controleren we in H6).
    const bonRij = await top().locator('text=Bon toevoegen').count()
    const s = await shot('formulier-nieuwe-transactie')
    await top().locator('button', { hasText: /^Opslaan$/ }).click(); await sleep(1200)
    await sluitAlles()
    const dump = await page.evaluate(DUMP_BON)
    const tx = dump.transactions.find(t => t.note === 'Lidl Utrecht')
    stap('H2', 'transactie €3,24 op 2026-02-11 aangemaakt',
      !!tx && tx.amount === 3.24 && tx.date === '2026-02-11' && tx.receiptId == null && bonRij === 0
      && errsSinds(i).length === 0,
      `transactie=${JSON.stringify(tx)}; bon-rij in een nieuw formulier=${bonRij} (0 verwacht); errors=${errsSinds(i).length}`, s)
  }

  /* ================= H3: bon uploaden via /bon en uitlezen ================= */
  const sample = ['lidl_bon_a.jpeg', 'lidl_bon_b.jpeg']
    .map(f => path.join(DATA, 'samples', f)).find(f => fs.existsSync(f))
  {
    const i = logs.length
    await page.goto(`${BASE}bon`, { waitUntil: 'networkidle' })
    await sleep(900)
    const sA = await shot('bon-leeg')
    await page.locator('button', { hasText: 'Bon toevoegen' }).first().click(); await sleep(800)
    await top().locator('input[type=file][accept="image/*,application/pdf"]').setInputFiles(sample)
    await sleep(1200)
    const sB = await shot('stuk-klaar')
    await page.locator('button', { hasText: 'Opslaan en uitlezen' }).click()
    await page.waitForSelector('text=Koppel aan transactie', { timeout: 30000 })
    await sleep(600)

    const viewer = (await top().innerText()).replace(/\n+/g, ' | ')
    const dump = await page.evaluate(DUMP_BON)
    const bon = dump.receipts[0]
    const sC = await shot('viewer-uitgelezen')
    stap('H3', 'bon uit bestand uitgelezen: 2 regels en totaal €3,24',
      dump.receipts.length === 1 && bon.total === 3.24 && bon.date === '2026-02-11' && bon.merchant === 'Lidl'
      && bon.merchantKey === 'lidl'
      && bon.items.length === 2 && bon.status === 'extracted' && bon.pages === 1 && bon.heeftThumb
      && dump.receiptItems.length === 2 && /Chips Great Britain/.test(viewer) && /Zakdoekjes balsem/.test(viewer)
      && /3,24/.test(viewer) && /klopt/.test(viewer)
      && aanroepen[1]?.denkenUit === true && aanroepen[1]?.beelden === 1 && errsSinds(i).length === 0,
      `bestand=${path.basename(sample)}; bon=${JSON.stringify({ ...bon, items: bon.items.map(x => `${x.name} ${x.price} ${x.group}`) })}; ` +
      `receiptItems=${dump.receiptItems.length}; stats=${JSON.stringify(dump.stats)}; ` +
      `aanroep=${JSON.stringify(aanroepen[1])}; viewer="${viewer.slice(0, 200)}"; errors=${errsSinds(i).length}`,
      [sA, sB, sC].join(', '))
  }

  /* ================= H4: koppelen aan de beste kandidaat ================= */
  {
    const i = logs.length
    await page.locator('button', { hasText: 'Koppel aan transactie' }).click(); await sleep(1200)
    const kandidaten = (await top().innerText()).replace(/\n+/g, ' | ')
    const sA = await shot('kandidaten')
    await top().locator('button', { hasText: 'Lidl Utrecht' }).first().click(); await sleep(1500)

    const dump = await page.evaluate(DUMP_BON)
    const bon = dump.receipts[0]
    const tx = dump.transactions.find(t => t.note === 'Lidl Utrecht')
    const sB = await shot('gekoppeld')
    stap('H4', 'beste kandidaat staat bovenaan en koppelt beide kanten',
      /Lidl Utrecht/.test(kandidaten) && /zelfde dag/.test(kandidaten) && /bedrag klopt/.test(kandidaten)
      && bon.transactionId === tx.id && tx.receiptId === bon.id && bon.status === 'linked'
      && dump.receiptItems.length === 2 && dump.receiptItems.every(r => r.transactionId === tx.id)
      && errsSinds(i).length === 0,
      `kandidaten="${kandidaten.slice(0, 180)}"; bon.transactionId=${bon.transactionId}, tx.receiptId=${tx.receiptId}, ` +
      `status=${bon.status}, receiptItems=${dump.receiptItems.length}; errors=${errsSinds(i).length}`,
      [sA, sB].join(', '))
  }

  /* ================= H5: groep corrigeren wordt onthouden ================= */
  {
    const i = logs.length
    await top().locator('button', { hasText: 'Huishouden' }).first().click(); await sleep(900)
    const groepen = (await top().innerText()).replace(/\n+/g, ' | ')
    const sA = await shot('groepkiezer')
    await top().locator('button', { hasText: 'Verzorging' }).first().click(); await sleep(1300)

    const dump = await page.evaluate(DUMP_BON)
    const bon = dump.receipts[0]
    const zakdoek = bon.items.find(x => x.nameKey === 'zakdoekjes balsem')
    const regel = dump.receiptItems.find(r => r.nameKey === 'zakdoekjes balsem')
    const sB = await shot('groep-gecorrigeerd')
    stap('H5', 'groep corrigeren wordt per nameKey onthouden en gespiegeld',
      zakdoek?.group === 'verzorging' && regel?.group === 'verzorging'
      && dump.groupOverrides?.['zakdoekjes balsem'] === 'verzorging'
      && dump.groupOverrides?.['chips great britain'] === undefined
      && bon.status === 'linked' && errsSinds(i).length === 0,
      `groepen-sheet="${groepen.slice(0, 120)}"; item.group=${zakdoek?.group}, receiptItem.group=${regel?.group}, ` +
      `overrides=${JSON.stringify(dump.groupOverrides)}; errors=${errsSinds(i).length}`,
      [sA, sB].join(', '))
  }

  /* ================= H6: 🧾 in de transactielijst en in het formulier ================= */
  {
    const i = logs.length
    await sluitAlles()
    await nav(1)
    await naarMaand('Februari 2026')
    const rijLocator = page.locator('div.divide-y button', { hasText: 'Lidl Utrecht' }).first()
    const rij = await rijLocator.innerText()
    const sA = await shot('transactielijst-met-bon')

    await touchTap(rijLocator)
    await sleep(1000)
    const formulier = (await top().innerText()).replace(/\n+/g, ' | ')
    const sB = await shot('formulier-met-bon')
    await sluitAlles()
    stap('H6', 'de transactierij toont 🧾 en het formulier de bon-rij met het aantal regels',
      /🧾/.test(rij) && /🧾 Bon · 2 regels/.test(formulier) && /Lidl/.test(formulier)
      && errsSinds(i).length === 0,
      `rij="${rij.replace(/\n+/g, ' | ')}"; formulier="${formulier.slice(0, 220)}"; errors=${errsSinds(i).length}`,
      [sA, sB].join(', '))
  }

  /* ================= H7: backup zonder afbeeldingen ================= */
  {
    const i = logs.length
    await nav(4)
    const toggle = await page.locator('text=Met bon-afbeeldingen (groter bestand)').count()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('button', { hasText: 'Backup maken' }).click(),
    ])
    const bestand = path.join(OUT, 'H-backup.json')
    await download.saveAs(bestand)
    const backup = JSON.parse(fs.readFileSync(bestand, 'utf-8'))
    const bon = backup.tables.receipts?.[0]
    const geheim = JSON.stringify(backup).includes('sk-test-nep-sleutel')
    const s = await shot('backup-zonder-afbeeldingen')
    stap('H7', 'backup zonder afbeeldingen bevat de regels maar niet de foto’s',
      toggle === 1 && backup.schemaVersion === 6 && backup.includesImages === false
      && backup.tables.receipts.length === 1 && bon.items.length === 2
      && !('pages' in bon) && !('pdf' in bon) && !('thumb' in bon)
      && backup.tables.receiptItems.length === 2 && !geheim && errsSinds(i).length === 0,
      `toggle aanwezig=${toggle}; schemaVersion=${backup.schemaVersion}, includesImages=${backup.includesImages}, ` +
      `receipts=${backup.tables.receipts.length} (items=${bon?.items?.length}, pages-veld=${'pages' in (bon ?? {})}), ` +
      `receiptItems=${backup.tables.receiptItems.length}, sleutel in backup=${geheim}; errors=${errsSinds(i).length}`, s)
  }

  /* ================= H8: een AH-PDF uit Bestanden ================= */
  const pdfSample = path.join(DATA, 'samples', 'ah_bon_2026-09-10.pdf')
  if (fs.existsSync(pdfSample)) {
    const i = logs.length
    await page.goto(`${BASE}bon`, { waitUntil: 'networkidle' })
    await sleep(900)
    await page.locator('button', { hasText: 'Bon toevoegen' }).first().click(); await sleep(800)
    // Een PDF gaat meteen door: renderen, tekst uitlezen en dan de AI-aanroep.
    await top().locator('input[type=file][accept="image/*,application/pdf"]').setInputFiles(pdfSample)
    await page.waitForSelector('text=Koppel aan transactie', { timeout: 40000 })
    await sleep(600)

    const dump = await page.evaluate(DUMP_BON)
    const bon = dump.receipts.find(r => r.source === 'pdf')
    const laatste = aanroepen[aanroepen.length - 1]
    const s = await shot('pdf-uitgelezen')
    stap('H8', 'AH-PDF: pagina gerenderd, tekst uitgelezen en allebei meegestuurd',
      !!bon && bon.pages === 1 && bon.heeftPdf && bon.heeftThumb && bon.rawTextLen > 200
      && laatste?.beelden === 1 && laatste?.tekstDelen === 2 && errsSinds(i).length === 0,
      `bon={source:${bon?.source}, pages:${bon?.pages}, pdf bewaard:${bon?.heeftPdf}, thumb:${bon?.heeftThumb}, ` +
      `rawText:${bon?.rawTextLen} tekens, regels:${bon?.items?.length}}; aanroep=${JSON.stringify(laatste)}; ` +
      `errors=${errsSinds(i).length}`, s)
  } else {
    stap('H8', 'AH-PDF overgeslagen', true, `voorbeeldbestand ontbreekt: ${pdfSample}`)
  }

  await page.unroute('**/chat/completions')
  return { stappen, aanroepen }
}
