// Rekenkern van de Budget-drift-grafiek: welke maanden meedoen, de mediane
// maanduitgave, de afronding van het voorstel en welke transacties meetellen.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const { berekenDrift, budgetVoorstel, volledigeMaanden } = await import(`${SRC}/utils/budgetDrift.js`)

let n = 0
const ok = msg => { n++; console.log('  ok ' + msg) }

/* ---------------- venster ---------------- */
{
  assert.deepEqual(volledigeMaanden(6, '2026-09'),
    ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
  assert.deepEqual(volledigeMaanden(6, '2026-02'),
    ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'])
  ok('zes volledige maanden, de lopende maand telt niet mee')
}

/* ---------------- afronding van het voorstel ---------------- */
{
  assert.equal(budgetVoorstel(102), 100)
  assert.equal(budgetVoorstel(103), 105)
  assert.equal(budgetVoorstel(102.5), 105, 'halverwege rondt omhoog')
  assert.equal(budgetVoorstel(2), 0)
  assert.equal(budgetVoorstel(0), 0)
  assert.equal(budgetVoorstel(-10), 0, 'nooit een negatief budget')
  ok('voorstel is de mediaan afgerond op vijf euro')
}

/* ---------------- mediaan per categorie ---------------- */
const maanden = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']
const cats = [
  { key: 'boodschappen', label: 'Boodschappen', icon: '🛒', type: 'expense', budget: 300, archived: false },
  { key: 'kleding', label: 'Kleding', icon: '👕', type: 'expense', budget: 50, archived: false },
]
const tx = (date, amount, extra = {}) => ({ date, amount, type: 'debit', category: 'boodschappen', ...extra })

{
  // 6 maanden: 100, 120, 340, 360, 380, 400 -> mediaan (340+360)/2 = 350
  const bedragen = [100, 120, 340, 360, 380, 400]
  const txs = maanden.map((m, i) => tx(`${m}-10`, bedragen[i]))
  const [rij] = berekenDrift(txs, [cats[0]], { maanden })
  assert.equal(rij.mediaanBedrag, 350)
  assert.equal(rij.afwijking, 50, 'structureel 50 euro over budget')
  assert.equal(rij.voorstel, 350)
  assert.deepEqual(rij.bedragen, bedragen)
  ok('mediaan over zes maanden, afwijking t.o.v. het budget')
}

{
  // Meerdere transacties in dezelfde maand tellen bij elkaar op; maanden
  // zonder uitgave tellen als nul mee.
  const txs = [tx('2026-01-05', 30), tx('2026-01-20', 30), tx('2026-02-05', 60)]
  const [rij] = berekenDrift(txs, [cats[0]], { maanden })
  assert.deepEqual(rij.bedragen, [60, 60, 0, 0, 0, 0])
  assert.equal(rij.mediaanBedrag, 0, 'vier lege maanden drukken de mediaan naar nul')
  assert.equal(rij.voorstel, 0)
  ok('maanden zonder uitgave tellen als nul mee')
}

/* ---------------- sortering en selectie ---------------- */
{
  const txs = [
    ...maanden.map(m => tx(`${m}-10`, 310)),
    ...maanden.map(m => tx(`${m}-11`, 200, { category: 'kleding' })),
  ]
  const rijen = berekenDrift(txs, cats, { maanden })
  assert.deepEqual(rijen.map(r => r.key), ['kleding', 'boodschappen'], 'grootste afwijking eerst')
  assert.equal(rijen[0].afwijking, 150)
  assert.equal(rijen[1].afwijking, 10)
  ok('gesorteerd op grootste afwijking, ook als die kleiner is in euro-uitgave')
}

{
  const alles = [
    ...cats,
    { key: 'oud', label: 'Oud', icon: '📦', type: 'expense', budget: 100, archived: true },
    { key: 'zonderbudget', label: 'Zonder budget', icon: '❓', type: 'expense', budget: 0, archived: false },
    { key: 'salaris', label: 'Salaris', icon: '💰', type: 'income', budget: 100, archived: false },
  ]
  const rijen = berekenDrift([], alles, { maanden })
  assert.deepEqual(rijen.map(r => r.key).sort(), ['boodschappen', 'kleding'])
  ok('gearchiveerde categorieen, inkomsten en categorieen zonder budget doen niet mee')
}

/* ---------------- uitsluitingen ---------------- */
{
  const txs = [
    ...maanden.map(m => tx(`${m}-10`, 300)),
    // declaratie: voorgeschoten werkkosten tellen niet mee
    ...maanden.map(m => tx(`${m}-11`, 100, { claimStatus: 'open' })),
    // afgekeurde declaratie is een gewone uitgave geworden
    tx('2026-01-12', 25, { claimStatus: 'rejected' }),
    // overboeking en bijschrijving
    ...maanden.map(m => tx(`${m}-13`, 500, { category: 'bankoverschrijving' })),
    tx('2026-01-14', 80, { type: 'credit' }),
    // buiten het venster
    tx('2025-12-10', 9999),
  ]
  const [rij] = berekenDrift(txs, [cats[0]], { maanden, transferKey: 'bankoverschrijving' })
  assert.deepEqual(rij.bedragen, [325, 300, 300, 300, 300, 300])
  assert.equal(rij.mediaanBedrag, 300)
  ok('declaraties, overboekingen, bijschrijvingen en oudere maanden tellen niet mee')
}

console.log(`\n${n} checks`)
