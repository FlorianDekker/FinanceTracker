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
const { categorizeWithLearning } = await import(`${SRC}/utils/categorizer.js`)
const { recordEvent } = await import(`${SRC}/utils/merchantLearning.js`)
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
  assert.deepEqual(res, { paid: 2, rejected: 0, deferred: 0 })

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
  assert.deepEqual(res, { paid: 1, rejected: 1, deferred: 0 })

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

/* ---------------- deeldeclaratie: aanmaken, indienen, uitbetalen ---------------- */

await t('deeldeclaratie indienen en met een exacte uitbetaling afsluiten -> paid', async () => {
  const date = C.partialClaimDate(2026, 9, new Date('2026-09-16'))
  const note = C.partialClaimNote('Reiskosten', 2026, 9)
  const partialId = await db.transactions.add({
    date, amount: 10, type: 'credit', category: 'reiskosten', subcategory: '', note,
    claimStatus: 'open', claimBatchId: null,
  })
  const aangemaakt = await db.transactions.get(partialId)
  assert.equal(C.isPartialClaim(aangemaakt), true)
  assert.equal(C.countsInTotals(aangemaakt), true, 'telt al als negatieve uitgave in reiskosten')

  const bid = await CL.submitClaimBatch({ name: 'Declaratie OV', transactionIds: [partialId] })
  assert.equal((await db.claimBatches.get(bid)).expectedTotal, 10)
  const ingediend = await db.transactions.get(partialId)
  assert.equal(ingediend.claimStatus, 'submitted')
  assert.equal(C.countsInTotals(ingediend), true, 'blijft meetellen terwijl hij loopt')

  const payoutId = await db.transactions.add({
    date: '2026-09-20', amount: 10, type: 'credit', category: 'salaris', subcategory: '', note: 'Declaratie OV',
  })
  const res = await CL.closeBatchWithPayout({ batchId: bid, transactionId: payoutId })
  assert.deepEqual(res, { paid: 1, rejected: 0, deferred: 0 })

  const afgehandeld = await db.transactions.get(partialId)
  assert.equal(afgehandeld.claimStatus, 'paid')
  assert.equal(C.countsInTotals(afgehandeld), true, 'blijft meetellen als negatieve uitgave, ook na uitbetaling')
  assert.equal(C.isCountedIncome(await db.transactions.get(payoutId)), false, 'de bulkbetaling zelf is geen inkomen')
})

