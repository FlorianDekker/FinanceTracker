import Dexie from 'dexie'
import { buildDefaultCategoryRows, makeCategoryRow } from '../constants/categories'

export const db = new Dexie('BudgetTracker')

db.version(1).stores({
  transactions: '++id, date, category, type, [date+category]',
  categories: 'key',
  settings: 'key',
})

db.version(2).stores({
  transactions: '++id, date, category, type, [date+category]',
  categories: 'key',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
})

// v3: categorieen worden bewerkbaar en verhuizen volledig naar de database.
// Geen index op booleans (archived/isFixed): IndexedDB indexeert die niet; ~16 rijen filteren we in-memory.
db.version(3).stores({
  transactions: '++id, date, category, type, [date+category]',
  categories: 'key, order',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
}).upgrade(async tx => {
  const table = tx.table('categories')
  const existing = await table.toArray()           // oude vorm: { key, budget }
  const budgets = Object.fromEntries(existing.map(c => [c.key, c.budget ?? 0]))

  const rows = buildDefaultCategoryRows(budgets)   // bestaande budgetten blijven behouden
  const knownKeys = new Set(rows.map(r => r.key))

  // Onbekende bestaande keys overleven met defaults (bijv. handmatig toegevoegd of uit een oude seed)
  let nextOrder = rows.reduce((max, r) => Math.max(max, r.order), -1) + 1
  const extras = existing
    .filter(c => !knownKeys.has(c.key))
    .map(c => ({ ...makeCategoryRow({ key: c.key, order: nextOrder++ }, c.budget ?? 0), ...c }))

  await table.clear()
  await table.bulkPut([...rows, ...extras])
})

// v4: eigen herkenningsregels. Een .stores() herhaalt altijd alle tabellen;
// er verandert niets aan bestaande data, dus een .upgrade() is niet nodig.
db.version(4).stores({
  transactions: '++id, date, category, type, [date+category]',
  categories: 'key, order',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
  rules: '++id, category',
})

// v5: declaraties. `claimStatus` is een string-index (IndexedDB indexeert geen
// booleans); transacties zonder het veld blijven gewoon staan en gelden overal
// als "geen declaratie" (zie src/utils/claims.js), dus een .upgrade() is niet nodig.
db.version(5).stores({
  transactions: '++id, date, category, type, claimStatus, [date+category]',
  categories: 'key, order',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
  rules: '++id, category',
  claimBatches: '++id, status',
})

// v6: bonnetjes. `receipts` bewaart de bon zelf (afbeeldingen, uitgelezen regels,
// status), `receiptItems` is de platgeslagen kopie van `receipts.items` zodat we
// los op productnaam, groep en datum kunnen zoeken en aggregeren.
// `transactions.receiptId` is nullable en krijgt bewust geen index: we zoeken
// altijd vanuit de bon naar de transactie, nooit andersom over een hele tabel.
db.version(6).stores({
  transactions: '++id, date, category, type, claimStatus, [date+category]',
  categories: 'key, order',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
  rules: '++id, category',
  claimBatches: '++id, status',
  receipts: '++id, transactionId, date, merchantKey, status',
  receiptItems: '++id, receiptId, nameKey, group, date',
})

// v7: vakanties (trips + Splitser-regels) en vermogen (rekeningen met
// momentopnames, reserveringen, spaardoelen). Transacties krijgen een index
// op tripId zodat een vakantie zijn banktransacties snel vindt. Rekeningen
// hebben een string-key (slug) zodat een backup-herstel geen id's hoeft te
// verschuiven; trips wél (zie backup.js voor de tripId-remap).
db.version(7).stores({
  transactions: '++id, date, category, type, claimStatus, tripId, [date+category]',
  categories: 'key, order',
  settings: 'key',
  merchantHistory: '++id, merchantKey, baseKey, timestamp',
  rules: '++id, category',
  claimBatches: '++id, status',
  receipts: '++id, transactionId, date, merchantKey, status',
  receiptItems: '++id, receiptId, nameKey, group, date',
  trips: '++id, from, to',
  tripItems: '++id, tripId, date',
  accounts: 'key, order',
  accountSnapshots: '++id, accountKey, date, [accountKey+date]',
  reservations: '++id, dueMonth',
  goals: '++id, order',
})

// Bootstrap learning from existing transactions (runs once, lazy-loaded to avoid circular imports)
db.on('ready', async () => {
  const { bootstrapFromHistory } = await import('../utils/merchantLearning')
  await bootstrapFromHistory()
})
