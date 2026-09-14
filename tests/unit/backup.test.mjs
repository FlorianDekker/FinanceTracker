import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { db } = await import(`${SRC}/db/db.js`)
const B = await import(`${SRC}/utils/backup.js`)

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

async function reset() {
  await db.transaction('rw', db.transactions, db.categories, db.settings, db.merchantHistory, db.rules, async () => {
    await Promise.all([db.transactions.clear(), db.categories.clear(), db.settings.clear(), db.merchantHistory.clear(), db.rules.clear()])
  })
}
async function seed() {
  await reset()
  await db.transactions.bulkAdd([
    { date: '2026-01-05', amount: 12.5, type: 'debit', category: 'boodschappen', subcategory: 'supermarkt', note: 'Albert Heijn', importedAt: 1 },
    { date: '2026-01-05', amount: 12.5, type: 'debit', category: 'boodschappen', subcategory: 'supermarkt', note: 'Jumbo', importedAt: 1 },
    { date: '2026-01-06', amount: 2500, type: 'credit', category: 'salaris', subcategory: '', note: 'Werkgever', importedAt: 1 },
  ])
  await db.categories.bulkPut([
    { key: 'boodschappen', label: 'Boodschappen', icon: '🛒', color: '#16A34A', type: 'expense', order: 0, isFixed: false, archived: false, role: null, subs: [], budget: 400 },
    { key: 'salaris', label: 'Salaris', icon: '💰', color: '#32D74B', type: 'income', order: 1, isFixed: false, archived: false, role: 'income', subs: [], budget: 0 },
  ])
  await db.settings.bulkPut([
    { key: 'theme', value: 'dark' },
    { key: 'accentColor', value: '#1E3A5F' },
    { key: 'ai', value: { apiKey: 'GEHEIM-123', model: 'Qwen' } },
    { key: 'togetherApiKey', value: 'GEHEIM-456' },
  ])
  await db.rules.bulkAdd([
    { keywords: ['albert heijn'], category: 'boodschappen', subcategory: 'supermarkt', createdAt: 1 },
  ])
  await db.merchantHistory.bulkAdd([
    { merchantKey: 'albertheijn', baseKey: 'albertheijn', category: 'boodschappen', subcategory: 'supermarkt', amount: 12.5, dayOfMonth: 5, type: 'debit', remiTokens: [], wasCorrection: false, previousCategory: '', timestamp: 1000 },
    { merchantKey: 'jumbo', baseKey: 'jumbo', category: 'boodschappen', subcategory: 'supermarkt', amount: 12.5, dayOfMonth: 5, type: 'debit', remiTokens: [], wasCorrection: false, previousCategory: '', timestamp: 2000 },
  ])
}

console.log('\n--- createBackup ---')
await seed()
const backup = await B.createBackup()

await t('formaat: app, schemaVersion, exportedAt, tables', () => {
  assert.equal(backup.app, 'FinanceTracker')
  assert.equal(backup.schemaVersion, db.verno)
  assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/)
  assert.deepEqual(Object.keys(backup.tables).sort(), ['categories', 'merchantHistory', 'rules', 'settings', 'transactions'].sort())
})
await t('aantallen kloppen', () => {
  assert.deepEqual(B.countRows(backup), { transactions: 3, categories: 2, settings: 2, merchantHistory: 2, rules: 1 })
})
await t('geheime settings (ai*, *apiKey*) zitten er NIET in', () => {
  const keys = backup.tables.settings.map(s => s.key)
  assert.deepEqual(keys.sort(), ['accentColor', 'theme'])
  assert.ok(!JSON.stringify(backup).includes('GEHEIM'))
})
await t('bestandsnaam financetracker-backup-YYYY-MM-DD.json', () => {
  assert.equal(B.backupFileName(new Date(2026, 8, 14)), 'financetracker-backup-2026-09-14.json')
})

