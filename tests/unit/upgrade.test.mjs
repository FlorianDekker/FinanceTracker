import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import Dexie from 'dexie'
const SRC = new URL('../../src', import.meta.url).href

// Zet eerst een "oude" BudgetTracker v2 neer met categorieen in {key, budget}-vorm
const legacy = new Dexie('BudgetTracker')
legacy.version(1).stores({ transactions: '++id, date, category, type, [date+category]', categories: 'key', settings: 'key' })
legacy.version(2).stores({ transactions: '++id, date, category, type, [date+category]', categories: 'key', settings: 'key', merchantHistory: '++id, merchantKey, baseKey, timestamp' })
await legacy.open()
await legacy.table('categories').bulkPut([{ key: 'woning', budget: 800 }, { key: 'boodschappen', budget: 350 }, { key: 'zelfbedacht', budget: 50 }, { key: 'sterre', budget: 120 }])
await legacy.table('transactions').add({ date: '2025-06-01', amount: 800, type: 'debit', category: 'woning', subcategory: 'huur', note: 'Huur juni' })
legacy.close()
console.log('  ok   oude v2-database aangemaakt')

const { db } = await import(`${SRC}/db/db.js`)
const B = await import(`${SRC}/utils/backup.js`)
await db.open()
assert.equal(db.verno, 5)
console.log('  ok   upgradeketen v2 -> v5 draait, verno = 5')

const woning = await db.categories.get('woning')
assert.equal(woning.budget, 800, 'budget behouden')
assert.equal(woning.label, 'Woning')
assert.equal((await db.categories.get('zelfbedacht')).budget, 50, 'onbekende key overleeft')
assert.equal(await db.transactions.count(), 1)
assert.ok(db.rules, 'rules-tabel bestaat')
assert.ok(db.claimBatches, 'claimBatches-tabel bestaat')
assert.equal(await db.claimBatches.count(), 0)
console.log('  ok   v3-migratie behield budgetten, v4 voegde rules toe, v5 claimBatches')

// 'sterre' zit niet meer in DEFAULT_CATEGORIES, maar Florians bestaande rij moet
// de migratie overleven via de extras-tak — inclusief een net label en icoon.
const { DEFAULT_CATEGORIES } = await import(`${SRC}/constants/categories.js`)
assert.equal(DEFAULT_CATEGORIES.some(c => c.key === 'sterre'), false, 'sterre wordt niet meer geseed')
const sterre = await db.categories.get('sterre')
assert.ok(sterre, 'bestaande sterre-rij overleeft de upgrade')
assert.equal(sterre.budget, 120, 'budget behouden')
assert.equal(sterre.label, 'Sterre')
assert.equal(sterre.icon, '🥰')
assert.deepEqual(sterre.subs.map(s => s.key), ['cadeaus_sterre', 'dates_sterre'])
console.log('  ok   legacy-categorie sterre behouden met label, icoon en budget')

const backup = await B.createBackup()
assert.equal(backup.schemaVersion, 5)
assert.equal(backup.tables.rules.length, 0)
assert.equal(backup.tables.claimBatches.length, 0)
console.log('  ok   backup van de gemigreerde database')
console.log(`  (backup: ${Object.entries(backup.tables).map(([t, r]) => `${t}=${r.length}`).join(' ')})`)
process.exit(0)
