/* eslint-disable react-refresh/only-export-components -- provider + losse db-mutators horen hier bij elkaar; kost alleen snelle HMR */
import { createContext, useContext, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  CATEGORY_MAP,
  buildDefaultCategoryRows,
  makeCategoryRow,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
} from '../constants/categories'
import { slugify, uniqueSlug } from '../utils/slug'

const CategoriesContext = createContext(null)

const EMPTY_ARRAY = []
const EMPTY_MAP = {}
const EMPTY_SET = new Set()

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)

/* ------------------------------------------------------------------ *
 * Losse mutators (werken ook buiten de provider, bijv. MigrationPage)  *
 * ------------------------------------------------------------------ */

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

// Seed vanuit Dictionary.json: merget uitsluitend budgetten, overschrijft geen rijen.
export async function seedCategories(dictJson) {
  const raw = typeof dictJson === 'string' ? JSON.parse(dictJson) : dictJson
  const catsObj = raw?.categories ?? raw ?? {}
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

const EDITABLE_FIELDS = ['label', 'icon', 'color', 'type', 'isFixed', 'archived', 'role', 'budget', 'order', 'subs']

export async function addCategory(input = {}) {
  const label = String(input.label ?? '').trim()
  if (!label) throw new Error('Geef de categorie een naam')

  let newKey
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.toArray()
    newKey = uniqueSlug(label, existing.map(c => c.key))
    const nextOrder = existing.reduce((max, c) => Math.max(max, c.order ?? 0), -1) + 1
    const row = makeCategoryRow({
      key: newKey,
      label,
      icon: input.icon || DEFAULT_CATEGORY_ICON,
      color: input.color || DEFAULT_CATEGORY_COLOR,
      type: input.type ?? 'expense',
      order: input.order ?? nextOrder,
      isFixed: input.isFixed ?? false,
      archived: false,
      role: input.role ?? null,
      subs: normalizeSubs(input.subs),
    }, input.budget ?? 0)
    if (row.role) await clearRole(existing, row.role, newKey)
    await db.categories.add(row)
  })
  return newKey
}

export async function updateCategory(key, patch = {}) {
  await db.transaction('rw', db.categories, async () => {
    const existing = await db.categories.toArray()
    const row = existing.find(c => c.key === key)
    if (!row) throw new Error(`Categorie '${key}' bestaat niet`)

    const next = { ...row }
    for (const field of EDITABLE_FIELDS) {
      if (patch[field] === undefined) continue
      if (field === 'budget') next.budget = Number(patch.budget) || 0
      else if (field === 'label') next.label = String(patch.label).trim() || row.label
      else if (field === 'subs') next.subs = normalizeSubs(patch.subs)
      else next[field] = patch[field]
    }
    // Rollen zijn uniek: een rol verhuizen haalt hem bij de vorige categorie weg.
    if (next.role && next.role !== row.role) await clearRole(existing, next.role, key)
    await db.categories.put(next)
  })
}

export async function archiveCategory(key) {
  const row = await db.categories.get(key)
  if (!row) throw new Error(`Categorie '${key}' bestaat niet`)
  if (row.role === 'uncategorized') throw new Error('De restcategorie kan niet gearchiveerd worden')
  await db.categories.put({ ...row, archived: true })
}

export async function restoreCategory(key) {
  const row = await db.categories.get(key)
  if (!row) throw new Error(`Categorie '${key}' bestaat niet`)
  await db.categories.put({ ...row, archived: false })
}

// Hard verwijderen mag alleen als er geen enkele transactie meer naar de categorie wijst.
export async function deleteCategory(key) {
  const count = await db.transactions.where('category').equals(key).count()
  if (count > 0) {
    throw new Error(`Deze categorie heeft nog ${count} transactie${count === 1 ? '' : 's'}; verplaats of archiveer ze eerst`)
  }
  await db.categories.delete(key)
}

// Nieuwe volgorde in één bulkPut (geen flikkering in de UI).
export async function reorderCategories(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return
  await db.transaction('rw', db.categories, async () => {
    const rows = await db.categories.bulkGet(keys)
    const puts = []
    keys.forEach((key, index) => {
      const row = rows[index]
      if (row && row.order !== index) puts.push({ ...row, order: index })
      else if (row) puts.push(row)
    })
    await db.categories.bulkPut(puts)
  })
}

