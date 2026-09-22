// Spaarpercentage: maandpercentage, gewogen periodepercentage en het
// voortschrijdend gemiddelde — zonder database.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const S = await import(`${SRC}/utils/savings.js`)

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const rij = (month, income, expenses) => ({ year: 2026, month, income, expenses })

t('maandpercentage: null zonder inkomen, negatief kan', () => {
  assert.equal(S.monthRate(rij(1, 0, 500)), null)
  assert.equal(S.monthRate(rij(2, 2000, 1500)), 0.25)
  assert.equal(S.monthRate(rij(3, 1000, 1200)), -0.2)
  assert.equal(S.pct(S.monthRate(rij(1, 0, 500))), null)
  assert.equal(S.pct(0.256), 26)
})

t('periodepercentage is gewogen en slaat maanden zonder inkomen over', () => {
  const rows = [rij(1, 2000, 1000), rij(2, 0, 800), rij(3, 4000, 3000)]
  const p = S.periodSavings(rows)
  assert.equal(p.months, 2, 'februari (geen salaris) telt niet mee')
  assert.equal(p.income, 6000)
  assert.equal(p.expenses, 4000, 'de uitgaven van februari tellen ook niet mee')
  assert.equal(p.saved, 2000)
  assert.equal(S.pct(p.rate), 33, 'gewogen: 2000/6000, niet het gemiddelde van 50% en 25%')
})

t('periodepercentage: null zonder enig inkomen', () => {
  assert.equal(S.periodSavings([rij(1, 0, 100)]).rate, null)
  assert.equal(S.periodSavings([]).rate, null)
})

t('voortschrijdend gemiddelde kijkt n rijen terug', () => {
  const rows = [rij(1, 1000, 500), rij(2, 1000, 900), rij(3, 1000, 700), rij(4, 0, 300)]
  const r = S.rollingRates(rows, 2).map(S.pct)
  assert.deepEqual(r, [50, 30, 20, 30], 'april zonder inkomen: gemiddelde van alleen maart')
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
