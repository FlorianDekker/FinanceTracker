import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { db } = await import(`${SRC}/db/db.js`)
const { predictCategory, recordEvent } = await import(`${SRC}/utils/merchantLearning.js`)

await db.open()
const now = Date.now(), MONTH = 30 * 86400000
// 3 events op 'sportschool' -> categorie 'hobbys' (die we straks archiveren)
for (let i = 0; i < 3; i++) {
  await db.merchantHistory.add({
    merchantKey: 'sportschoolamsterdam', baseKey: 'sportschoolamsterdam',
    category: 'hobbys', subcategory: 'gamen', amount: 25, dayOfMonth: 1,
    type: 'debit', remiTokens: [], wasCorrection: false, previousCategory: '',
    timestamp: now - i * MONTH,
  })
}
// 1 event naar een wel-actieve categorie
await db.merchantHistory.add({
  merchantKey: 'sportschoolamsterdam', baseKey: 'sportschoolamsterdam',
  category: 'abonnementen', subcategory: 'sportabonnement', amount: 25, dayOfMonth: 1,
  type: 'debit', remiTokens: [], wasCorrection: false, previousCategory: '', timestamp: now,
})

const all = await predictCategory('Sportschool Amsterdam', 25, 'debit', '')
assert.equal(all.cat, 'hobbys')
assert.equal(all.source, 'recurring')
console.log('  ok zonder guard wint de terugkerende (gearchiveerde) categorie')

const guarded = await predictCategory('Sportschool Amsterdam', 25, 'debit', '', k => k !== 'hobbys')
assert.equal(guarded.cat, 'abonnementen', 'moet de volgende kandidaat kiezen')
assert.notEqual(guarded.source, 'recurring')
console.log('  ok guard slaat gearchiveerde categorie over (recurring + scoring)')

const none = await predictCategory('Sportschool Amsterdam', 25, 'debit', '', () => false)
assert.equal(none, null)
console.log('  ok alles gearchiveerd -> null')

const count = await db.merchantHistory.count()
assert.equal(count, 4, 'leerdata blijft ongemoeid')
console.log('  ok leerdata niet gemuteerd')
process.exit(0)
