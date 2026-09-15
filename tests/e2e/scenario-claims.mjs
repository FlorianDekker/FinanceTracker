// Scenario Declaraties (Fase 2): markeren, indienen als batch, CSV exporteren,
// de uitbetaling koppelen met een verschil en de afkeur-flow, inclusief de
// gevolgen voor het dashboard en het budget.
import fs from 'node:fs'
import path from 'node:path'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const MONTHS_LONG = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']
const nu = new Date()
const DEZE_MAAND = `${MONTHS_LONG[nu.getMonth()]} ${nu.getFullYear()}`

// Leest transacties en batches rechtstreeks uit IndexedDB.
const DUMP_CLAIMS = async () => {
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
  const transactions = await lees('transactions')
  const claimBatches = await lees('claimBatches')
  db.close()
  return {
    batches: claimBatches,
    claims: transactions
      .filter(t => t.claimStatus)
      .map(t => ({ id: t.id, note: t.note, amount: t.amount, category: t.category, subcategory: t.subcategory, claimStatus: t.claimStatus, claimBatchId: t.claimBatchId })),
  }
}

export async function scenarioClaims({ page, OUT, logs, ensureMonth }) {
  const isError = l => l.type !== 'warning'
  const errsSinds = i => logs.slice(i).filter(isError)
  let n = 0
  const shot = async naam => {
    await sleep(450); n += 1
    const bestand = `F-${String(n).padStart(2, '0')}-${naam}`
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

  const kaartBedrag = async label => page.evaluate(l => {
    for (const btn of document.querySelectorAll('div.grid.grid-cols-3 button')) {
      if (!btn.innerText.includes(l)) continue
      const m = btn.innerText.match(/€([\d.]+),(\d\d)/)
      if (m) return Number(m[1].replace(/\./g, '') + '.' + m[2])
    }
    return null
  }, label)

  // Eén transactie via het formulier op de transactiepagina.
  async function nieuweTransactie({ bedrag, richting = 'Af', categorie, sub, omschrijving, declaratie = false }) {
    await nav(1)
    await page.locator('button.fixed.right-4').click(); await sleep(900)
    await top().locator('input[inputmode="decimal"]').fill(bedrag)
    if (richting === 'Bij') { await top().locator('button', { hasText: /^Bij$/ }).click(); await sleep(300) }
    await page.locator('span:text-is("Categorie")').locator('xpath=following-sibling::button').first().click()
    await sleep(800)
    await top().locator('button', { has: page.locator(`span:text-is("${categorie}")`) }).first().click()
    await sleep(700)
    if (sub) { await top().locator('button', { hasText: sub }).first().click(); await sleep(700) }
    await top().locator('input[placeholder="Bijv. Albert Heijn"]').fill(omschrijving)
    if (declaratie) { await top().locator('button', { hasText: 'Declaratie voor werk' }).click(); await sleep(300) }
    const s = await shot(`formulier-${omschrijving.toLowerCase().replace(/\s+/g, '-')}`)
    await top().locator('button', { hasText: /^Opslaan$/ }).click(); await sleep(1200)
    await sluitAlles()
    return s
  }

  /* ================= F1: twee declaraties markeren via het formulier ================= */
  {
    const i = logs.length
    await nieuweTransactie({ bedrag: '30', categorie: 'Reiskosten', omschrijving: 'NS Utrecht werk', declaratie: true })
    const s = await nieuweTransactie({ bedrag: '20', categorie: 'Reiskosten', omschrijving: 'Lunch klant', declaratie: true })
    const dump = await page.evaluate(DUMP_CLAIMS)
    const open = dump.claims.filter(c => c.claimStatus === 'open')
    stap('F1', 'twee uitgaven gemarkeerd als declaratie', open.length === 2 && errsSinds(i).length === 0,
      `${open.length} open declaraties: ${JSON.stringify(open.map(o => `${o.note} ${o.amount} ${o.category}`))}; errors=${errsSinds(i).length}`, s)
  }

  /* ================= F2: dashboardkaart -> /declaraties, Open toont ze ================= */
  let openTekst = ''
  {
    const i = logs.length
    await nav(0)
    const kaart = await page.locator('a[href*="declaraties"]').count()
    await page.locator('a[href*="declaraties"]').first().click(); await sleep(1200)
    const url = page.url()
    openTekst = (await page.locator('div.card').nth(1).innerText()).replace(/\n+/g, ' | ')
    const kop = (await page.locator('div.card').first().innerText()).replace(/\n+/g, ' | ')
    const knop = await page.locator('button', { hasText: /indienen ·/ }).innerText().catch(() => '')
    const s = await shot('declaraties-open')
    stap('F2', 'dashboardkaart opent /declaraties met beide declaraties onder Open',
      kaart === 1 && /\/declaraties$/.test(url) && /NS Utrecht werk/.test(openTekst) && /Lunch klant/.test(openTekst)
      && /2 indienen · €50,00/.test(knop) && errsSinds(i).length === 0,
      `dashboardkaart=${kaart}, url=${url}; kop="${kop}"; lijst="${openTekst}"; knop="${knop}"; errors=${errsSinds(i).length}`, s)
  }

  /* ================= F3: indienen als batch ================= */
  {
    const i = logs.length
    await page.locator('button', { hasText: /indienen ·/ }).click(); await sleep(900)
    const naam = await top().locator('input[type="text"]').first().inputValue()
    const sA = await shot('indienen-sheet')
    await top().locator('button', { hasText: /^Indienen ·/ }).click(); await sleep(1500)
    await sluitAlles()
    const dump = await page.evaluate(DUMP_CLAIMS)
    const batch = dump.batches[0]
    const submitted = dump.claims.filter(c => c.claimStatus === 'submitted')
    const tabTekst = (await page.locator('div.card').nth(1).innerText()).replace(/\n+/g, ' | ')
    const sB = await shot('ingediend-batch')
    stap('F3', 'indienen maakt één batch en zet beide items op submitted',
      dump.batches.length === 1 && batch?.status === 'submitted' && batch?.expectedTotal === 50
      && submitted.length === 2 && submitted.every(c => c.claimBatchId === batch.id)
      && /2 uitgaven/.test(tabTekst) && errsSinds(i).length === 0,
      `standaardnaam="${naam}"; batch=${JSON.stringify(batch)}; submitted=${submitted.length}; kaart="${tabTekst}"; errors=${errsSinds(i).length}`,
      sA + ', ' + sB)
  }

  /* ================= F4: CSV exporteren ================= */
  {
    const i = logs.length
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.locator('button', { hasText: 'Exporteer CSV' }).click(),
    ])
    const bestand = path.join(OUT, 'declaratie.csv')
    await download.saveAs(bestand)
    const ruw = fs.readFileSync(bestand, 'utf-8')
    const bom = ruw.charCodeAt(0) === 0xFEFF
    const regels = ruw.replace(/^﻿/, '').trim().split(/\r\n/)
    const s = await shot('na-csv')
    stap('F4', 'CSV met BOM, puntkomma\'s en decimale komma',
      /^declaratie-.*\.csv$/.test(download.suggestedFilename()) && bom
      && regels[0] === 'datum;omschrijving;categorie;subcategorie;bedrag'
      && regels.length === 3 && /;NS Utrecht werk;Reiskosten;;30,00$/.test(regels[1])
      && /;Lunch klant;Reiskosten;;20,00$/.test(regels[2]) && errsSinds(i).length === 0,
      `bestand="${download.suggestedFilename()}", BOM=${bom}, ${regels.length} regels: ${JSON.stringify(regels)}; errors=${errsSinds(i).length}`, s)
  }

  /* ================= F5: de bijschrijving van werk aanmaken ================= */
  let boodschappenVoor = null
  {
    const i = logs.length
    await nieuweTransactie({ bedrag: '30', richting: 'Bij', categorie: 'Salaris', omschrijving: 'Declaratie werk sept' })
    await nav(0)
    await ensureMonth(page, DEZE_MAAND)
    boodschappenVoor = await kaartBedrag('Boodschappen')
    const s = await shot('dashboard-voor-koppelen')
    stap('F5', 'bijschrijving van €30 aangemaakt (totaal min het afgekeurde item)',
      boodschappenVoor != null && errsSinds(i).length === 0,
      `Boodschappen in ${DEZE_MAAND} vóór de afkeur: €${boodschappenVoor}; errors=${errsSinds(i).length}`, s)
  }

  /* ================= F6: uitbetaling koppelen + afkeur-flow ================= */
  {
    const i = logs.length
    await page.locator('a[href*="declaraties"]').first().click(); await sleep(1200)
    await page.locator('button', { hasText: /^Ingediend$/ }).click(); await sleep(700)
    await page.locator('button', { hasText: 'Uitbetaling koppelen' }).click(); await sleep(1000)
    const kandidaten = (await top().innerText()).replace(/\n+/g, ' | ')
    const sA = await shot('kies-bijschrijving')
    await top().locator('button', { hasText: 'Declaratie werk sept' }).click(); await sleep(900)

    const vergelijking = (await top().innerText()).replace(/\n+/g, ' | ')
    const sB = await shot('vergelijking')
    await top().locator('button', { hasText: /^Verder$/ }).click(); await sleep(900)

    // Afkeurstap: het item van €20 aanvinken, de teller moet passen
    await top().locator('button', { hasText: 'Lunch klant' }).click(); await sleep(600)
    const teller = (await top().innerText()).replace(/\n+/g, ' | ')
    const sC = await shot('welke-afgekeurd')
    await top().locator('button', { hasText: /^Verder$/ }).click(); await sleep(900)

    // Categorie kiezen: Reiskosten -> Boodschappen
    const voorKeuze = (await top().innerText()).replace(/\n+/g, ' | ')
    await top().locator('button', { hasText: 'wijzigen' }).first().click(); await sleep(900)
    await top().locator('button', { has: page.locator('span:text-is("Boodschappen")') }).first().click(); await sleep(800)
    await top().locator('button', { hasText: 'Geen subcategorie' }).click(); await sleep(800)
    const knop = await top().locator('button', { hasText: /Afronden|houden hun huidige/ }).innerText()
    const sD = await shot('afkeur-categorie')
    await top().locator('button', { hasText: /Afronden/ }).click(); await sleep(1800)
    await sluitAlles()

    const dump = await page.evaluate(DUMP_CLAIMS)
    const batch = dump.batches[0]
    const item1 = dump.claims.find(c => c.note === 'NS Utrecht werk')
    const item2 = dump.claims.find(c => c.note === 'Lunch klant')
    const payout = dump.claims.find(c => c.note === 'Declaratie werk sept')
    const sE = await shot('afgehandeld')

    stap('F6', 'uitbetaling koppelen met verschil + afkeur-flow',
      item1?.claimStatus === 'paid' && item2?.claimStatus === 'rejected' && item2?.category === 'boodschappen'
      && item2?.claimBatchId === batch.id && payout?.claimStatus === 'payout' && payout?.claimBatchId === batch.id
      && batch?.status === 'closed' && batch?.paidAmount === 30 && batch?.paidAt > 0
      && /€20,00 van €20,00/.test(teller) && /1 gewijzigd/.test(knop) && errsSinds(i).length === 0,
      `kandidaten="${kandidaten.slice(0, 120)}"; vergelijking="${vergelijking.slice(0, 160)}"; teller="${teller.slice(0, 120)}"; ` +
      `categoriestap="${voorKeuze.slice(0, 120)}"; eindknop="${knop}"; ` +
      `item1=${JSON.stringify(item1)}; item2=${JSON.stringify(item2)}; payout=${JSON.stringify(payout)}; batch=${JSON.stringify(batch)}; ` +
      `errors=${errsSinds(i).length}`,
      [sA, sB, sC, sD, sE].join(', '))
  }

  /* ================= F7: dashboardkaart weg, budget gestegen ================= */
  {
    const i = logs.length
    await nav(0)
    await ensureMonth(page, DEZE_MAAND)
    const kaart = await page.locator('a[href*="declaraties"]').count()
    const boodschappenNa = await kaartBedrag('Boodschappen')
    const s = await shot('dashboard-na-afhandeling')
    const stijging = Math.round(((boodschappenNa ?? 0) - (boodschappenVoor ?? 0)) * 100) / 100
    stap('F7', 'kaart "Declaraties open" verdwijnt en het budget stijgt met het afgekeurde bedrag',
      kaart === 0 && stijging === 20 && errsSinds(i).length === 0,
      `dashboardkaart=${kaart} (0 verwacht); Boodschappen €${boodschappenVoor} -> €${boodschappenNa} (+${stijging}); errors=${errsSinds(i).length}`, s)
  }

  /* ================= F8: het afgehandelde tabblad ================= */
  {
    const i = logs.length
    await nav(1)
    await page.locator('a[href*="declaraties"]').first().click(); await sleep(1200)
    await page.locator('button', { hasText: /^Afgehandeld$/ }).click(); await sleep(800)
    const tekst = (await page.locator('div.card').nth(1).innerText()).replace(/\n+/g, ' | ')
    await page.locator('div.card').nth(1).locator('button').first().click(); await sleep(1000)
    const detail = (await top().innerText()).replace(/\n+/g, ' | ').slice(0, 200)
    const s = await shot('afgehandeld-detail')
    await sluitAlles()
    stap('F8', 'Afgehandeld toont de afgesloten batch met het afgekeurde bedrag',
      /Uitbetaald/.test(tekst) && /€20,00 afgekeurd/.test(tekst) && /Lunch klant/.test(detail) && errsSinds(i).length === 0,
      `kaart="${tekst}"; detail="${detail}"; errors=${errsSinds(i).length}`, s)
  }

  /* ========== F9: categorie wijzigen op een open declaratie ========== */
  {
    const i = logs.length
    await nieuweTransactie({ bedrag: '12', categorie: 'Reiskosten', omschrijving: 'Taxi station', declaratie: true })
    await nav(1)
    await page.locator('a[href*="declaraties"]').first().click(); await sleep(1200)
    await page.locator('div.card button', { hasText: 'Taxi station' }).first().click(); await sleep(900)
    const voor = (await top().innerText()).replace(/\n+/g, ' | ')
    const sA = await shot('item-categorie-rij')

    await top().locator('button', { hasText: 'wijzigen' }).first().click(); await sleep(900)
    await top().locator('button', { has: page.locator('span:text-is("Boodschappen")') }).first().click(); await sleep(800)
    await top().locator('button', { hasText: 'Geen subcategorie' }).click(); await sleep(1200)
    const na = (await top().innerText()).replace(/\n+/g, ' | ')
    const sB = await shot('item-categorie-gewijzigd')
    await sluitAlles()

    const dump = await page.evaluate(DUMP_CLAIMS)
    const taxi = dump.claims.find(c => c.note === 'Taxi station')
    stap('F9', 'categorie van een open declaratie wijzigen via de detail-sheet',
      /Categorie/.test(voor) && /Reiskosten/.test(voor) && /Boodschappen/.test(na)
      && taxi?.category === 'boodschappen' && taxi?.claimStatus === 'open' && errsSinds(i).length === 0,
      `sheet vooraf="${voor.slice(0, 140)}"; na de keuze="${na.slice(0, 140)}"; item=${JSON.stringify(taxi)}; errors=${errsSinds(i).length}`,
      sA + ', ' + sB)
  }

  /* ========== F10: Voorschot omzetten + voorstel bij afkeuren ========== */
  {
    const i = logs.length
    await nieuweTransactie({ bedrag: '18', categorie: 'Voorschot', omschrijving: 'NS Utrecht' })
    await nieuweTransactie({ bedrag: '15', categorie: 'Voorschot', omschrijving: 'Tikkie Jan' })

    // Instellingen -> de eenmalige omzetting (de bevestiging wordt automatisch geaccepteerd)
    await nav(4)
    const kaart = await page.locator('h2:text-is("Declaraties")').locator('xpath=following-sibling::div').first().innerText()
    const sA = await shot('instellingen-omzetting')
    await page.locator('button', { hasText: 'Zet Voorschot-uitgaven om naar declaraties' }).click(); await sleep(1500)
    const toast = await page.locator('div.mx-4.mt-4').first().innerText().catch(() => '')
    const naOmzetting = await page.evaluate(DUMP_CLAIMS)
    const omgezet = naOmzetting.claims.filter(c => ['NS Utrecht', 'Tikkie Jan'].includes(c.note))
    const sB = await shot('na-omzetting')

    // "Niet declareren" op de NS-rit: de app stelt Reiskosten voor
    await nav(1)
    await page.locator('a[href*="declaraties"]').first().click(); await sleep(1200)
    await page.locator('div.card button', { hasText: 'NS Utrecht' }).first().click(); await sleep(900)
    await top().locator('button', { hasText: 'Niet declareren' }).click(); await sleep(1200)
    const voorstel = (await top().innerText()).replace(/\n+/g, ' | ')
    const sC = await shot('afkeuren-voorstel')
    await top().locator('button', { hasText: /^Bevestigen$/ }).click(); await sleep(1500)
    await sluitAlles()

    const dump = await page.evaluate(DUMP_CLAIMS)
    const ns = dump.claims.find(c => c.note === 'NS Utrecht')
    const tikkie = dump.claims.find(c => c.note === 'Tikkie Jan')
    const sD = await shot('na-afkeuren-voorstel')

    stap('F10', 'Voorschot omzetten en bij afkeuren de échte categorie voorgesteld krijgen',
      omgezet.length === 2 && omgezet.every(c => c.claimStatus === 'open' && c.category === 'voorschot')
      && /Tip: gebruik voor nieuwe werkkosten/.test(kaart)
      && /voorstel/.test(voorstel) && /Reiskosten/.test(voorstel)
      && ns?.claimStatus === 'rejected' && ns?.category === 'reiskosten'
      && tikkie?.claimStatus === 'open' && tikkie?.category === 'voorschot' && errsSinds(i).length === 0,
      `instellingenkaart="${kaart.replace(/\n+/g, ' | ').slice(0, 220)}"; toast="${toast.replace(/\n+/g, ' ').slice(0, 90)}"; ` +
      `na omzetting=${JSON.stringify(omgezet)}; afkeursheet="${voorstel.slice(0, 160)}"; ` +
      `ns=${JSON.stringify(ns)}; tikkie=${JSON.stringify(tikkie)}; errors=${errsSinds(i).length}`,
      [sA, sB, sC, sD].join(', '))
  }

  return { stappen }
}
