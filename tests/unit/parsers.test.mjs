// Parsers per bank. Alle voorbeeldbestanden zijn verzonnen: fictieve namen,
// bedragen en IBAN's — geen echte transactiedata.
import assert from 'node:assert/strict'
const SRC = new URL('../../src', import.meta.url).href
const P = await import(`${SRC}/utils/parsers.js`)

let n = 0
const t = (name, fn) => { fn(); n++; console.log('  ok', name) }

/* ── ABN AMRO: gedrag moet ongewijzigd zijn ───────────────────────────── */

const ABN_TAB = [
  '123456789\tEUR\t20260901\t20260901\t1000,00\t950,25\t-49,75\tBEA, Apple Pay        Bakkerij Zon AB123456   01.09.26/12:04    AMSTERDAM',
  '123456789\tEUR\t20260903\t20260903\t950,25\t1150,25\t200,00\t/TRTP/SEPA OVERBOEKING/IBAN/NL01TEST0123456789/BIC/TESTNL2A/NAME/J. Voorbeeld/REMI/Tikkie ID 998877, Pizza-avond, NL01TEST0123456789/EREF/NOTPROVIDED',
].join('\r\n')

t('ABN tab-export: 2 rijen, datum/bedrag/type/merchant', () => {
  const rows = P.parseABNExport(ABN_TAB)
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { date: '2026-09-01', merchant: 'Bakkerij Zon', amount: 49.75, type: 'debit' })
  assert.deepEqual(rows[1], { date: '2026-09-03', merchant: 'J. Voorbeeld', amount: 200, type: 'credit' })
  assert.equal('remi' in rows[0], false, 'tab-export levert geen remi (ongewijzigd gedrag)')
})

t('ABN extractMerchant blijft hetzelfde', () => {
  assert.equal(P.extractMerchant(['BEA, Apple Pay        Kaasboer BV NL123456   01.09.26/12:04    UTRECHT']), 'Kaasboer BV')
  // Zonder terminalcode blijft de plaatsnaam staan — bestaand gedrag, bewust ongewijzigd.
  assert.equal(P.extractMerchant(['BEA, Apple Pay        Kaasboer BV,PAS123          NR:XY9    01.09.26/12:04    UTRECHT']), 'Kaasboer BV UTRECHT')
  assert.equal(P.extractMerchant(['/TRTP/iDEAL/IBAN/NL01TEST0123456789/NAME/Webshop Voorbeeld/REMI/Bestelling 42']), 'Webshop Voorbeeld')
  assert.equal(P.extractMerchant(['/TRTP/SEPA/NAME/NS Groep/REMI/OV-chipkaart opladen']), 'NS OV-Chipkaart')
  assert.equal(P.parseABNDate('20260901'), '2026-09-01')
  assert.equal(P.parseABNAmount('-1.234,56'), -1234.56)
})

/* ── ING ──────────────────────────────────────────────────────────────── */

const ING = [
  '"Datum";"Naam / Omschrijving";"Rekening";"Tegenrekening";"Code";"Af Bij";"Bedrag (EUR)";"Mutatiesoort";"Mededelingen";"Saldo na mutatie";"Tag"',
  '"20260902";"Bakkerij Zon";"NL01INGB0001234567";"";"BA";"Af";"12,45";"Betaalautomaat";"Pasvolgnr: 003 02-09-2026 08:12 Term: XY1234";"1.987,55";""',
  '"20260903";"J. Voorbeeld";"NL01INGB0001234567";"NL02TEST0987654321";"GT";"Bij";"25,00";"Online bankieren";"Naam: J. Voorbeeld Omschrijving: Pizza-avond IBAN: NL02TEST0987654321";"2.012,55";""',
  '"20260905";"Woningstichting Fictief";"NL01INGB0001234567";"NL03TEST0555555555";"IC";"Af";"1.050,00";"Incasso";"Naam: Woningstichting Fictief Omschrijving: Huur september Kenmerk: 2026-09";"962,55";""',
].join('\r\n')

