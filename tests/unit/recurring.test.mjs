// Pure kern van useRecurring: welke posten zijn terugkerend, wanneer is een
// prijs gestegen, wanneer is er iets gemist en wat blijft er buiten beschouwing.
import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const { detecteerVasteLasten, groepSleutel, mediaan } = await import(`${SRC}/utils/recurring.js`)

let n = 0
const ok = msg => { n++; console.log('  ok ' + msg) }

const tx = (date, amount, extra = {}) => ({
  date, amount, type: 'debit', category: 'abonnementen', subcategory: 'spotify', note: '', ...extra,
})
const vind = (posten, deel) => posten.find(p => p.id.includes(deel))

/* ---------------- mediaan ---------------- */
assert.equal(mediaan([5]), 5)
assert.equal(mediaan([1, 2, 3]), 2)
assert.equal(mediaan([1, 2, 3, 10]), 2.5)
assert.equal(mediaan([]), 0)
ok('mediaan: oneven het middelste, even het gemiddelde van de twee middelste')

/* ---------------- detectie ---------------- */
{
  const txs = [
    tx('2026-01-15', 10.99), tx('2026-02-15', 10.99), tx('2026-03-15', 10.99),
    // eenmalig: maar een maand
    tx('2026-02-03', 42, { subcategory: '' }),
  ]
  const posten = detecteerVasteLasten(txs, { maand: '2026-03', today: '2026-03-20' })
  assert.equal(posten.length, 1, 'alleen de post met >= 2 verschillende maanden')
  assert.equal(posten[0].amount, 10.99)
  assert.equal(posten[0].monthCount, 3)
  assert.equal(posten[0].perJaar, 10.99 * 12)
  assert.equal(posten[0].paid, true, 'in maart is er betaald')
  assert.equal(posten[0].verwachteDag, 15)
  ok('terugkerend vanaf twee verschillende maanden, eenmalige uitgaven vallen af')
}

{
  // Twee betalingen in dezelfde maand is geen abonnement
  const posten = detecteerVasteLasten([tx('2026-01-05', 9), tx('2026-01-25', 9)], { maand: '2026-01' })
  assert.equal(posten.length, 0)
  ok('twee betalingen binnen een maand tellen niet als terugkerend')
}

/* ---------------- groepering op omschrijving ---------------- */
{
  const txs = [
    tx('2026-01-15', 10.99, { note: 'Spotify AB' }),
    tx('2026-02-15', 10.99, { note: 'Spotify AB' }),
    tx('2026-03-15', 11.99, { note: 'Spotify AB' }),
  ]
  const posten = detecteerVasteLasten(txs, { maand: '2026-03', today: '2026-03-20' })
  assert.equal(posten.length, 1, 'een prijswijziging splitst de post niet')
  assert.equal(posten[0].verhoogd, true)
  assert.ok(Math.abs(posten[0].verschil - 1) < 1e-9, 'verschil is 1,00')
  assert.equal(posten[0].lastAmount, 11.99)
  assert.equal(posten[0].vorigBedrag, 10.99)
  assert.equal(posten[0].amount, 10.99, 'maandbedrag blijft de mediaan')
  ok('omschrijving houdt Spotify een regel en markeert de prijsstijging')
}

{
  // Zonder omschrijving groepeert het afgeronde bedrag: huur en energie
  // blijven los, maar 21,99 en 22,20 horen bij elkaar.
  assert.equal(groepSleutel(tx('2026-01-01', 21.99)), 'abonnementen|spotify|#22')
  assert.equal(groepSleutel(tx('2026-01-01', 22.20)), 'abonnementen|spotify|#22')
  assert.notEqual(groepSleutel(tx('2026-01-01', 8)), groepSleutel(tx('2026-01-01', 816)))
  ok('zonder omschrijving groepeert het op het afgeronde bedrag')
}

{
  const txs = [
    tx('2026-01-15', 10, { note: 'Spotify' }),
    tx('2026-02-15', 10, { note: 'Spotify' }),
    tx('2026-01-10', 10, { note: 'Netflix' }),
    tx('2026-02-10', 10, { note: 'Netflix' }),
  ]
  const posten = detecteerVasteLasten(txs, { maand: '2026-02' })
  assert.equal(posten.length, 2, 'zelfde bedrag, andere omschrijving = twee posten')
  ok('verschillende merchants met hetzelfde bedrag blijven gescheiden')
}

{
  const txs = [
    tx('2026-01-15', 11.99, { note: 'Spotify' }),
    tx('2026-02-15', 10.99, { note: 'Spotify' }),
  ]
  const posten = detecteerVasteLasten(txs, { maand: '2026-02' })
  assert.equal(posten[0].verhoogd, false, 'goedkoper is geen stijging')
  assert.equal(posten[0].verschil, 0)
  ok('een prijsverlaging levert geen badge op')
}

