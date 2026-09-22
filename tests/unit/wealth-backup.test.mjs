// Vermogen in de backup: gaan rekeningen, momentopnames, reserveringen en
// spaardoelen mee, en overleven ze zowel "vervangen" als "samenvoegen"?
// (De algemene backup-tests staan in backup.test.mjs; dit bestand raakt alleen
// de vier Vermogen-tabellen aan, zodat beide los van elkaar te lezen zijn.)
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { db } = await import(`${SRC}/db/db.js`)
const B = await import(`${SRC}/utils/backup.js`)
const W = await import(`${SRC}/hooks/useWealth.js`)

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const TABELLEN = ['accounts', 'accountSnapshots', 'reservations', 'goals']

async function reset() {
  for (const naam of TABELLEN) await db[naam].clear()
}

async function seed() {
  await reset()
  await db.accounts.bulkPut([
    { key: 'bank-nl01abna0123456789', name: 'Betaalrekening …6789', kind: 'betaal', order: 0,
      source: 'abn-import', account: 'NL01ABNA0123456789', balance: 2500, balanceAt: '2026-09-20', archived: false },
    { key: 'eigen-abc', name: 'Spaarrekening', kind: 'spaar', order: 1,
      source: 'manual', account: null, balance: 8000, balanceAt: '2026-09-01', archived: false },
  ])
  await db.accountSnapshots.bulkAdd([
    { accountKey: 'bank-nl01abna0123456789', date: '2026-09-20', balance: 2500 },
    { accountKey: 'eigen-abc', date: '2026-09-01', balance: 8000 },
    { accountKey: 'eigen-abc', date: '2026-09-20', balance: 8100 },
  ])
  await db.reservations.bulkAdd([
    { name: 'Tandarts', amount: 300, dueMonth: '2026-11', note: '', done: false, doneAt: null, category: '' },
    { name: 'Laptop', amount: 1200, dueMonth: null, note: 'ooit', done: false, doneAt: null, category: '' },
  ])
  await db.goals.bulkAdd([
    { name: 'Keuken', icon: '🏠', target: 10000, order: 0, rule: { type: 'surplus' },
      startMonth: '2026-01', manualDeposits: [{ date: '2026-03-01', amount: 500, note: 'bonus' }], reached: false, reachedAt: null },
  ])
}

await seed()
const backup = await B.createBackup()

await t('de vier Vermogen-tabellen zitten in de backup', () => {
  for (const naam of TABELLEN) assert.ok(Array.isArray(backup.tables[naam]), `${naam} ontbreekt`)
  const counts = B.countRows(backup)
  assert.equal(counts.accounts, 2)
  assert.equal(counts.accountSnapshots, 3)
  assert.equal(counts.reservations, 2)
  assert.equal(counts.goals, 1)
})

await t('alle velden gaan mee, ook de geneste regel en stortingen', () => {
  const goal = backup.tables.goals[0]
  assert.deepEqual(goal.rule, { type: 'surplus' })
  assert.deepEqual(goal.manualDeposits, [{ date: '2026-03-01', amount: 500, note: 'bonus' }])
  const rekening = backup.tables.accounts.find(a => a.source === 'abn-import')
  assert.equal(rekening.account, 'NL01ABNA0123456789')
  assert.equal(rekening.key, 'bank-nl01abna0123456789', 'string-key, dus geen id-remap nodig')
})

await t('vervangen: alles terug zoals het was', async () => {
  await reset()
  await db.accounts.put({ key: 'weg', name: 'Oud', kind: 'overig', order: 9, source: 'manual', balance: 1, archived: false })
  await B.restoreBackup(backup, { mode: 'replace' })
  assert.equal(await db.accounts.count(), 2)
  assert.equal(await db.accountSnapshots.count(), 3)
  assert.equal(await db.reservations.count(), 2)
  assert.equal(await db.goals.count(), 1)
  assert.equal(await db.accounts.get('weg'), undefined, 'wat er niet in de backup zat, is weg')
  const spaar = await db.accounts.get('eigen-abc')
  assert.equal(spaar.balance, 8000)
  assert.equal((await db.goals.toArray())[0].manualDeposits[0].amount, 500)
})

await t('de momentopnames wijzen na herstel nog naar hun rekening', async () => {
  const snaps = await db.accountSnapshots.where('accountKey').equals('eigen-abc').toArray()
  assert.equal(snaps.length, 2)
  const bekend = new Set((await db.accounts.toArray()).map(a => a.key))
  for (const s of await db.accountSnapshots.toArray()) {
    assert.ok(bekend.has(s.accountKey), `losse momentopname voor ${s.accountKey}`)
  }
})

// LET OP — bekend gat: de merge-tak van `restoreBackup` kent alleen
// transacties, bonnen, batches, regels, categorieen, instellingen en (sinds
// Vakanties) trips. Voor accounts/accountSnapshots/reservations/goals doet
// "samenvoegen" dus nog niets: bestaande rijen blijven staan, maar rijen uit de
// backup worden niet toegevoegd. "Alles vervangen" zet ze wel volledig terug.
// Deze twee tests leggen dat vast; zodra backup.js de vier tabellen meeneemt
// (zelfde patroon als mergeRows voor rules/merchantHistory, met een sleutel op
// accounts.key / [accountKey+date] / naam+maand / naam) mag de tweede omgedraaid.
await t('samenvoegen: bestaande rijen blijven ongemoeid', async () => {
  await reset()
  await db.accounts.put({ key: 'eigen-abc', name: 'Mijn eigen naam', kind: 'spaar', order: 1,
    source: 'manual', account: null, balance: 9999, balanceAt: '2026-09-22', archived: false })
  await db.reservations.add({ name: 'Tandarts', amount: 300, dueMonth: '2026-11', note: '', done: false, doneAt: null, category: '' })
  const r = await B.restoreBackup(backup, { mode: 'merge' })
  assert.ok(r.mode === 'merge')

  const spaar = await db.accounts.get('eigen-abc')
  assert.equal(spaar.name, 'Mijn eigen naam', 'de bestaande rekening wint bij samenvoegen')
  assert.equal(spaar.balance, 9999)
  assert.equal(await db.reservations.count(), 1, 'de bestaande reservering staat er nog')
})

await t('samenvoegen voegt Vermogen-rijen nog NIET toe (zie de opmerking hierboven)', async () => {
  assert.equal(await db.accounts.get('bank-nl01abna0123456789'), undefined)
  assert.equal(await db.accountSnapshots.count(), 0)
  assert.equal(await db.goals.count(), 0)
})

await t('instellingen buffer en horizon overleven een backup', async () => {
  await W.setWealthBuffer(1500)
  await W.setProjectionMonths(36)
  const met = await B.createBackup()
  const keys = met.tables.settings.map(s => s.key)
  assert.ok(keys.includes(W.WEALTH_BUFFER_SETTING))
  assert.ok(keys.includes(W.WEALTH_PROJECTION_SETTING))
  await db.settings.clear()
  await B.restoreBackup(met, { mode: 'merge' })
  assert.equal((await db.settings.get(W.WEALTH_BUFFER_SETTING)).value, 1500)
  assert.equal((await db.settings.get(W.WEALTH_PROJECTION_SETTING)).value, 36)
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