t('ING: 3 rijen met Af/Bij, YYYYMMDD en komma-bedragen', () => {
  const { transactions, warnings } = P.parseIng(ING)
  assert.equal(transactions.length, 3)
  assert.deepEqual(warnings, [])
  assert.equal(transactions[0].date, '2026-09-02')
  assert.equal(transactions[0].type, 'debit')
  assert.equal(transactions[0].amount, 12.45)
  assert.equal(transactions[0].merchant, 'Bakkerij Zon')
  assert.equal(transactions[0].balance, 1987.55)
  assert.equal(transactions[0].account, 'NL01INGB0001234567')
  assert.equal(transactions[1].type, 'credit')
  assert.equal(transactions[1].remi, 'Pizza-avond', 'Mededelingen opgeschoond tot de omschrijving')
  assert.equal(transactions[1].counterparty, 'NL02TEST0987654321')
  assert.equal(transactions[2].amount, 1050)
  assert.equal(transactions[2].remi, 'Huur september')
})

t('ING met komma als scheidingsteken werkt ook', () => {
  const comma = ING.replace(/";"/g, '","')
  const { transactions } = P.parseIng(comma)
  assert.equal(transactions.length, 3)
  assert.equal(transactions[0].amount, 12.45)
})

/* ── Rabobank ─────────────────────────────────────────────────────────── */

const RABO = [
  '"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"',
  '"NL04RABO0123456789","EUR","RABONL2U","000000000001","2026-09-02","2026-09-02","-32,10","1.467,90","NL05TEST0111111111","Supermarkt Fictief","","","","bg","","REF1","","","","Betaalautomaat 12:03","","","","",""',
  '"NL04RABO0123456789","EUR","RABONL2U","000000000002","2026-09-04","2026-09-04","+1.500,00","2.967,90","NL06TEST0222222222","Werkgever Fictief BV","","","","sb","","REF2","","","","Salaris september","deel 1","","","",""',
  '"NL04RABO0123456789","EUR","RABONL2U","000000000003","2026-09-06","2026-09-06","-9,99","2.957,91","","","","","","db","","REF3","","","","Kosten betaalpakket","","","","",""',
].join('\r\n')

t('Rabobank: teken in het bedrag, naam tegenpartij, saldo', () => {
  const { transactions, warnings } = P.parseRabobank(RABO)
  assert.equal(transactions.length, 3)
  assert.deepEqual(warnings, [])
  assert.equal(transactions[0].date, '2026-09-02')
  assert.equal(transactions[0].type, 'debit')
  assert.equal(transactions[0].amount, 32.10)
  assert.equal(transactions[0].merchant, 'Supermarkt Fictief')
  assert.equal(transactions[0].balance, 1467.90)
  assert.equal(transactions[1].type, 'credit')
  assert.equal(transactions[1].amount, 1500)
  assert.equal(transactions[1].remi, 'Salaris september deel 1')
  assert.equal(transactions[2].merchant, 'Kosten betaalpakket', 'zonder tegenpartij valt hij terug op de omschrijving')
  assert.equal(transactions[0].account, 'NL04RABO0123456789')
})

/* ── bunq ─────────────────────────────────────────────────────────────── */

const BUNQ = [
  'Date;Interest Date;Amount;Account;Counterparty;Name;Description',
  '2026-09-02;2026-09-02;-4,50;NL07BUNQ0123456789;NL08TEST0333333333;Koffiehuis Fictief;Cappuccino',
  '2026-09-03;2026-09-03;15,00;NL07BUNQ0123456789;NL09TEST0444444444;K. Vriend;Tikkie ID 123456, Borrel',
  '2026-09-07;2026-09-07;-60,00;NL07BUNQ0123456789;NL10TEST0555555555;Sportclub Fictief;Contributie',
].join('\n')

t('bunq: puntkomma, getekend bedrag, Name als merchant', () => {
  const { transactions } = P.parseBunq(BUNQ)
  assert.equal(transactions.length, 3)
  assert.equal(transactions[0].merchant, 'Koffiehuis Fictief')
  assert.equal(transactions[0].amount, 4.5)
  assert.equal(transactions[0].type, 'debit')
  assert.equal(transactions[1].type, 'credit')
  assert.equal(transactions[1].remi, 'Borrel', 'Tikkie-ID gestript')
  assert.equal(transactions[1].counterparty, 'NL09TEST0444444444')
  assert.equal(transactions[2].date, '2026-09-07')
})