console.log('\n--- restore: replace ---')
await reset()
await db.transactions.add({ date: '2020-01-01', amount: 1, type: 'debit', category: 'x', subcategory: '', note: 'oud' })
await db.settings.put({ key: 'theme', value: 'light' })
await db.settings.put({ key: 'aiApiKey', value: 'LOKAAL_GEHEIM' })
const rep = await B.restoreBackup(JSON.stringify(backup), { mode: 'replace' })
await t('replace wist en vult alle tabellen', async () => {
  assert.equal(await db.transactions.count(), 3)
  assert.equal(await db.categories.count(), 2)
  assert.equal(await db.settings.count(), 3) // 2 uit backup + bewaard geheim
  assert.equal(await db.merchantHistory.count(), 2)
  assert.equal(await db.rules.count(), 1)
  assert.equal((await db.settings.get('theme')).value, 'dark')
  assert.equal(rep.stats.transactions.added, 3)
})
await t('replace bewaart lokale geheime settings (ai*, *apiKey*)', async () => {
  assert.equal((await db.settings.get('aiApiKey'))?.value, 'LOKAAL_GEHEIM')
})

console.log('\n--- restore: merge ---')
await t('merge op dezelfde db voegt niets dubbels toe', async () => {
  const r = await B.restoreBackup(backup, { mode: 'merge' })
  assert.equal(await db.transactions.count(), 3)
  assert.equal(r.stats.transactions.added, 0)
  assert.equal(r.stats.transactions.skipped, 3)
  assert.equal(r.stats.merchantHistory.added, 0)
  assert.equal(r.stats.rules.added, 0)
  assert.equal(r.stats.categories.added, 0)
  assert.equal(r.stats.settings.added, 0)
})
await t('merge dedupt op date|amount|type|note, niet op date|amount|type', async () => {
  // rij 1 en 2 hebben zelfde datum/bedrag/type maar andere omschrijving: beide blijven
  const txs = await db.transactions.where('date').equals('2026-01-05').toArray()
  assert.equal(txs.length, 2)
})
await t('merge voegt nieuwe rijen toe en bewaart bestaande categorie/instelling', async () => {
  const extra = JSON.parse(JSON.stringify(backup))
  extra.tables.transactions.push({ id: 99, date: '2026-02-01', amount: 9.99, type: 'debit', category: 'boodschappen', subcategory: '', note: 'Lidl' })
  extra.tables.categories.push({ key: 'vakantie', label: 'Vakantie', icon: '✈️', color: '#0A84FF', type: 'expense', order: 2, isFixed: false, archived: false, role: null, subs: [], budget: 100 })
  extra.tables.categories[0] = { ...extra.tables.categories[0], budget: 999 }
  extra.tables.settings.push({ key: 'showConfidence', value: true })
  extra.tables.settings[0] = { key: 'theme', value: 'light' }
  extra.tables.merchantHistory.push({ merchantKey: 'lidl', baseKey: 'lidl', category: 'boodschappen', subcategory: '', amount: 9.99, dayOfMonth: 1, type: 'debit', remiTokens: [], wasCorrection: false, previousCategory: '', timestamp: 3000 })
  const r = await B.restoreBackup(extra, { mode: 'merge' })
  assert.equal(r.stats.transactions.added, 1)
  assert.equal(r.stats.categories.added, 1)
  assert.equal(r.stats.settings.added, 1)
  assert.equal(r.stats.merchantHistory.added, 1)
  assert.equal(await db.transactions.count(), 4)
  assert.equal((await db.categories.get('boodschappen')).budget, 400, 'bestaande categorie wint')
  assert.equal((await db.settings.get('theme')).value, 'dark', 'bestaande instelling wint')
  const ids = (await db.transactions.toArray()).map(t => t.id)
  assert.equal(new Set(ids).size, ids.length, 'geen dubbele ids')
})
await t('merge voegt nieuwe herkenningsregels toe, dubbele niet', async () => {
  const extra = JSON.parse(JSON.stringify(backup))
  extra.tables.rules.push({ id: 7, keywords: ['Coffee Company', 'COFFEE'], category: 'boodschappen', subcategory: '', createdAt: 5 })
  const before = await db.rules.count()
  const r = await B.restoreBackup(extra, { mode: 'merge' })
  assert.equal(r.stats.rules.added, 1)
  assert.equal(await db.rules.count(), before + 1)
  const added = (await db.rules.toArray()).find(x => x.keywords.includes('coffee company'))
  assert.deepEqual(added.keywords, ['coffee company', 'coffee'], 'trefwoorden genormaliseerd')
  assert.equal(added.id !== 7, true, 'eigen id')
})
await t('geheime instellingen worden ook bij terugzetten geweigerd', async () => {
  await db.settings.delete('aiApiKey') // lokaal geheim uit de replace-test opruimen
  const evil = JSON.parse(JSON.stringify(backup))
  evil.tables.settings.push({ key: 'aiApiKey', value: 'GEHEIM' })
  await B.restoreBackup(evil, { mode: 'merge' })
  assert.equal(await db.settings.get('aiApiKey'), undefined)
})

