// De database-kant van Vermogen: rekeningen uit de bankimport, saldo bijwerken
// met een momentopname, reserveringen afvinken en de volgorde van spaardoelen.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { db } = await import(`${SRC}/db/db.js`)
const W = await import(`${SRC}/hooks/useWealth.js`)
const { today } = await import(`${SRC}/utils/formatters.js`)
const { wealthHistory } = await import(`${SRC}/utils/wealth/history.js`)

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

await db.open()
await db.transactions.bulkAdd([
  { date: '2026-09-01', amount: 20, type: 'debit', category: 'boodschappen', note: 'AH', balance: 1000, account: 'NL01ABNA0123456789' },
  { date: '2026-09-10', amount: 40, type: 'debit', category: 'boodschappen', note: 'AH', balance: 960, account: 'NL01ABNA0123456789' },
  { date: '2026-09-12', amount: 60, type: 'debit', category: 'boodschappen', note: 'markt' },   // handmatig
])

await t('bankrekening wordt eenmalig aangemaakt met het verwachte saldo', async () => {
  assert.equal(await W.ensureImportAccounts(), 1)
  assert.equal(await W.ensureImportAccounts(), 0, 'een tweede keer verandert niets')
  const a = await db.accounts.get('bank-nl01abna0123456789')
  assert.equal(a.source, 'abn-import')
  assert.equal(a.kind, 'betaal')
  assert.equal(a.balance, 900, '960 uit de import minus de handmatige 60')
  assert.match(a.name, /6789/)
})

await t('initWealth legt de stand van vandaag vast', async () => {
  await W.initWealth()
  const snaps = await db.accountSnapshots.where('accountKey').equals('bank-nl01abna0123456789').toArray()
  assert.equal(snaps.length, 1)
  assert.equal(snaps[0].date, today())
  assert.equal(snaps[0].balance, 900)
  await W.initWealth()
  assert.equal(await db.accountSnapshots.where('accountKey').equals('bank-nl01abna0123456789').count(), 1,
    'één momentopname per rekening per dag')
})

let spaarKey
await t('handmatige rekening toevoegen geeft meteen een meetpunt', async () => {
  spaarKey = await W.addAccount({ name: 'Spaarrekening', kind: 'spaar', balance: 5000, balanceAt: '2026-09-01' })
  const a = await db.accounts.get(spaarKey)
  assert.equal(a.balance, 5000)
  assert.equal(a.source, 'manual')
  assert.equal(a.order, 1, 'achter de bankrekening')
  const snaps = await db.accountSnapshots.where('accountKey').equals(spaarKey).toArray()
  assert.deepEqual(snaps.map(s => [s.date, s.balance]), [['2026-09-01', 5000]])
})

await t('saldo bijwerken schrijft rekening én momentopname, en overschrijft dezelfde dag', async () => {
  await W.setAccountBalance(spaarKey, 5200, '2026-09-15')
  await W.setAccountBalance(spaarKey, 5250, '2026-09-15')
  const a = await db.accounts.get(spaarKey)
  assert.equal(a.balance, 5250)
  assert.equal(a.balanceAt, '2026-09-15')
  const snaps = (await db.accountSnapshots.where('accountKey').equals(spaarKey).toArray()).sort((x, y) => (x.date < y.date ? -1 : 1))
  assert.deepEqual(snaps.map(s => [s.date, s.balance]), [['2026-09-01', 5000], ['2026-09-15', 5250]])
  const verloop = wealthHistory(await db.accountSnapshots.toArray())
  assert.equal(verloop.find(p => p.date === '2026-09-15').total, 5250, 'de bankrekening had toen nog geen meting')
})

await t('archiveren haalt de rekening uit beeld maar bewaart het verloop', async () => {
  await W.archiveAccount(spaarKey)
  assert.equal((await db.accounts.get(spaarKey)).archived, true)
  assert.equal(await db.accountSnapshots.where('accountKey').equals(spaarKey).count(), 2)
  await W.archiveAccount(spaarKey, false)
})

await t('reservering toevoegen, afvinken en terugzetten', async () => {
  const id = await W.addReservation({ name: 'Tandarts', amount: '300', dueMonth: '2026-11' })
  let r = await db.reservations.get(id)
  assert.equal(r.amount, 300)
  assert.equal(r.done, false)
  await W.toggleReservationDone(r)
  r = await db.reservations.get(id)
  assert.equal(r.done, true)
  assert.ok(r.doneAt > 0)
  await W.toggleReservationDone(r)
  assert.equal((await db.reservations.get(id)).doneAt, null)
  await assert.rejects(() => W.addReservation({ name: '  ', amount: 10 }), /naam/)
})

await t('spaardoelen: volgorde verwisselen en handmatig storten', async () => {
  const a = await W.addGoal({ name: 'Keuken', target: 10000, rule: { type: 'surplus' }, startMonth: '2026-01' })
  const b = await W.addGoal({ name: 'Buffer', target: 2000, rule: { type: 'fixed', amount: 100 }, startMonth: '2026-01' })
  assert.deepEqual((await db.goals.orderBy('order').toArray()).map(g => g.name), ['Keuken', 'Buffer'])

  await W.moveGoal(b, -1)
  assert.deepEqual((await db.goals.orderBy('order').toArray()).map(g => g.name), ['Buffer', 'Keuken'])
  assert.equal(await W.moveGoal(b, -1), false, 'bovenaan kan niet verder omhoog')

  await W.addManualDeposit(a, { date: '2026-05-01', amount: '1.250,50', note: 'bonus' })
  assert.deepEqual((await db.goals.get(a)).manualDeposits, [{ date: '2026-05-01', amount: 1250.5, note: 'bonus' }])
  await W.removeManualDeposit(a, 0)
  assert.deepEqual((await db.goals.get(a)).manualDeposits, [])
})

await t('buffer en horizon: standaarden en grenzen', async () => {
  assert.equal(await W.setWealthBuffer(-50), 0, 'nooit negatief')
  assert.equal(await W.setProjectionMonths(999), 60)
  assert.equal(await W.setProjectionMonths(1), 3)
  await db.settings.delete(W.WEALTH_BUFFER_SETTING)
  assert.equal(W.DEFAULT_BUFFER, 1000)
  assert.equal(W.DEFAULT_PROJECTION_MONTHS, 24)
})

await t('rekening verwijderen neemt het verloop mee', async () => {
  await W.deleteAccount(spaarKey)
  assert.equal(await db.accounts.get(spaarKey), undefined)
  assert.equal(await db.accountSnapshots.where('accountKey').equals(spaarKey).count(), 0)
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
