// Vermogen: maandrekenwerk, de waterval van de spaardoelen, het
// vermogensverloop uit de momentopnames en de projectie — zonder database.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const M = await import(`${SRC}/utils/wealth/months.js`)
const G = await import(`${SRC}/utils/wealth/goals.js`)
const H = await import(`${SRC}/utils/wealth/history.js`)
const P = await import(`${SRC}/utils/wealth/projection.js`)
const A = await import(`${SRC}/utils/wealth/accounts.js`)
const R = await import(`${SRC}/utils/wealth/reservations.js`)

let pass = 0, fail = 0
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

/* ---------------------------------------------------------------- maanden */

t('maanden: optellen, tellen, labelen', () => {
  assert.equal(M.monthOf(new Date(2026, 8, 5)), '2026-09')
  assert.equal(M.monthOf('2026-09-30'), '2026-09')
  assert.equal(M.addMonths('2026-11', 3), '2027-02')
  assert.equal(M.addMonths('2026-02', -3), '2025-11')
  assert.equal(M.monthsBetween('2026-01', '2027-03'), 14)
  assert.equal(M.monthLabel('2026-09'), 'sep 26')
  assert.equal(M.monthLabelLong('2026-09'), 'september 2026')
  assert.equal(M.lastFullMonth(new Date(2026, 0, 3)), '2025-12')
})

/* ----------------------------------------------------------- spaardoelen */

const maand = (m, saved) => ({ month: m, saved })
const doel = (o) => ({ id: o.id, name: o.name ?? `doel ${o.id}`, target: o.target, order: o.order ?? o.id,
  rule: o.rule, startMonth: o.startMonth ?? '2026-01', manualDeposits: o.manualDeposits ?? [] })

t('één doel met surplus krijgt alles wat er overbleef', () => {
  const r = G.allocateGoals(
    [maand('2026-01', 500), maand('2026-02', 300), maand('2026-03', 200)],
    [doel({ id: 1, target: 5000, rule: { type: 'surplus' } })],
  )
  const g = r.goals[0]
  assert.equal(g.saved, 1000)
  assert.deepEqual(g.perMonth, { '2026-01': 500, '2026-02': 300, '2026-03': 200 })
  assert.equal(g.remaining, 4000)
  assert.equal(g.reached, false)
  assert.equal(g.pace, 333.33, 'tempo: gemiddeld over de maanden die er zijn (max. zes)')
})

t('fixed gaat voor en verkleint het surplus voor de rest', () => {
  const r = G.allocateGoals([maand('2026-01', 1000)], [
    doel({ id: 1, order: 2, target: 10000, rule: { type: 'surplus' } }),
    doel({ id: 2, order: 1, target: 10000, rule: { type: 'fixed', amount: 250 } }),
  ])
  const perId = Object.fromEntries(r.goals.map(g => [g.id, g]))
  assert.equal(perId[2].saved, 250, 'het vaste bedrag eerst')
  assert.equal(perId[1].saved, 750, 'de rest naar het surplus-doel')
  assert.deepEqual(r.months[0], { month: '2026-01', saved: 1000, allocated: 1000, left: 0 })
})

t('fixed kan nooit meer opzijleggen dan er die maand overbleef', () => {
  const r = G.allocateGoals([maand('2026-01', 180)], [
    doel({ id: 1, target: 5000, rule: { type: 'fixed', amount: 250 } }),
    doel({ id: 2, target: 5000, rule: { type: 'fixed', amount: 100 } }),
  ])
  assert.deepEqual(r.goals.map(g => g.saved), [180, 0])
})

t('surplus_above laat de vloer in de pot staan', () => {
  const r = G.allocateGoals([maand('2026-01', 900), maand('2026-02', 150)], [
    doel({ id: 1, target: 10000, rule: { type: 'surplus_above', floor: 200 } }),
  ])
  assert.deepEqual(r.goals[0].perMonth, { '2026-01': 700 }, 'februari bleef onder de vloer')
  assert.equal(r.goals[0].saved, 700)
  assert.equal(r.months[1].left, 150, 'wat onder de vloer blijft, blijft staan')
})

t('een maand met een negatief saldo levert niets op', () => {
  const r = G.allocateGoals([maand('2026-01', -400), maand('2026-02', 300)], [
    doel({ id: 1, target: 1000, rule: { type: 'surplus' } }),
  ])
  assert.deepEqual(r.goals[0].perMonth, { '2026-02': 300 })
  assert.equal(r.months[0].allocated, 0)
})

