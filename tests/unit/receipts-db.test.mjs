// Bonnetjes op de echte database: de v5 -> v6 upgrade, het spiegelen naar
// `receiptItems`, koppelen/ontkoppelen, de geleerde productgroepen bij het
// uitlezen (met een nagebootste AI-API) en de backup met en zonder
// afbeeldingen.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import Dexie from 'dexie'

const SRC = new URL('../../src', import.meta.url).href

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.stack ?? e.message) }
}

/* ------------------------------------------------------------------ *
 * 1. Een bestaande v5-database, daarna de upgrade naar v6             *
 * ------------------------------------------------------------------ */

const V5_STORES = {
  transactions: '++id, date, category, type, claimStatus, [date+category]',
  categories: 'key, order',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
  rules: '++id, category',
  claimBatches: '++id, status',
}
const legacy = new Dexie('BudgetTracker')
legacy.version(5).stores(V5_STORES)
await legacy.open()
assert.equal(legacy.verno, 5)
await legacy.table('transactions').bulkAdd([
  { date: '2026-02-11', amount: 3.24, type: 'debit', category: 'boodschappen', subcategory: '', note: 'Lidl Utrecht' },
  { date: '2026-02-12', amount: 19.95, type: 'debit', category: 'boodschappen', subcategory: '', note: 'Albert Heijn' },
])
await legacy.table('categories').bulkPut([
  { key: 'boodschappen', label: 'Boodschappen', icon: '🛒', color: '#16A34A', type: 'expense', order: 0, isFixed: false, archived: false, role: null, subs: [], budget: 400 },
])
await legacy.table('settings').put({ key: 'theme', value: 'dark' })
legacy.close()
console.log('  ok   v5-database met 2 transacties aangemaakt')

const { db } = await import(`${SRC}/db/db.js`)
const R = await import(`${SRC}/hooks/useReceipts.js`)
const B = await import(`${SRC}/utils/backup.js`)
const { receiptItemRows } = await import(`${SRC}/utils/receipts/items.js`)
await db.open()

console.log('\n--- v6-upgrade ---')
await t('verno = 7 en de nieuwe tabellen bestaan', async () => {
  assert.equal(db.verno, 7)
  assert.ok(db.receipts, 'receipts-tabel')
  assert.ok(db.receiptItems, 'receiptItems-tabel')
  assert.equal(await db.receipts.count(), 0)
})
await t('bestaande v5-data blijft ongemoeid', async () => {
  assert.equal(await db.transactions.count(), 2)
  assert.equal((await db.categories.get('boodschappen')).budget, 400)
  assert.equal((await db.settings.get('theme')).value, 'dark')
})
await t('indexen van receipts en receiptItems staan er', () => {
  const bon = db.receipts.schema.indexes.map(i => i.name).sort()
  const regel = db.receiptItems.schema.indexes.map(i => i.name).sort()
  assert.deepEqual(bon, ['date', 'merchantKey', 'status', 'transactionId'])
  assert.deepEqual(regel, ['date', 'group', 'nameKey', 'receiptId'])
})

/* ------------------------------------------------------------------ *
 * 2. syncReceiptItems                                                  *
 * ------------------------------------------------------------------ */

const jpeg = bytes => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })

const BON_ITEMS = [
  { name: 'Chips Great Britain', nameKey: 'chips great britain', qty: 1, unitPrice: 1.69, price: 1.69, group: 'snacks_snoep', isDiscount: false },
  { name: 'Zakdoekjes balsem', nameKey: 'zakdoekjes balsem', qty: 1, unitPrice: 1.55, price: 1.55, group: 'huishouden', isDiscount: false },
]

let bonId = null
console.log('\n--- syncReceiptItems ---')
await t('spiegelt items naar receiptItems, inclusief datum en winkel', async () => {
  bonId = await db.receipts.add({
    transactionId: null, source: 'file', pages: [jpeg([1, 2, 3])], pdf: null, thumb: jpeg([9]),
    capturedAt: Date.now(), merchant: 'Lidl', merchantKey: 'lidl', date: '2026-02-11', time: '20:22',
    total: 3.24, currency: 'EUR', items: BON_ITEMS, discounts: [], discountTotal: 0,
    rawText: '', model: 'Qwen/Qwen3.5-9B', extractedAt: Date.now(), status: 'extracted', error: null,
  })
  const n = await R.syncReceiptItems({ ...(await db.receipts.get(bonId)), id: bonId })
  assert.equal(n, 2)
  const rijen = await db.receiptItems.where('receiptId').equals(bonId).toArray()
  assert.equal(rijen.length, 2)
  assert.deepEqual(rijen.map(r => r.nameKey).sort(), ['chips great britain', 'zakdoekjes balsem'])
  assert.equal(rijen[0].date, '2026-02-11')
  assert.equal(rijen[0].merchantKey, 'lidl')
})
await t('opnieuw spiegelen laat geen dubbele rijen achter', async () => {
  await R.syncReceiptItems({ ...(await db.receipts.get(bonId)), id: bonId })
  assert.equal(await db.receiptItems.where('receiptId').equals(bonId).count(), 2)
})
await t('receiptItemRows zonder id levert niets op', () => {
  assert.deepEqual(receiptItemRows({ items: BON_ITEMS }), [])
})

