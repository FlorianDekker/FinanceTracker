import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { categorize, SALARY_THRESHOLD } = await import(`${SRC}/utils/categorizer.js`)

const active = new Set(['woning','boodschappen','overige_kosten','bankoverschrijving','salaris','voorschot','rest','abonnementen'])
const isActiveKey = k => active.has(k)
const roles = { uncategorized: { key: 'overige_kosten' }, transfer: { key: 'bankoverschrijving' }, income: { key: 'salaris' } }

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok', name) }

t('salaris via rol', () => {
  const r = categorize('WERKGEVER BV', 2500, 'credit', '', roles, { isActiveKey })
  assert.equal(r.cat, 'salaris'); assert.equal(r.confidence, 'high')
})
t('salarisdrempel is standaard 2000', () => assert.equal(SALARY_THRESHOLD, 2000))
t('salarisdrempel is instelbaar via options.salaryThreshold', () => {
  const opt = { isActiveKey, salaryThreshold: 1200 }
  assert.equal(categorize('WERKGEVER BV', 1500, 'credit', '', roles, opt).cat, 'salaris')
  assert.equal(categorize('WERKGEVER BV', 1500, 'credit', '', roles, { isActiveKey }).cat, 'bankoverschrijving')
  // Onzin-waarden vallen terug op de standaarddrempel
  assert.equal(categorize('WERKGEVER BV', 2500, 'credit', '', roles, { isActiveKey, salaryThreshold: 0 }).cat, 'salaris')
})
t('possiblySterre bestaat niet meer in het resultaat', () => {
  const r = categorize('Restaurant De Fictieve Lepel', 40, 'debit', '', roles, { isActiveKey })
  assert.equal('possiblySterre' in r, false)
  assert.equal('possiblySterre' in categorize('Onbekend', 5, 'debit'), false)
})
t('credit zonder regel -> transfer-rol', () => {
  assert.equal(categorize('Jan Jansen', 12, 'credit', '', roles, { isActiveKey }).cat, 'bankoverschrijving')
})
t('debit zonder regel -> uncategorized-rol', () => {
  assert.equal(categorize('Onbekend XYZ', 12, 'debit', '', roles, { isActiveKey }).cat, 'overige_kosten')
})
t('ingebouwde regel', () => {
  const r = categorize('ALBERT HEIJN 1234', 30, 'debit', '', roles, { isActiveKey })
  assert.equal(r.cat, 'boodschappen'); assert.equal(r.sub, 'supermarkt'); assert.equal(r.matched, true)
})
t('regel naar gearchiveerde categorie -> restbak', () => {
  const r = categorize('KRUIDVAT 55', 8, 'debit', '', roles, { isActiveKey }) // gezondheid_verzorging niet actief
  assert.equal(r.cat, 'overige_kosten'); assert.equal(r.sub, ''); assert.equal(r.confidence, 'low'); assert.equal(r.matched, false)
})
t('eigen rollen (andere slugs)', () => {
  const myRoles = { uncategorized: { key: 'rest' }, transfer: { key: 'overboeking' }, income: { key: 'loon' } }
  const ia = k => ['rest','overboeking','loon'].includes(k)
  assert.equal(categorize('Onbekend', 5, 'debit', '', myRoles, { isActiveKey: ia }).cat, 'rest')
  assert.equal(categorize('Piet', 5, 'credit', '', myRoles, { isActiveKey: ia }).cat, 'overboeking')
  assert.equal(categorize('Baas', 3000, 'credit', '', myRoles, { isActiveKey: ia }).cat, 'loon')
})
t('gebruikersregel gaat voor ingebouwde regel', () => {
  const rules = [{ id: 1, keywords: ['Albert Heijn'], category: 'woning', subcategory: 'huur' }]
  const r = categorize('ALBERT HEIJN 1234', 30, 'debit', '', roles, { isActiveKey, rules })
  assert.equal(r.cat, 'woning'); assert.equal(r.sub, 'huur')
})
t('zonder byRole/opties = oud gedrag', () => {
  assert.equal(categorize('Onbekend', 5, 'debit').cat, 'overige_kosten')
  assert.equal(categorize('KRUIDVAT', 5, 'debit').cat, 'gezondheid_verzorging')
})
t('remi telt alleen mee bij credits', () => {
  assert.equal(categorize('Jan', 20, 'credit', 'spotify gedeeld', roles, { isActiveKey }).cat, 'abonnementen')
  assert.equal(categorize('Jan', 20, 'debit', 'spotify gedeeld', roles, { isActiveKey }).cat, 'overige_kosten')
})
t('spatie in trefwoord blijft behouden (ns )', () => {
  assert.equal(categorize('NS REIZEN', 5, 'debit', '', roles, { isActiveKey }).cat, 'overige_kosten') // reiskosten inactief
  assert.equal(categorize('NS REIZEN', 5, 'debit').cat, 'reiskosten')
  assert.equal(categorize('DINSDAG', 5, 'debit').cat, 'overige_kosten')
})

