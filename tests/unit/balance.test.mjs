// Saldocontrole: anker uit de bankimport, handmatige regels sindsdien,
// verwacht saldo en het verschil met wat de bank toont — zonder database.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const B = await import(`${SRC}/utils/balance.js`)

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const imp = (id, date, amount, type, balance, account = 'NL01ABNA0000000001') => ({ id, date, amount, type, balance, account })
const man = (id, date, amount, type) => ({ id, date, amount, type })

t('anker = laatste importregel met saldo, per rekening; zelfde dag → hoogste id', () => {
  const txs = [
    imp(1, '2026-09-01', 50, 'debit', 1000),
    imp(2, '2026-09-10', 20, 'debit', 980),
    imp(3, '2026-09-10', 100, 'credit', 1080),
    imp(4, '2026-09-12', 10, 'debit', 490, 'NL02INGB0000000002'),
    man(5, '2026-09-11', 30, 'debit'),
  ]
  const a = B.anchorsPerAccount(txs)
  assert.equal(a['NL01ABNA0000000001'].balance, 1080)
  assert.equal(a['NL01ABNA0000000001'].date, '2026-09-10')
  assert.equal(a['NL02INGB0000000002'].balance, 490)
  assert.equal(Object.keys(a).length, 2)
})

t('handmatig sindsdien: alleen regels zonder saldo, op of na de ankerdag, chronologisch', () => {
  const anchor = { account: 'x', date: '2026-09-10', balance: 1080, id: 3 }
  const txs = [
    man(9, '2026-09-09', 5, 'debit'),      // vóór het anker: telt niet
    man(7, '2026-09-15', 12.5, 'debit'),
    man(6, '2026-09-10', 200, 'credit'),   // op de ankerdag: telt wel (jij oordeelt)
    imp(8, '2026-09-10', 1, 'debit', 1079),
  ]
  const m = B.manualSince(txs, anchor)
  assert.deepEqual(m.map(x => x.id), [6, 7])
  assert.equal(B.expectedBalance(anchor, m), 1267.5)
})

t('vergelijking: verschil = bank − verwacht, met ok-vlag binnen een halve cent', () => {
  assert.deepEqual(B.compareBalance(1267.5, 1267.5), { expected: 1267.5, actual: 1267.5, diff: 0, ok: true })
  assert.equal(B.compareBalance(1267.5, 1250).diff, -17.5)
  assert.equal(B.compareBalance(1267.5, 1300.004).ok, false)
  assert.equal(B.compareBalance(null, 10), null)
  assert.equal(B.compareBalance(10, 'abc'), null)
})

t('invoer: komma, punt, duizendtallen en euroteken', () => {
  assert.equal(B.parseBalanceInput('1.234,56'), 1234.56)
  assert.equal(B.parseBalanceInput('1234.56'), 1234.56)
  assert.equal(B.parseBalanceInput('€ 1234,5'), 1234.5)
  assert.equal(B.parseBalanceInput('1,234.56'), 1234.56)
  assert.equal(B.parseBalanceInput(''), null)
  assert.equal(B.parseBalanceInput('x'), null)
})

t('controles: nieuwste vooraan, maximaal MAX_CHECKS', () => {
  let list = []
  for (let i = 0; i < B.MAX_CHECKS + 3; i++) list = B.appendCheck(list, { at: i })
  assert.equal(list.length, B.MAX_CHECKS)
  assert.equal(list[0].at, B.MAX_CHECKS + 2)
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
