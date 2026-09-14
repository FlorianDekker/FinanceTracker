// Kassabon → gestructureerde regels via een OpenAI-compatible chat-API.
//
// Werkt met together.ai (default), maar ook met OpenAI/OpenRouter/andere
// providers die `POST {baseUrl}/chat/completions` spreken. De sleutel staat
// lokaal in settings; together.ai stuurt `access-control-allow-origin: *`, dus
// de PWA kan rechtstreeks aanroepen zonder proxy.
//
// Twee invoerpaden:
//   text   → tekst-PDF (AH-app). Goedkoop en exact, geen image_url.
//   images → foto's/scans. Eén aanroep met alle pagina's van dezelfde bon.

import { GROUP_KEYS, RECEIPT_GROUPS, normalizeGroup } from './groups'

export const DEFAULT_BASE_URL = 'https://api.together.xyz/v1'
export const DEFAULT_MODEL = 'Qwen/Qwen3.5-9B'
export const TOLERANTIE = 0.05
const TIMEOUT_MS = 60_000
const MAX_TOKENS = 8000
const POGINGEN = 4        // together.ai geeft onder belasting regelmatig een 503 of verbreekt de verbinding

/** Fout met een `code` zodat de UI kan kiezen tussen "opnieuw" en "sleutel nakijken". */
export class ReceiptExtractError extends Error {
  constructor(code, message, opties = {}) {
    super(message)
    this.name = 'ReceiptExtractError'
    this.code = code                    // auth | network | parse | validation | quota
    this.status = opties.status ?? null
    this.cause = opties.cause ?? null
    this.detail = opties.detail ?? null
  }
}

// ─── Prompt ──────────────────────────────────────────────────────

const GROEPEN_REGEL = RECEIPT_GROUPS.map(g => `${g.key} (${g.label})`).join(', ')

// Bewust een verzonnen winkel/bedragen: een voorbeeld met echte waarden uit een
// testbon zou het model naar die waarden toe trekken (gemeten: het model
// noemde het voorbeeld letterlijk als "hint" in zijn redenering).
const SCHEMA_VOORBEELD = `{
  "merchant": "Naam van de winkel",
  "date": "2024-11-28",
  "time": "12:34",
  "currency": "EUR",
  "total": 4.15,
  "payment_method": "pin",
  "items": [
    { "name": "VOLKORENBROOD", "qty": 1, "unit_price": 2.19, "price": 2.19, "group": "brood_bakkerij" },
    { "name": "APPELS ELSTAR", "qty": 2, "unit_price": 1.48, "price": 2.96, "group": "groente_fruit" }
  ],
  "discounts": [
    { "name": "2E HALVE PRIJS APPELS", "amount": 1.00 }
  ]
}`

