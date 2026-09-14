// De volledige declaratieketen op de echte database: indienen, uitbetaling
// koppelen (exact en met een verschil), afkeuren, ontbinden, de CSV voor werk
// en een backup-round-trip waarbij de batch-id's verschuiven.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const { db } = await import(`${SRC}/db/db.js`)
const C = await import(`${SRC}/utils/claims.js`)
const CL = await import(`${SRC}/hooks/useClaims.js`)
const B = await import(`${SRC}/utils/backup.js`)
const { buildDefaultCategoryRows } = await import(`${SRC}/constants/categories.js`)

await db.open()
await db.categories.bulkPut(buildDefaultCategoryRows({ boodschappen: 400, reiskosten: 100 }))

const claim = (note, amount, date) => ({
  date, amount, type: 'debit', category: 'reiskosten', subcategory: '', note,
  claimStatus: 'open', claimBatchId: null,
})

// Dezelfde som als useBudgetStats: alleen wat meetelt, per categorie.
async function spentPerCategory(prefix) {
  const txs = await db.transactions.where('date').startsWith(prefix).filter(C.countsInTotals).toArray()
  const spent = {}
  for (const tx of txs) {
    if (tx.type !== 'debit') continue
    spent[tx.category] = C.round2((spent[tx.category] ?? 0) + tx.amount)
  }
  return spent
}

/* ---------------- indienen ---------------- */

const idA = await db.transactions.add(claim('NS Utrecht', 30, '2026-04-03'))
const idB = await db.transactions.add(claim('NS Den Haag', 20, '2026-05-12'))
const idC = await db.transactions.add(claim('Taxi', 15, '2026-06-02'))
let batchId

await t('indienen maakt een batch en zet alleen de gekozen items op submitted', async () => {
  batchId = await CL.submitClaimBatch({ name: 'Declaratie juni 2026', note: 'via HR', transactionIds: [idA, idB] })
  const batch = await db.claimBatches.get(batchId)
  assert.equal(batch.status, 'submitted')
  assert.equal(batch.expectedTotal, 50)
  assert.ok(batch.submittedAt > 0, 'submittedAt gezet')
  assert.equal(batch.paidAt, null)

  const [a, b, c] = await db.transactions.bulkGet([idA, idB, idC])
  assert.deepEqual([a.claimStatus, b.claimStatus, c.claimStatus], ['submitted', 'submitted', 'open'])
  assert.deepEqual([a.claimBatchId, b.claimBatchId, c.claimBatchId], [batchId, batchId, null])
})

await t('ingediende declaraties tellen nergens mee', async () => {
  const april = await spentPerCategory('2026-04')
  assert.equal(april.reiskosten, undefined, 'de ingediende rit telt niet als uitgave')
})

/* ---------------- exact koppelen ---------------- */

await t('een kloppende bijschrijving sluit de batch af', async () => {
  const payoutId = await db.transactions.add({
    date: '2026-06-25', amount: 50, type: 'credit', category: 'salaris', subcategory: '', note: 'Declaratie werk',
  })
  assert.equal(C.amountsMatch(50, 50), true)
  const res = await CL.closeBatchWithPayout({ batchId, transactionId: payoutId })
  assert.deepEqual(res, { paid: 2, rejected: 0 })

  const batch = await db.claimBatches.get(batchId)
  assert.equal(batch.status, 'closed')
  assert.equal(batch.paidAmount, 50)
  assert.equal(batch.paidTransactionId, payoutId)
  assert.ok(batch.paidAt > 0, 'paidAt gezet')

  const [a, b, payout] = await db.transactions.bulkGet([idA, idB, payoutId])
  assert.deepEqual([a.claimStatus, b.claimStatus], ['paid', 'paid'])
  assert.equal(payout.claimStatus, 'payout')
  assert.equal(payout.claimBatchId, batchId)
  assert.equal(C.isCountedIncome(payout), false, 'de bulkbetaling is geen inkomen')
})

/* ---------------- koppelen met een verschil + afkeuren ---------------- */

let batch2, rejectedId
await t('minder ontvangen: afgekeurde items landen in hun nieuwe categorie', async () => {
  const okId = await db.transactions.add(claim('NS Amsterdam', 30, '2026-07-04'))
  rejectedId = await db.transactions.add(claim('Lunch Utrecht', 20, '2026-07-05'))
  batch2 = await CL.submitClaimBatch({ name: 'Declaratie juli 2026', transactionIds: [okId, rejectedId] })

  const payoutId = await db.transactions.add({
    date: '2026-08-25', amount: 30, type: 'credit', category: 'salaris', subcategory: '', note: 'Declaratie werk juli',
  })
  const voor = await spentPerCategory('2026-07')
  assert.equal(voor.boodschappen, undefined)

  const afgekeurd = await db.transactions.get(rejectedId)
  const res = await CL.closeBatchWithPayout({
    batchId: batch2,
    transactionId: payoutId,
    rejections: [{ tx: afgekeurd, category: 'boodschappen', subcategory: '' }],
  })
  assert.deepEqual(res, { paid: 1, rejected: 1 })

  const [ok, weg] = await db.transactions.bulkGet([okId, rejectedId])
  assert.equal(ok.claimStatus, 'paid')
  assert.equal(weg.claimStatus, 'rejected')
  assert.equal(weg.category, 'boodschappen', 'de gekozen categorie is opgeslagen')
  assert.equal(weg.claimBatchId, batch2, 'de batch blijft zichtbaar voor de historie')

  const batch = await db.claimBatches.get(batch2)
  assert.equal(batch.status, 'closed')
  assert.equal(batch.paidAmount, 30)

  const na = await spentPerCategory('2026-07')
  assert.equal(na.boodschappen, 20, 'de afgekeurde uitgave telt weer mee in juli')
  assert.equal(na.reiskosten, undefined, 'de uitbetaalde rit niet')
})