t('doel halverwege bereikt: de rest stroomt door naar het volgende', () => {
  const r = G.allocateGoals([maand('2026-01', 400), maand('2026-02', 400), maand('2026-03', 400)], [
    doel({ id: 1, order: 1, target: 600, rule: { type: 'surplus' } }),
    doel({ id: 2, order: 2, target: 5000, rule: { type: 'surplus' } }),
  ])
  const [a, b] = r.goals
  assert.deepEqual(a.perMonth, { '2026-01': 400, '2026-02': 200 })
  assert.equal(a.reached, true)
  assert.equal(a.reachedMonth, '2026-02')
  assert.equal(a.progress, 600)
  assert.equal(a.etaMonth, null, 'een bereikt doel heeft geen verwachte datum meer')
  assert.deepEqual(b.perMonth, { '2026-02': 200, '2026-03': 400 })
})

t('startMonth: eerdere maanden slaan we over', () => {
  const r = G.allocateGoals([maand('2026-01', 300), maand('2026-02', 300)], [
    doel({ id: 1, target: 1000, startMonth: '2026-02', rule: { type: 'surplus' } }),
  ])
  assert.deepEqual(r.goals[0].perMonth, { '2026-02': 300 })
  assert.equal(r.months[0].left, 300, 'januari bleef ongebruikt')
})

t('handmatige stortingen tellen los mee, ook voor en na de reeks', () => {
  const r = G.allocateGoals([maand('2026-02', 100)], [
    doel({ id: 1, target: 1000, rule: { type: 'surplus' }, manualDeposits: [
      { date: '2025-12-24', amount: 200, note: 'kerstgeld' },
      { date: '2026-02-10', amount: 50 },
      { date: '2026-03-01', amount: 25 },
    ] }),
  ])
  const g = r.goals[0]
  assert.equal(g.deposits, 275)
  assert.equal(g.allocated, 100)
  assert.equal(g.saved, 375)
  assert.equal(g.remaining, 625)
})

t('verwacht klaar: tempo van de laatste zes maanden, null als het stilstaat', () => {
  const maanden = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map(m => maand(m, 200))
  const r = G.allocateGoals(maanden, [doel({ id: 1, target: 2000, rule: { type: 'surplus' } })])
  const g = r.goals[0]
  assert.equal(g.saved, 1200)
  assert.equal(g.pace, 200)
  assert.equal(g.etaMonths, 4)
  assert.equal(g.etaMonth, '2026-10')

  const stil = G.allocateGoals([maand('2026-01', 0)], [doel({ id: 1, target: 500, rule: { type: 'surplus' } })])
  assert.equal(stil.goals[0].etaMonth, null)
})

t('rijen van cashflowPerMonth (year/month) worden ook begrepen', () => {
  const r = G.allocateGoals([{ year: 2026, month: 3, saved: 120 }], [
    doel({ id: 1, target: 500, rule: { type: 'surplus' } }),
  ])
  assert.deepEqual(r.goals[0].perMonth, { '2026-03': 120 })
})

/* ------------------------------------------------------------- verloop */

t('verloop: laatst bekende saldo per rekening, opgeteld per dag', () => {
  const punten = H.wealthHistory([
    { id: 1, accountKey: 'a', date: '2026-09-01', balance: 1000 },
    { id: 2, accountKey: 'b', date: '2026-09-03', balance: 500 },
    { id: 3, accountKey: 'a', date: '2026-09-05', balance: 900 },
  ])
  assert.deepEqual(punten.map(p => [p.date, p.total]), [
    ['2026-09-01', 1000],
    ['2026-09-03', 1500],
    ['2026-09-05', 1400],
  ])
})

t('verloop: twee metingen op dezelfde dag → de laatste wint; filter op rekening', () => {
  const snaps = [
    { id: 1, accountKey: 'a', date: '2026-09-01', balance: 100 },
    { id: 2, accountKey: 'a', date: '2026-09-01', balance: 120 },
    { id: 3, accountKey: 'weg', date: '2026-09-01', balance: 999 },
  ]
  assert.equal(H.wealthHistory(snaps, ['a'])[0].total, 120)
  assert.equal(H.wealthHistory(snaps)[0].total, 1119)
  assert.equal(H.latestSnapshots(snaps).a.balance, 120)
  assert.deepEqual(H.wealthHistory([]), [])
})

/* ------------------------------------------------------------ projectie */

const nu = new Date(2026, 8, 15)   // 15 september 2026

