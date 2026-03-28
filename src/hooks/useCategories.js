import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { CATEGORIES } from '../constants/categories'

export function useCategories() {
  const stored = useLiveQuery(() => db.categories.toArray(), [])

  if (!stored) return []

  // Merge stored budgets with the canonical category definitions
  const budgetMap = Object.fromEntries((stored || []).map(c => [c.key, c.budget ?? 0]))
  return CATEGORIES.map(cat => ({
    ...cat,
    budget: budgetMap[cat.key] ?? 0,
  }))
}

export async function setCategoryBudget(key, budget) {
  await db.categories.put({ key, budget: Number(budget) })
}

// Seed default categories from Dictionary.json import data
export async function seedCategories(dictJson) {
  const raw = JSON.parse(dictJson)
  const catsObj = raw.categories ?? raw ?? {}
  const puts = []
  for (const [key, val] of Object.entries(catsObj)) {
    puts.push({ key, budget: Number(val?.budget ?? 0) })
  }
  await db.categories.bulkPut(puts)
}