/* ── Revolut ──────────────────────────────────────────────────────────── */

const REVOLUT = [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'CARD_PAYMENT,Current,2026-09-02 08:11:02,2026-09-02 10:02:11,Koffiehuis Fictief,-4.50,0.00,EUR,COMPLETED,120.50',
  'TOPUP,Current,2026-09-03 09:00:00,2026-09-03 09:00:05,Payment from J. Voorbeeld,50.00,0.00,EUR,COMPLETED,170.50',
  'CARD_PAYMENT,Current,2026-09-04 20:15:00,,Restaurant Fictief,-28.00,0.00,EUR,PENDING,142.50',
  'ATM,Current,2026-09-05 12:00:00,2026-09-05 12:00:30,Cash withdrawal,-20.00,1.50,EUR,COMPLETED,121.00',
].join('\n')

t('Revolut: alleen COMPLETED, datum met tijd, balance', () => {
  const { transactions, warnings } = P.parseRevolut(REVOLUT)
  assert.equal(transactions.length, 3)
  assert.equal(transactions[0].date, '2026-09-02')
  assert.equal(transactions[0].merchant, 'Koffiehuis Fictief')
  assert.equal(transactions[0].amount, 4.5)
  assert.equal(transactions[0].balance, 120.5)
  assert.equal(transactions[1].type, 'credit')
  assert.ok(warnings.some(w => w.includes('COMPLETED')), 'waarschuwing over de PENDING-regel')
  assert.ok(warnings.some(w => w.toLowerCase().includes('fee')), 'waarschuwing over de fee')
})

/* ── N26 ──────────────────────────────────────────────────────────────── */

const N26_NIEUW = [
  'Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,Account Name,Amount (EUR),Original Amount,Original Currency,Exchange Rate',
  '2026-09-02,2026-09-02,Supermarkt Fictief,DE11TEST0123456789,Presentment,Boodschappen,Main Account,-23.45,,,',
  '2026-09-03,2026-09-03,Werkgever Fictief BV,DE12TEST0987654321,Credit Transfer,Salaris september,Main Account,2500.00,,,',
  '2026-09-06,2026-09-06,Sportclub Fictief,DE13TEST0555555555,Direct Debit,Contributie,Main Account,-35.00,,,',
].join('\n')

const N26_OUD = [
  'Date,Payee,Account number,Transaction type,Payment reference,Amount (EUR),Amount (Foreign Currency),Type Foreign Currency,Exchange Rate',
  '2026-09-02,Supermarkt Fictief,DE11TEST0123456789,MasterCard Payment,Boodschappen,-23.45,,,',
  '2026-09-03,Werkgever Fictief BV,DE12TEST0987654321,Income,Salaris september,2500.00,,,',
].join('\n')

t('N26 (recent formaat)', () => {
  const { transactions } = P.parseN26(N26_NIEUW)
  assert.equal(transactions.length, 3)
  assert.equal(transactions[0].merchant, 'Supermarkt Fictief')
  assert.equal(transactions[0].amount, 23.45)
  assert.equal(transactions[0].type, 'debit')
  assert.equal(transactions[0].remi, 'Boodschappen')
  assert.equal(transactions[0].counterparty, 'DE11TEST0123456789')
  assert.equal(transactions[0].account, 'Main Account')
  assert.equal(transactions[1].type, 'credit')
})

t('N26 (ouder formaat met Payee)', () => {
  const { transactions } = P.parseN26(N26_OUD)
  assert.equal(transactions.length, 2)
  assert.equal(transactions[0].merchant, 'Supermarkt Fictief')
  assert.equal(transactions[1].amount, 2500)
})

/* ── Generieke CSV-mapper ─────────────────────────────────────────────── */

