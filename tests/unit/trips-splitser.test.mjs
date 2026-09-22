// De Splitser-parser tegen de echte settlement-tekst uit
// docs/voorbeelden/splitser-parijs.txt: 16 regels, €318,96 totaal en het
// aandeel van Florian (€141,79) dat exact met de Balance-sectie klopt.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../src', import.meta.url).href
const FIXTURE = new URL('../../docs/voorbeelden/splitser-parijs.txt', import.meta.url)

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const S = await import(`${SRC}/utils/trips/splitser.js`)
const tekst = readFileSync(FIXTURE, 'utf8')
const p = S.parseSplitserPdf(tekst)

console.log('\n--- de fixture ---')
await t('kop: naam en datum van het settlement', () => {
  assert.equal(p.name, 'Parijs')
  assert.equal(p.settledOn, '2026-07-14')
})
await t('leden en balans uit de Balance-sectie', () => {
  assert.deepEqual(p.members, ['Florian', 'Dani', 'Yonathan'])
  assert.deepEqual(p.balance.Florian, { balance: 22.97, expensesPlus: 164.76, expensesMinus: 141.79 })
  assert.deepEqual(p.balance.Yonathan, { balance: -34.87, expensesPlus: 0, expensesMinus: 34.87 })
})
await t('16 regels, samen €318,96 — gelijk aan "Total spent"', () => {
  assert.equal(p.rows.length, 16)
  assert.equal(p.sumAmounts, 318.96)
  assert.equal(p.totalSpent, 318.96)
  assert.deepEqual(p.warnings, [])
})
await t('periode uit de regels', () => {
  assert.equal(p.from, '2026-07-11')
  assert.equal(p.to, '2026-07-14')
})
await t('betaler, omschrijving, bedrag, datum en deelnemers per regel', () => {
  assert.deepEqual(p.rows[0], {
    date: '2026-07-14',
    description: 'Cola laatste dag',
    amount: 10,
    payer: 'Dani',
    participants: [{ name: 'Dani', share: 5 }, { name: 'Florian', share: 5 }],
  })
  const indiaas = p.rows.find(r => r.description === 'Avondeten indiaas')
  assert.equal(indiaas.payer, 'Florian')
  assert.equal(indiaas.amount, 58.5)
  assert.equal(indiaas.participants.length, 3)
  // Een regel met een ongelijke verdeling blijft ongelijk.
  const quixxx = p.rows.find(r => r.description === 'Bier Quixxx')
  assert.deepEqual(quixxx.participants, [{ name: 'Dani', share: 8.5 }, { name: 'Florian', share: 8 }])
})
await t('kopregels, paginawissels en "Continuing on next page" zijn eruit', () => {
  assert.equal(p.rows.some(r => /Payer|Continuing|Settlement/i.test(r.description)), false)
  // De regels van pagina twee staan er wél in.
  assert.ok(p.rows.some(r => r.description === 'Toeristenbelasting'))
  assert.ok(p.rows.some(r => r.description === 'Eten libanees'))
})
await t('Σ myShare voor Florian is €141,79 en klopt met de balans', () => {
  assert.equal(S.totalShareOf(p.rows, 'Florian'), 141.79)
  assert.deepEqual(S.checkMyShare(p, 'Florian'), { ok: true, expected: 141.79, actual: 141.79, diff: 0 })
  assert.equal(S.totalShareOf(p.rows, 'Yonathan'), 34.87)
  assert.equal(S.totalShareOf(p.rows, 'Iemand anders'), 0)
})
await t('shareOf: mijn aandeel per regel, 0 als ik niet meedeed', () => {
  assert.equal(S.shareOf(p.rows[0], 'Florian'), 5)
  assert.equal(S.shareOf(p.rows[0], 'Yonathan'), 0)
})

