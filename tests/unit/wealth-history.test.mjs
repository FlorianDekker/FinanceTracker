// Vermogensverloop met terugwerkende kracht: de bankreeks uit transacties
// (src/utils/wealth/bankHistory.js), het samenvoegen met momentopnames en de
// periodekeuze (src/utils/wealth/history.js) — zonder database.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const BH = await import(`${SRC}/utils/wealth/bankHistory.js`)
const H = await import(`${SRC}/utils/wealth/history.js`)

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

/* ------------------------------------------------------ bankAccountHistories */

t('bankreeks: laatste mutatie per dag, twee rekeningen, handmatig alleen bij het nieuwste anker', () => {
  const txs = [
    { id: 1, date: '2026-09-01', amount: 20, type: 'debit', balance: 1000, account: 'NL01' },
    { id: 2, date: '2026-09-01', amount: 50, type: 'debit', balance: 950, account: 'NL01' },  // zelfde dag: deze wint
    { id: 3, date: '2026-09-05', amount: 50, type: 'credit', balance: 900, account: 'NL01' }, // nieuwste anker
    { id: 4, date: '2026-08-20', amount: 10, type: 'debit', balance: 500, account: 'NL02' },  // ouder anker
    { id: 5, date: '2026-09-10', amount: 40, type: 'debit' },   // handmatig, na het NL01-anker
    { id: 6, date: '2026-09-10', amount: 10, type: 'credit' },  // handmatig, zelfde dag: stapelt door
    { id: 7, date: '2026-09-12', amount: 5, type: 'debit' },    // handmatig, volgende dag
  ]
  const reeksen = BH.bankAccountHistories(txs)

  assert.deepEqual(reeksen.NL01, [
    { date: '2026-09-01', balance: 950 },
    { date: '2026-09-05', balance: 900 },
    { date: '2026-09-10', balance: 870 },  // 900 - 40 + 10
    { date: '2026-09-12', balance: 865 },  // 870 - 5
  ])
  assert.deepEqual(reeksen.NL02, [{ date: '2026-08-20', balance: 500 }],
    'NL02 heeft het oudere anker: geen handmatige regels erbij')
})

t('bankreeks: geen doorzet-punten voor dagen zonder mutatie', () => {
  const txs = [
    { id: 1, date: '2026-01-01', amount: 100, type: 'debit', balance: 900, account: 'NL01' },
    { id: 2, date: '2026-06-01', amount: 100, type: 'credit', balance: 1000, account: 'NL01' },
  ]
  assert.equal(BH.bankAccountHistories(txs).NL01.length, 2, 'alleen de twee dagen met een mutatie')
})

t('bankreeks: geen transacties → lege verzameling', () => {
  assert.deepEqual(BH.bankAccountHistories([]), {})
  assert.deepEqual(BH.bankAccountHistories([{ id: 1, date: '2026-01-01', amount: 5, type: 'debit' }]), {},
    'handmatige regel zonder banksaldo levert geen rekening op')
})

/* ------------------------------------------------------ combinedWealthHistory */

t('verloop: bankrekening leidend uit transacties, handmatige rekening op momentopnames, completeFrom', () => {
  const accounts = [
    { key: 'bank-nl01', source: 'abn-import', account: 'NL01' },
    { key: 'spaar', source: 'manual' },
  ]
  const snapshots = [
    // Deze momentopname van de bankrekening moet genegeerd worden: de bankreeks is leidend.
    { id: 1, accountKey: 'bank-nl01', date: '2026-09-01', balance: 999999 },
    { id: 2, accountKey: 'spaar', date: '2026-09-06', balance: 5000 },
    { id: 3, accountKey: 'spaar', date: '2026-09-13', balance: 5200 },
  ]
  const txs = [
    { id: 1, date: '2026-09-01', amount: 20, type: 'debit', balance: 1000, account: 'NL01' },
    { id: 2, date: '2026-09-01', amount: 50, type: 'debit', balance: 950, account: 'NL01' },
    { id: 3, date: '2026-09-05', amount: 50, type: 'credit', balance: 900, account: 'NL01' },
    { id: 4, date: '2026-09-10', amount: 40, type: 'debit' },
    { id: 5, date: '2026-09-10', amount: 10, type: 'credit' },
    { id: 6, date: '2026-09-12', amount: 5, type: 'debit' },
  ]

  const r = H.combinedWealthHistory(accounts, snapshots, txs)
  assert.deepEqual(r.points.map(p => [p.date, p.total]), [
    ['2026-09-01', 950],   // spaar telt nog niet mee: vóór zijn eerste momentopname
    ['2026-09-05', 900],
    ['2026-09-06', 5900],  // spaar komt erbij: 900 + 5000
    ['2026-09-10', 5870],  // 870 + 5000
    ['2026-09-12', 5865],  // 865 + 5000
    ['2026-09-13', 6065],  // 865 + 5200
  ])
  assert.equal(r.completeFrom, '2026-09-06', 'eerste dag dat alle rekeningen meetellen')
  assert.equal(r.accountCount, 2)
})

t('verloop: een rekening zonder enige meting telt nooit mee (weggelaten, niet als 0)', () => {
  const accounts = [
    { key: 'spaar', source: 'manual' },
    { key: 'nieuw', source: 'manual' },
  ]
  const snapshots = [{ id: 1, accountKey: 'spaar', date: '2026-01-01', balance: 100 }]
  const r = H.combinedWealthHistory(accounts, snapshots, [])
  assert.deepEqual(r.points.map(p => [p.date, p.total]), [['2026-01-01', 100]])
  assert.equal(r.completeFrom, null, 'nieuw heeft nog helemaal geen meting')
})

t('verloop: geen rekeningen → lege reeks', () => {
  assert.deepEqual(H.combinedWealthHistory([], [], []), { points: [], completeFrom: null, accountCount: 0 })
})

/* ------------------------------------------------------------ periodekeuze */

const REEKS = [
  { date: '2024-01-01', total: 1000 },
  { date: '2024-06-01', total: 1200 },
  { date: '2025-01-01', total: 1500 },
  { date: '2025-06-01', total: 1700 },
  { date: '2025-09-01', total: 1800 },
  { date: '2025-09-29', total: 1850 },
  { date: '2026-06-01', total: 2100 },
  { date: '2026-09-29', total: 2400 },
]

t('periodekeuze: 3 maanden schuift het laatst bekende punt naar de grens', () => {
  const r = H.filterHistoryPeriod(REEKS, '3m')
  assert.deepEqual(r, [
    { date: '2026-06-29', total: 2100 },
    { date: '2026-09-29', total: 2400 },
  ])
})

t('periodekeuze: 1 jaar, met een punt precies op de grens', () => {
  const r = H.filterHistoryPeriod(REEKS, '1j')
  assert.deepEqual(r.map(p => p.date), ['2025-09-29', '2026-06-01', '2026-09-29'])
})

t('periodekeuze: alles laat de hele reeks staan', () => {
  const r = H.filterHistoryPeriod(REEKS, 'alles')
  assert.equal(r.length, REEKS.length)
  assert.equal(r[0].date, '2024-01-01')
})

t('periodekeuze: lege reeks blijft leeg', () => {
  assert.deepEqual(H.filterHistoryPeriod([], '1j'), [])
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
