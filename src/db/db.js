import Dexie from 'dexie'

export const db = new Dexie('BudgetTracker')

db.version(1).stores({
  transactions: '++id, date, category, type, [date+category]',
  categories: 'key',
  settings: 'key',
})
