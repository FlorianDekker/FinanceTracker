// Overboekingen tussen je eigen rekeningen, zodat ze nergens als inkomen of
// uitgave meetellen. Namen en IBAN's hier zijn allemaal verzonnen.
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const O = await import(`${SRC}/utils/ownTransfers.js`)

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok', name) }

t('normalizeAccount: hoofdletters en spaties maken niet uit', () => {
  assert.equal(O.normalizeAccount('NL91 rabo 0300 0654 32'), 'NL91RABO0300065432')
  assert.equal(O.normalizeAccount('  '), null)
  assert.equal(O.normalizeAccount(undefined), null)
})

t('collectKnownAccounts: bestaand + nieuw, genormaliseerd, zonder lege waarden', () => {
  const bestaand = [{ account: 'NL01TEST0111111111' }, { account: '' }, { account: null }]
  const nieuw = [{ account: 'NL02 TEST 0222222222' }]
  const set = O.collectKnownAccounts(bestaand, nieuw)
  assert.equal(set.size, 2)
  assert.ok(set.has('NL01TEST0111111111'))
  assert.ok(set.has('NL02TEST0222222222'))
})

t('matchesOwnName: korte naam met initiaal matcht volle naam in de tekst', () => {
  assert.equal(O.matchesOwnName('To Jan Pieter Voorbeeld', ['J. Voorbeeld']), true)
  assert.equal(O.matchesOwnName('Transfer from Jan Pieter Voorbeeld', ['J. Voorbeeld']), true)
  assert.equal(O.matchesOwnName('Jan Pieter Voorbeeld', ['J. Voorbeeld']), true)
  assert.equal(O.matchesOwnName('Supermarkt Fictief', ['J. Voorbeeld']), false)
  assert.equal(O.matchesOwnName('', ['J. Voorbeeld']), false)
  assert.equal(O.matchesOwnName('Wat dan ook', []), false)
})

t('matchesOwnName: tussenvoegsel telt niet als significant woord', () => {
  // "de Boer" -> alleen "boer" is significant; "de" alleen is geen match
  assert.equal(O.matchesOwnName('De gemeente Voorbeeldstad', ['de Boer']), false)
  assert.equal(O.matchesOwnName('Overboeking naar J. de Boer', ['de Boer']), true)
})

t('detectOwnTransfer: tegenrekening al bekend bij de app', () => {
  const knownAccounts = new Set(['NL01TEST0111111111'])
  const tx = { merchant: 'Iemand Fictief', counterparty: 'NL01 TEST 0111111111', type: 'debit' }
  const r = O.detectOwnTransfer(tx, { knownAccounts })
  assert.equal(r.isOwn, true)
  assert.equal(r.reason, 'eigen-rekening')
})

t('detectOwnTransfer: eigen naam in de omschrijving', () => {
  const tx = { merchant: 'To Jan Pieter Voorbeeld', remi: '', type: 'debit' }
  const r = O.detectOwnTransfer(tx, { ownNames: ['J. Voorbeeld'] })
  assert.equal(r.isOwn, true)
  assert.equal(r.reason, 'eigen-naam')
})

t('detectOwnTransfer: Revolut-topup vanaf een eigen bankrekening', () => {
  const tx = { merchant: 'Money added via IDEAL', type: 'credit', bankType: 'Topup' }
  const r = O.detectOwnTransfer(tx, {})
  assert.equal(r.isOwn, true)
  assert.equal(r.reason, 'revolut-topup')

  const anders = O.detectOwnTransfer({ merchant: 'Payment from Iemand Fictief', type: 'credit', bankType: 'Topup' }, {})
  assert.equal(anders.isOwn, false, 'een gewone overboeking van iemand anders is geen topup-herkenning')
})

t('detectOwnTransfer: afschrijving naar Revolut', () => {
  const tx = { merchant: 'Revolut', remi: '', type: 'debit' }
  const r = O.detectOwnTransfer(tx, {})
  assert.equal(r.isOwn, true)
  assert.equal(r.reason, 'naar-revolut')

  // Een bijschrijving die "Revolut" noemt is geen eigen overboeking via deze regel
  // (zou je salaris van "Revolut Ltd" kunnen zijn — niet aannemen dat dat eigen geld is).
  const credit = O.detectOwnTransfer({ merchant: 'Revolut Ltd', type: 'credit' }, {})
  assert.equal(credit.isOwn, false)
})

t('detectOwnTransfer: niets van dit alles -> geen eigen overboeking', () => {
  const r = O.detectOwnTransfer({ merchant: 'Supermarkt Fictief', remi: '', type: 'debit', counterparty: 'NL09TEST0999999999' }, {
    knownAccounts: new Set(['NL01TEST0111111111']),
    ownNames: ['J. Voorbeeld'],
  })
  assert.equal(r.isOwn, false)
  assert.equal(r.reason, null)
})

t('markOwnTransfers: annoteert zonder andere velden te veranderen', () => {
  const txs = [
    { merchant: 'Supermarkt Fictief', remi: '', type: 'debit', amount: 12 },
    { merchant: 'To Jan Pieter Voorbeeld', remi: '', type: 'debit', amount: 50 },
  ]
  const uit = O.markOwnTransfers(txs, { ownNames: ['J. Voorbeeld'] })
  assert.equal(uit[0].isOwnTransfer, false)
  assert.equal(uit[1].isOwnTransfer, true)
  assert.equal(uit[1].ownTransferReason, 'eigen-naam')
  assert.equal(uit[1].amount, 50, 'overige velden blijven ongewijzigd')
  assert.equal(txs[1].isOwnTransfer, undefined, 'de invoer wordt niet gemuteerd')
})

console.log(`\n${n} own-transfers-tests geslaagd`)
process.exit(0)
