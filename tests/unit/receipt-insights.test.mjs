// De pure kern achter de bon-inzichten: groep-aggregatie per maand, dekking,
// prijshistorie, top-producten en het zoeken. Geen database, geen browser:
// alles krijgt gewone arrays binnen.
import assert from 'node:assert/strict'

const SRC = new URL('../../src', import.meta.url).href
const ins = await import(`${SRC}/utils/receipts/insights.js`)

let n = 0
const ok = msg => { n++; console.log('  ok ' + msg) }

// Kleine fabriek zodat de testdata leesbaar blijft.
const item = (o = {}) => ({
  receiptId: 1, name: 'Product', nameKey: 'product', qty: 1, unitPrice: null, price: 1,
  group: 'overig', isDiscount: false, date: '2026-09-01', merchant: 'Lidl', merchantKey: 'lidl',
  transactionId: null, ...o,
})

/* ---------------- helpers ---------------- */
{
  assert.equal(ins.maandVan('2026-09-14'), '2026-09')
  assert.equal(ins.maandVan('2026-09'), '2026-09')
  assert.equal(ins.maandVan(''), '')
  assert.equal(ins.maandVan(null), '')
  assert.equal(ins.maandVan('geen datum'), '')
  ok('maandVan pakt JJJJ-MM en degradeert naar leeg')

  assert.deepEqual(ins.laatsteMaanden(6, '2026-09'), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  assert.deepEqual(ins.laatsteMaanden(3, '2026-01'), ['2025-11', '2025-12', '2026-01'])
  assert.deepEqual(ins.laatsteMaanden(1, '2026-09'), ['2026-09'])
  ok('laatsteMaanden loopt over de jaargrens en telt de lopende maand mee')

  assert.equal(ins.normaliseerZoek('Crème brûlée'), 'creme brulee')
  assert.equal(ins.normaliseerZoek('AH  Olijf-olie!'), 'ah olijf olie')
  assert.equal(ins.normaliseerZoek(null), '')
  ok('normaliseerZoek haalt diakrieten en leestekens weg')
}

/* ---------------- prijsnormalisatie ---------------- */
{
  assert.equal(ins.eenheidsprijs({ unitPrice: 1.69, price: 1.69, qty: 1 }), 1.69)
  assert.equal(ins.eenheidsprijs({ unitPrice: null, price: 5, qty: 2 }), 2.5)
  assert.equal(ins.eenheidsprijs({ unitPrice: null, price: 1, qty: 3 }), 0.33)
  assert.equal(ins.eenheidsprijs({ unitPrice: null, price: 4 }), 4, 'geen qty telt als 1')
  assert.equal(ins.eenheidsprijs({ unitPrice: null, price: 4, qty: 0 }), 4, 'qty 0 telt als 1')
  assert.equal(ins.eenheidsprijs({ unitPrice: null, price: null }), null)
  assert.equal(ins.eenheidsprijs({ unitPrice: -2.4, price: -2.4, qty: 1 }), 2.4, 'korting wordt positief')
  ok('eenheidsprijs valt terug op price/qty en rondt op centen af')

  assert.equal(ins.regelBedrag({ price: -2.4 }), 2.4)
  assert.equal(ins.regelBedrag({ price: null }), 0)
  ok('regelBedrag is altijd positief')
}

/* ---------------- groepen per maand ---------------- */
{
  const items = [
    item({ date: '2026-08-03', group: 'zuivel_eieren', price: 3 }),
    item({ date: '2026-08-20', group: 'zuivel_eieren', price: 2 }),
    item({ date: '2026-08-20', group: 'groente_fruit', price: 5 }),
    item({ date: '2026-09-02', group: 'groente_fruit', price: 4 }),
    item({ date: '2026-09-02', group: 'snacks_snoep', price: 1.5 }),
    item({ date: '2026-09-02', group: 'statiegeld_korting', price: -0.75, isDiscount: true }),
    item({ date: '2026-07-01', group: 'dranken', price: 9 }),      // buiten het venster
    item({ date: '', group: 'dranken', price: 99 }),               // zonder datum
  ]
  const maanden = ['2026-08', '2026-09']
  const uit = ins.groepenPerMaand(items, { maanden })

  assert.deepEqual(uit.maanden, maanden)
  assert.equal(uit.perMaand[0].totaal, 10)
  assert.equal(uit.perMaand[1].totaal, 5.5)
  assert.equal(uit.perMaand[0].perGroep.zuivel_eieren, 5)
  assert.equal(uit.perMaand[1].perGroep.groente_fruit, 4)
  assert.equal(uit.perMaand[1].perGroep.statiegeld_korting, undefined, 'korting zit niet in een groep')
  ok('groepenPerMaand telt per maand per groep en negeert regels buiten het venster')

  assert.equal(uit.perMaand[0].korting, 0)
  assert.equal(uit.perMaand[1].korting, 0.75)
  assert.equal(uit.korting, 0.75)
  assert.equal(uit.totaal, 15.5)
  ok('kortingsregels tellen apart als bespaard bedrag')

  assert.deepEqual(uit.groepen, ['groente_fruit', 'zuivel_eieren', 'snacks_snoep'])
  assert.deepEqual(uit.totalen, { groente_fruit: 9, zuivel_eieren: 5, snacks_snoep: 1.5 })
  ok('alleen voorkomende groepen, aflopend op bedrag')

  const leeg = ins.groepenPerMaand([], { maanden })
  assert.deepEqual(leeg.maanden, maanden)
  assert.equal(leeg.perMaand.every(m => m.totaal === 0 && m.korting === 0), true)
  assert.deepEqual(leeg.groepen, [])
  ok('zonder regels blijven de maandkolommen bestaan met nul')

  const onbekend = ins.groepenPerMaand([item({ date: '2026-09-02', group: 'iets raars', price: 2 })], { maanden })
  assert.equal(onbekend.perMaand[1].perGroep.overig, 2)
  ok('een onbekende groep landt in de restbak overig')
}

/* ---------------- groep-totalen voor de donut ---------------- */
{
  const { rijen, totaal, korting } = ins.groepTotalen([
    item({ group: 'groente_fruit', price: 3 }),
    item({ group: 'groente_fruit', price: 1 }),
    item({ group: 'dranken', price: 6 }),
    item({ group: 'statiegeld_korting', price: -2, isDiscount: true }),
  ])
  assert.equal(totaal, 10)
  assert.equal(korting, 2)
  assert.equal(rijen.length, 2)
  assert.equal(rijen[0].group, 'dranken')
  assert.equal(rijen[0].aandeel, 0.6)
  assert.equal(rijen[1].aantal, 2)
  assert.equal(rijen[0].label, 'Dranken')
  assert.match(rijen[0].color, /^#[0-9A-F]{6}$/i)
  assert.ok(rijen[0].icon.length > 0)
  ok('groepTotalen levert aandeel, label, kleur en icoon per groep')

  const leeg = ins.groepTotalen([])
  assert.deepEqual(leeg.rijen, [])
  assert.equal(leeg.totaal, 0)
  ok('groepTotalen op een lege lijst valt niet om')
}

/* ---------------- dekking ---------------- */
{
  const txs = [
    { date: '2026-09-02', amount: 20, type: 'debit', category: 'boodschappen', receiptId: 1 },
    { date: '2026-09-09', amount: 30, type: 'debit', category: 'boodschappen', receiptId: null },
    { date: '2026-09-09', amount: 50, type: 'debit', category: 'wonen', receiptId: null },
    { date: '2026-09-15', amount: 100, type: 'credit', category: 'salaris', receiptId: null },
    { date: '2026-08-15', amount: 80, type: 'debit', category: 'boodschappen', receiptId: 2 },
  ]

  const bood = ins.berekenDekking(txs, { ym: '2026-09', categorieKeys: ['boodschappen'] })
  assert.equal(bood.totaal, 50)
  assert.equal(bood.metBon, 20)
  assert.equal(bood.ratio, 0.4)
  assert.equal(bood.bonnen, 1)
  assert.equal(bood.aantal, 2)
  ok('dekking rekent op bedrag binnen één maand en één categorie')

  const alles = ins.berekenDekking(txs, { ym: '2026-09' })
  assert.equal(alles.totaal, 100, 'inkomsten tellen niet mee')
  assert.equal(Math.round(alles.ratio * 100), 20)
  ok('zonder categoriefilter tellen alle uitgaven van de maand mee')

  const overAlles = ins.berekenDekking(txs, { categorieKeys: new Set(['boodschappen']) })
  assert.equal(overAlles.totaal, 130)
  assert.equal(overAlles.metBon, 100)
  ok('zonder maand loopt de dekking over alle maanden, ook met een Set')

  const cats = [
    { key: 'boodschappen', type: 'expense' },
    { key: 'wonen', type: 'expense' },
    { key: 'salaris', type: 'income' },
  ]
  assert.deepEqual(ins.dekkingCategorieKeys(cats), ['boodschappen'])
  assert.deepEqual(ins.dekkingCategorieKeys(cats.slice(1)), ['wonen'])
  assert.deepEqual(ins.dekkingCategorieKeys([{ key: 'boodschappen', type: 'expense', archived: true }, { key: 'eten', type: 'expense' }]), ['eten'])
  assert.deepEqual(ins.dekkingCategorieKeys([]), [])
  ok('dekkingCategorieKeys kiest Boodschappen, anders alle uitgavecategorieën')

  const geen = ins.berekenDekking([], { ym: '2026-09' })
  assert.equal(geen.ratio, 0)
  assert.equal(geen.totaal, 0)
  ok('geen transacties geeft ratio 0 in plaats van NaN')
}

/* ---------------- prijshistorie ---------------- */
{
  const items = [
    item({ nameKey: 'melk halfvol', name: 'Melk halfvol', date: '2026-07-04', unitPrice: 1.19, price: 1.19, merchant: 'Lidl', merchantKey: 'lidl' }),
    item({ nameKey: 'melk halfvol', name: 'Melk halfvol', date: '2026-09-04', unitPrice: null, price: 2.7, qty: 2, merchant: 'Albert Heijn', merchantKey: 'albert heijn' }),
    item({ nameKey: 'melk halfvol', name: 'Melk halfvol', date: '2026-08-04', unitPrice: 1.29, price: 1.29, merchant: 'Lidl', merchantKey: 'lidl' }),
    item({ nameKey: 'melk halfvol', date: '', unitPrice: 9 }),                       // zonder datum
    item({ nameKey: 'melk halfvol', date: '2026-08-05', unitPrice: null, price: null }), // zonder prijs
    item({ nameKey: 'brood', date: '2026-08-04', unitPrice: 2 }),
  ]
  const punten = ins.prijshistorie(items, 'melk halfvol')
  assert.deepEqual(punten.map(p => p.date), ['2026-07-04', '2026-08-04', '2026-09-04'])
  assert.deepEqual(punten.map(p => p.prijs), [1.19, 1.29, 1.35])
  assert.equal(punten[2].merchantKey, 'albert heijn')
  ok('prijshistorie normaliseert price/qty, sorteert op datum en gooit onbruikbare punten weg')

  assert.deepEqual(ins.prijshistorie(items, ''), [])
  assert.deepEqual(ins.prijshistorie(items, 'bestaat niet'), [])
  ok('een onbekend product geeft een lege reeks')

  const s = ins.prijsSamenvatting(punten)
  assert.equal(s.nu, 1.35)
  assert.equal(s.was, 1.19)
  assert.equal(s.verschil, 0.16)
  assert.equal(s.pct, 13.4)
  assert.equal(s.laagste, 1.19)
  assert.equal(s.hoogste, 1.35)
  assert.equal(s.aantal, 3)
  ok('prijsSamenvatting geeft nu/was/verschil/percentage')

  const een = ins.prijsSamenvatting([{ prijs: 2 }])
  assert.equal(een.nu, 2)
  assert.equal(een.was, null)
  assert.equal(een.pct, null)
  assert.equal(ins.prijsSamenvatting([]).nu, null)
  ok('met één of nul punten valt er niets te vergelijken')
}

/* ---------------- top producten ---------------- */
{
  const items = [
    item({ nameKey: 'melk', name: 'Melk', date: '2026-09-01', price: 1.2 }),
    item({ nameKey: 'melk', name: 'Melk', date: '2026-09-08', price: 1.2 }),
    item({ nameKey: 'melk', name: 'Melk', date: '2026-08-08', price: 1.1 }),
    item({ nameKey: 'biefstuk', name: 'Biefstuk', date: '2026-09-08', price: 9, merchant: 'Albert Heijn' }),
    item({ nameKey: 'bonuskorting', name: 'Bonus korting', date: '2026-09-08', price: -3, isDiscount: true }),
  ]

  const maand = ins.topProducten(items, { prefix: '2026-09' })
  assert.equal(maand.aantalProducten, 2, 'kortingsregels zijn geen product')
  assert.equal(maand.vaakst[0].nameKey, 'melk')
  assert.equal(maand.vaakst[0].keer, 2)
  assert.equal(maand.vaakst[0].totaal, 2.4)
  assert.equal(maand.duurst[0].nameKey, 'biefstuk')
  assert.equal(maand.duurst[0].totaal, 9)
  assert.deepEqual(maand.duurst[0].winkels, ['Albert Heijn'])
  ok('top producten per maand: vaakst op aantal, duurst op bedrag')

  const jaar = ins.topProducten(items, { prefix: '2026' })
  assert.equal(jaar.vaakst[0].keer, 3)
  assert.equal(jaar.vaakst[0].laatst, '2026-09-08')
  ok('met een jaar-prefix tellen alle maanden mee')

  assert.equal(ins.topProducten(items, { prefix: '2026-09', limiet: 1 }).vaakst.length, 1)
  assert.equal(ins.topProducten([], { prefix: '2026-09' }).aantalProducten, 0)
  ok('limiet wordt gerespecteerd en een lege lijst geeft niets')

  assert.equal(ins.meestGekocht(items, 20)[0].nameKey, 'melk')
  ok('meestGekocht levert de chips voor de productkiezer')
}

/* ---------------- zoeken ---------------- */
{
  const items = [
    item({ nameKey: 'zakdoekjes balsem', name: 'Zakdoekjes balsem', date: '2026-09-02', price: 1.55 }),
    item({ nameKey: 'creme fraiche', name: 'Crème fraîche', date: '2026-08-02', price: 1.15 }),
    item({ nameKey: 'chips great britain', name: 'Chips Great Britain', date: '2026-09-04', price: 1.69 }),
    item({ nameKey: 'zakdoek doos', name: 'Zakdoek doos', date: '2026-07-02', price: 2.5 }),
  ]

  assert.deepEqual(ins.zoekItems(items, 'zakdoek').map(i => i.nameKey), ['zakdoekjes balsem', 'zakdoek doos'])
  ok('zoeken op deel van een woord vindt alle varianten, nieuwste eerst')

  assert.equal(ins.zoekItems(items, 'creme')[0].nameKey, 'creme fraiche')
  assert.equal(ins.zoekItems(items, 'crème')[0].nameKey, 'creme fraiche')
  assert.equal(ins.zoekItems(items, 'FRAÎCHE')[0].nameKey, 'creme fraiche')
  ok('zoeken is ongevoelig voor diakrieten en hoofdletters')

  assert.equal(ins.zoekItems(items, 'great chips').length, 1, 'losse woorden in willekeurige volgorde')
  assert.deepEqual(ins.zoekItems(items, ''), [])
  assert.deepEqual(ins.zoekItems(items, '   '), [])
  assert.deepEqual(ins.zoekItems(items, 'bestaatniet'), [])
  ok('lege of niet-gevonden zoektermen geven een lege lijst')

  const s = ins.zoekSamenvatting(ins.zoekItems(items, 'zakdoek'))
  assert.equal(s.aantal, 2)
  assert.equal(s.totaal, 4.05)
  assert.equal(s.gemiddeld, 2.03)
  assert.equal(s.laatst, '2026-09-02')
  ok('zoekSamenvatting telt keer, gemiddelde en laatste datum')
}

/* ---------------- bonnen groeperen ---------------- */
{
  const bonnen = [
    { id: 1, date: '2026-09-04', merchant: 'Lidl', merchantKey: 'lidl' },
    { id: 2, date: '2026-09-01', merchant: 'Albert Heijn', merchantKey: 'albert heijn' },
    { id: 3, date: '2026-08-11', merchant: 'Lidl', merchantKey: 'lidl' },
    { id: 4, date: null, merchant: null, merchantKey: '' },
  ]
  const groepen = ins.bonnenPerMaand(bonnen)
  assert.deepEqual(groepen.map(g => g.ym), ['onbekend', '2026-09', '2026-08'])
  assert.deepEqual(groepen[1].bonnen.map(b => b.id), [1, 2])
  ok('bonnen per maand: zonder datum bovenaan, daarna nieuwste maand eerst')

  const winkels = ins.topWinkels(bonnen, 5)
  assert.deepEqual(winkels.map(w => w.merchantKey), ['lidl', 'albert heijn'])
  assert.equal(winkels[0].aantal, 2)
  assert.equal(ins.topWinkels(bonnen, 1).length, 1)
  assert.deepEqual(ins.topWinkels([]), [])
  ok('topWinkels telt bonnen per winkel en respecteert de limiet')
}

console.log(`\n${n} checks ok`)