export const PROMPTS = {
  nl: {
    system: 'Je leest Nederlandse kassabonnen uit. Je antwoordt uitsluitend met geldige JSON, zonder uitleg en zonder markdown.',
    user: [
      'Lees deze kassabon uit en geef exact dit JSON-object terug:',
      SCHEMA_VOORBEELD,
      '',
      'Regels:',
      '1. "merchant" = de naam van de winkel, voluit geschreven. Leid hem af uit logo, adres of kenmerken (BONUSKAART/AIRMILES/AH = Albert Heijn, Jumbo, Lidl, Kruidvat, ...).',
      '2. "date" = ISO-datum JJJJ-MM-DD. Let op: op Nederlandse bonnen staat de dag eerst (10-9-2026 = 2026-09-10).',
      '3. "time" = HH:MM (24-uurs) of null.',
      '4. "total" = het eindbedrag achter TOTAAL, dus ná aftrek van kortingen.',
      '5. "items" bevat alleen echte productregels. Neem NIET op: SUBTOTAAL, TOTAAL, UW VOORDEEL, BONUS BOX, BTW-overzicht, spaarzegels, AIRMILES, bonuskaartnummers, terminalgegevens.',
      '6. Per regel: "qty" = aantal (standaard 1), "unit_price" = prijs per stuk, "price" = het bedrag van de hele regel. Staat er maar één bedrag, gebruik dat voor beide.',
      '7. Kortingsregels (bijvoorbeeld "40% K FUSILLI SALS -2,40", "BONUS", "2E HALVE PRIJS") horen in "discounts" met een POSITIEF bedrag, niet in "items".',
      '8. Statiegeld is een gewone regel in "items" met een positief bedrag en groep statiegeld_korting.',
      '9. "group" moet exact één van deze sleutels zijn: ' + GROEPEN_REGEL + '. Weet je het niet zeker: overig.',
      '10. Alle bedragen zijn getallen met een punt als decimaalteken (5.99, niet "5,99" of "€5,99").',
      '11. Controleer je werk: de som van alle "price" min de som van alle "amount" in discounts moet gelijk zijn aan "total".',
      '12. "payment_method" is precies één van: pin, contant, creditcard, apple pay, ideal, overig. Bankpas/Maestro/betaalpas = pin.',
      '13. Het voorbeeld hierboven is verzonnen. Neem er nooit waarden uit over. Kun je iets niet lezen, gebruik dan null (en een lege lijst voor items) — verzin nooit een winkel, datum of bedrag.',
      '14. Geef alleen het JSON-object terug, geen tekst eromheen.',
    ].join('\n'),
    tekstIntro: 'Dit is de uitgelezen tekst van de kassabon:',
    fotoIntro: 'Hieronder staan de foto\'s van één kassabon (mogelijk meerdere stukken van dezelfde bon).',
  },
  en: {
    system: 'You extract data from Dutch supermarket receipts. Respond with valid JSON only, no explanation, no markdown.',
    user: [
      'Extract this receipt and return exactly this JSON object:',
      SCHEMA_VOORBEELD,
      '',
      'Rules:',
      '1. "merchant" = the full store name. Infer it from the logo, address or markers (BONUSKAART/AIRMILES/AH = Albert Heijn, Jumbo, Lidl, Kruidvat, ...).',
      '2. "date" = ISO date YYYY-MM-DD. Dutch receipts print day first (10-9-2026 = 2026-09-10).',
      '3. "time" = HH:MM (24h) or null.',
      '4. "total" = the final amount after TOTAAL, i.e. after discounts.',
      '5. "items" contains product lines only. Do NOT include SUBTOTAAL, TOTAAL, UW VOORDEEL, BONUS BOX, VAT/BTW summaries, loyalty stamps, AIRMILES, loyalty card numbers or terminal details.',
      '6. Per line: "qty" = quantity (default 1), "unit_price" = price per unit, "price" = the line total. If only one amount is printed, use it for both.',
      '7. Discount lines (e.g. "40% K FUSILLI SALS -2,40", "BONUS", "2E HALVE PRIJS") belong in "discounts" with a POSITIVE amount, not in "items".',
      '8. Deposit ("statiegeld") is a normal item with a positive amount and group statiegeld_korting.',
      '9. "group" must be exactly one of these keys: ' + GROEPEN_REGEL + '. When unsure: overig.',
      '10. All amounts are numbers with a dot as decimal separator (5.99, not "5,99" or "€5,99").',
      '11. Check your work: the sum of all "price" minus the sum of all discount "amount" must equal "total".',
      '12. "payment_method" is exactly one of: pin, contant, creditcard, apple pay, ideal, overig. Bankpas/Maestro/debit card = pin.',
      '13. The example above is fictional. Never copy values from it. If you cannot read something, use null (and an empty list for items) — never invent a store, date or amount.',
      '14. Return only the JSON object, nothing else.',
    ].join('\n'),
    tekstIntro: 'This is the extracted text of the receipt:',
    fotoIntro: 'Below are photos of a single receipt (possibly multiple parts of the same receipt).',
  },
}

// ─── Parsers ─────────────────────────────────────────────────────

/**
 * Tolerante JSON-parser voor modeloutput: haalt ```json-blokken weg, negeert
 * inleidende tekst en herstelt de meest voorkomende slordigheden.
 * Gooit een ReceiptExtractError('parse') als er niets te redden valt.
 */