await t('deeldeclaratie afkeuren: categorie blijft staan en de rij telt niet meer mee', async () => {
  const date = C.partialClaimDate(2026, 9, new Date('2026-09-16'))
  const note = C.partialClaimNote('Reiskosten', 2026, 9)
  const partialId = await db.transactions.add({
    date, amount: 8, type: 'credit', category: 'reiskosten', subcategory: '', note,
    claimStatus: 'open', claimBatchId: null,
  })
  const voor = await db.transactions.get(partialId)
  assert.equal(C.countsInTotals(voor), true)

  // Zoals RejectClaimSheet voor een deeldeclaratie: de categorie blijft exact gelijk.
  await CL.rejectClaims([{ tx: voor, category: voor.category, subcategory: voor.subcategory }])
  const na = await db.transactions.get(partialId)
  assert.equal(na.claimStatus, 'rejected')
  assert.equal(na.category, 'reiskosten', 'categorie ongewijzigd')
  assert.equal(C.countsInTotals(na), false, 'werk vergoedt dit niet, dus telt niet meer mee')
  assert.equal(C.isCountedExpense(na), false, 'en wordt ook geen uitgave: het blijft een credit-rij')
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

/* ---------------- categorie wijzigen op een lopend item ---------------- */

await t('de categorie van een ingediende declaratie wijzigen laat de status staan', async () => {
  const id = await db.transactions.add(claim('Hotel Zwolle', 95, '2026-09-08'))
  const bid = await CL.submitClaimBatch({ name: 'Declaratie hotel', transactionIds: [id] })
  const voor = await db.transactions.get(id)
  await CL.changeClaimCategory(voor, 'vakantie', '')

  const na = await db.transactions.get(id)
  assert.equal(na.category, 'vakantie')
  assert.equal(na.subcategory, '')
  assert.equal(na.claimStatus, 'submitted', 'de declaratie blijft ingediend')
  assert.equal(na.claimBatchId, bid)
  assert.equal((await db.claimBatches.get(bid)).expectedTotal, 95, 'het batchtotaal verandert niet')

  const ev = (await db.merchantHistory.where('baseKey').equals('hotelzwolle').toArray()).at(-1)
  assert.equal(ev?.category, 'vakantie')
  assert.equal(ev?.wasCorrection, true, 'de wijziging gaat als correctie naar de learning')
  assert.equal(ev?.previousCategory, 'reiskosten')
})

/* ---------------- voorstel bij afkeuren ---------------- */

const voorschotTx = (note, amount, date) => ({
  date, amount, type: 'debit', category: 'voorschot', subcategory: '', note,
})

await t('suggestRejectCategory: een vage categorie krijgt het voorstel, een echte niet', () => {
  const ctx = { uncategorizedKey: 'overige_kosten' }
  const ns = { category: 'voorschot', subcategory: '', note: 'NS Utrecht' }

  assert.deepEqual(
    C.suggestRejectCategory(ns, { ...ctx, suggestion: { cat: 'reiskosten', sub: 'trein' } }),
    { category: 'reiskosten', subcategory: 'trein', isSuggestion: true })

  // Voorspellingen naar voorschot of de restbak negeren we: dan zou de app zijn
  // eigen verlegenheidscategorie bevestigen.
  assert.deepEqual(
    C.suggestRejectCategory(ns, { ...ctx, suggestion: { cat: 'voorschot', sub: '' } }),
    { category: 'voorschot', subcategory: '', isSuggestion: false })
  assert.deepEqual(
    C.suggestRejectCategory(ns, { ...ctx, suggestion: { cat: 'overige_kosten', sub: '' } }),
    { category: 'voorschot', subcategory: '', isSuggestion: false })
  assert.deepEqual(
    C.suggestRejectCategory(ns, { ...ctx, suggestion: null }),
    { category: 'voorschot', subcategory: '', isSuggestion: false })

  // Een uitgave die al een echte categorie heeft, houdt die gewoon.
  assert.deepEqual(
    C.suggestRejectCategory({ category: 'boodschappen', subcategory: '' },
      { ...ctx, suggestion: { cat: 'reiskosten', sub: '' } }),
    { category: 'boodschappen', subcategory: '', isSuggestion: false })

  assert.equal(C.isVagueCategory('', {}), true)
  assert.equal(C.isVagueCategory('reiskosten', { uncategorizedKey: 'overige_kosten' }), false)
})

await t('het voorstel negeert geleerde voorschot-historie en valt terug op de regels', async () => {
  // Zoals Florians situatie: alles stond jarenlang op Voorschot.
  for (let i = 0; i < 4; i++) recordEvent('NS Utrecht', 'voorschot', '', 30, 'debit', null, null)
  await recordEvent('Tikkie Jan', 'voorschot', '', 25, 'debit', null, null)

  const cats = await db.categories.toArray()
  const actief = new Set(cats.filter(c => !c.archived).map(c => c.key))
  const byRole = {
    uncategorized: cats.find(c => c.key === 'overige_kosten'),
    transfer: cats.find(c => c.key === 'bankoverschrijving'),
    income: cats.find(c => c.key === 'salaris'),
  }
  // Precies de filter uit useRejectSuggestions: bestaand, niet gearchiveerd en
  // niet vaag (dus geen voorschot en geen restbak).
  const isActiveKey = key => actief.has(key) && !C.isVagueCategory(key, { uncategorizedKey: 'overige_kosten' })
  const opties = { rules: [], isActiveKey }

  const zonderFilter = await categorizeWithLearning('NS Utrecht', 30, 'debit', '', byRole, {})
  assert.equal(zonderFilter.cat, 'voorschot', 'ongefilterd zou de app zichzelf napraten')

  const ns = await categorizeWithLearning('NS Utrecht', 30, 'debit', '', byRole, opties)
  assert.equal(ns.cat, 'reiskosten', 'de ingebouwde regel ns -> reiskosten wint')
  assert.deepEqual(
    C.suggestRejectCategory(voorschotTx('NS Utrecht', 30, '2026-09-10'),
      { suggestion: ns, uncategorizedKey: 'overige_kosten' }),
    { category: 'reiskosten', subcategory: '', isSuggestion: true })

  const tikkie = await categorizeWithLearning('Tikkie Jan', 25, 'debit', '', byRole, opties)
  assert.equal(tikkie.cat, 'overige_kosten', 'zonder regel belandt hij in de restbak')
  assert.deepEqual(
    C.suggestRejectCategory(voorschotTx('Tikkie Jan', 25, '2026-09-10'),
      { suggestion: tikkie, uncategorizedKey: 'overige_kosten' }),
    { category: 'voorschot', subcategory: '', isSuggestion: false },
    'geen bruikbaar voorstel: hij blijft staan waar hij staat')
})

/* ---------------- eenmalige omzetting van Voorschot ---------------- */

await t('de omzetting zet Voorschot-uitgaven op open en laat de categorie staan', async () => {
  const nsId = await db.transactions.add(voorschotTx('NS Utrecht', 30, '2026-09-11'))
  const tikkieId = await db.transactions.add(voorschotTx('Tikkie Jan', 25, '2026-09-12'))
  // Een bijschrijving en een al gemarkeerde uitgave doen niet mee.
  await db.transactions.add({ ...voorschotTx('Terug van Jan', 25, '2026-09-12'), type: 'credit' })
  await db.transactions.add({ ...voorschotTx('Al gemarkeerd', 10, '2026-09-12'), claimStatus: 'open' })

  const n = await CL.convertVoorschotToClaims()
  assert.equal(n, 2, 'alleen de twee ongemarkeerde afschrijvingen')

  const [ns, tikkie] = await db.transactions.bulkGet([nsId, tikkieId])
  assert.deepEqual([ns.claimStatus, tikkie.claimStatus], ['open', 'open'])
  assert.deepEqual([ns.category, tikkie.category], ['voorschot', 'voorschot'],
    'de categorie blijft staan tot je hem afkeurt of wijzigt')
  assert.equal(await CL.convertVoorschotToClaims(), 0, 'een tweede keer valt er niets meer om te zetten')

  // En dan de vervolgstap: "niet declareren" met het voorstel bevestigen.
  await CL.rejectClaims([{ tx: ns, category: 'reiskosten', subcategory: '' }])
  const na = await db.transactions.get(nsId)
  assert.equal(na.claimStatus, 'rejected')
  assert.equal(na.category, 'reiskosten')
  assert.equal((await db.transactions.get(tikkieId)).category, 'voorschot', 'Tikkie blijft ongemoeid')
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

await t('batch heropenen: uitbetaling los, items terug naar ingediend, batch wacht weer', async () => {
  const ids = await db.transactions.bulkAdd([
    claim('Trein Den Haag', 20, '2026-08-03'),
    claim('Lunch klant', 15, '2026-08-05'),
  ], { allKeys: true })
  const batchId = await CL.submitClaimBatch({ name: 'Heropen-test', transactionIds: ids })
  const payoutId = await db.transactions.add({
    date: '2026-09-01', amount: 35, type: 'credit', category: 'salaris', subcategory: '',
    note: 'Werkgever declaraties', claimStatus: null, claimBatchId: null,
  })
  await CL.closeBatchWithPayout({ batchId, transactionId: payoutId })
  assert.equal((await db.claimBatches.get(batchId)).status, 'closed')

  const n = await CL.reopenClaimBatch(batchId)
  assert.equal(n, 2)
  const batch = await db.claimBatches.get(batchId)
  assert.equal(batch.status, 'submitted')
  assert.equal(batch.paidTransactionId, null)
  assert.equal(batch.paidAmount, null)
  assert.equal(batch.paidAt, null)
  const payout = await db.transactions.get(payoutId)
  assert.equal(C.claimStatusOf(payout), null, 'de uitbetaling is weer een gewone bijschrijving')
  assert.equal(payout.claimBatchId, null)
  for (const id of ids) {
    const tx = await db.transactions.get(id)
    assert.equal(C.claimStatusOf(tx), 'submitted')
    assert.equal(tx.claimBatchId, batchId, 'en zit nog in de batch')
  }
  // Nog een keer heropenen doet niets: de batch is al niet meer gesloten.
  assert.equal(await CL.reopenClaimBatch(batchId), 0)
})

await t('toch geen declaratie: uitbetaald item verlaat de batch, deeldeclaratie verdwijnt', async () => {
  const ids = await db.transactions.bulkAdd([
    claim('Parkeren Utrecht', 8, '2026-08-10'),
    { date: '2026-08-31', amount: 25, type: 'credit', category: 'reiskosten', subcategory: '',
      note: 'Reiskosten werk augustus 2026', claimStatus: 'open', claimBatchId: null },
  ], { allKeys: true })
  const batchId = await CL.submitClaimBatch({ name: 'Weghaal-test', transactionIds: ids })
  const payoutId = await db.transactions.add({
    date: '2026-09-05', amount: 33, type: 'credit', category: 'salaris', subcategory: '',
    note: 'Werkgever declaraties', claimStatus: null, claimBatchId: null,
  })
  await CL.closeBatchWithPayout({ batchId, transactionId: payoutId })

  const [parkeren, deel] = await db.transactions.bulkGet(ids)
  assert.equal(C.claimStatusOf(parkeren), 'paid')
  assert.ok(C.isPartialClaim(deel))

  await CL.discardClaim(parkeren)
  const los = await db.transactions.get(parkeren.id)
  assert.equal(C.claimStatusOf(los), null)
  assert.equal(los.claimBatchId, null)
  assert.ok(C.countsInTotals(los), 'telt weer gewoon mee als uitgave')

  await CL.discardClaim(deel)
  assert.equal(await db.transactions.get(deel.id), undefined, 'een deeldeclaratie zonder markering bestaat niet')

  // De batch blijft bestaan met zijn historie, alleen zonder deze items.
  const rest = await CL.batchItemsQuery(batchId)
  assert.equal(rest.length, 0)
  assert.equal((await db.claimBatches.get(batchId)).status, 'closed')
})

await t('deelbetaling: niet-betaalde items gaan terug naar Open en zijn opnieuw in te dienen', async () => {
  const ids = await db.transactions.bulkAdd([
    claim('Trein Groningen', 40, '2026-08-12'),
    claim('Hotel Groningen', 120, '2026-08-12'),
    claim('Koffie klant', 6, '2026-08-13'),
  ], { allKeys: true })
  const batchId = await CL.submitClaimBatch({ name: 'Deelbetaling-test', transactionIds: ids })
  // Werk betaalt alleen de trein; het hotel komt later, de koffie is afgekeurd.
  const payoutId = await db.transactions.add({
    date: '2026-09-10', amount: 40, type: 'credit', category: 'salaris', subcategory: '',
    note: 'Werkgever declaraties', claimStatus: null, claimBatchId: null,
  })
  const [trein, hotel, koffie] = await db.transactions.bulkGet(ids)
  const res = await CL.closeBatchWithPayout({
    batchId, transactionId: payoutId,
    rejections: [{ tx: koffie, category: 'boodschappen', subcategory: '' }],
    deferred: [hotel],
    note: '€120,00 (1×) later opnieuw ingediend',
  })
  assert.deepEqual(res, { paid: 1, rejected: 1, deferred: 1 })

  const [t1, h1, k1] = await db.transactions.bulkGet(ids)
  assert.equal(C.claimStatusOf(t1), 'paid')
  assert.equal(C.claimStatusOf(k1), 'rejected')
  assert.equal(C.claimStatusOf(h1), 'open', 'het hotel staat weer open')
  assert.equal(h1.claimBatchId, null, 'en hangt niet meer aan de oude batch')
  assert.ok(!C.countsInTotals(h1), 'en telt dus nog steeds niet als eigen uitgave')
  const batch = await db.claimBatches.get(batchId)
  assert.equal(batch.status, 'closed')
  assert.match(batch.note, /later opnieuw ingediend/)

  // Het hotel gaat in een nieuwe batch en wordt daar wél betaald.
  const batch2 = await CL.submitClaimBatch({ name: 'Nabetaling', transactionIds: [hotel.id] })
  const payout2 = await db.transactions.add({
    date: '2026-10-10', amount: 120, type: 'credit', category: 'salaris', subcategory: '',
    note: 'Werkgever declaraties', claimStatus: null, claimBatchId: null,
  })
  await CL.closeBatchWithPayout({ batchId: batch2, transactionId: payout2 })
  const h2 = await db.transactions.get(hotel.id)
  assert.equal(C.claimStatusOf(h2), 'paid')
  assert.equal(h2.claimBatchId, batch2)

  // Een destijds afgekeurd item alsnog opnieuw indienen: terug naar Open, categorie blijft.
  await CL.resubmitClaim(koffie.id)
  const k2 = await db.transactions.get(koffie.id)
  assert.equal(C.claimStatusOf(k2), 'open')
  assert.equal(k2.claimBatchId, null)
  assert.equal(k2.category, 'boodschappen', 'de gecorrigeerde categorie blijft staan')
  assert.ok(!C.countsInTotals(k2))
})

await t('twee ingediende batches samenvoegen en met één betaling afsluiten', async () => {
  const idsA = await db.transactions.bulkAdd([claim('Trein Zwolle', 30, '2026-09-01')], { allKeys: true })
  const idsB = await db.transactions.bulkAdd([
    claim('Lunch Zwolle', 12, '2026-09-02'),
    claim('Parkeren Zwolle', 8, '2026-09-02'),
  ], { allKeys: true })
  const a = await CL.submitClaimBatch({ name: 'Batch A', transactionIds: idsA })
  const b = await CL.submitClaimBatch({ name: 'Batch B', transactionIds: idsB })

  const moved = await CL.mergeClaimBatches(a, [b])
  assert.equal(moved, 2)
  assert.equal(await db.claimBatches.get(b), undefined, 'batch B is weg')
  const batchA = await db.claimBatches.get(a)
  assert.equal(batchA.status, 'submitted')
  assert.equal(batchA.expectedTotal, 50, 'verwacht totaal is de som')
  assert.match(batchA.note, /samengevoegd met Batch B/)
  for (const id of [...idsA, ...idsB]) {
    const tx = await db.transactions.get(id)
    assert.equal(tx.claimBatchId, a)
    assert.equal(C.claimStatusOf(tx), 'submitted')
  }

  const payoutId = await db.transactions.add({
    date: '2026-09-20', amount: 50, type: 'credit', category: 'salaris', subcategory: '',
    note: 'Werkgever declaraties', claimStatus: null, claimBatchId: null,
  })
  const res = await CL.closeBatchWithPayout({ batchId: a, transactionId: payoutId })
  assert.deepEqual(res, { paid: 3, rejected: 0, deferred: 0 })

  // Samenvoegen met een al afgesloten batch mag niet.
  await assert.rejects(() => CL.mergeClaimBatches(a, [b]), /ingediende/)
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
