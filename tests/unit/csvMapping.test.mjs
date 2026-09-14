// Eigen kolomindelingen: handtekening van de kopregel, bewaren en terugvinden.
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const M = await import(`${SRC}/utils/csvMappings.js`)
const P = await import(`${SRC}/utils/parsers.js`)

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok', name) }

const ONBEKEND = [
  'Boekdatum;Tekst;Bedrag EUR',
  '02-09-2026;Supermarkt Fictief;-23,45',
  '03-09-2026;Werkgever Fictief BV;2500,00',
  '06-09-2026;Sportclub Fictief;-35,00',
].join('\r\n')

t('handtekening normaliseert quotes, hoofdletters en spaties', () => {
  const sig = M.headerSignature(ONBEKEND)
  assert.equal(sig, 'boekdatum|tekst|bedrag eur')
  assert.equal(M.headerSignature(['Boekdatum', 'Tekst', 'Bedrag EUR']), sig, 'array geeft dezelfde handtekening')
  assert.equal(M.headerSignature('﻿"BOEKDATUM";"Tekst";"Bedrag   EUR"\n1;2;3'), sig)
  assert.equal(M.headerSignature('Boekdatum;Tekst;Bedrag EUR;;\n1;2;3;;'), sig, 'lege staartkolommen tellen niet mee')
})

t('een andere kopregel geeft een andere handtekening', () => {
  assert.notEqual(M.headerSignature(ONBEKEND), M.headerSignature('Datum;Omschrijving;Bedrag\n1;2;3'))
  assert.equal(M.headerSignature(''), '')
})

t('onvolledige indelingen worden geweigerd', () => {
  assert.equal(M.isCompleteMapping(null), false)
  assert.equal(M.isCompleteMapping({ dateCol: 0 }), false)
  assert.equal(M.isCompleteMapping({ dateCol: 0, amountCol: 2 }), true)
  assert.equal(M.isCompleteMapping({ dateCol: 0, amountCol: 2, signMode: 'debitCreditCol' }), false)
  assert.equal(M.isCompleteMapping({ dateCol: 0, amountCol: 2, signMode: 'debitCreditCol', debitCreditCol: 3 }), true)
})

t('normalizeMapping vult aan en gooit ballast weg', () => {
  const m = M.normalizeMapping({ dateCol: 0, amountCol: 2, descriptionCols: [1, ''], debitValue: 'Af', onzin: true })
  assert.equal(m.signMode, 'signed')
  assert.equal(m.hasHeader, true)
  assert.deepEqual(m.descriptionCols, [1])
  assert.equal('debitValue' in m, false, 'zonder Af/Bij-kolom is debitValue betekenisloos')
  assert.equal('onzin' in m, false)
})

t('opslaan en terugvinden onder de handtekening', () => {
  const sig = M.headerSignature(ONBEKEND)
  const mapping = { dateCol: 0, dateFormat: 'DD-MM-YYYY', amountCol: 2, signMode: 'signed', descriptionCols: [1] }

  const opgeslagen = M.saveMapping({}, sig, mapping, 1000)
  assert.deepEqual(Object.keys(opgeslagen), [sig])
  assert.equal(opgeslagen[sig].savedAt, 1000)

  const terug = M.getMapping(opgeslagen, sig)
  assert.equal(terug.dateFormat, 'DD-MM-YYYY')
  assert.equal(terug.amountCol, 2)
  assert.equal(M.getMapping(opgeslagen, 'andere;kop'), null)
  assert.equal(M.getMapping(null, sig), null)
})

t('de bewaarde indeling leest hetzelfde bestand de tweede keer meteen', () => {
  const sig = M.headerSignature(ONBEKEND)
  const voorstel = P.suggestMapping(['Boekdatum', 'Tekst', 'Bedrag EUR'], ['02-09-2026', 'Supermarkt Fictief', '-23,45'])
  assert.equal(voorstel.dateCol, 0)
  assert.equal(voorstel.amountCol, 2)
  // 'Tekst' staat niet in de hints, dus die wijst de gebruiker zelf aan.
  const bewaard = M.saveMapping({}, sig, { ...voorstel, descriptionCols: [1] })

  const mapping = M.getMapping(bewaard, sig)
  assert.ok(mapping, 'indeling herkend')
  const { transactions } = P.parseGenericCsv(ONBEKEND, mapping)
  assert.equal(transactions.length, 3)
  assert.equal(transactions[0].date, '2026-09-02')
  assert.equal(transactions[0].type, 'debit')
  assert.equal(transactions[0].amount, 23.45)
  assert.equal(transactions[0].merchant, 'Supermarkt Fictief')
  assert.equal(transactions[1].type, 'credit')
})

t('saveMapping is onveranderlijk en houdt maximaal MAX_MAPPINGS indelingen', () => {
  const basis = {}
  const een = M.saveMapping(basis, 'a|b', { dateCol: 0, amountCol: 1 }, 1)
  assert.deepEqual(basis, {}, 'de ingang wordt niet gewijzigd')

  let mappings = een
  for (let i = 0; i < M.MAX_MAPPINGS + 5; i++) {
    mappings = M.saveMapping(mappings, `kop${i}`, { dateCol: 0, amountCol: 1 }, 100 + i)
  }
  assert.equal(Object.keys(mappings).length, M.MAX_MAPPINGS)
  assert.equal(M.getMapping(mappings, 'a|b'), null, 'de oudste is eruit gevallen')
  assert.ok(M.getMapping(mappings, `kop${M.MAX_MAPPINGS + 4}`), 'de nieuwste staat erin')
})

t('een onvolledige indeling wordt niet bewaard', () => {
  const uit = M.saveMapping({}, 'a|b', { dateCol: 0 })
  assert.deepEqual(uit, {})
})

console.log(`\n${n} csv-mapping-tests geslaagd`)
process.exit(0)
