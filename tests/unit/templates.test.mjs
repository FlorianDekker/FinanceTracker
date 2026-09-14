// Categorie-templates uit de onboarding: de systeemrollen moeten in elke
// template aanwezig zijn, anders valt de rest van de app terug op losse slugs.
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const T = await import(`${SRC}/constants/templates.js`)
const { DEFAULT_CATEGORIES } = await import(`${SRC}/constants/categories.js`)

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok', name) }

t('er zijn drie templates met unieke id', () => {
  const ids = T.TEMPLATES.map(x => x.id)
  assert.deepEqual(ids, ['standaard', 'minimaal', 'student'])
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(T.getTemplate('bestaat-niet').id, 'standaard', 'onbekende id valt terug op standaard')
})

for (const template of T.TEMPLATES) {
  t(`${template.id}: rollen aanwezig en rijen volledig`, () => {
    const rows = T.buildTemplateRows(template.id)
    assert.deepEqual(T.validateTemplateRows(rows), [], 'geen validatieproblemen')

    assert.equal(rows.filter(r => r.role === 'uncategorized').length, 1)
    assert.ok(rows.filter(r => r.role === 'income').length >= 1)
    assert.ok(rows.filter(r => r.role === 'transfer').length >= 1)

    for (const row of rows) {
      for (const veld of ['key', 'label', 'icon', 'color', 'type', 'order', 'isFixed', 'archived', 'role', 'subs', 'budget']) {
        assert.ok(veld in row, `${row.key} mist ${veld}`)
      }
      assert.equal(row.archived, false)
      assert.equal(row.budget, 0)
    }
  })

  t(`${template.id}: slugs uniek, order 0..n-1`, () => {
    const rows = T.buildTemplateRows(template.id)
    const keys = rows.map(r => r.key)
    assert.equal(new Set(keys).size, keys.length, 'unieke categoriesleutels')
    assert.deepEqual(rows.map(r => r.order), rows.map((_, i) => i))
    for (const row of rows) {
      const subs = row.subs.map(s => s.key)
      assert.equal(new Set(subs).size, subs.length, `${row.key}: unieke subsleutels`)
      for (const sub of row.subs) assert.ok(sub.label, `${row.key}: sub zonder label`)
    }
  })
}

t('standaard is exact DEFAULT_CATEGORIES', () => {
  const rows = T.buildTemplateRows('standaard')
  assert.equal(rows.length, DEFAULT_CATEGORIES.length)
  assert.deepEqual(rows.map(r => r.key), DEFAULT_CATEGORIES.map(c => c.key))
})

t('minimaal is kleiner en hergebruikt bestaande sleutels', () => {
  const rows = T.buildTemplateRows('minimaal')
  assert.equal(rows.filter(r => r.type === 'expense').length, 7)
  assert.equal(rows.length, 9, '7 uitgaven + salaris + bankoverschrijving')
  const bekend = new Set(DEFAULT_CATEGORIES.map(c => c.key))
  for (const row of rows) assert.ok(bekend.has(row.key), `${row.key} bestaat ook in de standaardlijst`)
})

t('student voegt Studie toe en DUO onder inkomen', () => {
  const rows = T.buildTemplateRows('student')
  const studie = rows.find(r => r.key === 'studie')
  assert.ok(studie, 'Studie-categorie aanwezig')
  assert.deepEqual(studie.subs.map(s => s.key), ['collegegeld', 'boeken'])
  const inkomen = rows.find(r => r.role === 'income')
  assert.ok(inkomen.subs.some(s => s.key === 'duo'), 'DUO als subcategorie van inkomen')
  assert.equal(rows.length, DEFAULT_CATEGORIES.length + 1)
})

t('budgetten uit de wizard komen in de rijen terecht', () => {
  const rows = T.buildTemplateRows('standaard', { woning: 1200, boodschappen: '350' })
  assert.equal(rows.find(r => r.key === 'woning').budget, 1200)
  assert.equal(rows.find(r => r.key === 'boodschappen').budget, 350)
  assert.equal(rows.find(r => r.key === 'kleding').budget, 0)
})

t('validatie slaat alarm bij een kapotte template', () => {
  const rows = T.buildTemplateRows('standaard').filter(r => r.role !== 'uncategorized')
  const problemen = T.validateTemplateRows(rows)
  assert.ok(problemen.some(p => p.includes('restcategorie')))
  assert.ok(problemen.some(p => p.includes('overige_kosten')))

  const dubbel = T.buildTemplateRows('standaard')
  dubbel.push({ ...dubbel[0], subs: [{ key: 'a', label: 'A' }, { key: 'a', label: 'A' }] })
  const p2 = T.validateTemplateRows(dubbel)
  assert.ok(p2.some(p => p.includes('dubbele sleutels')))
  assert.ok(p2.some(p => p.includes('dubbele subcategorieën')))
})

console.log(`\n${n} template-tests geslaagd`)
process.exit(0)
