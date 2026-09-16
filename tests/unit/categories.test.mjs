import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { db } = await import(`${SRC}/db/db.js`)
const { archiveCategory, deleteCategory, restoreCategory, ensureDefaultCategories, addCategory, addSub } = await import(`${SRC}/hooks/useCategories.jsx`)

await db.open()
await ensureDefaultCategories()
const orders = async () => (await db.categories.toArray())
  .filter(c => !c.archived).sort((a, b) => a.order - b.order).map(c => `${c.key}:${c.order}`)

const before = await orders()
console.log('  start', before.length, 'actieve categorieen, order 0..' + (before.length - 1))
assert.deepEqual(before.map((_, i) => i), before.map(s => +s.split(':')[1]))

// Archiveer iets uit het midden
const mid = (await db.categories.toArray()).filter(c => !c.archived).sort((a, b) => a.order - b.order)[3]
await archiveCategory(mid.key)
let now = await orders()
assert.equal(now.length, before.length - 1)
assert.deepEqual(now.map(s => +s.split(':')[1]), now.map((_, i) => i), 'na archiveren 0..n-1')
console.log('  ok archiveren hernummert naar 0..n-1')

// Verwijder een lege categorie
const target = (await db.categories.toArray()).filter(c => !c.archived).sort((a, b) => a.order - b.order)[1]
await deleteCategory(target.key)
now = await orders()
assert.equal(now.length, before.length - 2)
assert.deepEqual(now.map(s => +s.split(':')[1]), now.map((_, i) => i), 'na verwijderen 0..n-1')
console.log('  ok verwijderen hernummert naar 0..n-1')

// Restbak mag niet weg
const rest = (await db.categories.toArray()).find(c => c.role === 'uncategorized')
await assert.rejects(() => archiveCategory(rest.key), /restcategorie/)
console.log('  ok restcategorie kan niet gearchiveerd worden')

// Terugzetten werkt nog
await restoreCategory(mid.key)
assert.equal((await db.categories.get(mid.key)).archived, false)
console.log('  ok terugzetten werkt')

// addCategory geeft de nieuwe key terug, zodat de kiezer 'm meteen kan selecteren
const newKey = await addCategory({ label: 'Huisdieren' })
assert.equal(typeof newKey, 'string')
assert.ok(newKey.length > 0)
assert.equal((await db.categories.get(newKey)).label, 'Huisdieren')
console.log('  ok addCategory geeft nieuwe key terug')

// addSub geeft de nieuwe sub-key terug
const subKey = await addSub(newKey, 'Hondenvoer')
assert.equal(typeof subKey, 'string')
let row = await db.categories.get(newKey)
assert.ok(row.subs.some(s => s.key === subKey && s.label === 'Hondenvoer'))
console.log('  ok addSub geeft nieuwe sub-key terug')

// addSub met bestaande naam (andere hoofdletters/spaties) maakt geen duplicaat
const dupeKey = await addSub(newKey, '  hondenvoer  ')
assert.equal(dupeKey, subKey)
row = await db.categories.get(newKey)
assert.equal(row.subs.filter(s => s.key === subKey).length, 1)
assert.equal(row.subs.length, 1)
console.log('  ok addSub voorkomt duplicaten op naam (hoofdletterongevoelig, getrimd)')
process.exit(0)
