// Scenario Import (Fase 3B): een ING-export wordt herkend, een onbekend
// CSV-formaat gaat door de kolommapper en die indeling wordt de volgende keer
// automatisch herkend.
//
// Alle testbestanden zijn verzonnen (fictieve namen, bedragen en IBAN's) en
// worden in een tijdelijke map gezet; er komt geen echte bankdata aan te pas.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sleep = ms => new Promise(r => setTimeout(r, ms))

const ING_CSV = [
  '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"',
  '"20260902";"Bakkerij Zon";"NL01INGB0001234567";"";"BA";"Af";"12,45";"Betaalautomaat";"Pasvolgnr: 003";"1.987,55";""',
  '"20260903";"Supermarkt Fictief";"NL01INGB0001234567";"";"BA";"Af";"38,90";"Betaalautomaat";"Pasvolgnr: 003";"1.948,65";""',
  '"20260904";"J. Voorbeeld";"NL01INGB0001234567";"NL02TEST0987654321";"GT";"Bij";"25,00";"Online bankieren";"Naam: J. Voorbeeld Omschrijving: Pizza-avond";"1.973,65";""',
  '"20260905";"Woningstichting Fictief";"NL01INGB0001234567";"NL03TEST0555555555";"IC";"Af";"1.050,00";"Incasso";"Naam: Woningstichting Fictief Omschrijving: Huur september";"923,65";""',
  '"20260908";"Sportclub Fictief";"NL01INGB0001234567";"NL04TEST0444444444";"IC";"Af";"29,95";"Incasso";"Naam: Sportclub Fictief Omschrijving: Contributie";"893,70";""',
].join('\r\n')

// Onbekende bank: geen enkele parser herkent deze kopregel.
const ONBEKEND_CSV = [
  'Boekdatum;Tekst;Bedrag EUR',
  '02-09-2026;Boekhandel Fictief;-18,99',
  '04-09-2026;Terugbetaling Fictief;7,50',
  '06-09-2026;Koffiehuis Fictief;-4,25',
].join('\r\n')

// Zelfde kopregel, andere regels: de bewaarde indeling moet meteen werken.
const ONBEKEND_CSV_2 = [
  'Boekdatum;Tekst;Bedrag EUR',
  '11-09-2026;Bloemist Fictief;-14,50',
  '12-09-2026;Museum Fictief;-9,75',
].join('\r\n')

