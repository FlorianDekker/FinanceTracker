// Pure vakantie-logica: landen uit de omschrijving, het clusteren van
// buitenlandse betalingen tot reisvoorstellen en de kostenberekening.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href

let pass = 0, fail = 0
async function t(name, fn) {
  try { await fn(); pass++; console.log('  ok  ', name) }
  catch (e) { fail++; console.log('  FOUT', name, '\n       ', e.message) }
}

const C = await import(`${SRC}/utils/trips/country.js`)
const S = await import(`${SRC}/utils/trips/suggest.js`)
const K = await import(`${SRC}/utils/trips/costs.js`)

console.log('\n--- land uit de omschrijving ---')
await t('leest Land: FRA uit de notitie', () => {
  assert.equal(C.countryOf({ note: 'SUMUP *BOULANGERIE PARIS Pasvolgnr: 01 12-07-2026 14:22 Land: FRA' }), 'FRA')
  assert.equal(C.countryOf({ note: 'ALBERT HEIJN 1234 Pasvolgnr: 01 Land: NLD' }), 'NLD')
  assert.equal(C.countryOf({ note: 'Geen land hier' }), null)
  assert.equal(C.countryOf({ note: 'land: fra' }), null, 'alleen hoofdletters')
  assert.equal(C.countryOf(null), null)
})
await t('NLD is thuis, de rest is buitenland', () => {
  assert.equal(C.isForeign('FRA'), true)
  assert.equal(C.isForeign('NLD'), false)
  assert.equal(C.isForeign(null), false)
  assert.equal(C.foreignCountryOf({ note: 'x Land: NLD' }), null)
  assert.equal(C.foreignCountryOf({ note: 'x Land: BEL' }), 'BEL')
})
await t('vlag en naam, met een vangnet voor onbekende codes', () => {
  assert.equal(C.flagOf('FRA'), '🇫🇷')
  assert.equal(C.flagOf('BEL'), '🇧🇪')
  assert.equal(C.countryName('FRA'), 'Frankrijk')
  assert.equal(C.countryLabel('ITA'), '🇮🇹 Italië')
  assert.equal(C.countryLabel('XXX'), '🌍 XXX')
  assert.equal(C.flagsOf(['FRA', 'BEL']), '🇫🇷🇧🇪')
  assert.equal(C.flagsOf([]), '🧳')
})

console.log('\n--- clusteren tot reisvoorstellen ---')
const tx = (id, date, land, amount = 10, extra = {}) => ({
  id, date, amount, type: 'debit', category: 'vakantie', tripId: null,
  note: land ? `WINKEL Land: ${land}` : 'ALBERT HEIJN', ...extra,
})

await t('een gat van meer dan 3 dagen splitst de reizen', () => {
  const clusters = S.clusterTrips([
    tx(1, '2026-07-11', 'FRA'), tx(2, '2026-07-12', 'FRA'), tx(3, '2026-07-14', 'FRA'),
    tx(4, '2026-09-01', 'ESP'), tx(5, '2026-09-03', 'ESP'),
  ])
  assert.equal(clusters.length, 2)
  assert.deepEqual([clusters[0].from, clusters[0].to], ['2026-09-01', '2026-09-03'], 'nieuwste eerst')
  assert.deepEqual(clusters[1].countries, ['FRA'])
  assert.equal(clusters[1].count, 3)
  assert.equal(clusters[1].days, 4)
})
await t('landwissel binnen een dag blijft één reis, daarna niet meer', () => {
  const samen = S.clusterTrips([tx(1, '2026-07-11', 'BEL'), tx(2, '2026-07-11', 'FRA'), tx(3, '2026-07-12', 'FRA')])
  assert.equal(samen.length, 1)
  assert.deepEqual(samen[0].countries, ['BEL', 'FRA'])

  const los = S.clusterTrips([tx(1, '2026-07-11', 'BEL'), tx(2, '2026-07-13', 'FRA')])
  assert.equal(los.length, 2, 'landwissel met twee dagen ertussen splitst')
})
await t('transacties zonder land of mét vakantie tellen niet mee', () => {
  const clusters = S.clusterTrips([
    tx(1, '2026-07-11', 'FRA'),
    tx(2, '2026-07-12', null),
    tx(3, '2026-07-12', 'FRA', 10, { tripId: 4 }),
  ])
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].count, 1)
})
await t('totaal is netto: bijschrijvingen gaan eraf', () => {
  const [c] = S.clusterTrips([
    tx(1, '2026-07-11', 'FRA', 100),
    tx(2, '2026-07-12', 'FRA', 40, { type: 'credit' }),
  ])
  assert.equal(c.total, 60)
})
await t('datum-hulpjes', () => {
  assert.equal(S.dayDiff('2026-07-11', '2026-07-14'), 3)
  assert.equal(S.shiftDate('2026-07-01', -1), '2026-06-30')
  assert.equal(S.tripDays('2026-07-11', '2026-07-14'), 4)
  assert.equal(S.tripDays(null, null), 1)
})

