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

// Bootstrap learning from existing transactions (runs once, lazy-loaded to avoid circular imports)
db.on('ready', async () => {
  const { bootstrapFromHistory } = await import('../utils/merchantLearning')
  await bootstrapFromHistory()
})