export function parseLooseJson(raw) {
  const tekst = String(raw ?? '').trim()
  if (!tekst) throw new ReceiptExtractError('parse', 'Het model gaf een leeg antwoord terug.')

  const kandidaten = []
  // 1. gefencede blokken (```json … ```)
  const fence = /```(?:json|JSON)?\s*([\s\S]*?)```/g
  let m
  while ((m = fence.exec(tekst)) !== null) kandidaten.push(m[1])
  // 2. het hele antwoord
  kandidaten.push(tekst)
  // 3. van de eerste { tot de laatste }
  const eerste = tekst.indexOf('{')
  const laatste = tekst.lastIndexOf('}')
  if (eerste !== -1 && laatste > eerste) kandidaten.push(tekst.slice(eerste, laatste + 1))
  // 4. gebalanceerd object vanaf de eerste {
  if (eerste !== -1) {
    const gebalanceerd = balanceerObject(tekst, eerste)
    if (gebalanceerd) kandidaten.push(gebalanceerd)
  }

  for (const kandidaat of kandidaten) {
    for (const variant of [kandidaat, opschonen(kandidaat)]) {
      const s = variant.trim()
      if (!s.startsWith('{') && !s.startsWith('[')) continue
      try {
        const v = JSON.parse(s)
        if (v && typeof v === 'object') return v
      } catch { /* volgende kandidaat */ }
    }
  }
  throw new ReceiptExtractError('parse', 'Het model gaf geen bruikbare JSON terug. Probeer het opnieuw of kies een ander model.', {
    detail: tekst.slice(0, 400),
  })
}

function balanceerObject(tekst, start) {
  let diepte = 0
  let inString = false
  let escape = false
  for (let i = start; i < tekst.length; i++) {
    const c = tekst[i]
    if (escape) { escape = false; continue }
    if (c === '\\') { escape = true; continue }
    if (c === '"') { inString = !inString; continue }
    if (inString) continue
    if (c === '{') diepte++
    else if (c === '}') {
      diepte--
      if (diepte === 0) return tekst.slice(start, i + 1)
    }
  }
  return null
}

function opschonen(s) {
  return String(s)
    .replace(/^\ufeff/, '')
    .replace(/,\s*([}\]])/g, '$1')              // trailing komma's
    .replace(/([:[,]\s*)'([^'\n]*)'/g, '$1"$2"') // enkele aanhalingstekens rond waarden
    .replace(/\bNaN\b|\bundefined\b/g, 'null')
    .replace(/(:\s*)(-?\d+),(\d{1,2})(\s*[,}\]])/g, '$1$2.$3$4') // 5,99 → 5.99
}

/** "€ 5,99" / "-2,40" / "5.99" / 5.99 → number (of null). */
export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  let s = String(v).trim().replace(/−/g, '-')
  if (!s) return null
  const negatief = /^\(.*\)$/.test(s) || s.includes('-')
  s = s.replace(/[^0-9.,]/g, '')
  if (!s) return null
  const laatsteKomma = s.lastIndexOf(',')
  const laatstePunt = s.lastIndexOf('.')
  if (laatsteKomma > laatstePunt) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return null
  return negatief ? -Math.abs(n) : n
}

export function rond(n) {
  const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100
  return r === 0 ? 0 : r   // geen -0 in opgeslagen data
}

/** Datum in allerlei notaties → ISO JJJJ-MM-DD (of null). */
export function parseDate(v) {
  if (!v) return null
  const s = String(v).trim()
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(m[1], m[2], m[3])
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    let jaar = m[3]
    if (jaar.length === 2) jaar = String(2000 + Number(jaar))
    // Nederlandse bonnen: dag eerst. Is het eerste getal > 12 dan is dat zeker.
    const a = Number(m[1]); const b = Number(m[2])
    if (a > 12 && b <= 12) return iso(jaar, m[2], m[1])
    return iso(jaar, m[2], m[1])
  }
  return null
}

function iso(j, m, d) {
  const jaar = Number(j); const maand = Number(m); const dag = Number(d)
  if (!(jaar >= 1990 && jaar <= 2100) || !(maand >= 1 && maand <= 12) || !(dag >= 1 && dag <= 31)) return null
  return `${jaar}-${String(maand).padStart(2, '0')}-${String(dag).padStart(2, '0')}`
}