const GENERIEK = [
  'Boekdatum;Omschrijving;Tegenrekening;Debet/Credit;Bedrag',
  '02-09-2026;Supermarkt Fictief;NL11TEST0123456789;Af;23,45',
  '03-09-2026;Werkgever Fictief BV;NL12TEST0987654321;Bij;2.500,00',
  '06-09-2026;Sportclub Fictief;NL13TEST0555555555;Af;35,00',
].join('\r\n')

t('generieke mapping met DD-MM-YYYY en een Af/Bij-kolom', () => {
  const { transactions } = P.parseGenericCsv(GENERIEK, {
    delimiter: ';',
    hasHeader: true,
    dateCol: 'Boekdatum',
    dateFormat: 'DD-MM-YYYY',
    amountCol: 'Bedrag',
    signMode: 'debitCreditCol',
    debitCreditCol: 'Debet/Credit',
    debitValue: 'Af',
    descriptionCols: ['Omschrijving'],
    counterpartyCol: 'Tegenrekening',
  })
  assert.equal(transactions.length, 3)
  assert.deepEqual(
    transactions.map(t2 => [t2.date, t2.type, t2.amount, t2.merchant]),
    [
      ['2026-09-02', 'debit', 23.45, 'Supermarkt Fictief'],
      ['2026-09-03', 'credit', 2500, 'Werkgever Fictief BV'],
      ['2026-09-06', 'debit', 35, 'Sportclub Fictief'],
    ]
  )
  assert.equal(transactions[0].counterparty, 'NL11TEST0123456789')
})

t('generieke mapping op kolomindex zonder kopregel, getekend bedrag', () => {
  const zonderKop = '01/09/2026,Boekhandel Fictief,-18.99\n02/09/2026,Terugbetaling,7.50'
  const { transactions } = P.parseGenericCsv(zonderKop, {
    delimiter: ',', hasHeader: false,
    dateCol: 0, dateFormat: 'DD/MM/YYYY', amountCol: 2,
    signMode: 'signed', descriptionCols: [1],
  })
  assert.equal(transactions.length, 2)
  assert.equal(transactions[0].date, '2026-09-01')
  assert.equal(transactions[0].type, 'debit')
  assert.equal(transactions[0].amount, 18.99)
  assert.equal(transactions[1].type, 'credit')
})

t('suggestMapping herkent kolommen uit een kopregel', () => {
  const kop = ['Boekdatum', 'Omschrijving', 'Tegenrekening', 'Debet/Credit', 'Bedrag']
  const m = P.suggestMapping(kop, ['02-09-2026', 'Supermarkt Fictief', 'NL11TEST0123456789', 'Af', '23,45'])
  assert.equal(m.dateCol, 0)
  assert.equal(m.dateFormat, 'DD-MM-YYYY')
  assert.equal(m.amountCol, 4)
  assert.equal(m.signMode, 'debitCreditCol')
  assert.equal(m.debitCreditCol, 3)
  assert.equal(m.counterpartyCol, 2)
  assert.deepEqual(m.descriptionCols, [1])
})

t('suggestMapping op een ING-kopregel', () => {
  const kop = ['Datum', 'Naam / Omschrijving', 'Rekening', 'Tegenrekening', 'Code', 'Af Bij', 'Bedrag (EUR)', 'Mutatiesoort', 'Mededelingen']
  const m = P.suggestMapping(kop, ['20260902', 'Bakkerij Zon', 'NL01INGB0001234567', '', 'BA', 'Af', '12,45', 'Betaalautomaat', ''])
  assert.equal(m.dateCol, 0)
  assert.equal(m.dateFormat, 'YYYYMMDD')
  assert.equal(m.amountCol, 6)
  assert.equal(m.signMode, 'debitCreditCol')
  assert.equal(m.debitCreditCol, 5)
})

/* ── Detectie ─────────────────────────────────────────────────────────── */

