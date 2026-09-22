// Kortingen aan de juiste productregel koppelen (`matchDiscounts`) en de
// nettoprijs per product uitrekenen (`netItems`). Geen database, geen browser.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const { matchDiscounts, netItems } = await import(`${SRC}/utils/receipts/discounts.js`)

let n = 0
const ok = msg => { n++; console.log('  ok ' + msg) }

const item = (o = {}) => ({ name: 'Product', nameKey: 'product', qty: 1, unitPrice: null, price: 1, group: 'overig', isDiscount: false, ...o })

/* ---------------- matchDiscounts: heuristiek ---------------- */
{
  const items = [
    item({ name: 'FUSILLI SALSICCIA', nameKey: 'fusilli salsiccia', price: 2.4 }),
    item({ name: 'TERRA CREME', nameKey: 'terra creme', price: 0.89 }),
  ]
  const discounts = [{ name: 'BONUS FUSILLI', amount: 1.2 }]
  const uit = matchDiscounts(items, discounts)
  assert.equal(uit[0].itemIndex, 0, '"BONUS FUSILLI" hoort bij "FUSILLI SALSICCIA"')
  ok('BONUS FUSILLI → FUSILLI SALSICCIA')
}

{
  const items = [
    item({ name: 'DOUWE EGBERTS AROMA', nameKey: 'douwe egberts aroma', price: 3.5 }),
    item({ name: 'MELK HALFVOL', nameKey: 'melk halfvol', price: 1.29 }),
  ]
  const discounts = [{ name: '35% K DOUWE EGB', amount: 1.05 }]
  const uit = matchDiscounts(items, discounts)
  assert.equal(uit[0].itemIndex, 0, 'afgekorte productnaam matcht via prefix + exacte token')
  ok('35% K DOUWE EGB → DOUWE EGBERTS AROMA')
}

{
  const items = [item({ name: 'BROOD WIT', nameKey: 'brood wit', price: 1.5 })]
  const discounts = [{ name: 'BONUS', amount: 0.5 }]
  const uit = matchDiscounts(items, discounts)
  assert.equal(uit[0].itemIndex, null, 'een generieke "BONUS" zonder productnaam matcht niets')
  ok('generieke BONUS zonder tokens → null')
}

{
  const items = [
    item({ name: 'APPELS ELSTAR', nameKey: 'appels elstar', price: 2 }),
    item({ name: 'PEREN CONFERENCE', nameKey: 'peren conference', price: 2 }),
  ]
  const discounts = [{ name: '2E HALVE PRIJS APPELS', amount: 1 }]
  const uit = matchDiscounts(items, discounts)
  assert.equal(uit[0].itemIndex, 0, '"2e halve prijs" is ruis, "appels" is het aanknopingspunt')
  ok('2E HALVE PRIJS APPELS → APPELS ELSTAR (ruiswoorden genegeerd)')
}

/* ---------------- matchDiscounts: geleerde koppeling ---------------- */
{
  const items = [
    item({ name: 'FUSILLI SALSICCIA', nameKey: 'fusilli salsiccia', price: 2.4 }),
    item({ name: 'PENNE ARRABIATA', nameKey: 'penne arrabiata', price: 2.1 }),
  ]
  // Heuristiek zou zonder geleerde koppeling niets vinden (geen gedeeld token),
  // maar een eerdere handmatige koppeling moet toch winnen.
  const discounts = [{ name: 'ACTIE PASTA', amount: 0.5 }]
  const uit = matchDiscounts(items, discounts, { learned: { 'actie pasta': 'penne arrabiata' } })
  assert.equal(uit[0].itemIndex, 1, 'geleerde koppeling wint van de heuristiek')
  ok('geleerde koppeling wint')

  const nietOpDezeBon = matchDiscounts([items[0]], discounts, { learned: { 'actie pasta': 'penne arrabiata' } })
  assert.equal(nietOpDezeBon[0].itemIndex, null, 'geleerd product staat niet op deze bon en er is ook geen tokenmatch')
  ok('geleerde koppeling die niet op de bon staat valt terug op de heuristiek (en die vindt hier niets)')

  const explicietLos = matchDiscounts(items, [{ name: 'BONUS FUSILLI', amount: 1 }], { learned: { 'bonus fusilli': null } })
  assert.equal(explicietLos[0].itemIndex, null, 'expliciet geleerd als los blijft los, ook al zou de heuristiek iets vinden')
  ok('expliciet geleerd "los" (null) overschrijft de heuristiek')
}

/* ---------------- matchDiscounts: gelijkspel en meerdere kortingen ---------------- */
{
  const items = [
    item({ name: 'COLA 1.5L', nameKey: 'cola 1 5l', price: 2 }),
    item({ name: 'COLA ZERO 1.5L', nameKey: 'cola zero 1 5l', price: 2 }),
  ]
  const discounts = [
    { name: 'BONUS COLA', amount: 0.5 },
    { name: 'BONUS COLA', amount: 0.5 },
  ]
  const uit = matchDiscounts(items, discounts)
  const targets = uit.map(d => d.itemIndex).sort()
  assert.deepEqual(targets, [0, 1], 'twee gelijke kortingen verdelen zich over de twee producten in plaats van te stapelen')
  ok('bij gelijkspel wint het product dat nog geen korting heeft')
}

/* ---------------- netItems ---------------- */
{
  const items = [
    item({ name: 'FUSILLI SALSICCIA', price: 2.4, qty: 1 }),
    item({ name: 'MELK HALFVOL', price: 1.29, qty: 1 }),
    item({ name: 'BONUS', price: -1.2, isDiscount: true, group: 'statiegeld_korting' }),
  ]
  const discounts = [{ name: 'BONUS FUSILLI', amount: 1.2, itemIndex: 0 }]
  const uit = netItems(items, discounts)
  assert.equal(uit[0].discount, 1.2)
  assert.equal(uit[0].netPrice, 1.2)
  assert.equal(uit[0].netUnitPrice, 1.2)
  assert.equal(uit[1].discount, 0)
  assert.equal(uit[1].netPrice, 1.29, 'een product zonder gekoppelde korting behoudt zijn brutoprijs als netPrice')
  assert.equal(uit[2].discount, 0, 'de kortingsregel zelf krijgt geen discount/netPrice-behandeling')
  assert.equal(uit[2].netPrice, -1.2)
  ok('netItems trekt de gekoppelde korting van de productprijs af')
}

{
  const items = [item({ name: 'KOFFIE', price: 3, qty: 2 })]
  const discounts = [{ name: 'BONUS KOFFIE', amount: 5, itemIndex: 0 }]     // groter dan de prijs
  const uit = netItems(items, discounts)
  assert.equal(uit[0].discount, 3, 'de korting wordt nooit groter dan de productprijs')
  assert.equal(uit[0].netPrice, 0)
  assert.equal(uit[0].netUnitPrice, 0)
  ok('een korting groter dan de prijs drukt de nettoprijs niet onder 0')
}

{
  const items = [item({ name: 'BROOD', price: 2, qty: 1 })]
  const uit = netItems(items, null)
  assert.equal(uit[0].discount, 0)
  assert.equal(uit[0].netPrice, 2)
  ok('netItems overleeft een ontbrekende discounts-array')

  const legeItems = netItems(null, [{ name: 'x', amount: 1, itemIndex: 0 }])
  assert.deepEqual(legeItems, [])
  ok('netItems overleeft ontbrekende items')
}

console.log(`\n${n} checks`)