console.log('\n--- randgevallen ---')
await t('een omschrijving die over twee tekstregels breekt', () => {
  const uit = S.parseSplitserPdf([
    'Expenses',
    'Payer Description Amount Date Participants',
    'Florian Heel lang avondeten met de hele',
    'groep in het centrum €30.00 12-07-2026 Dani (€10.00), Florian (€10.00), Yonathan (€10.00)',
    'Total spent €30.00',
  ])
  assert.equal(uit.rows.length, 1)
  assert.equal(uit.rows[0].description, 'Heel lang avondeten met de hele groep in het centrum')
  assert.deepEqual(uit.warnings, [])
})
await t('waarschuwt als de som niet bij "Total spent" past', () => {
  const uit = S.parseSplitserPdf([
    'Expenses',
    'Florian Broodje €10.00 12-07-2026 Florian (€10.00)',
    'Total spent €99.00',
  ])
  assert.equal(uit.rows.length, 1)
  assert.match(uit.warnings[0], /Total spent/)
})
await t('checkMyShare ziet een verschil met de balans', () => {
  const uit = S.parseSplitserPdf([
    'Balance',
    'Member Balance + - + - + -',
    'Florian €0.00 €10.00 €99.00 €0.00 €0.00 €0.00 €0.00',
    'Expenses',
    'Florian Broodje €10.00 12-07-2026 Florian (€10.00)',
  ])
  const c = S.checkMyShare(uit, 'Florian')
  assert.equal(c.ok, false)
  assert.equal(c.expected, 99)
  assert.equal(c.actual, 10)
})
await t('bedragen met punt, komma en duizendtallen', () => {
  assert.equal(S.parseBedrag('318.96'), 318.96)
  assert.equal(S.parseBedrag('1.234,56'), 1234.56)
  assert.equal(S.parseBedrag('1,234.56'), 1234.56)
  assert.equal(S.parseBedrag('€ 12,50'), 12.5)
  assert.equal(S.parseBedrag('-34.87'), -34.87)
  assert.equal(S.parseBedrag('geen getal'), null)
  assert.equal(S.parseDatum('14-07-2026'), '2026-07-14')
  assert.equal(S.parseDatum('2026-07-14'), null)
})
await t('lege of onzinnige invoer geeft een waarschuwing, geen crash', () => {
  const leeg = S.parseSplitserPdf('')
  assert.deepEqual(leeg.rows, [])
  assert.match(leeg.warnings[0], /Geen uitgaven/)
})

console.log('\n--- tweede import van dezelfde reis ---')
await t('bestaande regels blijven, nieuwe komen erbij, verdwenen gaan weg', () => {
  const bestaand = [
    { id: 1, date: '2026-07-14', description: 'Cola laatste dag', amount: 10, category: 'boodschappen' },
    { id: 2, date: '2026-07-14', description: 'Hummus', amount: 2.4, category: 'boodschappen' },
    { id: 3, date: '2026-07-13', description: 'Weggehaalde regel', amount: 5, category: 'vakantie' },
  ]
  const nieuw = [
    { date: '2026-07-14', description: 'Cola laatste dag', amount: 10 },
    { date: '2026-07-14', description: 'Hummus', amount: 2.4 },
    { date: '2026-07-13', description: 'Nieuw rondje', amount: 8 },
  ]
  const d = S.diffSplitserRows(bestaand, nieuw)
  assert.deepEqual(d.toAdd.map(r => r.description), ['Nieuw rondje'])
  assert.deepEqual(d.keptIds.sort(), [1, 2])
  assert.deepEqual(d.toRemove, [3])
  assert.deepEqual(d.kept.map(k => k.id), [1, 2])
})
await t('twee identieke regels in één settlement blijven twee regels', () => {
  const bestaand = [
    { id: 1, date: '2026-07-12', description: 'Rondje', amount: 8 },
    { id: 2, date: '2026-07-12', description: 'Rondje', amount: 8 },
  ]
  const d = S.diffSplitserRows(bestaand, [
    { date: '2026-07-12', description: 'Rondje', amount: 8 },
    { date: '2026-07-12', description: 'Rondje', amount: 8 },
    { date: '2026-07-12', description: 'Rondje', amount: 8 },
  ])
  assert.equal(d.toAdd.length, 1)
  assert.equal(d.keptIds.length, 2)
  assert.deepEqual(d.toRemove, [])
})

console.log(`\n${pass} geslaagd, ${fail} mislukt`)
process.exit(fail ? 1 : 0)
