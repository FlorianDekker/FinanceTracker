// Pure kern van het bonnetjes-uitlezen: groep-normalisatie, de tolerante
// JSON-parser, de validatie en het koppelen aan transacties. Geen netwerk:
// modelantwoorden zijn hier vaste strings.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SRC = new URL('../../src', import.meta.url).href
const groups = await import(`${SRC}/utils/receipts/groups.js`)
const extract = await import(`${SRC}/utils/receipts/extract.js`)
const match = await import(`${SRC}/utils/receipts/match.js`)
const pdfText = await import(`${SRC}/utils/receipts/pdfText.js`)

let n = 0
const ok = msg => { n++; console.log('  ok ' + msg) }

/* ---------------- groups.normalizeGroup ---------------- */
{
  const { normalizeGroup, GROUP_KEYS, RECEIPT_GROUPS } = groups
  assert.equal(RECEIPT_GROUPS.length, 16, '15 groepen + overig')
  assert.equal(new Set(GROUP_KEYS).size, GROUP_KEYS.length, 'keys zijn uniek')
  assert.ok(GROUP_KEYS.includes('overig'))
  ok('taxonomie: 16 unieke groepen met een restbak')

  assert.equal(normalizeGroup('groente_fruit'), 'groente_fruit')
  assert.equal(normalizeGroup('Groente & fruit'), 'groente_fruit')
  assert.equal(normalizeGroup('GROENTE_FRUIT'), 'groente_fruit')
  ok('key, label en hoofdletters leiden naar dezelfde groep')

  assert.equal(normalizeGroup('dairy'), 'zuivel_eieren')
  assert.equal(normalizeGroup('Dairy & Eggs'), 'zuivel_eieren')
  assert.equal(normalizeGroup('frozen food'), 'diepvries')
  assert.equal(normalizeGroup('Personal care'), 'verzorging')
  assert.equal(normalizeGroup('ready meals'), 'kant_en_klaar')
  assert.equal(normalizeGroup('beverages'), 'dranken')
  assert.equal(normalizeGroup('pet food'), 'huisdier')
  ok('Engelse modeloutput mapt naar de Nederlandse keys')

  assert.equal(normalizeGroup('statiegeld/korting'), 'statiegeld_korting')
  assert.equal(normalizeGroup('BONUS korting'), 'statiegeld_korting')
  assert.equal(normalizeGroup('emballage'), 'statiegeld_korting')
  ok('kortingen en statiegeld vallen in één groep')

  for (const invoer of ['', null, undefined, 'iets wat niet bestaat', 42, {}]) {
    assert.equal(normalizeGroup(invoer), 'overig', `fallback voor ${JSON.stringify(invoer)}`)
  }
  ok('onbekende of lege invoer valt altijd terug op overig')

  for (const g of groups.RECEIPT_GROUPS) {
    assert.equal(normalizeGroup(g.label), g.key, `label van ${g.key}`)
    assert.ok(/^#[0-9A-F]{6}$/i.test(g.color), `kleur van ${g.key}`)
    assert.ok(g.icon.length > 0)
  }
  ok('elk label mapt terug op zijn eigen key en elke groep heeft kleur + icoon')

  assert.equal(groups.groupLabel('zuivel_eieren'), 'Zuivel & eieren')
  assert.equal(groups.groupLabel('bestaat-niet'), 'Overig')
  ok('groupLabel/groupColor/groupIcon degraderen naar Overig')
}

/* ---------------- tolerante JSON-parser ---------------- */
{
  const { parseLooseJson, ReceiptExtractError } = extract

  assert.deepEqual(parseLooseJson('{"a":1}'), { a: 1 })
  ok('kale JSON')

  assert.deepEqual(parseLooseJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseLooseJson('```\n{"a":1}\n```'), { a: 1 })
  ok('gefencede blokken met en zonder taalaanduiding')

  assert.deepEqual(parseLooseJson('Natuurlijk! Hier is het resultaat:\n{"a":1}\nLaat me weten of dit klopt.'), { a: 1 })
  ok('JSON tussen inleidende en afsluitende praat')

  assert.deepEqual(parseLooseJson('{"a":1,"b":[1,2,],}'), { a: 1, b: [1, 2] })
  ok('trailing komma\'s')

  assert.deepEqual(parseLooseJson('{"prijs": 5,99}'), { prijs: 5.99 })
  ok('Nederlands decimaalteken in een getal')

  assert.deepEqual(parseLooseJson('{"a":1} {"b":2}'), { a: 1 })
  ok('bij twee objecten wint het eerste gebalanceerde object')

  assert.deepEqual(parseLooseJson('Hier:\n```json\n{"note":"zie {haakje} hier"}\n```'), { note: 'zie {haakje} hier' })
  ok('accolades binnen een string breken het balanceren niet')

  for (const kapot of ['', '   ', 'sorry, ik kan dit niet lezen', '{"a": ']) {
    assert.throws(() => parseLooseJson(kapot), e => e instanceof ReceiptExtractError && e.code === 'parse', `moet falen op ${JSON.stringify(kapot)}`)
  }
  ok('onbruikbare output gooit ReceiptExtractError met code parse')
}

/* ---------------- bedragen, datums, tijden ---------------- */
{
  const { parseAmount, parseDate, parseTime } = extract
  assert.equal(parseAmount('€ 5,99'), 5.99)
  assert.equal(parseAmount('-2,40'), -2.4)
  assert.equal(parseAmount('−2,40'), -2.4, 'minteken uit unicode')
  assert.equal(parseAmount('1.234,50'), 1234.5)
  assert.equal(parseAmount('1,234.50'), 1234.5)
  assert.equal(parseAmount(7.37), 7.37)
  assert.equal(parseAmount('abc'), null)
  assert.equal(parseAmount(null), null)
  ok('parseAmount leest NL- en EN-notatie, valuta en mintekens')

  assert.equal(parseDate('10-9-2026'), '2026-09-10')
  assert.equal(parseDate('10/09/2026'), '2026-09-10')
  assert.equal(parseDate('2026-09-10'), '2026-09-10')
  assert.equal(parseDate('11.02.26'), '2026-02-11')
  assert.equal(parseDate('geen datum'), null)
  ok('parseDate: dag-eerst op NL-bonnen, tweecijferige jaren, ISO')

  assert.equal(parseTime('17:51'), '17:51')
  assert.equal(parseTime('7.05'), '07:05')
  assert.equal(parseTime('99:99'), null)
  ok('parseTime normaliseert naar HH:MM')
}

/* ---------------- normalizeReceipt ---------------- */
{
  const { normalizeReceipt } = extract
  const bon = normalizeReceipt({
    merchant: ' Albert Heijn ', date: '10-9-2026', time: '17:51', total: '7,37',
    payment_method: 'Bankpas',
    items: [
      { name: 'FUSILLI SALS', qty: 1, unit_price: 5.99, price: 5.99, group: 'ready meals' },
      { name: 'TERRA CREME', price: 0.89, group: 'Dairy' },
      { name: 'APPELS', qty: 2, unit_price: 1.48, group: 'fruit' },
    ],
    discounts: [{ name: '40% korting', amount: 2.4 }],
  })
  assert.equal(bon.merchant, 'Albert Heijn')
  assert.equal(bon.date, '2026-09-10')
  assert.equal(bon.total, 7.37)
  assert.equal(bon.currency, 'EUR')
  assert.equal(bon.paymentMethod, 'pin', 'Bankpas telt als pin')
  assert.equal(bon.items[0].group, 'kant_en_klaar')
  assert.equal(bon.items[1].group, 'zuivel_eieren')
  assert.equal(bon.items[1].unitPrice, 0.89, 'zonder unit_price afgeleid uit price')
  assert.equal(bon.items[2].price, 2.96, 'zonder price afgeleid uit qty × unit_price')
  assert.equal(bon.items[0].nameKey, 'fusilli sals')
  ok('normalizeReceipt vult ontbrekende velden aan en normaliseert groepen')

  const negatief = normalizeReceipt({
    total: 3, items: [{ name: 'BROOD', price: 5 }, { name: 'BONUS', price: -2 }],
  })
  assert.equal(negatief.items[1].isDiscount, true)
  assert.equal(negatief.items[1].group, 'statiegeld_korting')
  assert.deepEqual(negatief.discounts, [{ name: 'BONUS', amount: 2 }])
  ok('een negatieve regel wordt een korting, ook zonder discounts-array')

  const dubbel = normalizeReceipt({
    total: 3,
    items: [{ name: 'BROOD', price: 5 }, { name: 'BONUS', price: -2 }],
    discounts: [{ name: 'BONUS', amount: 2 }],
  })
  assert.equal(dubbel.discounts.length, 1, 'korting uit beide bronnen telt één keer')
  assert.equal(extract.validateReceipt(dubbel).ok, true)
  ok('een korting die zowel als regel als in discounts staat wordt ontdubbeld')

  const leeg = normalizeReceipt(null)
  assert.deepEqual(leeg.items, [])
  assert.equal(leeg.total, null)
  ok('normalizeReceipt overleeft null en onzin')

  const genest = normalizeReceipt({ receipt: { merchant: 'Lidl', total: 1 } })
  assert.equal(genest.merchant, 'Lidl')
  ok('een in { receipt: ... } verpakt antwoord wordt uitgepakt')
}

/* ---------------- validateReceipt ---------------- */
{
  const { validateReceipt, normalizeReceipt } = extract
  const goed = normalizeReceipt({
    total: 7.37,
    items: [{ name: 'a', price: 5.99 }, { name: 'b', price: 0.89 }, { name: 'c', price: 2.89 }],
    discounts: [{ name: 'bonus', amount: 2.4 }],
  })
  const v = validateReceipt(goed)
  assert.equal(v.itemsSum, 9.77)
  assert.equal(v.discountSum, 2.4)
  assert.equal(v.diff, 0)
  assert.equal(v.ok, true)
  ok('Σ regels − Σ kortingen = totaal → ok')

  assert.equal(validateReceipt(normalizeReceipt({ total: 10, items: [{ name: 'a', price: 10.04 }] })).ok, true, '4 cent mag')
  assert.equal(validateReceipt(normalizeReceipt({ total: 10, items: [{ name: 'a', price: 10.05 }] })).ok, true, '5 cent mag precies')
  const teVeel = validateReceipt(normalizeReceipt({ total: 10, items: [{ name: 'a', price: 10.06 }] }))
  assert.equal(teVeel.ok, false)
  assert.equal(teVeel.diff, 0.06)
  ok('tolerantie is precies ±0,05')

  const zonderTotaal = validateReceipt(normalizeReceipt({ items: [{ name: 'a', price: 1 }] }))
  assert.equal(zonderTotaal.ok, false)
  assert.equal(zonderTotaal.reden, 'geen totaalbedrag')
  assert.equal(validateReceipt(normalizeReceipt({ total: 5 })).reden, 'geen regels')
  assert.equal(validateReceipt(null).ok, false)
  ok('ontbrekend totaal of ontbrekende regels is niet ok, met een reden')
}

/* ---------------- match.findTransactionCandidates ---------------- */
{
  const { findTransactionCandidates, bestMatch, dagenVerschil } = match
  const bon = { date: '2026-09-10', total: 7.37 }
  const txs = [
    { id: 1, date: '2026-09-11', amount: 7.37, type: 'debit' },
    { id: 2, date: '2026-09-10', amount: 7.37, type: 'debit' },
    { id: 3, date: '2026-09-09', amount: 8.00, type: 'debit' },
    { id: 4, date: '2026-09-10', amount: 7.37, type: 'credit' },
    { id: 5, date: '2026-09-20', amount: 7.37, type: 'debit' },
    { id: 6, date: '2026-09-10', amount: 7.37, type: 'debit', receiptId: 99 },
  ]
  const k = findTransactionCandidates(bon, txs)
  assert.deepEqual(k.map(x => x.id), [2, 1, 3], 'bedrag eerst, dan datumafstand')
  assert.equal(k[0].dayDiff, 0)
  assert.equal(k[0].exact, true)
  assert.equal(k[2].amountDiff, 0.63)
  ok('kandidaten: gesorteerd op bedragverschil, dan datumafstand')

  assert.equal(findTransactionCandidates(bon, txs).some(x => x.type === 'credit'), false, 'geen inkomsten')
  assert.equal(findTransactionCandidates(bon, txs).some(x => x.id === 5), false, 'buiten ±3 dagen')
  assert.equal(findTransactionCandidates(bon, txs).some(x => x.id === 6), false, 'al aan een andere bon gekoppeld')
  ok('inkomsten, te oude transacties en al gekoppelde transacties vallen af')

  assert.equal(findTransactionCandidates(bon, txs, { days: 0 }).length, 1)
  assert.equal(findTransactionCandidates(bon, txs, { maxDiff: 0.01 }).length, 2)
  assert.equal(findTransactionCandidates(bon, txs, { includeLinked: true }).length, 4)
  ok('days, maxDiff en includeLinked doen wat ze beloven')

  assert.deepEqual(findTransactionCandidates({ total: 5 }, txs), [], 'bon zonder datum')
  assert.deepEqual(findTransactionCandidates({ date: '2026-09-10' }, txs), [], 'bon zonder totaal')
  assert.deepEqual(findTransactionCandidates(bon, null), [])
  assert.deepEqual(findTransactionCandidates(bon, [null, { date: 'kapot', amount: 7.37 }]), [])
  ok('onvolledige invoer levert een lege lijst, geen fout')

  assert.equal(bestMatch(bon, txs)?.id, undefined, 'twee exacte treffers → laat de gebruiker kiezen')
  assert.equal(bestMatch(bon, [txs[1], txs[2]])?.id, 2, 'precies één exacte treffer')
  assert.equal(bestMatch(bon, [txs[2]]), null, 'geen exacte treffer')
  ok('bestMatch koppelt alleen automatisch bij precies één exacte treffer')

  assert.equal(dagenVerschil('2026-09-10', '2026-09-13'), 3)
  assert.equal(dagenVerschil('2026-09-10', 'kapot'), null)
  ok('dagenVerschil rekent in hele dagen en verdraagt onzin')
}

/* ---------------- extractReceipt met een nagebootste API ---------------- */
{
  const { extractReceipt, ReceiptExtractError } = extract
  const ai = { baseUrl: 'https://voorbeeld.test/v1', apiKey: 'test-sleutel', model: 'test-model' }
  const echteFetch = globalThis.fetch
  let laatsteRequest = null

  const stub = (status, body, headers = {}) => {
    globalThis.fetch = async (url, init) => {
      laatsteRequest = { url, init, body: JSON.parse(init.body) }
      return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status, headers: { 'Content-Type': 'application/json', ...headers },
      })
    }
  }
  const antwoord = inhoud => ({
    model: 'test-model',
    usage: { prompt_tokens: 100, completion_tokens: 50 },
    choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: inhoud } }],
  })

  try {
    stub(200, antwoord('Alsjeblieft!\n```json\n{"merchant":"Jumbo","date":"11-02-2026","time":"20:22","total":"3,24","payment_method":"Bankpas","items":[{"name":"Chips","price":1.69,"group":"snacks"},{"name":"Zakdoekjes","price":1.55,"group":"personal care"}],"discounts":[],}\n```'))
    const bon = await extractReceipt({ text: 'OMSCHRIJVING ...', ai })
    assert.equal(bon.merchant, 'Jumbo')
    assert.equal(bon.date, '2026-02-11')
    assert.equal(bon.total, 3.24)
    assert.equal(bon.paymentMethod, 'pin')
    assert.equal(bon.items[1].group, 'verzorging')
    assert.equal(bon.validation.ok, true)
    assert.equal(bon.raw.inputType, 'text')
    assert.equal(bon.raw.usage.prompt_tokens, 100)
    assert.ok(bon.raw.latencyMs >= 0)
    ok('extractReceipt: rommelig modelantwoord wordt een geldige, gevalideerde bon')

    assert.equal(laatsteRequest.url, 'https://voorbeeld.test/v1/chat/completions')
    assert.equal(laatsteRequest.init.headers.Authorization, 'Bearer test-sleutel')
    assert.equal(laatsteRequest.body.temperature, 0)
    assert.deepEqual(laatsteRequest.body.response_format, { type: 'json_object' })
    assert.deepEqual(laatsteRequest.body.chat_template_kwargs, { enable_thinking: false })
    assert.equal(typeof laatsteRequest.body.messages[1].content, 'string', 'tekst-invoer stuurt geen image_url mee')
    assert.ok(!JSON.stringify(laatsteRequest.body).includes('image_url'))
    ok('tekst-invoer: geen image_url, wel json_object en denken-uit')

    stub(200, antwoord('{"merchant":"Lidl","total":1,"items":[{"name":"a","price":1}]}'))
    await extractReceipt({ images: [new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })], ai })
    const inhoud = laatsteRequest.body.messages[1].content
    assert.ok(Array.isArray(inhoud))
    assert.equal(inhoud[1].type, 'image_url')
    assert.ok(inhoud[1].image_url.url.startsWith('data:image/jpeg;base64,'))
    ok('foto-invoer wordt als data-URL in een image_url-blok gestuurd')

    // json_object + chat_template_kwargs geweigerd → kalere request
    let n400 = 0
    globalThis.fetch = async (url, init) => {
      laatsteRequest = { url, init, body: JSON.parse(init.body) }
      if (laatsteRequest.body.chat_template_kwargs || laatsteRequest.body.response_format) {
        n400++
        return new Response(JSON.stringify({ error: { message: 'Input validation error' } }), { status: 400 })
      }
      return new Response(JSON.stringify(antwoord('{"merchant":"X","total":1,"items":[{"name":"a","price":1}]}')), { status: 200 })
    }
    const kaal = await extractReceipt({ text: 'bon', ai })
    assert.equal(kaal.merchant, 'X')
    assert.equal(kaal.raw.jsonMode, false)
    assert.equal(n400, 2, 'eerst zonder denken-uit, daarna zonder json_object')
    ok('geweigerde parameters leiden stap voor stap tot een kalere request')

    for (const [status, code] of [[401, 'auth'], [403, 'auth'], [402, 'quota']]) {
      stub(status, { error: { message: 'nee' } })
      await assert.rejects(() => extractReceipt({ text: 'bon', ai }),
        e => e instanceof ReceiptExtractError && e.code === code && /[a-z]/.test(e.message), `${status} → ${code}`)
    }
    ok('401/403 geven code auth, 402 geeft code quota, met een Nederlandse melding')

    let pogingen = 0
    globalThis.fetch = async () => {
      pogingen++
      return pogingen < 3
        ? new Response('{"error":{"message":"Service unavailable"}}', { status: 503 })
        : new Response(JSON.stringify(antwoord('{"merchant":"Y","total":2,"items":[{"name":"a","price":2}]}')), { status: 200 })
    }
    const naHerhaling = await extractReceipt({ text: 'bon', ai })
    assert.equal(naHerhaling.merchant, 'Y')
    assert.equal(pogingen, 3, 'twee keer 503, derde poging raak')
    ok('een 503 van de provider wordt automatisch opnieuw geprobeerd')

    stub(200, antwoord('het spijt me, ik zie geen bon'))
    await assert.rejects(() => extractReceipt({ text: 'bon', ai }),
      e => e instanceof ReceiptExtractError && e.code === 'parse')
    ok('een antwoord zonder JSON geeft code parse')

    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: '', reasoning: 'eindeloos nadenken' } }],
      usage: { completion_tokens: 8000 },
    }), { status: 200 })
    await assert.rejects(() => extractReceipt({ text: 'bon', ai }),
      e => e instanceof ReceiptExtractError && e.code === 'parse' && /nadenken/.test(e.message))
    ok('een redeneermodel dat zijn tokens opmaakt geeft een begrijpelijke foutmelding')

    stub(200, antwoord('{"merchant":"Z"}'))
    await assert.rejects(() => extractReceipt({ text: 'bon', ai }),
      e => e instanceof ReceiptExtractError && e.code === 'validation')
    ok('geen totaal én geen regels geeft code validation')

    globalThis.fetch = async () => { throw new TypeError('Failed to fetch') }
    await assert.rejects(() => extractReceipt({ text: 'bon', ai }),
      e => e instanceof ReceiptExtractError && e.code === 'network')
    ok('een mislukte verbinding geeft code network')

    await assert.rejects(() => extractReceipt({ text: 'bon', ai: { ...ai, apiKey: '' } }),
      e => e instanceof ReceiptExtractError && e.code === 'auth')
    await assert.rejects(() => extractReceipt({ ai }),
      e => e instanceof ReceiptExtractError && e.code === 'validation')
    ok('ontbrekende sleutel of ontbrekende invoer wordt herkend vóór er een call uitgaat')

    // Σ regels − kortingen ≠ totaal: geen fout, wel validation.ok false
    stub(200, antwoord('{"merchant":"Q","total":10,"items":[{"name":"a","price":3}]}'))
    const scheef = await extractReceipt({ text: 'bon', ai })
    assert.equal(scheef.validation.ok, false)
    assert.equal(scheef.validation.diff, -7)
    ok('een bon die niet optelt komt terug met validation.ok false, niet als fout')
  } finally {
    globalThis.fetch = echteFetch
  }
}