/* ── categorizeWithLearning: eigen regels winnen van de leerdata ─────── */
const { db } = await import(`${SRC}/db/db.js`)
const { categorizeWithLearning } = await import(`${SRC}/utils/categorizer.js`)
await db.open()

// 4 maanden aan 'Albert Heijn -> boodschappen' als leerdata
const now = Date.now(), MONTH = 30 * 86400000
for (let i = 0; i < 4; i++) {
  await db.merchantHistory.add({
    merchantKey: 'albertheijn', baseKey: 'albertheijn',
    category: 'boodschappen', subcategory: 'supermarkt', amount: 30, dayOfMonth: 3,
    type: 'debit', remiTokens: [], wasCorrection: false, previousCategory: '',
    timestamp: now - i * MONTH,
  })
}

const ta = async (name, fn) => { await fn(); n++; console.log('  ok', name) }

await ta('zonder eigen regel wint de leerdata', async () => {
  const r = await categorizeWithLearning('Albert Heijn', 30, 'debit', '', roles, { isActiveKey })
  assert.equal(r.cat, 'boodschappen')
  assert.notEqual(r.source, 'rules')          // leerdata, niet de ingebouwde regel
})
await ta('eigen regel wint van de leerdata', async () => {
  const rules = [{ id: 1, keywords: ['albert heijn'], category: 'woning', subcategory: 'huur' }]
  const r = await categorizeWithLearning('Albert Heijn', 30, 'debit', '', roles, { isActiveKey, rules })
  assert.equal(r.cat, 'woning'); assert.equal(r.sub, 'huur')
  assert.equal(r.source, 'rules'); assert.equal(r.confidencePct, 100)
})
await ta('eigen regel wint van de salarisdrempel', async () => {
  const rules = [{ id: 2, keywords: ['werkgever'], category: 'voorschot' }]
  const r = await categorizeWithLearning('WERKGEVER BV', 2500, 'credit', '', roles, { isActiveKey, rules })
  assert.equal(r.cat, 'voorschot')
})
await ta('eigen regel naar gearchiveerde categorie -> restbak, geen leerdata', async () => {
  const rules = [{ id: 3, keywords: ['albert heijn'], category: 'hobbys' }]
  const r = await categorizeWithLearning('Albert Heijn', 30, 'debit', '', roles, { isActiveKey, rules })
  assert.equal(r.cat, 'overige_kosten'); assert.equal(r.source, 'unknown')
})
await ta('ingebouwde regel blijft ná de leerdata', async () => {
  // geen leerdata voor Kruidvat -> ingebouwde regel doet het werk
  const r = await categorizeWithLearning('KRUIDVAT 55', 8, 'debit', '', roles, { isActiveKey })
  assert.equal(r.cat, 'overige_kosten')       // gezondheid_verzorging is inactief
  const r2 = await categorizeWithLearning('KRUIDVAT 55', 8, 'debit')
  assert.equal(r2.cat, 'gezondheid_verzorging'); assert.equal(r2.source, 'rules')
})

console.log(`\n${n} classifier-tests geslaagd`)
process.exit(0)