// Leest de transacties rechtstreeks uit IndexedDB.
const DUMP_TX = async () => {
  const db = await new Promise((resolve, reject) => {
    const rq = indexedDB.open('BudgetTracker')
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
  const rows = await new Promise((resolve, reject) => {
    const rq = db.transaction('transactions', 'readonly').objectStore('transactions').getAll()
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
  const settings = await new Promise((resolve, reject) => {
    const rq = db.transaction('settings', 'readonly').objectStore('settings').getAll()
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
  db.close()
  return {
    count: rows.length,
    rows: rows.map(t => ({ date: t.date, amount: t.amount, type: t.type, note: t.note, account: t.account ?? null, balance: t.balance ?? null, category: t.category })),
    csvMappings: settings.find(s => s.key === 'csvMappings')?.value ?? null,
  }
}

export async function scenarioImport({ page, OUT, logs }) {
  const isError = l => l.type !== 'warning'
  const errsSinds = i => logs.slice(i).filter(isError)
  let n = 0
  const shot = async naam => {
    await sleep(450); n += 1
    const bestand = `G-${String(n).padStart(2, '0')}-${naam}`
    await page.screenshot({ path: path.join(OUT, `${bestand}.png`), fullPage: true })
    return `${bestand}.png`
  }
  const stappen = []
  const stap = (id, titel, pass, bewijs, screenshot) => {
    stappen.push({ id, titel, pass, bewijs, screenshot })
    console.log(`   ${pass ? 'PASS' : 'FAIL'} ${id} ${titel}: ${bewijs}`)
  }

  // Testbestanden klaarzetten
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-e2e-import-'))
  const ingFile = path.join(tmp, 'ing-export.csv')
  const onbekendFile = path.join(tmp, 'onbekende-bank.csv')
  const onbekendFile2 = path.join(tmp, 'onbekende-bank-2.csv')
  fs.writeFileSync(ingFile, ING_CSV)
  fs.writeFileSync(onbekendFile, ONBEKEND_CSV)
  fs.writeFileSync(onbekendFile2, ONBEKEND_CSV_2)

  const kop = () => page.locator('div.font-bold', { hasText: 'nieuwe transacties' }).first()
  const subkop = () => kop().locator('xpath=following-sibling::div').first()
  const kiesBestand = async bestand => {
    await page.locator('input[type=file]').first().setInputFiles(bestand)
    await sleep(1600)
  }
  const naarImport = async () => {
    await page.locator('nav a').nth(3).click()
    await sleep(900)
  }

  const start = logs.length
  await naarImport()
  const uploadTekst = await page.locator('#root').innerText()
  await page.locator('button', { hasText: 'Hoe exporteer ik?' }).click()
  await sleep(400)
  const hulpTekst = await page.locator('#root').innerText()
  const uploadShot = await shot('upload-bankneutraal')
  stap('G1', 'upload-stap is bank-neutraal',
    !/ABN AMRO exportbestand/.test(uploadTekst) && /Exporteer je transacties bij je bank/.test(uploadTekst)
      && ['ABN AMRO', 'ING', 'Rabobank', 'bunq', 'Revolut', 'N26'].every(b => hulpTekst.includes(b)),
    `copy: "${uploadTekst.replace(/\n+/g, ' | ').slice(0, 90)}"; hulp noemt 6 banken`, uploadShot)

  /* ---- 1. ING-bestand wordt herkend ---- */
  await kiesBestand(ingFile)
  const ingKop = await kop().innerText().catch(() => '')
  const ingSub = await subkop().innerText().catch(() => '')
  const ingShot = await shot('ing-review')
  stap('G2', 'ING-export herkend, 5 rijen in review',
    ingKop.includes('5 nieuwe transacties') && ingSub.includes('ING'),
    `kop="${ingKop}" · bron="${ingSub}"`, ingShot)

  /* ---- 1b. Veeg een rij naar links om over te slaan, en herstel hem weer ---- */
  const eersteRij = page.locator('div.divide-y.divide-border > div.relative.overflow-hidden').first()
  const rijBox = await eersteRij.boundingBox()
  await page.mouse.move(rijBox.x + rijBox.width / 2, rijBox.y + rijBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rijBox.x + rijBox.width / 2 - 200, rijBox.y + rijBox.height / 2, { steps: 10 })
  await page.mouse.up()
  await sleep(400) // uitschuifanimatie + state-update
  const naSkipKop = await kop().innerText().catch(() => '')
  const skipShot = await shot('ing-rij-overgeslagen')
  stap('G2b', 'veeg naar links slaat een rij over (5 -> 4)',
    naSkipKop.includes('4 nieuwe transacties'), `kop="${naSkipKop}"`, skipShot)

  await page.locator('button', { hasText: 'Herstel' }).click()
  await sleep(300)
  const naHerstelKop = await kop().innerText().catch(() => '')
  const herstelShot = await shot('ing-rij-hersteld')
  stap('G2c', 'Herstel zet de overgeslagen rij terug (4 -> 5)',
    naHerstelKop.includes('5 nieuwe transacties'), `kop="${naHerstelKop}"`, herstelShot)

  await page.locator('button', { hasText: /^Opslaan$/ }).click()
  await page.waitForSelector('text=transacties opgeslagen', { timeout: 10000 })
  const naIng = await page.evaluate(DUMP_TX)
  const metAccount = naIng.rows.filter(r => r.account === 'NL01INGB0001234567')
  const metBalance = naIng.rows.filter(r => r.balance !== null)
  stap('G3', 'opslaan bewaart rekening en saldo',
    naIng.count === 5 && metAccount.length === 5 && metBalance.length === 5,
    `${naIng.count} transacties, ${metAccount.length} met account, ${metBalance.length} met balance (bv. ${JSON.stringify(naIng.rows[0])})`,
    await shot('ing-opgeslagen'))

  /* ---- 2. Onbekend formaat -> kolommapper ---- */
  await page.locator('button', { hasText: 'Nog een bestand importeren' }).click()
  await sleep(700)
  await kiesBestand(onbekendFile)
  const mapperOpen = await page.locator('text=Welke kolom is wat?').count() > 0
  const mapperShot = await shot('kolommapper-open')
  stap('G4', 'onbekend CSV opent de kolommapper', mapperOpen,
    mapperOpen ? 'sheet "Welke kolom is wat?" geopend' : 'geen kolommapper verschenen', mapperShot)

  const sheet = page.locator('div.fixed.bottom-0.left-0.right-0').last()
  const selects = sheet.locator('select')
  await selects.nth(0).selectOption('0')            // datumkolom
  await selects.nth(1).selectOption('DD-MM-YYYY')   // datumnotatie
  await selects.nth(2).selectOption('2')            // bedragkolom
  await selects.nth(3).selectOption('signed')       // teken in het bedrag
  await sheet.locator('button', { hasText: /^2\. Tekst$/ }).click()   // omschrijving
  await sleep(700)
  const voorbeeld = await sheet.innerText()
  const voorbeeldOk = voorbeeld.includes('Boekhandel Fictief') && voorbeeld.includes('18,99')
  const preShot = await shot('kolommapper-voorbeeld')
  stap('G5', 'live voorbeeld toont geparste rijen', voorbeeldOk,
    voorbeeldOk ? 'voorbeeld bevat "Boekhandel Fictief · 18,99"' : voorbeeld.replace(/\n+/g, ' | ').slice(0, 200), preShot)

  await sheet.locator('button', { hasText: 'Gebruik deze indeling' }).click()
  await sleep(1500)
  const mapKop = await kop().innerText().catch(() => '')
  const mapShot = await shot('kolommapper-review')
  stap('G6', 'na "Gebruik deze indeling" staan er 3 rijen in review',
    mapKop.includes('3 nieuwe transacties'), `kop="${mapKop}"`, mapShot)

  await page.locator('button', { hasText: /^Opslaan$/ }).click()
  await page.waitForSelector('text=transacties opgeslagen', { timeout: 10000 })
  const naMapper = await page.evaluate(DUMP_TX)
  const bewaard = Object.keys(naMapper.csvMappings ?? {})
  stap('G7', 'de indeling is bewaard onder de kopregel',
    naMapper.count === 8 && bewaard.includes('boekdatum|tekst|bedrag eur'),
    `${naMapper.count} transacties; bewaarde indelingen: ${bewaard.join(' / ') || 'geen'}`,
    await shot('mapper-opgeslagen'))

  /* ---- 3. Zelfde kopregel: indeling wordt herkend ---- */
  await page.locator('button', { hasText: 'Nog een bestand importeren' }).click()
  await sleep(700)
  await kiesBestand(onbekendFile2)
  const tweedeKop = await kop().innerText().catch(() => '')
  const paginaTekst = await page.locator('#root').innerText()
  const herkend = paginaTekst.includes('Eigen indeling herkend')
  const herkendShot = await shot('eigen-indeling-herkend')
  stap('G8', 'dezelfde kopregel wordt de tweede keer herkend',
    herkend && tweedeKop.includes('2 nieuwe transacties') && await page.locator('text=Welke kolom is wat?').count() === 0,
    `kop="${tweedeKop}", melding "Eigen indeling herkend"=${herkend}, kolommapper bleef dicht`, herkendShot)

  await page.locator('button', { hasText: /^Opslaan$/ }).click()
  await page.waitForSelector('text=transacties opgeslagen', { timeout: 10000 })
  const eind = await page.evaluate(DUMP_TX)
  stap('G9', 'eindstand', eind.count === 10 && errsSinds(start).length === 0,
    `${eind.count} transacties in de database (5 ING + 3 + 2), console-errors: ${errsSinds(start).length}`,
    await shot('eindstand'))

  fs.rmSync(tmp, { recursive: true, force: true })
  return { stappen, eind }
}
