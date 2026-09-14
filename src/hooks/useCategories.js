import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { DEFAULT_CATEGORIES, CATEGORY_MAP, buildDefaultCategoryRows, makeCategoryRow } from '../constants/categories'

export function useCategories() {
  const stored = useLiveQuery(() => db.categories.toArray(), [])

  if (!stored) return []

  // Merge stored budgets with the canonical category definitions
  const budgetMap = Object.fromEntries((stored || []).map(c => [c.key, c.budget ?? 0]))
  return DEFAULT_CATEGORIES.map(cat => ({
    ...cat,
    budget: budgetMap[cat.key] ?? 0,
  }))
}

// Zorgt dat elke standaardcategorie als volledige rij in de db staat, zonder
// bestaande rijen (budget, label, kleur, ...) te overschrijven.
export async function ensureDefaultCategories() {
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.toArray()
    const byKey = Object.fromEntries(existing.map(c => [c.key, c]))
    const missing = buildDefaultCategoryRows(
      Object.fromEntries(existing.map(c => [c.key, c.budget ?? 0]))
    ).filter(r => !byKey[r.key])
    if (missing.length) await db.categories.bulkPut(missing)
  })
}

export async function setCategoryBudget(key, budget) {
  const value = Number(budget) || 0
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.get(key)
    if (existing) await db.categories.put({ ...existing, budget: value })
    else await db.categories.put(makeCategoryRow(CATEGORY_MAP[key] ?? { key }, value))
  })
}

// Seed default categories from Dictionary.json import data (merget alleen budgetten)
export async function seedCategories(dictJson) {
  const raw = JSON.parse(dictJson)
  const catsObj = raw.categories ?? raw ?? {}
  await ensureDefaultCategories()
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.toArray()
    const byKey = Object.fromEntries(existing.map(c => [c.key, c]))
    let nextOrder = existing.reduce((max, c) => Math.max(max, c.order ?? 0), -1) + 1
    const puts = []
    for (const [key, val] of Object.entries(catsObj)) {
      const budget = Number(val?.budget ?? 0) || 0
      const row = byKey[key]
      puts.push(row
        ? { ...row, budget }
        : makeCategoryRow({ order: nextOrder++, ...(CATEGORY_MAP[key] ?? { key }) }, budget))
    }
    if (puts.length) await db.categories.bulkPut(puts)
  })
}