/* ------------------------------------------------------------------ *
 * 3. Koppelen en ontkoppelen                                           *
 * ------------------------------------------------------------------ */

console.log('\n--- koppelen ---')
const txLidl = (await db.transactions.toArray()).find(t2 => t2.note === 'Lidl Utrecht')

await t('linkToTransaction zet beide kanten en de status', async () => {
  await R.linkToTransaction(bonId, txLidl.id)
  assert.equal((await db.receipts.get(bonId)).transactionId, txLidl.id)
  assert.equal((await db.receipts.get(bonId)).status, 'linked')
  assert.equal((await db.transactions.get(txLidl.id)).receiptId, bonId)
  const rijen = await db.receiptItems.where('receiptId').equals(bonId).toArray()
  assert.ok(rijen.every(r => r.transactionId === txLidl.id), 'ook de regels wijzen naar de transactie')
})
await t('autoLink vindt dezelfde transactie op bedrag en datum', async () => {
  await R.unlinkReceipt(bonId)
  const res = await R.autoLink(bonId)
  assert.equal(res.linked, true)
  assert.equal(res.transaction.id, txLidl.id)
})
await t('unlink maakt beide kanten weer leeg', async () => {
  await R.unlinkReceipt(bonId)
  assert.equal((await db.receipts.get(bonId)).transactionId, null)
  assert.equal((await db.receipts.get(bonId)).status, 'extracted')
  assert.equal((await db.transactions.get(txLidl.id)).receiptId, null)
})
await t('removeReceipt ruimt ook de regels en de transactieverwijzing op', async () => {
  const tijdelijk = await db.receipts.add({ transactionId: null, items: BON_ITEMS, date: '2026-03-01', total: 1, status: 'extracted', pages: [] })
  await R.syncReceiptItems({ ...(await db.receipts.get(tijdelijk)), id: tijdelijk })
  await R.linkToTransaction(tijdelijk, txLidl.id)
  await R.removeReceipt(tijdelijk)
  assert.equal(await db.receipts.get(tijdelijk), undefined)
  assert.equal(await db.receiptItems.where('receiptId').equals(tijdelijk).count(), 0)
  assert.equal((await db.transactions.get(txLidl.id)).receiptId, null)
})

/* ------------------------------------------------------------------ *
 * 4. Uitlezen met geleerde groepen (API nagebootst)                    *
 * ------------------------------------------------------------------ */

console.log('\n--- uitlezen met receiptGroupOverrides ---')

const API_ANTWOORD = {
  model: 'Qwen/Qwen3.5-9B',
  usage: { prompt_tokens: 1810, completion_tokens: 134 },
  choices: [{
    finish_reason: 'stop',
    message: {
      content: JSON.stringify({
        merchant: 'Lidl', date: '2026-02-11', time: '20:22', currency: 'EUR', total: 3.24, payment_method: 'pin',
        items: [
          { name: 'Chips Great Britain', qty: 1, unit_price: 1.69, price: 1.69, group: 'snacks_snoep' },
          { name: 'Zakdoekjes balsem', qty: 1, unit_price: 1.55, price: 1.55, group: 'huishouden' },
        ],
        discounts: [],
      }),
    },
  }],
}

let aanroepen = 0
globalThis.fetch = async () => {
  aanroepen += 1
  return { ok: true, status: 200, text: async () => JSON.stringify(API_ANTWOORD) }
}

await t('zonder sleutel weigert extract meteen, zonder de bon te beschadigen', async () => {
  await db.settings.delete(R.AI_KEY_SETTING)
  await assert.rejects(() => R.extractReceiptById(bonId), /API-sleutel/)
  assert.equal((await db.receipts.get(bonId)).status, 'extracted', 'status blijft zoals hij was')
})

await t('een fout van de AI-dienst zet de bon op status error met een NL-melding', async () => {
  await R.setAiConfig({ apiKey: 'foute-sleutel' })
  const origineel = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })
  const stuk = await db.receipts.add({ transactionId: null, pages: [jpeg([1])], items: [], discounts: [], status: 'new', currency: 'EUR', rawText: '' })
  await assert.rejects(() => R.extractReceiptById(stuk), /sleutel/i)
  const na = await db.receipts.get(stuk)
  assert.equal(na.status, 'error')
  assert.match(na.error, /Instellingen/)
  globalThis.fetch = origineel
  await R.removeReceipt(stuk)
})