export function parseTime(v) {
  if (!v) return null
  const m = String(v).match(/(\d{1,2})[:.](\d{2})/)
  if (!m) return null
  const u = Number(m[1]); const min = Number(m[2])
  if (u > 23 || min > 59) return null
  return `${String(u).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Genormaliseerde productnaam voor zoeken en prijshistorie. */
export function nameKey(naam) {
  return String(naam ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const KORTING_PATROON = /(korting|bonus|voordeel|actie|discount|2e\s*halve|%\s*k\b|kado|gratis)/i

// ─── Normalisatie & validatie ────────────────────────────────────

/** Ruwe modeloutput → het vaste bon-object dat de app opslaat. */
export function normalizeReceipt(ruw) {
  const obj = (ruw && typeof ruw === 'object' && !Array.isArray(ruw)) ? ruw : {}
  const bron = obj.receipt && typeof obj.receipt === 'object' ? obj.receipt : obj

  const items = []
  const uitItems = []
  for (const r of toArray(bron.items ?? bron.lines ?? bron.products)) {
    if (!r || typeof r !== 'object') continue
    const naam = String(r.name ?? r.description ?? r.omschrijving ?? '').trim()
    const prijs = parseAmount(r.price ?? r.amount ?? r.total ?? r.bedrag)
    const stuk = parseAmount(r.unit_price ?? r.unitPrice ?? r.prijs)
    const aantal = parseAmount(r.qty ?? r.quantity ?? r.aantal)
    if (!naam && prijs == null) continue

    const expliciet = r.is_discount === true || r.isDiscount === true || r.discount === true
    const isDiscount = expliciet || (prijs != null && prijs < 0)
    const qty = aantal != null && aantal > 0 ? aantal : 1
    const price = prijs != null ? rond(prijs) : (stuk != null ? rond(stuk * qty) : null)
    const unitPrice = stuk != null ? rond(stuk) : (price != null ? rond(price / qty) : null)

    const item = {
      name: naam,
      nameKey: nameKey(naam),
      qty,
      unitPrice,
      price,
      group: normalizeGroup(r.group ?? r.category ?? r.groep),
      isDiscount,
    }
    if (isDiscount) {
      item.group = 'statiegeld_korting'
      if (item.price != null && item.price > 0) item.price = -item.price
      if (item.unitPrice != null && item.unitPrice > 0) item.unitPrice = -item.unitPrice
      uitItems.push({ name: naam, amount: Math.abs(item.price ?? 0) })
    }
    items.push(item)
  }

  // Kortingen: het model mag ze los aanleveren én als negatieve regel. Beide
  // meetellen zou dubbel aftrekken, dus dedupliceren op naam + bedrag.
  const discounts = []
  const gezien = new Set()
  const voegToe = d => {
    const amount = Math.abs(rond(d.amount ?? 0))
    if (!amount) return
    const sleutel = `${nameKey(d.name)}|${amount.toFixed(2)}`
    if (gezien.has(sleutel)) return
    gezien.add(sleutel)
    discounts.push({ name: String(d.name ?? 'Korting').trim() || 'Korting', amount })
  }
  for (const d of toArray(bron.discounts ?? bron.kortingen)) {
    if (!d) continue
    if (typeof d === 'number') { voegToe({ name: 'Korting', amount: d }); continue }
    voegToe({ name: d.name ?? d.description ?? d.omschrijving ?? 'Korting', amount: parseAmount(d.amount ?? d.price ?? d.value ?? d.bedrag) })
  }
  for (const d of uitItems) voegToe(d)

  const bon = {
    merchant: String(bron.merchant ?? bron.store ?? bron.winkel ?? '').trim() || null,
    date: parseDate(bron.date ?? bron.datum),
    time: parseTime(bron.time ?? bron.tijd),
    total: parseAmount(bron.total ?? bron.totaal ?? bron.amount) ?? null,
    currency: String(bron.currency ?? bron.valuta ?? 'EUR').trim().toUpperCase().slice(0, 3) || 'EUR',
    items,
    discounts,
    paymentMethod: normaliseerBetaalwijze(bron.payment_method ?? bron.paymentMethod ?? bron.betaalwijze),
  }
  if (bon.total != null) bon.total = rond(Math.abs(bon.total))
  return bon
}

function toArray(v) {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') return Object.values(v)
  return []
}

function normaliseerBetaalwijze(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s) return null
  if (/pin|maestro|debit|debet|bankpas|betaalpas/.test(s)) return 'pin'
  if (/contant|cash/.test(s)) return 'contant'
  if (/credit|visa|mastercard/.test(s)) return 'creditcard'
  if (/apple\s*pay/.test(s)) return 'apple pay'
  if (/ideal/.test(s)) return 'ideal'
  return String(v).trim().slice(0, 30)
}

/**
 * Σ prijzen − Σ kortingen ≈ total.
 * @returns {{ itemsSum: number, discountSum: number, diff: number, ok: boolean, reden: string|null }}
 */
export function validateReceipt(bon, tolerantie = TOLERANTIE) {
  const items = Array.isArray(bon?.items) ? bon.items : []
  const discounts = Array.isArray(bon?.discounts) ? bon.discounts : []
  const itemsSum = rond(items.filter(i => !i.isDiscount).reduce((s, i) => s + (Number(i.price) || 0), 0))
  const discountSum = rond(discounts.reduce((s, d) => s + Math.abs(Number(d.amount) || 0), 0))
  // let op: Number(null) is 0 en dus "finite" — expliciet op null/undefined testen
  const total = bon?.total == null ? NaN : Number(bon.total)

  if (!Number.isFinite(total)) {
    return { itemsSum, discountSum, diff: null, ok: false, reden: 'geen totaalbedrag' }
  }
  if (items.length === 0) {
    return { itemsSum, discountSum, diff: rond(-total), ok: false, reden: 'geen regels' }
  }
  const diff = rond(itemsSum - discountSum - total)
  return {
    itemsSum,
    discountSum,
    diff,
    ok: Math.abs(diff) <= tolerantie + 1e-9,
    reden: Math.abs(diff) <= tolerantie + 1e-9 ? null : 'som wijkt af van het totaal',
  }
}

// ─── HTTP ────────────────────────────────────────────────────────

function base64VanBuffer(ab) {
  const bytes = new Uint8Array(ab)
  const B = globalThis.Buffer
  if (B) return B.from(bytes).toString('base64')
  let s = ''
  const stap = 0x8000
  for (let i = 0; i < bytes.length; i += stap) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + stap))
  }
  return globalThis.btoa(s)
}

async function naarDataUrl(bron) {
  if (typeof bron === 'string') return bron
  if (bron && typeof bron.arrayBuffer === 'function') {
    const ab = await bron.arrayBuffer()
    const type = bron.type && bron.type.startsWith('image/') ? bron.type : 'image/jpeg'
    return `data:${type};base64,${base64VanBuffer(ab)}`
  }
  throw new ReceiptExtractError('parse', 'Onbekend afbeeldingsformaat voor het uitlezen van de bon.')
}

function foutVanStatus(status, body) {
  const kort = String(body ?? '').slice(0, 300)
  if (status === 401 || status === 403) {
    return new ReceiptExtractError('auth', 'De API-sleutel werd geweigerd. Controleer hem bij Instellingen → AI & bonnetjes.', { status, detail: kort })
  }
  if (status === 402 || status === 429) {
    return new ReceiptExtractError('quota', 'Het tegoed of de limiet van de AI-dienst is bereikt. Probeer het later opnieuw.', { status, detail: kort })
  }
  return new ReceiptExtractError('network', `De AI-dienst gaf een fout terug (${status}).`, { status, detail: kort })
}

async function chatCompletion({ baseUrl, apiKey, model, messages, jsonMode, denkenUit, signal, timeoutMs, maxTokens }) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`
  const body = {
    model,
    messages,
    temperature: 0,
    // Ruim bemeten: redeneermodellen (Qwen3.5) schrijven eerst een paar duizend
    // tokens gedachten en pas daarna de JSON. Met 3000 liep dat structureel
    // tegen `finish_reason: length` aan en kwam er een leeg antwoord terug.
    max_tokens: maxTokens ?? MAX_TOKENS,
  }
  if (jsonMode) body.response_format = { type: 'json_object' }
  // Redeneermodellen (Qwen3.x) schrijven anders duizenden tokens gedachten
  // vóór de JSON. Gemeten op de AH-bon: 77 s / 8000 tokens / geen antwoord mét
  // denken, tegenover 3 s / 259 tokens / correct antwoord zonder. Providers die
  // deze parameter niet kennen geven 400; dan proberen we het zonder.
  if (denkenUit) body.chat_template_kwargs = { enable_thinking: false }

  const ctrl = new AbortController()
  let verlopen = false
  const timer = setTimeout(() => { verlopen = true; ctrl.abort() }, timeoutMs ?? TIMEOUT_MS)
  const doorgeven = () => ctrl.abort()
  if (signal) {
    if (signal.aborted) ctrl.abort()
    else signal.addEventListener('abort', doorgeven, { once: true })
  }

  const start = Date.now()
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
  } catch (err) {
    if (verlopen) {
      throw new ReceiptExtractError('network', 'Het uitlezen duurde te lang (60 seconden). Probeer het opnieuw of maak een kleinere foto.', { cause: err })
    }
    if (signal?.aborted) throw new ReceiptExtractError('network', 'Het uitlezen is afgebroken.', { cause: err })
    throw new ReceiptExtractError('network', 'Geen verbinding met de AI-dienst. Controleer je internetverbinding.', { cause: err })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener?.('abort', doorgeven)
  }

  const tekst = await res.text()
  if (!res.ok) throw foutVanStatus(res.status, tekst)

  let json
  try {
    json = JSON.parse(tekst)
  } catch (err) {
    throw new ReceiptExtractError('parse', 'De AI-dienst gaf een onleesbaar antwoord terug.', { cause: err, detail: tekst.slice(0, 300) })
  }
  return { json, latencyMs: Date.now() - start }
}

