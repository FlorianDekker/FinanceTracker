// Rabobank-rekeningafschrift (PDF). Voorbeelditems zijn verzonnen: fictieve
// naam, IBAN's en bedragen, maar wel afgeleid van de echte kolomopmaak
// (x-posities in PDF-punten) zoals pdf.js die uit een echt afschrift haalt.
// Zie de opdracht: de pure parser wordt getest op een array tekst-items,
// niet op een echt PDF-bestand (dat zou persoonsgegevens vereisen).
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const { parseRabobankPdfItems, looksLikeRabobankStatement } = await import(`${SRC}/utils/parsers/rabobankPdf.js`)

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok', name) }

// item(str, x, y) met pagina 1, zoals extractPdfItems() in pdfText.js levert.
const i = (str, x, y, page = 1) => ({ str, x, y, page })

function basisItems() {
  return [
    // Ten name van / Datum aanmaak afschrift / Blad
    i('Ten name van', 34, 700), i('Datum aanmaak afschrift', 366, 700), i('Blad', 553, 700),
    i('J.', 34, 690), i('Tester', 54, 690), i('21-10-2026', 395, 690), i('1', 532, 690), i('van', 542, 690), i('1', 562, 690),
    // Datum vanaf / Beginsaldo (met adresresten op dezelfde regel, zoals in het echte afschrift)
    i('1234 AB PLAATS', 34, 670), i('Datum vanaf', 405, 670), i('Beginsaldo', 532, 670),
    i('01-09-2026', 395, 660), i('500,00', 532, 660), i('CR', 557, 660),
    // Datum tot en met / Eindsaldo
    i('Datum tot en met', 392, 650), i('Eindsaldo', 536, 650),
    i('30-09-2026', 395, 640), i('912,32', 521, 640), i('CR', 557, 640),
    // IBAN / BIC / Totaal afgeschreven / Totaal bijgeschreven
    i('IBAN / Rekeningnummer', 37, 630), i('BIC', 262, 630), i('Totaal afgeschreven', 383, 630), i('Totaal bijgeschreven', 502, 630),
    i('NL99', 37, 620), i('TEST 0123 4567 89 EUR', 62, 620), i('TESTNL2U', 262, 620), i('87,89', 406, 620), i('500,21', 526, 620),
    // Tabelkop
    i('Rente', 37, 600), i('Type', 69, 600), i('Tegenrekening', 89, 600), i('Naam/omschrijving', 206, 600),
    i('Bedrag af (debet)', 420, 600), i('Bedrag bij (credit)', 509, 600),
    i('datum', 37, 594),
    // TX1: db, met tegenrekening, meerregelige omschrijving + Verwerkingsdatum
    i('05-09', 37, 560), i('db', 69, 560), i('NL88 TEST 0222 3333 44', 89, 560), i('Winkel Fictief', 206, 560), i('12,34', 454, 560),
    i('Kosten', 206, 550),
    i('Verwerkingsdatum:', 206, 540), i('05-09-2026', 297, 540),
    // TX2: cb, credit, geen vervolgregel
    i('20-09', 37, 520), i('cb', 69, 520), i('NL77 TEST 0333 4444 55', 89, 520), i('Werkgever Fictief BV', 206, 520), i('500,21', 524, 520),
    // TX3: ei, geen tegenrekening, meerregelig
    i('28-09', 37, 500), i('ei', 69, 500), i('Energieleverancier Fictief', 206, 500), i('75,55', 433, 500),
    i('Voorschot', 206, 490), i('oktober', 251, 490),
    i('Verwerkingsdatum:', 206, 480), i('29-09-2026', 297, 480),
    // Voettekst (stopt de tabel)
    i('ba = betaalautomaat', 34, 460),
    i('CR = tegoed', 548, 20),
  ]
}

t('leest kop (periode, saldi, IBAN, naam) en 3 mutaties', () => {
  const { transactions, warnings, tenNameVan } = parseRabobankPdfItems(basisItems())
  assert.deepEqual(warnings, [], 'saldo en totalen sluiten, dus geen waarschuwingen')
  assert.equal(transactions.length, 3)
  assert.equal(tenNameVan, 'J. Tester')

  const [tx1, tx2, tx3] = transactions
  assert.equal(tx1.date, '2026-09-05', 'Verwerkingsdatum geeft het jaar én de echte boekdatum')
  assert.equal(tx1.type, 'debit')
  assert.equal(tx1.amount, 12.34)
  assert.equal(tx1.merchant, 'Winkel Fictief')
  assert.equal(tx1.remi, 'Kosten', 'Verwerkingsdatum zelf gaat niet in de remi')
  assert.equal(tx1.counterparty, 'NL88TEST0222333344')
  assert.equal(tx1.account, 'NL99TEST0123456789')
  assert.equal(tx1.bankType, 'db')
  assert.equal(tx1.balance, 487.66, '500,00 - 12,34')

  assert.equal(tx2.date, '2026-09-20', 'zonder Verwerkingsdatum: hoofddatum + jaar uit de periode')
  assert.equal(tx2.type, 'credit')
  assert.equal(tx2.amount, 500.21)
  assert.equal(tx2.merchant, 'Werkgever Fictief BV')
  assert.equal(tx2.balance, 987.87)

  assert.equal(tx3.date, '2026-09-29')
  assert.equal(tx3.type, 'debit')
  assert.equal(tx3.amount, 75.55)
  assert.equal(tx3.merchant, 'Energieleverancier Fictief')
  assert.equal(tx3.remi, 'Voorschot oktober')
  assert.equal(tx3.counterparty, undefined, 'geen tegenrekening op deze regel')
  assert.equal(tx3.balance, 912.32, 'komt overeen met het eindsaldo uit de kop')
})

t('waarschuwt als het eindsaldo niet klopt met de mutaties', () => {
  const items = basisItems().map(it => (it.str === '912,32' ? { ...it, str: '999,99' } : it))
  const { warnings } = parseRabobankPdfItems(items)
  assert.ok(warnings.some(w => w.includes('Saldocontrole')), 'verwacht een saldo-waarschuwing')
})

t('waarschuwt als "Totaal afgeschreven" niet overeenkomt met de som van de mutaties', () => {
  const items = basisItems().map(it => (it.str === '87,89' ? { ...it, str: '1,00' } : it))
  const { warnings } = parseRabobankPdfItems(items)
  assert.ok(warnings.some(w => w.toLowerCase().includes('totaal afgeschreven')))
})

t('geen tekst-items geeft een duidelijke waarschuwing, geen crash', () => {
  const { transactions, warnings } = parseRabobankPdfItems([])
  assert.equal(transactions.length, 0)
  assert.ok(warnings.length > 0)
})

t('looksLikeRabobankStatement herkent "Rekeningafschrift" + Rabobank/RABO', () => {
  assert.equal(looksLikeRabobankStatement('Rekeningafschrift ... Rabobank ... NL91 RABO 0300 0654 32'), true)
  assert.equal(looksLikeRabobankStatement('Rekeningafschrift van een andere bank BIC INGBNL2A'), false)
  assert.equal(looksLikeRabobankStatement('Kassabon Albert Heijn'), false)
})

console.log(`\n${n} rabobank-pdf-tests geslaagd`)
process.exit(0)