let nieuweBon = null
await t('extract vult de bon, de regels en de statistiek', async () => {
  await R.setAiConfig({ apiKey: 'test-sleutel', model: 'Qwen/Qwen3.5-9B' })
  nieuweBon = await db.receipts.add({
    transactionId: null, source: 'file', pages: [jpeg([1, 2, 3, 4])], pdf: null, thumb: jpeg([5]),
    capturedAt: Date.now(), merchant: null, merchantKey: '', date: null, time: null, total: null,
    currency: 'EUR', items: [], discounts: [], discountTotal: 0, rawText: '', model: null,
    extractedAt: null, status: 'new', error: null,
  })
  const uit = await R.extractReceiptById(nieuweBon)
  assert.equal(aanroepen, 1)
  assert.equal(uit.merchant, 'Lidl')
  assert.equal(uit.total, 3.24)
  assert.equal(uit.status, 'extracted', 'validatie klopt -> extracted')
  assert.equal(uit.items.length, 2)
  assert.equal(await db.receiptItems.where('receiptId').equals(nieuweBon).count(), 2)
  const stats = await R.getReceiptStats()
  assert.equal(stats.count, 1)
  assert.equal(stats.tokensIn, 1810)
  assert.ok(stats.estCost > 0 && stats.estCost < 0.001, `kosten plausibel: ${stats.estCost}`)
})

await t('een groep handmatig wijzigen wordt onthouden per nameKey', async () => {
  const bon = await db.receipts.get(nieuweBon)
  const items = bon.items.map(i => (i.nameKey === 'zakdoekjes balsem' ? { ...i, group: 'verzorging' } : i))
  await R.updateReceiptItems(nieuweBon, items)
  const overrides = await R.getGroupOverrides()
  assert.equal(overrides['zakdoekjes balsem'], 'verzorging')
  assert.equal(overrides['chips great britain'], undefined, 'ongewijzigde regels worden niet geleerd')
  const regel = (await db.receiptItems.where('receiptId').equals(nieuweBon).toArray())
    .find(r => r.nameKey === 'zakdoekjes balsem')
  assert.equal(regel.group, 'verzorging', 'ook de gespiegelde regel volgt')
})

await t('bij een volgende uitlezing wint de geleerde groep van het model', async () => {
  const tweede = await db.receipts.add({
    transactionId: null, source: 'file', pages: [jpeg([7, 7, 7])], pdf: null, thumb: null,
    capturedAt: Date.now(), items: [], discounts: [], status: 'new', currency: 'EUR', rawText: '',
  })
  const uit = await R.extractReceiptById(tweede)
  const zakdoek = uit.items.find(i => i.nameKey === 'zakdoekjes balsem')
  assert.equal(zakdoek.group, 'verzorging', 'model zei huishouden, de geleerde keuze wint')
  assert.equal(uit.items.find(i => i.nameKey === 'chips great britain').group, 'snacks_snoep')
  await R.removeReceipt(tweede)
})

/* ------------------------------------------------------------------ *
 * 5. Backup: met en zonder afbeeldingen                                *
 * ------------------------------------------------------------------ */

console.log('\n--- backup ---')
await t('de AI-sleutel staat nooit in een backup', async () => {
  await db.settings.put({ key: R.AI_KEY_SETTING, value: 'GEHEIME-SLEUTEL' })
  const backup = await B.createBackup()
  assert.ok(!JSON.stringify(backup).includes('GEHEIME-SLEUTEL'))
  assert.equal(backup.tables.settings.some(s => s.key === R.AI_KEY_SETTING), false)
  assert.equal(backup.tables.settings.some(s => s.key === 'ai'), false, 'ook het ai-object valt onder de ai-prefix')
  assert.ok(backup.tables.settings.some(s => s.key === R.GROUP_OVERRIDES_SETTING), 'geleerde groepen gaan wél mee')
})

await t('zonder afbeeldingen: wel items en rawText, geen pages/pdf/thumb', async () => {
  const backup = await B.createBackup({ includeImages: false })
  assert.equal(backup.includesImages, false)
  const bon = backup.tables.receipts.find(r => r.id === bonId)
  assert.ok(bon, 'de bon zit in de backup')
  assert.equal('pages' in bon, false)
  assert.equal('pdf' in bon, false)
  assert.equal('thumb' in bon, false)
  assert.equal(bon.items.length, 2, 'de regels gaan wel mee')
  assert.ok(backup.tables.receiptItems.length >= 2)
  // Moet zonder fout te serialiseren zijn (een Blob wordt anders stil {}).
  assert.ok(JSON.stringify(backup).length > 100)
})

