// Voorbeelddata: deterministisch, plausibel en volledig te plaatsen binnen de
// categorie-templates van de onboarding.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { generateDemoTransactions, loadDemoData, clearDemoData, DEMO_MODE_KEY } = await import(`${SRC}/utils/demoData.js`)
const { buildTemplateRows, templateDefs } = await import(`${SRC}/constants/templates.js`)
const { db } = await import(`${SRC}/db/db.js`)

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok', name) }
const ta = async (name, fn) => { await fn(); n++; console.log('  ok', name) }

const TODAY = new Date('2026-09-14T10:00:00Z')
const rijen = generateDemoTransactions({ seed: 4242, today: TODAY })

t('dezelfde seed levert exact dezelfde transacties', () => {
  const opnieuw = generateDemoTransactions({ seed: 4242, today: TODAY })
  assert.deepEqual(opnieuw, rijen)
  const anders = generateDemoTransactions({ seed: 99, today: TODAY })
  assert.notDeepEqual(anders, rijen, 'een andere seed geeft andere data')
})

t('ongeveer 300 rijen over zes maanden', () => {
  assert.ok(rijen.length > 240 && rijen.length < 360, `${rijen.length} rijen`)
  const maanden = new Set(rijen.map(r => r.date.slice(0, 7)))
  assert.equal(maanden.size, 6, [...maanden].join(', '))
})

t('alle bedragen positief, datums oplopend en niet in de toekomst', () => {
  const laatste = TODAY.toISOString().slice(0, 10)
  let vorige = '0000-00-00'
  for (const tx of rijen) {
    assert.ok(tx.amount > 0, `bedrag ${tx.amount} bij ${tx.note}`)
    assert.ok(['debit', 'credit'].includes(tx.type))
    assert.match(tx.date, /^\d{4}-\d{2}-\d{2}$/)
    assert.ok(tx.date <= laatste, `${tx.date} ligt in de toekomst`)
    assert.ok(tx.date >= vorige, 'gesorteerd op datum')
    vorige = tx.date
    assert.ok(tx.note && tx.note.length > 1)
  }
})

t('drie openstaande declaraties in reiskosten', () => {
  const claims = rijen.filter(tx => tx.claimStatus === 'open')
  assert.equal(claims.length, 3)
  for (const claim of claims) {
    assert.equal(claim.category, 'reiskosten')
    assert.equal(claim.type, 'debit')
    assert.equal(claim.claimBatchId, null)
  }
})

t('elke categorie en subcategorie bestaat in de standaard-template', () => {
  const defs = templateDefs('standaard')
  const byKey = new Map(defs.map(d => [d.key, d]))
  for (const tx of rijen) {
    const def = byKey.get(tx.category)
    assert.ok(def, `categorie ${tx.category} ontbreekt in de template`)
    if (tx.subcategory) {
      assert.ok(def.subs.some(s => s.key === tx.subcategory), `${tx.category}/${tx.subcategory} ontbreekt`)
    }
  }
})

t('vaste lasten en salaris zitten er elke maand in', () => {
  const perMaand = m => rijen.filter(tx => tx.date.startsWith(m))
  const maanden = [...new Set(rijen.map(r => r.date.slice(0, 7)))]
  for (const maand of maanden.slice(0, 5)) {          // de lopende maand kan nog niet compleet zijn
    const noten = perMaand(maand).map(tx => tx.note)
    for (const vast of ['Woningstichting De Sleutel', 'Vattenfall', 'Spotify', 'Salaris Werkgever BV']) {
      assert.ok(noten.includes(vast), `${vast} ontbreekt in ${maand}`)
    }
  }
  const salaris = rijen.filter(tx => tx.note === 'Salaris Werkgever BV')
  assert.ok(salaris.every(tx => tx.type === 'credit' && tx.date.endsWith('-25')))
  assert.ok(salaris.every(tx => tx.amount > 2400 && tx.amount < 2500))
})

/* ── In de database ──────────────────────────────────────────────────── */

await ta('loadDemoData vult de database en zet demoMode', async () => {
  await db.open()
  await db.categories.bulkPut(buildTemplateRows('standaard'))
  const aantal = await loadDemoData({ seed: 4242, today: TODAY })

  assert.equal(await db.transactions.count(), aantal)
  assert.equal(await db.merchantHistory.count(), aantal, 'leerdata meteen gevuld')
  assert.equal((await db.settings.get(DEMO_MODE_KEY))?.value, true)
  assert.equal(await db.transactions.where('claimStatus').equals('open').count(), 3)

  const keys = new Set((await db.categories.toArray()).map(c => c.key))
  const onbekend = (await db.transactions.toArray()).filter(tx => !keys.has(tx.category))
  assert.equal(onbekend.length, 0)
})

await ta('bij de minimale template vallen onbekende categorieën op een rol terug', async () => {
  await clearDemoData()
  await db.categories.clear()
  await db.categories.bulkPut(buildTemplateRows('minimaal'))
  await loadDemoData({ seed: 4242, today: TODAY })

  const keys = new Set((await db.categories.toArray()).map(c => c.key))
  const txs = await db.transactions.toArray()
  assert.ok(txs.every(tx => keys.has(tx.category)), 'geen transactie zonder bestaande categorie')
  const rest = txs.filter(tx => tx.category === 'overige_kosten')
  assert.ok(rest.length > 0, 'kleding/vakantie e.d. belanden in de restbak')
  // Subcategorieën die de template niet kent zijn leeggemaakt.
  const cats = Object.fromEntries((await db.categories.toArray()).map(c => [c.key, c]))
  assert.ok(txs.every(tx => !tx.subcategory || cats[tx.category].subs.some(s => s.key === tx.subcategory)))
})

await ta('clearDemoData ruimt op maar laat categorieën staan', async () => {
  const catsVoor = await db.categories.count()
  await clearDemoData()
  assert.equal(await db.transactions.count(), 0)
  assert.equal(await db.merchantHistory.count(), 0)
  assert.equal(await db.categories.count(), catsVoor)
  assert.equal(await db.settings.get(DEMO_MODE_KEY), undefined)
})

console.log(`\n${n} demodata-tests geslaagd`)
process.exit(0)
