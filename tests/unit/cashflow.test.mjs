// Inkomen/uitgaven per maand: precies de regels die `useCashflowData` altijd
// al hanteerde, nu als pure functie — zonder database.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const C = await import(`${SRC}/utils/cashflow.js`)

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const catMap = {
  salaris: { type: 'income' },
  boodschappen: { type: 'expense' },
  overboeking: { type: 'transfer' },
  voorschot: { type: 'expense' },
}
const M = [{ year: 2026, month: 9 }]
const tx = (o) => ({ date: '2026-09-05', type: 'debit', amount: 100, category: 'boodschappen', ...o })

t('maandsleutel en venster', () => {
  assert.equal(C.monthKey(2026, 3), '2026-03')
  const now = new Date(2026, 8, 15)   // september 2026
  assert.deepEqual(C.cashflowMonths({ window: 3, now }), [
    { year: 2026, month: 7 }, { year: 2026, month: 8 }, { year: 2026, month: 9 },
  ])
  const jaar = C.cashflowMonths({ now })
  assert.equal(jaar.length, 9, 'zonder venster: jan t/m de huidige maand')
  assert.deepEqual(jaar[0], { year: 2026, month: 1 })
  assert.deepEqual(C.cashflowMonths({ window: 2, now: new Date(2026, 0, 10) }),
    [{ year: 2025, month: 12 }, { year: 2026, month: 1 }], 'venster loopt over de jaargrens')
})

t('inkomen, uitgaven en gespaard', () => {
  const [r] = C.cashflowPerMonth([
    tx({ type: 'credit', amount: 3000, category: 'salaris' }),
    tx({ amount: 400 }),
    tx({ amount: 100 }),
  ], catMap, 'overboeking', M)
  assert.equal(r.income, 3000)
  assert.equal(r.expenses, 500)
  assert.equal(r.saved, 2500)
  assert.equal(r.rate, 2500 / 3000)
})

t('bijschrijving in een uitgavencategorie = negatieve uitgave, geen inkomen', () => {
  const [r] = C.cashflowPerMonth([
    tx({ type: 'credit', amount: 2000, category: 'salaris' }),
    tx({ amount: 300 }),
    tx({ type: 'credit', amount: 50, category: 'boodschappen' }),   // retour
  ], catMap, 'overboeking', M)
  assert.equal(r.income, 2000, 'de retour is geen inkomen')
  assert.equal(r.expenses, 250, 'de retour verlaagt de uitgaven')
})

t('overboeking en voorschot tellen niet mee', () => {
  const [r] = C.cashflowPerMonth([
    tx({ amount: 900, category: 'overboeking' }),
    tx({ type: 'credit', amount: 900, category: 'overboeking' }),
    tx({ amount: 60, category: 'voorschot' }),
    tx({ amount: 40 }),
  ], catMap, 'overboeking', M)
  assert.equal(r.income, 0)
  assert.equal(r.expenses, 40)
})

t('bijschrijving in een categorie zonder type telt nergens mee', () => {
  const [r] = C.cashflowPerMonth([tx({ type: 'credit', amount: 75, category: 'onbekend' })], catMap, 'overboeking', M)
  assert.equal(r.income, 0)
  assert.equal(r.expenses, 0)
})

t('vergoede declaraties en uitbetalingen vallen weg, afgekeurde tellen mee', () => {
  const [r] = C.cashflowPerMonth([
    tx({ amount: 50, claimStatus: 'open' }),
    tx({ amount: 50, claimStatus: 'submitted' }),
    tx({ type: 'credit', amount: 100, claimStatus: 'payout', category: 'salaris' }),
    tx({ amount: 20, claimStatus: 'paid' }),
    tx({ amount: 30, claimStatus: 'rejected' }),
  ], catMap, 'overboeking', M)
  assert.equal(r.income, 0, 'een uitbetaling van werk is geen inkomen')
  assert.equal(r.expenses, 30, 'alleen de afgekeurde uitgave is echt van jou')
})

t('uitgaven nooit onder 0; saved wel afgekapt, rate niet', () => {
  const [r] = C.cashflowPerMonth([
    tx({ type: 'credit', amount: 1000, category: 'salaris' }),
    tx({ type: 'credit', amount: 300, category: 'boodschappen' }),   // meer retour dan uitgaven
  ], catMap, 'overboeking', M)
  assert.equal(r.expenses, 0, 'negatieve uitgaven worden 0')

  const [k] = C.cashflowPerMonth([
    tx({ type: 'credit', amount: 1000, category: 'salaris' }),
    tx({ amount: 1200 }),
  ], catMap, 'overboeking', M)
  assert.equal(k.saved, 0, 'saved is afgekapt op 0 voor de gestapelde balken')
  assert.equal(k.savingsRate, 0)
  assert.equal(Math.round(k.rate * 100), -20, 'rate is het eerlijke percentage en mag negatief zijn')
})

t('zonder inkomen: rate null, savingsRate 0', () => {
  const [r] = C.cashflowPerMonth([tx({ amount: 80 })], catMap, 'overboeking', M)
  assert.equal(r.rate, null)
  assert.equal(r.savingsRate, 0)
  assert.equal(r.saved, 0)
})

t('elke gevraagde maand krijgt een rij, ook zonder transacties; rest wordt genegeerd', () => {
  const rows = C.cashflowPerMonth([
    tx({ date: '2026-08-31', amount: 10 }),
    tx({ date: '2026-09-01', amount: 20 }),
    tx({ date: '2026-10-01', amount: 999 }),
  ], catMap, 'overboeking', [{ year: 2026, month: 8 }, { year: 2026, month: 9 }])
  assert.deepEqual(rows.map(r => r.expenses), [10, 20])
  assert.equal(rows.length, 2, 'oktober valt buiten het venster')
})

t('zonder transfer-categorie gaat het gewoon door', () => {
  const [r] = C.cashflowPerMonth([tx({ amount: 25 })], catMap, null, M)
  assert.equal(r.expenses, 25)
  assert.deepEqual(C.cashflowPerMonth(null, catMap, null, M)[0].income, 0)
})


t('type Overboeking (bijv. Investeren) telt niet als uitgave en drukt het spaarpercentage niet', () => {
  const catMap = { salaris: { type: 'income' }, boodschappen: { type: 'expense' }, investeren: { type: 'transfer' } }
  const txs = [
    { date: '2026-03-01', amount: 3000, type: 'credit', category: 'salaris' },
    { date: '2026-03-05', amount: 400, type: 'debit', category: 'boodschappen' },
    { date: '2026-03-06', amount: 500, type: 'debit', category: 'investeren' },
    { date: '2026-03-20', amount: 50, type: 'credit', category: 'investeren' },
  ]
  const [m] = C.cashflowPerMonth(txs, catMap, null, [{ year: 2026, month: 3 }])
  assert.equal(m.expenses, 400)
  assert.equal(m.income, 3000)
  assert.equal(m.saved, 2600)
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