console.log('\n--- voorvinken binnen een periode ---')
await t('buitenland, categorie vakantie en niet-inkomen-bijschrijvingen', () => {
  const rijen = [
    tx(1, '2026-07-11', 'FRA', 20, { category: 'boodschappen' }),
    tx(2, '2026-07-12', null, 15, { category: 'vakantie' }),
    tx(3, '2026-07-12', null, 30, { category: 'bankoverschrijving', type: 'credit' }),
    tx(4, '2026-07-12', null, 2500, { category: 'salaris', type: 'credit' }),
    tx(5, '2026-07-13', null, 12, { category: 'boodschappen' }),
    tx(6, '2026-07-13', 'FRA', 12, { category: 'boodschappen', tripId: 9 }),
  ]
  const uit = S.suggestTripTransactions(rijen, {
    vakantieKeys: ['vakantie'],
    isIncomeKey: key => key === 'salaris',
  })
  assert.deepEqual(uit.suggested.map(t => t.id), [1, 2, 3])
  assert.deepEqual(uit.others.map(t => t.id), [4, 5])
  assert.deepEqual(uit.countries, ['FRA'])
})
await t('de eigen vakantie blijft altijd aangevinkt', () => {
  const rijen = [tx(1, '2026-07-13', null, 12, { category: 'boodschappen', tripId: 9 })]
  const uit = S.suggestTripTransactions(rijen, { tripId: 9 })
  assert.deepEqual(uit.suggested.map(t => t.id), [1])
})

console.log('\n--- kosten ---')
const bank = (id, date, amount, extra = {}) => ({ id, date, amount, type: 'debit', category: 'vakantie', ...extra })