t('projectie: start vandaag, daarna elke maand erbij en reserveringen eraf', () => {
  const r = P.projectWealth({
    start: 10000, monthly: 500, months: 3, buffer: 1000, now: nu,
    reservations: [
      { name: 'Tandarts', amount: 300, dueMonth: '2026-11' },
      { name: 'Ooit een laptop', amount: 1500, dueMonth: null },
      { name: 'Al betaald', amount: 999, dueMonth: '2026-11', done: true },
    ],
  })
  assert.deepEqual(r.points.map(p => [p.month, p.balance]), [
    ['2026-09', 10000],
    ['2026-10', 10500],
    ['2026-11', 10700],
    ['2026-12', 11200],
  ])
  assert.equal(r.points[0].now, true)
  assert.deepEqual(r.points[2].due.map(d => d.name), ['Tandarts'])
  assert.equal(r.unplanned, 1500, 'ongepland zit niet in de lijn')
  assert.equal(r.firstBelow, null)
  assert.deepEqual(r.low, { month: '2026-09', balance: 10000 })
  assert.equal(r.end, 11200)
})

t('projectie: achterstallige en deze maand vervallende reserveringen in de eerste stap', () => {
  const r = P.projectWealth({
    start: 5000, monthly: 0, months: 2, now: nu,
    reservations: [
      { name: 'Vergeten', amount: 200, dueMonth: '2026-06' },
      { name: 'Deze maand', amount: 100, dueMonth: '2026-09' },
      { name: 'Volgende', amount: 50, dueMonth: '2026-11' },
    ],
  })
  assert.equal(r.points[1].balance, 4700)
  assert.deepEqual(r.points[1].due.map(d => d.name), ['Vergeten', 'Deze maand'])
  assert.equal(r.points[2].balance, 4650)
})

t('projectie: laagste punt en de eerste maand onder de buffer', () => {
  const r = P.projectWealth({
    start: 2000, monthly: 100, months: 4, buffer: 1000, now: nu,
    reservations: [{ name: 'Auto', amount: 1500, dueMonth: '2026-11' }],
  })
  assert.deepEqual(r.points.map(p => p.balance), [2000, 2100, 700, 800, 900])
  assert.deepEqual(r.low, { month: '2026-11', balance: 700 })
  assert.equal(r.firstBelow, '2026-11')
})

/* -------------------------------------------------- rekeningen/reserveringen */

t('rekeningen: totaal telt alleen de niet-gearchiveerde', () => {
  const accounts = [
    { key: 'a', balance: 1000, order: 1 },
    { key: 'b', balance: 250.555, order: 0 },
    { key: 'c', balance: 9999, archived: true, order: 2 },
    { key: 'd', balance: null, order: 3 },
  ]
  assert.equal(A.totalWealth(accounts), 1250.56)
  assert.deepEqual(A.sortAccounts(accounts).map(a => a.key), ['b', 'a', 'c', 'd'])
  assert.equal(A.kindOf('spaar').icon, '🏦')
  assert.equal(A.kindOf('bestaat-niet').key, 'overig')
  assert.equal(A.maskAccount('NL01ABNA0123456789'), '…6789')
  assert.equal(A.importAccountKey('NL01 ABNA 0123456789'), 'bank-nl01abna0123456789')
})

t('rekeningen: saldo uit de import = anker + handmatige regels erna', () => {
  const txs = [
    { id: 1, date: '2026-09-01', amount: 20, type: 'debit', balance: 1000, account: 'NL01' },
    { id: 2, date: '2026-09-10', amount: 40, type: 'debit', balance: 960, account: 'NL01' },
    { id: 3, date: '2026-08-20', amount: 10, type: 'debit', balance: 500, account: 'NL02' },
    { id: 4, date: '2026-09-12', amount: 25, type: 'debit' },          // handmatig, geen rekening
  ]
  const saldi = A.importAccountBalances(txs)
  assert.equal(saldi.NL01.balance, 935, 'handmatig telt bij de rekening met het nieuwste anker')
  assert.equal(saldi.NL01.manualCount, 1)
  assert.equal(saldi.NL02.balance, 500)
  assert.equal(saldi.NL02.anchorDate, '2026-08-20')
})

t('reserveringen: gepland, ongepland en vrij vermogen', () => {
  const lijst = [
    { name: 'Tandarts', amount: 300, dueMonth: '2026-11' },
    { name: 'Laptop', amount: 1200, dueMonth: null },
    { name: 'Gedaan', amount: 80, dueMonth: '2026-08', done: true },
  ]
  const totalen = R.reservationTotals(lijst)
  assert.deepEqual(totalen, { planned: 300, unplanned: 1200, open: 1500, done: 80, count: 2 })
  assert.equal(R.freeWealth(5000, 1000, lijst), 2500)
  assert.equal(R.freeWealth(1000, 1000, lijst), -1500, 'mag negatief zijn')
  assert.deepEqual(R.sortReservations(lijst).map(r => r.name), ['Tandarts', 'Laptop', 'Gedaan'])
})

console.log(`\n${pass} ok, ${fail} fout`)
process.exit(fail ? 1 : 0)