/* ---------------- pdfText op de echte AH-bon ---------------- */
{
  const dataDir = process.env.FT_DATA_DIR ?? path.join(os.homedir(), 'Documents', 'FinanceTracker-data')
  const pdf = path.join(dataDir, 'samples', 'ah_bon_2026-09-10.pdf')
  if (!fs.existsSync(pdf)) {
    console.log(`  -- pdfText overgeslagen: ${pdf} ontbreekt (zet FT_DATA_DIR)`)
  } else {
    const r = await pdfText.extractPdfText(fs.readFileSync(pdf))
    assert.equal(r.pages, 1)
    assert.equal(r.isTextPdf, true)
    const regels = r.text.split('\n')
    assert.ok(regels.includes('AANTAL OMSCHRIJVING PRIJS BEDRAG'), 'kolomkop staat op één regel')
    assert.ok(regels.includes('1 TERRA CREME 0,89'), 'aantal, omschrijving en bedrag staan op één regel')
    assert.ok(regels.includes('40% K FUSILLI SALS -2,40'), 'kortingsregel blijft intact')
    assert.ok(regels.includes('TOTAAL 7,37'))
    assert.ok(regels.includes('PINNEN 7,37'))
    assert.ok(regels.includes('17:51 10-9-2026'))
    ok('pdfText reconstrueert de kolommen van de AH-bon als leesbare regels')

    const buf = fs.readFileSync(pdf)
    const ab = new Uint8Array(buf).buffer
    await pdfText.extractPdfText(ab)
    const tweede = await pdfText.extractPdfText(ab)
    assert.equal(tweede.text, r.text, 'dezelfde buffer blijft bruikbaar na een eerste aanroep')
    ok('extractPdfText laat de meegegeven buffer intact (pdf.js detacheert hem anders)')
  }

  assert.deepEqual(pdfText.itemsToLines([]), [])
  assert.deepEqual(pdfText.itemsToLines([
    { str: 'B', transform: [1, 0, 0, 10, 50, 100], width: 5, height: 10 },
    { str: 'A', transform: [1, 0, 0, 10, 10, 100], width: 5, height: 10 },
    { str: 'boven', transform: [1, 0, 0, 10, 10, 200], width: 20, height: 10 },
  ]), ['boven', 'A B'])
  ok('itemsToLines sorteert op y aflopend en binnen een regel op x')

  await assert.rejects(() => pdfText.extractPdfText('geen buffer'), /ArrayBuffer/)
  ok('extractPdfText weigert invoer die geen buffer is')
}

console.log(`\n${n} checks`)