await t('zonder Splitser is myCost gewoon bank netto', () => {
  const c = K.tripCosts({
    transactions: [bank(1, '2026-07-11', 100), bank(2, '2026-07-12', 50, { type: 'credit', category: 'bankoverschrijving' })],
    from: '2026-07-11', to: '2026-07-12',
  })
  assert.equal(c.hasSplitser, false)
  assert.equal(c.bankOut, 100)
  assert.equal(c.bankIn, 50)
  assert.equal(c.myCost, 50)
  assert.equal(c.reconcile, 0)
  assert.equal(c.days, 2)
  assert.equal(c.perDayCost, 25)
})
await t('een gematchte bankregel telt niet dubbel', () => {
  const items = [
    { id: 1, date: '2026-07-11', amount: 60, myShare: 30, category: 'boodschappen', matchedTxId: 1, payer: 'Florian' },
    { id: 2, date: '2026-07-12', amount: 40, myShare: 20, category: 'boodschappen', matchedTxId: null, payer: 'Dani' },
  ]
  const transactions = [bank(1, '2026-07-11', 60), bank(2, '2026-07-12', 25, { category: 'reiskosten' })]
  const c = K.tripCosts({ items, transactions, from: '2026-07-11', to: '2026-07-12' })
  assert.equal(c.splitserShare, 50)
  assert.equal(c.bankNotCovered, 25, 'alleen de treinkaartjes zijn niet gedekt')
  assert.equal(c.myCost, 75)
  assert.equal(c.bankNet, 85)
  assert.equal(c.reconcile, 10, 'zoveel schoot je voor')
  // De verdeling loopt op 'categorie|sub'; de gedekte bankregel staat met zijn
  // eigen categorie (Vakantie) in de kolom `bank`, niet in `mine`.
  assert.deepEqual(c.perCategory.map(r => [r.key, r.mine, r.bank]),
    [['boodschappen|', 50, 0], ['reiskosten|', 25, 25], ['vakantie|', 0, 60]])
  assert.deepEqual(c.perDay, [{ date: '2026-07-11', amount: 30 }, { date: '2026-07-12', amount: 45 }])
  assert.equal(c.perCategory.reduce((s, r) => s + r.amount, 0), c.myCost, 'de verdeling telt op tot myCost')
})
await t('een lopende declaratie telt nergens mee', () => {
  const c = K.tripCosts({
    transactions: [bank(1, '2026-07-11', 100), bank(2, '2026-07-11', 40, { claimStatus: 'open' })],
    from: '2026-07-11', to: '2026-07-11',
  })
  assert.equal(c.bankOut, 100)
  assert.equal(c.myCost, 100)
  assert.equal(c.openClaimCount, 1)
})
await t('matchen op bedrag en datum, dichtstbijzijnde wint', () => {
  const items = [
    { id: 10, date: '2026-07-12', amount: 58.5, payer: 'Florian' },
    { id: 11, date: '2026-07-12', amount: 12, payer: 'Dani' },
  ]
  const txs = [
    bank(1, '2026-07-15', 58.5),      // te ver weg
    bank(2, '2026-07-13', 58.5),      // 1 dag ernaast
    bank(3, '2026-07-12', 58.51),     // binnen een cent
    bank(4, '2026-07-12', 12),        // niet van mij betaald
  ]
  const m = K.suggestMatches(items, txs, 'Florian')
  assert.equal(m.get(10), 3, 'zelfde dag wint van een dag ernaast')
  assert.equal(m.has(11), false, 'regels van een ander zijn geen bankregel van mij')
})
await t('elke banktransactie wordt hoogstens één keer gebruikt', () => {
  const items = [
    { id: 1, date: '2026-07-12', amount: 20, payer: 'Florian' },
    { id: 2, date: '2026-07-12', amount: 20, payer: 'Florian' },
  ]
  const m = K.suggestMatches(items, [bank(7, '2026-07-12', 20)], 'Florian')
  assert.equal(m.size, 1)
})


await t('landen: Sri Lanka heeft een vlag en naam; eigen icoon wint van de vlag', async () => {
  const C = await import(`${SRC}/utils/trips/country.js`)
  assert.equal(C.countryName('LKA'), 'Sri Lanka')
  assert.equal(C.flagOf('LKA'), '🇱🇰')
  assert.equal(C.tripIcon({ countries: ['LKA'] }), '🇱🇰')
  assert.equal(C.tripIcon({ countries: ['LKA'], icon: '🏝️' }), '🏝️')
  assert.equal(C.tripIcon({ countries: [] }), '🧳')
})

await t('negeerlijst: op id en op partij (zonder het landdeel), incasso komt niet meer terug', async () => {
  const S = await import(`${SRC}/utils/trips/suggest.js`)
  const incasso = { id: 1, date: '2026-05-03', amount: 12, type: 'debit', note: 'FOO INSURANCE LTD Land: IRL' }
  const incasso2 = { id: 2, date: '2026-06-03', amount: 12, type: 'debit', note: 'FOO INSURANCE LTD  Land: IRL' }
  const cafe = { id: 3, date: '2026-07-12', amount: 8, type: 'debit', note: 'CAFE ROMA PARIS Land: FRA' }
  const ignore = S.ignoreEntriesFor({ transactions: [incasso] })
  assert.deepEqual(ignore.txIds, [1])
  assert.deepEqual(ignore.notes, ['foo insurance ltd'])
  const over = S.filterIgnored([incasso, incasso2, cafe], ignore)
  assert.deepEqual(over.map(t => t.id), [3], 'ook de latere incasso van dezelfde partij valt weg')
  assert.equal(S.filterIgnored([cafe], { txIds: [], notes: [] }).length, 1)
})

console.log(`\n${pass} geslaagd, ${fail} mislukt`)
process.exit(fail ? 1 : 0)