await t('de categoriewijziging gaat als correctie naar de merchant-learning', async () => {
  const events = await db.merchantHistory.toArray()
  const ev = events.find(e => e.category === 'boodschappen')
  assert.ok(ev, 'er is een leergebeurtenis vastgelegd')
  assert.equal(ev.wasCorrection, true)
  assert.equal(ev.previousCategory, 'reiskosten')
})

await t('een niet-passend verschil komt als notitie op de batch', async () => {
  const id1 = await db.transactions.add(claim('Parkeren', 12.5, '2026-08-03'))
  const bid = await CL.submitClaimBatch({ name: 'Declaratie augustus 2026', transactionIds: [id1] })
  const payoutId = await db.transactions.add({
    date: '2026-09-02', amount: 10, type: 'credit', category: 'salaris', subcategory: '', note: 'Deelbetaling',
  })
  await CL.closeBatchWithPayout({
    batchId: bid, transactionId: payoutId, rejections: [], note: `${C.round2(2.5)} verschil niet toegewezen`,
  })
  const batch = await db.claimBatches.get(bid)
  assert.equal(batch.status, 'closed')
  assert.match(batch.note, /verschil niet toegewezen/)
  assert.equal((await db.transactions.get(id1)).claimStatus, 'paid')
})

/* ---------------- ontbinden ---------------- */

await t('een batch ontbinden zet alles terug op open', async () => {
  const id1 = await db.transactions.add(claim('Hotel', 80, '2026-09-01'))
  const id2 = await db.transactions.add(claim('Diner', 40, '2026-09-02'))
  const bid = await CL.submitClaimBatch({ name: 'Declaratie september 2026', transactionIds: [id1, id2] })
  assert.equal((await db.claimBatches.get(bid)).expectedTotal, 120)

  const aantal = await CL.dissolveClaimBatch(bid)
  assert.equal(aantal, 2)
  assert.equal(await db.claimBatches.get(bid), undefined, 'de batch is weg')
  const [a, b] = await db.transactions.bulkGet([id1, id2])
  assert.deepEqual([a.claimStatus, b.claimStatus], ['open', 'open'])
  assert.deepEqual([a.claimBatchId, b.claimBatchId], [null, null])
})

/* ---------------- "niet declareren" zonder betaling ---------------- */

await t('niet declareren keurt af en laat de uitgave weer meetellen', async () => {
  const id = await db.transactions.add(claim('Kantoorartikelen', 18, '2026-09-05'))
  const tx = await db.transactions.get(id)
  await CL.rejectClaims([{ tx, category: 'hobbys', subcategory: '' }])
  const na = await db.transactions.get(id)
  assert.equal(na.claimStatus, 'rejected')
  assert.equal(na.category, 'hobbys')
  assert.equal(C.isCountedExpense(na), true)
})

/* ---------------- CSV voor werk ---------------- */

await t('de CSV is puntkomma-gescheiden met BOM en decimale komma', async () => {
  const catMap = Object.fromEntries((await db.categories.toArray()).map(c => [c.key, c]))
  const items = [
    { date: '2026-04-03', note: 'NS Utrecht', category: 'reiskosten', subcategory: '', amount: 30 },
    { date: '2026-05-12', note: 'Lunch; met klant', category: 'boodschappen', subcategory: '', amount: 12.5 },
  ]
  const csv = C.claimBatchCsv(items, catMap)
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'BOM voor Excel')
  const regels = csv.slice(1).trim().split('\r\n')
  assert.equal(regels[0], 'datum;omschrijving;categorie;subcategorie;bedrag')
  assert.equal(regels[1], '2026-04-03;NS Utrecht;Reiskosten;;30,00')
  assert.equal(regels[2], '2026-05-12;"Lunch; met klant";Boodschappen;;12,50', 'puntkomma in tekst wordt aangehaald')
  assert.equal(C.claimBatchFileName('Declaratie juni 2026'), 'declaratie-juni-2026.csv')
  assert.equal(C.claimBatchFileName('Q3 reiskosten'), 'declaratie-q3-reiskosten.csv')
})

/* ---------------- backup: claimBatchId wordt hermapt ---------------- */

await t('backup/restore hermapt claimBatchId naar de nieuwe batch-id', async () => {
  const backup = await B.createBackup()
  const batchesVoor = await db.claimBatches.toArray()
  const naamVan = new Map(batchesVoor.map(b => [b.id, b.name]))
  const verwacht = naamVan.get((await db.transactions.get(rejectedId)).claimBatchId)
  assert.ok(verwacht, 'de afgekeurde transactie hing aan een batch')

  await db.transactions.clear()
  await db.claimBatches.clear()
  // Een losse batch erbij zodat de auto-increment id's zeker verschuiven.
  await db.claimBatches.add({ name: 'Losse batch', status: 'open', createdAt: 1 })

  const { stats } = await B.restoreBackup(backup, { mode: 'merge' })
  assert.equal(stats.claimBatches.added, batchesVoor.length)
  assert.equal(stats.transactions.added, backup.tables.transactions.length)

  const terug = await db.transactions
    .where('claimStatus').equals('rejected')
    .filter(tx => tx.note === 'Lunch Utrecht').first()
  assert.ok(terug, 'de afgekeurde transactie staat terug')
  const batch = await db.claimBatches.get(terug.claimBatchId)
  assert.ok(batch, 'claimBatchId wijst naar een bestaande batch')
  assert.equal(batch.name, verwacht, 'en naar dezelfde batch als voor de backup')
  assert.notEqual(terug.claimBatchId, batch2, 'de id is echt verschoven')
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