await t('met afbeeldingen: Blob -> base64 -> Blob met dezelfde bytes', async () => {
  const backup = await B.createBackup({ includeImages: true })
  const bon = backup.tables.receipts.find(r => r.id === bonId)
  assert.equal(bon.pages.length, 1)
  assert.equal(bon.pages[0].$blob, 'image/jpeg')
  assert.equal(typeof bon.pages[0].data, 'string')
  assert.equal(bon.thumb.$blob, 'image/jpeg')

  const heen = JSON.parse(JSON.stringify(backup))
  await B.restoreBackup(heen, { mode: 'replace' })
  const terug = await db.receipts.get(bonId)
  assert.ok(terug.pages[0] instanceof Blob, 'weer een echte Blob')
  assert.equal(terug.pages[0].type, 'image/jpeg')
  assert.deepEqual([...new Uint8Array(await terug.pages[0].arrayBuffer())], [1, 2, 3])
  assert.deepEqual([...new Uint8Array(await terug.thumb.arrayBuffer())], [9])
})

await t('geschatte grootte is groter mét afbeeldingen', async () => {
  const zonder = await B.estimateBackupBytes({ includeImages: false })
  const met = await B.estimateBackupBytes({ includeImages: true })
  assert.ok(met > zonder, `${met} > ${zonder}`)
  assert.ok(await B.receiptImageBytes() > 0)
})

/* ------------------------------------------------------------------ *
 * 6. Restore hermapt receiptId                                         *
 * ------------------------------------------------------------------ */

console.log('\n--- restore hermapt de verwijzingen ---')
await t('samenvoegen laat transactions.receiptId en receipts.transactionId kloppen', async () => {
  // Uitgangspunt: één bon gekoppeld aan één transactie.
  await R.linkToTransaction(bonId, txLidl.id)
  const backup = JSON.parse(JSON.stringify(await B.createBackup({ includeImages: false })))
  assert.equal(backup.tables.receipts[0].transactionId, txLidl.id)

  // Alles wissen en met andere id's beginnen, zodat hermappen echt nodig is.
  await db.transaction('rw', db.receipts, db.receiptItems, db.transactions, async () => {
    await db.receipts.clear()
    await db.receiptItems.clear()
    await db.transactions.clear()
  })
  for (let i = 0; i < 5; i++) {
    await db.receipts.add({ transactionId: null, items: [], date: `2020-01-0${i + 1}`, total: 100 + i, merchantKey: `vulling${i}`, status: 'extracted', pages: [] })
    await db.transactions.add({ date: `2020-01-0${i + 1}`, amount: 100 + i, type: 'debit', category: 'boodschappen', subcategory: '', note: `vulling ${i}` })
  }

  const res = await B.restoreBackup(backup, { mode: 'merge' })
  // In de backup staan twee bonnen van dezelfde aankoop (dezelfde winkel,
  // datum en totaal): de merge-sleutel merchantKey|date|total vat ze samen.
  assert.equal(backup.tables.receipts.length, 2)
  assert.equal(res.stats.receipts.added, 1, 'dubbele bon wordt niet nog eens toegevoegd')
  assert.equal(res.stats.receipts.skipped, 1)
  assert.ok(res.stats.transactions.added >= 1)

  const bon = (await db.receipts.toArray()).find(r => r.merchantKey === 'lidl')
  const tx = (await db.transactions.toArray()).find(x => x.note === 'Lidl Utrecht')
  assert.ok(bon && tx)
  assert.notEqual(bon.id, bonId, 'de bon heeft een nieuw id gekregen')
  assert.equal(bon.transactionId, tx.id, 'bon wijst naar de nieuwe transactie')
  assert.equal(tx.receiptId, bon.id, 'transactie wijst terug naar de nieuwe bon')
  const regels = await db.receiptItems.where('receiptId').equals(bon.id).toArray()
  assert.equal(regels.length, 2, 'de regels zijn opnieuw afgeleid uit items')
  assert.ok(regels.every(r => r.transactionId === tx.id))
})

await t('dezelfde backup nog eens samenvoegen voegt niets dubbels toe', async () => {
  const backup = JSON.parse(JSON.stringify(await B.createBackup({ includeImages: false })))
  const voor = await db.receipts.count()
  const voorRegels = await db.receiptItems.count()
  const res = await B.restoreBackup(backup, { mode: 'merge' })
  assert.equal(res.stats.receipts.added, 0)
  assert.equal(await db.receipts.count(), voor)
  assert.equal(await db.receiptItems.count(), voorRegels)
})

console.log(`\n${pass} geslaagd, ${fail} mislukt`)
process.exit(fail ? 1 : 0)