/** Herhaalt bij tijdelijke fouten (429/5xx) met oplopende wachttijd. */
async function chatCompletionMetHerhaling(opties) {
  let laatste
  for (let poging = 1; poging <= POGINGEN; poging++) {
    try {
      return await chatCompletion(opties)
    } catch (err) {
      const tijdelijk = err instanceof ReceiptExtractError && (
        err.status === 429 ||
        (err.status >= 500 && err.status < 600) ||
        // verbroken verbinding: wel opnieuw proberen, maar niet na een timeout
        // of nadat de gebruiker zelf afbrak
        (err.code === 'network' && err.status === null && !/te lang|afgebroken/.test(err.message))
      )
      if (!tijdelijk || poging === POGINGEN || opties.signal?.aborted) throw err
      laatste = err
      await new Promise(r => setTimeout(r, 1500 * 2 ** (poging - 1)))
    }
  }
  throw laatste
}

// Een provider die een parameter niet kent, antwoordt met 400/422. We kunnen
// niet uit de tekst afleiden wélke parameter dat is (together.ai zegt alleen
// "Input validation error"), dus vallen we stap voor stap terug op een kalere
// request.
function parameterGeweigerd(err) {
  return err instanceof ReceiptExtractError && (err.status === 400 || err.status === 422)
}