export async function addSub(key, label) {
  const name = String(label ?? '').trim()
  if (!name) throw new Error('Geef de subcategorie een naam')
  let subKey
  await db.transaction('rw', db.categories, async () => {
    const row = await db.categories.get(key)
    if (!row) throw new Error(`Categorie '${key}' bestaat niet`)
    const subs = normalizeSubs(row.subs)
    subKey = uniqueSlug(name, subs.map(s => s.key))
    await db.categories.put({ ...row, subs: [...subs, { key: subKey, label: name }] })
  })
  return subKey
}

export async function renameSub(key, subKey, label) {
  const name = String(label ?? '').trim()
  if (!name) throw new Error('Geef de subcategorie een naam')
  await db.transaction('rw', db.categories, async () => {
    const row = await db.categories.get(key)
    if (!row) throw new Error(`Categorie '${key}' bestaat niet`)
    const subs = normalizeSubs(row.subs).map(s => (s.key === subKey ? { ...s, label: name } : s))
    await db.categories.put({ ...row, subs })
  })
}

export async function deleteSub(key, subKey) {
  await db.transaction('rw', db.categories, async () => {
    const row = await db.categories.get(key)
    if (!row) throw new Error(`Categorie '${key}' bestaat niet`)
    const subs = normalizeSubs(row.subs).filter(s => s.key !== subKey)
    await db.categories.put({ ...row, subs })
  })
}

function normalizeSubs(subs) {
  if (!Array.isArray(subs)) return []
  const seen = new Set()
  const out = []
  for (const sub of subs) {
    if (!sub) continue
    const label = String(sub.label ?? sub.key ?? '').trim()
    if (!label) continue
    const key = sub.key ? slugify(sub.key) : uniqueSlug(label, seen)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ key, label })
  }
  return out
}

// Haalt een rol weg bij alle andere categorieen (max. één categorie per rol).
async function clearRole(existing, role, exceptKey) {
  const others = existing.filter(c => c.role === role && c.key !== exceptKey)
  if (others.length) await db.categories.bulkPut(others.map(c => ({ ...c, role: null })))
}

/* ------------------------------------------------------------------ *
 * Provider + hook                                                      *
 * ------------------------------------------------------------------ */

export function CategoriesProvider({ children }) {
  const rows = useLiveQuery(() => db.categories.orderBy('order').toArray(), [])

  const value = useMemo(() => {
    const loading = rows === undefined
    const allCategories = loading ? EMPTY_ARRAY : [...rows].sort(byOrder)
    const categories = loading ? EMPTY_ARRAY : allCategories.filter(c => !c.archived)

    const catMap = loading ? EMPTY_MAP : Object.fromEntries(allCategories.map(c => [c.key, c]))
    const colors = loading
      ? EMPTY_MAP
      : Object.fromEntries(allCategories.map(c => [c.key, c.color ?? DEFAULT_CATEGORY_COLOR]))
    const expenseCategories = categories.filter(c => c.type === 'expense')
    const fixedKeys = loading ? EMPTY_SET : new Set(categories.filter(c => c.isFixed).map(c => c.key))
    const roleMap = loading ? EMPTY_MAP : Object.fromEntries(allCategories.filter(c => c.role).map(c => [c.role, c]))

    return {
      loading,
      categories,
      allCategories,
      catMap,
      colors,
      expenseCategories,
      fixedKeys,
      getByRole: role => roleMap[role] ?? null,
      addCategory,
      updateCategory,
      archiveCategory,
      restoreCategory,
      deleteCategory,
      reorderCategories,
      addSub,
      renameSub,
      deleteSub,
      setCategoryBudget,
      seedCategories,
    }
  }, [rows])

  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>
}

// Fallback zodat consumers buiten de provider (of tijdens het laden) niet crashen.
const FALLBACK = {
  loading: true,
  categories: EMPTY_ARRAY,
  allCategories: EMPTY_ARRAY,
  catMap: EMPTY_MAP,
  colors: EMPTY_MAP,
  expenseCategories: EMPTY_ARRAY,
  fixedKeys: EMPTY_SET,
  getByRole: () => null,
  addCategory,
  updateCategory,
  archiveCategory,
  restoreCategory,
  deleteCategory,
  reorderCategories,
  addSub,
  renameSub,
  deleteSub,
  setCategoryBudget,
  seedCategories,
}

export function useCategories() {
  return useContext(CategoriesContext) ?? FALLBACK
}