t('detectFormat herkent elk voorbeeldbestand', () => {
  const cases = [
    [ABN_TAB, 'abn.tab', 'abn'],
    [ING, 'ING.csv', 'ing'],
    [RABO, 'rabo.csv', 'rabobank'],
    [BUNQ, 'bunq.csv', 'bunq'],
    [REVOLUT, 'revolut.csv', 'revolut'],
    [N26_NIEUW, 'n26.csv', 'n26'],
    [N26_OUD, 'n26-oud.csv', 'n26'],
    ['date,amount,type,category,subcategory,note\n2026-09-01,12.5,debit,boodschappen,supermarkt,"AH"', 'export.csv', 'internal'],
    ['appel;peer;banaan\n1;2;3', 'rommel.csv', 'unknown'],
  ]
  for (const [text, name, bank] of cases) {
    assert.equal(P.detectFormat(text, name).bank, bank, `${name} -> ${bank}`)
  }
  assert.equal(P.detectFormat('', 'ABN.xlsx').bank, 'abn', 'excel gaat op de extensie')
  assert.equal(P.detectFormat(new TextEncoder().encode(ING).buffer, 'ing.csv').bank, 'ing', 'ArrayBuffer werkt ook')
})

t('detectFormat geeft een confidence tussen 0 en 1', () => {
  const d = P.detectFormat(ING, 'ing.csv')
  assert.ok(d.confidence > 0.9 && d.confidence <= 1)
  assert.equal(P.detectFormat('appel;peer', 'x.csv').confidence, 0)
})

/* ── parseBankFile ────────────────────────────────────────────────────── */

const fakeFile = (name, text) => ({ name, text: async () => text })

const ta = async (name, fn) => { await fn(); n++; console.log('  ok', name) }

await ta('parseBankFile leest een ING-bestand', async () => {
  const r = await P.parseBankFile(fakeFile('ing.csv', ING))
  assert.equal(r.bank, 'ing')
  assert.equal(r.transactions.length, 3)
  assert.deepEqual(r.warnings, [])
})

await ta('parseBankFile leest de ABN tab-export', async () => {
  const r = await P.parseBankFile(fakeFile('ABN.TAB', ABN_TAB))
  assert.equal(r.bank, 'abn')
  assert.equal(r.transactions.length, 2)
})

await ta('parseBankFile meldt een onbekend formaat', async () => {
  const r = await P.parseBankFile(fakeFile('rommel.csv', 'appel;peer\n1;2'))
  assert.equal(r.bank, 'unknown')
  assert.equal(r.transactions.length, 0)
  assert.equal(r.warnings.length, 1)
})

/* ── Robuustheid van de gedeelde CSV-lezer ────────────────────────────── */

t('CSV-lezer: BOM, CRLF, quotes in quotes, newline in cel', () => {
  const rows = P.parseCsv('﻿"a";"b ""x"""\r\n"1";"regel1\nregel2"\r\n', ';')
  assert.deepEqual(rows, [['a', 'b "x"'], ['1', 'regel1\nregel2']])
  assert.equal(P.sniffDelimiter('"a";"b,c";"d"'), ';')
  assert.equal(P.stripBom('﻿hoi'), 'hoi')
})

t('bedragen en datums', () => {
  assert.equal(P.parseAmount('1.234,56'), 1234.56)
  assert.equal(P.parseAmount('1,234.56'), 1234.56)
  assert.equal(P.parseAmount('-12,50'), -12.5)
  assert.equal(P.parseAmount('12,50-'), -12.5)
  assert.equal(P.parseAmount('1.250', ','), 1250)
  assert.equal(P.toIsoDate('20260901'), '2026-09-01')
  assert.equal(P.toIsoDate('01-09-2026'), '2026-09-01')
  assert.equal(P.toIsoDate('2026-09-01 14:03:22'), '2026-09-01')
  assert.equal(P.toIsoDate('geen datum'), '')
})

/* ── Eigen CSV-formaat blijft werken ──────────────────────────────────── */

t('parseTransactionsCsv (eigen formaat) ongewijzigd', () => {
  const rows = P.parseTransactionsCsv('date,amount,type,category,subcategory,note\n2026-09-01,12.5,debit,boodschappen,supermarkt,"Winkel, fictief"')
  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], { date: '2026-09-01', amount: 12.5, type: 'debit', category: 'boodschappen', subcategory: 'supermarkt', note: 'Winkel, fictief' })
})

console.log(`\n${n} parser-tests geslaagd`)
process.exit(0)