// ─── Publieke API ────────────────────────────────────────────────

/**
 * Leest één bon uit.
 *
 * @param {object} opties
 * @param {Blob[]|string[]} [opties.images]  foto's (Blob) of data-URL's; alle pagina's van dezelfde bon
 * @param {string}          [opties.text]    bontekst (uit een tekst-PDF); dan gaat er géén image_url mee
 * @param {{baseUrl:string, apiKey:string, model:string}} opties.ai
 * @param {AbortSignal}     [opties.signal]
 * @param {'nl'|'en'}       [opties.language='nl']
 * @param {'auto'|'on'|'off'} [opties.jsonMode='auto']
 * @param {boolean}         [opties.thinking=false]  laat een redeneermodel hardop denken (trager en duurder)
 * @param {number}          [opties.maxTokens=8000]
 * @returns {Promise<object>} bon + raw + validation
 */
export async function extractReceipt({
  images,
  text,
  ai,
  signal,
  language = 'nl',
  jsonMode = 'auto',
  thinking = false,
  timeoutMs = TIMEOUT_MS,
  maxTokens = MAX_TOKENS,
} = {}) {
  const baseUrl = ai?.baseUrl || DEFAULT_BASE_URL
  const model = ai?.model || DEFAULT_MODEL
  const apiKey = ai?.apiKey
  if (!apiKey) {
    throw new ReceiptExtractError('auth', 'Er is nog geen API-sleutel ingesteld. Vul hem in bij Instellingen → AI & bonnetjes.')
  }

  const plaatjes = (images ?? []).filter(Boolean)
  const bontekst = typeof text === 'string' ? text.trim() : ''
  if (plaatjes.length === 0 && !bontekst) {
    throw new ReceiptExtractError('validation', 'Er is geen bon meegegeven om uit te lezen.')
  }

  const p = PROMPTS[language] ?? PROMPTS.nl
  const messages = [{ role: 'system', content: p.system }]

  // Let op: stuur bij voorkeur JPEG. MiniMax-M3 antwoordt op een PNG-data-URL
  // met 503 "Service unavailable" terwijl dezelfde bon als JPEG wél werkt.
  if (plaatjes.length > 0) {
    const inhoud = [{ type: 'text', text: `${p.user}\n\n${p.fotoIntro}` }]
    for (const bron of plaatjes) {
      inhoud.push({ type: 'image_url', image_url: { url: await naarDataUrl(bron) } })
    }
    if (bontekst) inhoud.push({ type: 'text', text: `${p.tekstIntro}\n${bontekst}` })
    messages.push({ role: 'user', content: inhoud })
  } else {
    messages.push({ role: 'user', content: `${p.user}\n\n${p.tekstIntro}\n"""\n${bontekst}\n"""` })
  }

  // Van rijk naar kaal: json_object + denken-uit → json_object → niets extra's.
  const pogingen = []
  const startJson = jsonMode !== 'off'
  pogingen.push({ jsonMode: startJson, denkenUit: thinking === false })
  if (thinking === false) pogingen.push({ jsonMode: startJson, denkenUit: false })
  if (startJson && jsonMode === 'auto') pogingen.push({ jsonMode: false, denkenUit: false })

  let antwoord = null
  let gebruikt = pogingen[0]
  let laatsteFout = null
  for (let i = 0; i < pogingen.length; i++) {
    try {
      antwoord = await chatCompletionMetHerhaling({ baseUrl, apiKey, model, messages, ...pogingen[i], signal, timeoutMs, maxTokens })
      gebruikt = pogingen[i]
      break
    } catch (err) {
      laatsteFout = err
      if (i === pogingen.length - 1 || !parameterGeweigerd(err) || signal?.aborted) throw err
    }
  }
  if (!antwoord) throw laatsteFout
  const gebruiktJsonMode = gebruikt.jsonMode

  const keuze = antwoord.json?.choices?.[0]
  const inhoud = keuze?.message?.content
  const tekstAntwoord = Array.isArray(inhoud)
    ? inhoud.map(c => (typeof c === 'string' ? c : c?.text ?? '')).join('')
    : String(inhoud ?? '')

  if (!tekstAntwoord.trim() && keuze?.finish_reason === 'length') {
    throw new ReceiptExtractError('parse', 'Het model bleef te lang nadenken en kwam niet aan een antwoord toe. Probeer het opnieuw of kies een ander model.', {
      detail: `finish_reason=length, completion_tokens=${antwoord.json?.usage?.completion_tokens ?? '?'}`,
    })
  }

  const ruw = parseLooseJson(tekstAntwoord)
  const bon = normalizeReceipt(ruw)
  const validation = validateReceipt(bon)

  if (bon.total == null && bon.items.length === 0) {
    throw new ReceiptExtractError('validation', 'Er is geen bon herkend in deze afbeelding. Probeer een scherpere of rechtere foto.', {
      detail: tekstAntwoord.slice(0, 300),
    })
  }

  return {
    ...bon,
    raw: {
      model: antwoord.json?.model ?? model,
      usage: antwoord.json?.usage ?? null,
      latencyMs: antwoord.latencyMs,
      finishReason: keuze?.finish_reason ?? null,
      jsonMode: gebruiktJsonMode,
      thinking: !gebruikt.denkenUit,
      language,
      inputType: plaatjes.length > 0 ? 'image' : 'text',
      content: tekstAntwoord,
    },
    validation,
  }
}

export { GROUP_KEYS }