console.log('\n--- oude categorie-vorm {key, budget} ---')
await t('oude backup met {key,budget} wordt genormaliseerd', async () => {
  const old = { app: 'FinanceTracker', schemaVersion: 2, exportedAt: '2025-01-01T00:00:00.000Z',
    tables: { transactions: [], categories: [{ key: 'woning', budget: 750 }, { key: 'overige_kosten', budget: 0 }], settings: [], merchantHistory: [] } }
  await B.restoreBackup(old, { mode: 'replace' })
  const woning = await db.categories.get('woning')
  assert.equal(woning.budget, 750)
  assert.equal(woning.label, 'Woning')
  assert.equal(woning.icon, '🏠')
  assert.equal(woning.color, '#FF9F0A')
  assert.equal(woning.type, 'expense')
  assert.equal(woning.archived, false)
  assert.ok(Array.isArray(woning.subs) && woning.subs.length > 0)
  assert.equal((await db.categories.get('overige_kosten')).role, 'uncategorized', 'systeemrol wordt hersteld')
  assert.notEqual(woning.order, (await db.categories.get('overige_kosten')).order, 'volgorde blijft uniek')
})

console.log('\n--- ongeldige invoer ---')
const bad = [
  ['geen JSON', 'dit is geen json', /geldige JSON/],
  ['leeg object', {}, /geen FinanceTracker-backup/],
  ['verkeerde app', { app: 'Anders', tables: {} }, /geen FinanceTracker-backup/],
  ['tables ontbreekt', { app: 'FinanceTracker' }, /mist het onderdeel "tables"/],
  ['tabel is geen lijst', { app: 'FinanceTracker', tables: { transactions: 'nee' } }, /beschadigd/],
  ['null', null, /geen backup-gegevens/],
  ['array', [], /geen backup-gegevens/],
]
for (const [name, input, re] of bad) {
  await t(`weigert ${name}`, async () => { await assert.rejects(() => B.restoreBackup(input), re) })
}
await t('weigert hogere schemaVersion met uitleg', async () => {
  await assert.rejects(
    () => B.restoreBackup({ app: 'FinanceTracker', schemaVersion: db.verno + 1, tables: {} }),
    /nieuwere versie van de app/
  )
})
await t('accepteert lagere schemaVersion', async () => {
  const r = await B.restoreBackup({ app: 'FinanceTracker', schemaVersion: 1, tables: { transactions: [] } }, { mode: 'merge' })
  assert.equal(r.mode, 'merge')
})
await t('weigert onbekende modus', async () => {
  await assert.rejects(() => B.restoreBackup(backup, { mode: 'kwijt' }), /Onbekende herstelmodus/)
})

console.log(`\n${pass} geslaagd, ${fail} mislukt`)
process.exit(fail ? 1 : 0)