/* ---------------- gemist ---------------- */
{
  const txs = [tx('2026-01-10', 10, { note: 'Spotify' }), tx('2026-02-10', 10, { note: 'Spotify' })]

  const voor = detecteerVasteLasten(txs, { maand: '2026-03', today: '2026-03-12' })
  assert.equal(voor[0].gemist, false, 'binnen de speling van vijf dagen nog niet gemist')

  const na = detecteerVasteLasten(txs, { maand: '2026-03', today: '2026-03-20' })
  assert.equal(na[0].paid, false)
  assert.equal(na[0].gemist, true, 'dag + 5 voorbij zonder afschrijving')

  const betaald = detecteerVasteLasten([...txs, tx('2026-03-10', 10, { note: 'Spotify' })],
    { maand: '2026-03', today: '2026-03-20' })
  assert.equal(betaald[0].gemist, false, 'wel betaald = niet gemist')

  const opgezegd = detecteerVasteLasten(txs, { maand: '2026-09', today: '2026-09-20' })
  assert.equal(opgezegd[0].gemist, false, 'maanden stil = opgezegd, geen eeuwige waarschuwing')
  ok('gemist: pas na de gebruikelijke dag + 5 dagen, en niet voor opgezegde posten')
}

/* ---------------- uitsluitingen ---------------- */
{
  const txs = [
    tx('2026-01-15', 10, { note: 'Spotify' }),
    tx('2026-02-15', 10, { note: 'Spotify' }),
    // declaraties: voorgeschoten werkkosten tellen niet als vaste last
    tx('2026-01-20', 30, { note: 'NS', claimStatus: 'open' }),
    tx('2026-02-20', 30, { note: 'NS', claimStatus: 'submitted' }),
    // overboeking naar de spaarrekening
    tx('2026-01-01', 200, { category: 'bankoverschrijving', subcategory: '', note: 'Sparen' }),
    tx('2026-02-01', 200, { category: 'bankoverschrijving', subcategory: '', note: 'Sparen' }),
    // bijschrijving
    tx('2026-01-25', 50, { type: 'credit', note: 'Terug' }),
    tx('2026-02-25', 50, { type: 'credit', note: 'Terug' }),
  ]
  const posten = detecteerVasteLasten(txs, { maand: '2026-02', transferKey: 'bankoverschrijving' })
  assert.equal(posten.length, 1)
  assert.equal(posten[0].label, 'Spotify')
  assert.equal(vind(posten, 'bankoverschrijving'), undefined, 'overboekingen tellen niet mee')
  ok('declaraties, overboekingen en bijschrijvingen vallen buiten de vaste lasten')
}

{
  const txs = [
    tx('2026-01-15', 10, { note: 'Spotify' }),
    tx('2026-02-15', 10, { note: 'Spotify' }),
    tx('2026-01-16', 40, { category: 'boodschappen', subcategory: 'supermarkt', note: 'AH' }),
    tx('2026-02-16', 40, { category: 'boodschappen', subcategory: 'supermarkt', note: 'AH' }),
  ]
  const alles = detecteerVasteLasten(txs, { maand: '2026-02' })
  assert.equal(alles.length, 2, 'zonder filter doen alle categorieen mee')
  const beperkt = detecteerVasteLasten(txs, { maand: '2026-02', categoryKeys: new Set(['abonnementen']) })
  assert.equal(beperkt.length, 1)
  assert.equal(beperkt[0].category, 'abonnementen')
  ok('categoryKeys beperkt de detectie tot de vaste-lastcategorieen')
}

/* ---------------- sortering en labels ---------------- */
{
  const txs = [
    tx('2026-01-15', 10, { note: 'Spotify' }), tx('2026-02-15', 10, { note: 'Spotify' }),
    tx('2026-01-01', 800, { category: 'woning', subcategory: 'huur' }),
    tx('2026-02-01', 800, { category: 'woning', subcategory: 'huur' }),
  ]
  const catMap = { woning: { label: 'Woning', icon: '🏠', subs: [{ key: 'huur', label: 'Huur' }] } }
  const posten = detecteerVasteLasten(txs, { maand: '2026-02', catMap })
  assert.deepEqual(posten.map(p => p.amount), [800, 10], 'hoogste maandbedrag eerst')
  assert.equal(posten[0].label, 'Huur')
  assert.equal(posten[0].icon, '🏠')
  assert.equal(posten[1].icon, '📄', 'onbekende categorie krijgt een neutraal icoon')
  ok('sortering op maandbedrag en labels uit de categorielijst')
}

console.log(`\n${n} checks`)
