// Scenario D: de categorie-beheer-UI (geintroduceerd in v2-stap 5).
// Sheets renderen in een portal op <body>, dus we scopen steeds op de bovenste sheet.
import path from 'node:path'

const sleep = ms => new Promise(r => setTimeout(r, ms))

export function maakHelpers({ page, OUT, logs, DUMP }) {
  const isError = l => l.type !== 'warning'
  let n = 0
  const shot = async naam => {
    await sleep(450)
    n += 1
    const bestand = `D-${String(n).padStart(2, '0')}-${naam}`
    await page.screenshot({ path: path.join(OUT, `${bestand}.png`), fullPage: true })
    return `${bestand}.png`
  }
  // Bovenste sheet in de portal-stapel (backdrop + paneel delen de klassen niet).
  const top = () => page.locator('div.fixed.bottom-0.left-0.right-0').last()
  const sluitTop = async () => { await page.locator('button[aria-label="Sluiten"]').last().click(); await sleep(600) }
  const dump = () => page.evaluate(DUMP)
  const cat = async key => (await dump()).categories.find(c => c.key === key) ?? null
  const errsSinds = i => logs.slice(i).filter(isError)
  // Rijen van de beheer-sheet: label + ondertitel ("2 subs", "geen subs · inkomen").
  const rijen = () => top().evaluate(el => [...el.querySelectorAll('button.flex-1')].map(b => {
    const s = b.querySelectorAll('span.block')
    return { label: s[0]?.textContent.trim() ?? '', sub: s[1]?.textContent.trim() ?? '' }
  }))
  // showArchived blijft in React-state staan, dus de sectie kan al openstaan.
  const zorgArchiefOpen = async () => {
    if (await top().locator('button', { hasText: /^Herstel$/ }).count() === 0) {
      await top().locator('button', { hasText: /^Gearchiveerd \(/ }).click()
      await sleep(800)
    }
  }
  const opinRij = async label => {
    await top().locator('button.flex-1').filter({ has: page.locator(`span:text-is("${label}")`) }).first().click()
    await sleep(700)
  }
  return { shot, top, sluitTop, dump, cat, errsSinds, rijen, opinRij, zorgArchiefOpen, isError }
}

export async function beheerScenario({ page, OUT, logs, DUMP, dialogs }) {
  const H = maakHelpers({ page, OUT, logs, DUMP })
  const { shot, top, sluitTop, dump, cat, errsSinds, rijen, opinRij, zorgArchiefOpen } = H
  const stappen = []
  const stap = (nr, titel, pass, bewijs, screenshot) => {
    stappen.push({ nr, titel, pass, bewijs, screenshot })
    console.log(`   ${pass ? 'PASS' : 'FAIL'} D${nr} ${titel}: ${bewijs}`)
  }

  /* --- 1. beheer-sheet openen --- */
  {
    const i = logs.length
    await page.locator('nav a').nth(4).click(); await sleep(900)
    await page.locator('button', { hasText: 'Categorieën beheren' }).first().click()
    await sleep(900)
    const titel = await top().locator('div.text-base.font-semibold').first().innerText().catch(() => '')
    const r = await rijen()
    const s = await shot('beheer-open')
    stap(1, 'beheer-sheet opent', titel === 'Categorieën beheren' && r.length === 16,
      `titel="${titel}", ${r.length} actieve categorieen, errors=${errsSinds(i).length}`, s)
  }

  /* --- 2. nieuwe categorie "Huisdieren" --- */
  {
    const i = logs.length
    await top().locator('button', { hasText: '+ Nieuwe categorie' }).click(); await sleep(800)
    await top().locator('input[placeholder="Bijv. Huisdieren"]').fill('Huisdieren')
    await top().locator('button', { hasText: /^🐶$/ }).click(); await sleep(200)
    await top().locator('button[aria-label="Turquoise"]').click(); await sleep(200)
    await top().locator('button', { hasText: /^\+50$/ }).click(); await sleep(200)
    const budgetVeld = await top().locator('input[type=number]').inputValue()
    const s = await shot('nieuwe-categorie-ingevuld')
    await top().locator('button', { hasText: /^Toevoegen$/ }).click(); await sleep(1200)
    const r = await rijen()
    const c = await cat('huisdieren')
    stap(2, 'nieuwe categorie toevoegen',
      !!c && c.label === 'Huisdieren' && c.icon === '🐶' && c.color === '#30B0C7' && c.budget === 50
        && r[r.length - 1]?.label === 'Huisdieren' && errsSinds(i).length === 0,
      `db-rij ${JSON.stringify({ key: c?.key, label: c?.label, icon: c?.icon, color: c?.color, budget: c?.budget, order: c?.order, type: c?.type })}; budgetveld="${budgetVeld}"; laatste rij in lijst="${r[r.length - 1]?.label}" (${r.length} rijen); errors=${errsSinds(i).length}`, s)
  }

  /* --- 3. hernoemen naar "Huisdier" --- */
  {
    const i = logs.length
    await opinRij('Huisdieren')
    await top().locator('input[placeholder="Bijv. Huisdieren"]').fill('Huisdier')
    await top().locator('button', { hasText: /^Opslaan$/ }).click(); await sleep(1100)
    const c = await cat('huisdieren')
    const r = await rijen()
    const s = await shot('hernoemd')
    stap(3, 'hernoemen (key blijft slug)', c?.label === 'Huisdier' && c?.key === 'huisdieren' && r.some(x => x.label === 'Huisdier'),
      `db: key="${c?.key}" label="${c?.label}"; lijst toont "${r.find(x => x.label === 'Huisdier')?.label}"; errors=${errsSinds(i).length}`, s)
  }

  /* --- 4. subcategorieen toevoegen --- */
  {
    const i = logs.length
    await opinRij('Huisdier')
    const nieuw = top().locator('input[placeholder="Nieuwe subcategorie"]')
    await nieuw.fill('Voer'); await top().locator('button', { hasText: /^\+$/ }).last().click(); await sleep(300)
    await nieuw.fill('Dierenarts'); await top().locator('button', { hasText: /^\+$/ }).last().click(); await sleep(300)
    await top().locator('button', { hasText: /^Opslaan$/ }).click(); await sleep(1100)
    const c = await cat('huisdieren')
    const rij = (await rijen()).find(x => x.label === 'Huisdier')
    const s = await shot('subs-toegevoegd')
    stap(4, 'subcategorieen toevoegen',
      JSON.stringify(c?.subs) === JSON.stringify([{ key: 'voer', label: 'Voer' }, { key: 'dierenarts', label: 'Dierenarts' }]) && rij?.sub === '2 subs',
      `db subs=${JSON.stringify(c?.subs)}; lijst-ondertitel="${rij?.sub}"; errors=${errsSinds(i).length}`, s)
  }

  /* --- 5. omhoog verplaatsen tot bovenaan + volgorde blijft na sluiten --- */
  {
    const i = logs.length
    for (let k = 0; k < 20; k++) {
      const r = await rijen()
      const idx = r.findIndex(x => x.label === 'Huisdier')
      if (idx <= 0) break
      await top().locator('div.divide-y > div').nth(idx).locator('button[aria-label="Omhoog"]').click()
      await sleep(350)
    }
    const naVerplaatsen = await rijen()
    const dumpNa = await dump()
    const orders = dumpNa.categories.filter(c => !c.archived).sort((a, b) => a.order - b.order).map(c => `${c.key}:${c.order}`)
    await sluitTop()                                   // beheer-sheet sluiten
    await page.locator('button', { hasText: 'Categorieën beheren' }).first().click(); await sleep(900)
    const naHeropenen = await rijen()
    const s = await shot('volgorde-bovenaan')
    stap(5, 'volgorde: ▲ tot bovenaan, blijft na heropenen',
      naVerplaatsen[0]?.label === 'Huisdier' && naHeropenen[0]?.label === 'Huisdier'
      && dumpNa.categories.find(c => c.key === 'huisdieren')?.order === 0,
      `na ▲: [${naVerplaatsen.slice(0, 3).map(x => x.label)}]; na heropenen: [${naHeropenen.slice(0, 3).map(x => x.label)}]; db order huisdieren=${dumpNa.categories.find(c => c.key === 'huisdieren')?.order}; orders=${orders.slice(0, 5).join(', ')}…; errors=${errsSinds(i).length}`, s)
  }

  /* --- 6. transactie via de kiezer: Huisdier > Voer, 12,50 --- */
  {
    const i = logs.length
    await sluitTop()
    await page.locator('nav a').nth(1).click(); await sleep(900)   // Transacties (daar staat de + FAB)
    await page.locator('button', { hasText: /^\+$/ }).last().click(); await sleep(900)
    await page.locator('button', { hasText: 'Kies categorie…' }).click(); await sleep(800)
    await top().locator('button', { hasText: 'Huisdier' }).first().click(); await sleep(600)   // heeft subs -> subniveau
    const subNiveau = await top().locator('button').allInnerTexts()
    await top().locator('button', { hasText: /^Voer$/ }).first().click(); await sleep(700)
    await page.locator('input[placeholder="0,00"]').fill('12,50')
    const knopTekst = await page.locator('button', { hasText: 'Huisdier' }).first().innerText()
    const s = await shot('transactie-formulier')
    await page.locator('button', { hasText: /^Opslaan$/ }).first().click(); await sleep(1400)
    const d = await page.evaluate(async () => {
      const db = await new Promise(res => { const r = indexedDB.open('BudgetTracker'); r.onsuccess = () => res(r.result) })
      const rows = await new Promise(res => { const r = db.transaction('transactions').objectStore('transactions').getAll(); r.onsuccess = () => res(r.result) })
      db.close()
      return { totaal: rows.length, huisdier: rows.filter(t => t.category === 'huisdieren') }
    })
    const tx = d.huisdier[0]
    stap(6, 'transactie via categoriekiezer',
      d.huisdier.length === 1 && tx?.category === 'huisdieren' && tx?.subcategory === 'voer' && tx?.amount === 12.5 && errsSinds(i).length === 0,
      `db-transactie ${JSON.stringify({ category: tx?.category, subcategory: tx?.subcategory, amount: tx?.amount, type: tx?.type })}; totaal nu ${d.totaal}; knop toonde "${knopTekst.replace(/\n/g, ' ')}"; subniveau=[${subNiveau.filter(Boolean).join(', ')}]; errors=${errsSinds(i).length}`, s)
  }

  /* --- 7. systeemrol Inkomen verhuizen en terugzetten --- */
  {
    const i = logs.length
    const dialogsVoor = dialogs.length
    await page.locator('nav a').nth(4).click(); await sleep(900)
    await page.locator('button', { hasText: 'Categorieën beheren' }).first().click(); await sleep(900)
    await opinRij('Huisdier')
    await top().locator('button', { hasText: /^Inkomen$/ }).last().click(); await sleep(500)   // rol-rij staat onder Type
    await top().locator('button', { hasText: /^Opslaan$/ }).click(); await sleep(1200)
    const na = await dump()
    const h = na.categories.find(c => c.key === 'huisdieren')
    const sal = na.categories.find(c => c.key === 'salaris')
    const s = await shot('rol-inkomen-verhuisd')
    const bevestiging = dialogs.slice(dialogsVoor)
    stap(7, 'systeemrol Inkomen verhuist (Salaris verliest hem)',
      h?.role === 'income' && sal?.role === null && bevestiging.some(d => /Salaris verliest dan de rol/.test(d.message)),
      `db: huisdieren.role="${h?.role}", salaris.role=${JSON.stringify(sal?.role)}; confirm="${bevestiging.map(d => d.message).join(' | ')}"; errors=${errsSinds(i).length}`, s)

    // terugzetten: Huisdier -> Geen, Salaris -> Inkomen
    await opinRij('Huisdier')
    await top().locator('button', { hasText: /^Geen$/ }).click(); await sleep(400)
    await top().locator('button', { hasText: /^Opslaan$/ }).click(); await sleep(1100)
    await opinRij('Salaris')
    await top().locator('button', { hasText: /^Inkomen$/ }).last().click(); await sleep(400)
    await top().locator('button', { hasText: /^Opslaan$/ }).click(); await sleep(1200)
    const terug = await dump()
    const s2 = await shot('rol-teruggezet')
    stap(7.1, 'systeemrol teruggezet',
      terug.categories.find(c => c.key === 'salaris')?.role === 'income' && terug.categories.find(c => c.key === 'huisdieren')?.role === null,
      `db: salaris.role="${terug.categories.find(c => c.key === 'salaris')?.role}", huisdieren.role=${JSON.stringify(terug.categories.find(c => c.key === 'huisdieren')?.role)}`, s2)
  }

  /* --- 8. archiveren met verplaatsing van de transactie --- */
  {
    const i = logs.length
    await opinRij('Huisdier')
    const txTekst = await top().locator('div.text-xs.text-muted.mt-2.text-center').innerText().catch(() => '')
    await top().locator('button', { hasText: /^Archiveren$/ }).click(); await sleep(800)
    const keuzeTekst = await top().innerText()
    await top().locator('button', { hasText: /^Verplaats 1 transactie naar…$/ }).click(); await sleep(800)
    // rij-knop bevat icoon + label, dus matchen op het label-span
    await top().locator('button', { has: page.locator('span:text-is("Boodschappen")') }).first().click(); await sleep(600)  // heeft subs -> subniveau
    await top().locator('button', { hasText: 'Geen subcategorie' }).click(); await sleep(1500)
    const na = await dump()
    const d = await page.evaluate(async () => {
      const db = await new Promise(res => { const r = indexedDB.open('BudgetTracker'); r.onsuccess = () => res(r.result) })
      const rows = await new Promise(res => { const r = db.transaction('transactions').objectStore('transactions').getAll(); r.onsuccess = () => res(r.result) })
      db.close()
      return rows.filter(t => t.amount === 12.5)
    })
    const s = await shot('gearchiveerd-met-verplaatsing')
    const h = na.categories.find(c => c.key === 'huisdieren')
    stap(8, 'archiveren + transactie verplaatsen naar Boodschappen',
      h?.archived === true && d[0]?.category === 'boodschappen' && d[0]?.subcategory === '' && errsSinds(i).length === 0,
      `db: huisdieren.archived=${h?.archived}; verplaatste transactie ${JSON.stringify({ category: d[0]?.category, subcategory: d[0]?.subcategory, amount: d[0]?.amount })}; sheet meldde "${txTekst}" / "${keuzeTekst.split('\n').filter(Boolean).slice(0, 3).join(' | ')}"; errors=${errsSinds(i).length}`, s)
  }

  /* --- 9. herstel -> opnieuw archiveren -> verwijderen --- */
  {
    const i = logs.length
    const dialogsVoor = dialogs.length
    const archZichtbaar = await top().locator('button', { hasText: /^Gearchiveerd \(1\)/ }).count() > 0
    await zorgArchiefOpen()
    const archRegel = await top().innerText()
    const sA = await shot('archief-sectie')
    await top().locator('button', { hasText: /^Herstel$/ }).click(); await sleep(1200)
    const naHerstel = await dump()
    // opnieuw archiveren, nu zonder transacties -> window.confirm
    await opinRij('Huisdier')
    await top().locator('button', { hasText: /^Archiveren$/ }).click(); await sleep(1400)
    const naArchief = await dump()
    await zorgArchiefOpen()
    await top().locator('button', { hasText: /^Verwijder$/ }).waitFor({ timeout: 10000 })
    await top().locator('button', { hasText: /^Verwijder$/ }).click(); await sleep(1400)
    const naVerwijder = await dump()
    const s = await shot('verwijderd')
    const dlg = dialogs.slice(dialogsVoor)
    stap(9, 'herstel -> archiveer -> verwijder',
      naHerstel.categories.find(c => c.key === 'huisdieren')?.archived === false
      && naArchief.categories.find(c => c.key === 'huisdieren')?.archived === true
      && !naVerwijder.categories.some(c => c.key === 'huisdieren')
      && naVerwijder.categories.length === 16 && errsSinds(i).length === 0,
      `sectie "Gearchiveerd (1)" zichtbaar=${archZichtbaar} ("${archRegel.split('\n').filter(Boolean).slice(-4).join(' | ')}"); na herstel archived=${naHerstel.categories.find(c => c.key === 'huisdieren')?.archived}; na archiveren archived=${naArchief.categories.find(c => c.key === 'huisdieren')?.archived}; na verwijderen aanwezig=${naVerwijder.categories.some(c => c.key === 'huisdieren')} (${naVerwijder.categories.length} rijen); confirms="${dlg.map(d => d.message).join(' | ')}"; errors=${errsSinds(i).length}`, s)
  }

  /* --- 10. restbak kan niet gearchiveerd worden --- */
  {
    const i = logs.length
    await opinRij('Overige kosten')
    const archKnop = await top().locator('button', { hasText: /^Archiveren$/ }).count()
    const uitleg = await top().innerText()
    const s = await shot('restbak-geen-archiveren')
    await page.locator('button[aria-label="Sluiten"]').last().click(); await sleep(700)
    stap(10, 'restbak (Overige kosten) heeft geen Archiveren-knop',
      archKnop === 0 && /restbak kan niet gearchiveerd worden/i.test(uitleg),
      `Archiveren-knoppen=${archKnop}; uitleg aanwezig=${/restbak kan niet gearchiveerd worden/i.test(uitleg)}; errors=${errsSinds(i).length}`, s)
  }

  /* --- 11. contrast van de "transacties in de app"-regel in licht thema --- */
  {
    const i = logs.length
    await page.locator('button[aria-label="Sluiten"]').last().click().catch(() => {})
    await sleep(500)
    await page.locator('nav a').nth(4).click(); await sleep(800)
    await page.locator('button', { hasText: /^Donker$/ }).click(); await sleep(700)
    await page.locator('button', { hasText: /^Licht$/ }).click(); await sleep(900)
    const contrast = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => /transacties in de app$/.test(d.textContent.trim()) && d.children.length === 0)
      if (!el) return { gevonden: false }
      const parse = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const kleur = parse(getComputedStyle(el).color)
      let bgEl = el, bg = null
      while (bgEl) {
        const b = getComputedStyle(bgEl).backgroundColor
        if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { bg = parse(b); break }
        bgEl = bgEl.parentElement
      }
      const lum = ([r, g, b]) => {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const l1 = lum(kleur), l2 = lum(bg ?? [255, 255, 255])
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      return { gevonden: true, tekst: el.textContent.trim(), kleur, bg, ratio: Math.round(ratio * 100) / 100 }
    })
    const s = await shot('licht-thema-over-sectie')
    // Referentie: op main/c0594d8 had deze regel class "text-white" op een witte
    // kaart -> contrast 1.0:1 (volledig onzichtbaar). Dat is hier verholpen.
    stap(11, 'regel "transacties in de app" is zichtbaar in licht thema',
      contrast.gevonden && contrast.ratio > 1.5,
      `tekst="${contrast.tekst}", color=rgb(${contrast.kleur}), achtergrond=rgb(${contrast.bg}), contrast=${contrast.ratio}:1 (was 1.0:1 wit-op-wit); errors=${errsSinds(i).length}`, s)
    stap(11.1, 'diezelfde regel haalt WCAG AA (4.5:1)',
      contrast.ratio >= 4.5,
      `contrast=${contrast.ratio}:1 — dit is de app-brede "text-muted"-tint, identiek aan "Versie" en "Gegevens opgeslagen op dit apparaat" erboven; geen regressie van deze commit maar wel onder AA`, s)
  }

  return stappen
}
