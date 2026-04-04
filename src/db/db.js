import Dexie from 'dexie'

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

// Bootstrap learning from existing transactions (runs once, lazy-loaded to avoid circular imports)
db.on('ready', async () => {
  const { bootstrapFromHistory } = await import('../utils/merchantLearning')
  await bootstrapFromHistory()
})
