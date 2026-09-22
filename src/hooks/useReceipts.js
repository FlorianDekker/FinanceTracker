// Alles wat met bonnetjes te maken heeft: toevoegen (camera, bestand, PDF,
// klembord), uitlezen via de AI-dienst, corrigeren, koppelen aan een transactie
// en opruimen.
//
// Opzet zoals `useClaims.js`: losse async functies op moduleniveau (testbaar en
// overal aanroepbaar) plus een `useReceipts()`-hook die de live queries levert.

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { recordEvent, normalizeMerchant } from '../utils/merchantLearning'
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  ReceiptExtractError,
  extractReceipt,
  nameKey as productKey,
  rond,
  validateReceipt,
} from '../utils/receipts/extract'
import { downscaleImage, isWaarschijnlijkHeic, makeThumb } from '../utils/receipts/image'
import { extractPdfText, renderPdfPage } from '../utils/receipts/pdfText'
import { normalizeGroup } from '../utils/receipts/groups'
import { bestMatch, findTransactionCandidates } from '../utils/receipts/match'
import { receiptItemRows } from '../utils/receipts/items'
import { matchDiscounts } from '../utils/receipts/discounts'
import { receiptImageBytes } from '../utils/backup'

/* ------------------------------------------------------------------ *
 * Instellingen                                                         *
 * ------------------------------------------------------------------ */

// Let op: `isSecretSettingKey` in backup.js weert elke sleutel die met 'ai'
// begint. Zowel `ai` (baseUrl + model) als `aiApiKey` blijven dus vanzelf
// buiten backups — dat is precies de bedoeling voor de sleutel, en voor de
// baseUrl/het model is het onschuldig (die staan zo weer goed).
export const AI_SETTING = 'ai'
export const AI_KEY_SETTING = 'aiApiKey'
export const STORE_IMAGES_SETTING = 'receiptStoreImages'
export const STATS_SETTING = 'receiptStats'
export const GROUP_OVERRIDES_SETTING = 'receiptGroupOverrides'
export const DISCOUNT_LINKS_SETTING = 'receiptDiscountLinks'
export const PERSIST_SETTING = 'receiptPersistRequested'

export const RECEIPT_STATUSES = ['new', 'extracting', 'extracted', 'review', 'linked', 'error']

export const RECEIPT_STATUS_LABELS = {
  new: 'Nog niet uitgelezen',
  extracting: 'Bezig met uitlezen…',
  extracted: 'Uitgelezen',
  review: 'Te controleren',
  linked: 'Gekoppeld',
  error: 'Mislukt',
}

// Prijs per miljoen tokens (together.ai, gemeten september 2026).
export const MODEL_OPTIONS = [
  { id: 'Qwen/Qwen3.5-9B', label: 'Qwen 3.5 9B', hint: 'standaard · snel en goedkoop', in: 0.17, out: 0.25 },
  { id: 'MiniMaxAI/MiniMax-M3', label: 'MiniMax M3', hint: 'tweede kans bij een lastige bon', in: 0.3, out: 1.2 },
  { id: 'moonshotai/Kimi-K3', label: 'Kimi K3', hint: 'groot model, duurder', in: 0.6, out: 2.5 },
]

export const PROVIDER_PRESETS = [
  { id: 'together', label: 'Together.ai', baseUrl: 'https://api.together.xyz/v1', model: DEFAULT_MODEL },
  { id: 'custom', label: 'OpenAI-compatible (aangepast)', baseUrl: '', model: '' },
]

const DEFAULT_AI = { baseUrl: DEFAULT_BASE_URL, apiKey: '', model: DEFAULT_MODEL }
const DEFAULT_STATS = { count: 0, tokensIn: 0, tokensOut: 0, estCost: 0 }

export async function getAiConfig() {
  const [cfg, key] = await Promise.all([db.settings.get(AI_SETTING), db.settings.get(AI_KEY_SETTING)])
  const value = cfg?.value ?? {}
  return {
    baseUrl: String(value.baseUrl ?? '').trim() || DEFAULT_AI.baseUrl,
    model: String(value.model ?? '').trim() || DEFAULT_AI.model,
    // De sleutel staat apart opgeslagen; oude/handmatige rijen met de sleutel in
    // het `ai`-object blijven werken.
    apiKey: String(key?.value ?? value.apiKey ?? ''),
  }
}

/** Slaat baseUrl/model op in `ai` en de sleutel los in `aiApiKey`. */
export async function setAiConfig(patch = {}) {
  const huidig = await getAiConfig()
  const next = { ...huidig, ...patch }
  await db.settings.put({ key: AI_SETTING, value: { baseUrl: next.baseUrl, model: next.model } })
  if ('apiKey' in patch) await db.settings.put({ key: AI_KEY_SETTING, value: String(patch.apiKey ?? '') })
  return next
}

export async function getStoreImages() {
  const row = await db.settings.get(STORE_IMAGES_SETTING)
  return row?.value !== false          // standaard aan
}

export async function setStoreImages(value) {
  await db.settings.put({ key: STORE_IMAGES_SETTING, value: value !== false })
  return value !== false
}

export async function getReceiptStats() {
  const row = await db.settings.get(STATS_SETTING)
  return { ...DEFAULT_STATS, ...(row?.value ?? {}) }
}

export async function getGroupOverrides() {
  const row = await db.settings.get(GROUP_OVERRIDES_SETTING)
  const value = row?.value
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

/** Onthoudt een handmatig gekozen groep per genormaliseerde productnaam. */
export async function setGroupOverride(nameKey, group) {
  const key = String(nameKey ?? '').trim()
  if (!key) return null
  const overrides = await getGroupOverrides()
  overrides[key] = normalizeGroup(group)
  await db.settings.put({ key: GROUP_OVERRIDES_SETTING, value: overrides })
  return overrides
}

/** Geleerde groepen winnen altijd van wat het model verzint. */
export function applyGroupOverrides(items, overrides = {}) {
  return (Array.isArray(items) ? items : []).map(item => {
    const key = item?.nameKey || productKey(item?.name)
    const geleerd = overrides[key]
    return geleerd ? { ...item, nameKey: key, group: normalizeGroup(geleerd) } : { ...item, nameKey: key }
  })
}

export async function getDiscountLinks() {
  const row = await db.settings.get(DISCOUNT_LINKS_SETTING)
  const value = row?.value
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

/**
 * Onthoudt met welk product een korting hoort, per genormaliseerde kortings-
 * naam. `itemNameKey = null` betekent expliciet "los" (geen product) — dat
 * voorkomt dat de heuristiek diezelfde koppeling steeds opnieuw voorstelt.
 */
export async function setDiscountLink(discountNameKey, itemNameKey) {
  const key = String(discountNameKey ?? '').trim()
  if (!key) return null
  const links = await getDiscountLinks()
  links[key] = itemNameKey ? String(itemNameKey) : null
  await db.settings.put({ key: DISCOUNT_LINKS_SETTING, value: links })
  return links
}

/* ------------------------------------------------------------------ *
 * Foutmeldingen in het Nederlands                                      *
 * ------------------------------------------------------------------ */

const FOUT_TEKSTEN = {
  auth: 'De AI-sleutel ontbreekt of wordt geweigerd.',
  quota: 'Het tegoed of de limiet van de AI-dienst is bereikt.',
  network: 'Geen verbinding met de AI-dienst.',
  parse: 'Het antwoord van het model was niet te lezen.',
  validation: 'Er is geen bon herkend.',
}

/** @returns {{ code: string|null, message: string, needsSettings: boolean }} */
export function receiptErrorMessage(err) {
  const code = err instanceof ReceiptExtractError ? err.code : null
  return {
    code,
    message: err?.message || FOUT_TEKSTEN[code] || 'Er ging iets mis bij het uitlezen van deze bon.',
    needsSettings: code === 'auth',
  }
}

/* ------------------------------------------------------------------ *
 * Opslag                                                               *
 * ------------------------------------------------------------------ */

export async function storageEstimate() {
  const [count, bytes] = await Promise.all([db.receipts.count(), receiptImageBytes()])
  let usage = null
  let quota = null
  let persisted = null
  const opslag = typeof navigator !== 'undefined' ? navigator.storage : null
  if (opslag?.estimate) {
    try {
      const e = await opslag.estimate()
      usage = e?.usage ?? null
      quota = e?.quota ?? null
    } catch { /* Safari geeft dit soms niet vrij */ }
  }
  if (opslag?.persisted) {
    try { persisted = await opslag.persisted() } catch { /* idem */ }
  }
  const freeRatio = usage != null && quota ? Math.max(0, 1 - usage / quota) : null
  return { count, bytes, usage, quota, persisted, freeRatio }
}

/**
 * Vraagt iOS/Chrome om de opslag niet zomaar op te ruimen. Eén keer per
 * installatie; het antwoord onthouden we zodat we de gebruiker niet blijven
 * lastigvallen.
 */
export async function requestPersist() {
  const opslag = typeof navigator !== 'undefined' ? navigator.storage : null
  if (!opslag?.persist) return null
  const eerder = await db.settings.get(PERSIST_SETTING)
  if (eerder?.value != null) return eerder.value
  let ok = null
  try { ok = await opslag.persist() } catch { ok = null }
  await db.settings.put({ key: PERSIST_SETTING, value: ok })
  return ok
}

/* ------------------------------------------------------------------ *
 * Bon opslaan                                                          *
 * ------------------------------------------------------------------ */

/**
 * Spiegelt `receipt.items` naar de tabel `receiptItems`.
 * Elke schrijfactie op een bon loopt hierlangs, zodat de twee nooit uit de pas
 * lopen. Bij het verwijderen van een bon gaan de regels dezelfde weg.
 */
export async function syncReceiptItems(receipt) {
  if (!receipt || receipt.id == null) return 0
  const rijen = receiptItemRows(receipt)
  await db.receiptItems.where('receiptId').equals(receipt.id).delete()
  if (rijen.length) await db.receiptItems.bulkAdd(rijen)
  return rijen.length
}

function discountTotalVan(receipt) {
  const uitKortingen = (Array.isArray(receipt?.discounts) ? receipt.discounts : [])
    .reduce((s, d) => s + Math.abs(Number(d?.amount) || 0), 0)
  return rond(uitKortingen)
}

function statusVoor(receipt) {
  if (receipt.transactionId != null) return 'linked'
  if (receipt.extractedAt == null) return 'new'
  return receipt.validation?.ok === false ? 'review' : 'extracted'
}

function isPdf(file) {
  return (file?.type ?? '').includes('pdf') || /\.pdf$/i.test(file?.name ?? '')
}

async function nieuweBon(data) {
  const nu = Date.now()
  const id = await db.receipts.add({
    transactionId: data.transactionId ?? null,
    source: data.source ?? 'file',
    pages: data.pages ?? [],
    pdf: data.pdf ?? null,
    thumb: data.thumb ?? null,
    capturedAt: nu,
    merchant: null,
    merchantKey: '',
    date: null,
    time: null,
    total: null,
    currency: 'EUR',
    items: [],
    discounts: [],
    discountTotal: 0,
    rawText: data.rawText ?? '',
    model: null,
    extractedAt: null,
    status: 'new',
    error: null,
  })
  // Bij de eerste bon meteen om persistente opslag vragen.
  requestPersist().catch(() => {})
  return id
}

/**
 * Voegt foto's en/of PDF's toe. Meerdere afbeeldingen in één keer gelden als
 * meerdere stukken van dezelfde bon (zo leest het model ze ook uit); elke PDF
 * wordt een eigen bon.
 *
 * @returns {Promise<number[]>} de id's van de aangemaakte bonnen
 */
export async function addReceiptFromFiles(files, source = 'file', { transactionId = null } = {}) {
  const lijst = Array.from(files ?? []).filter(Boolean)
  if (!lijst.length) throw new Error('Er is geen bestand gekozen.')

  const ids = []
  const afbeeldingen = []
  for (const file of lijst) {
    if (isPdf(file)) ids.push(await addReceiptFromPdf(file, { transactionId }))
    else afbeeldingen.push(file)
  }
  if (afbeeldingen.length) {
    const pages = []
    for (const file of afbeeldingen) {
      try {
        pages.push(await downscaleImage(file, { maxSide: 1600, quality: 0.8 }))
      } catch (err) {
        if (isWaarschijnlijkHeic(file)) {
          throw new Error('Deze HEIC-foto kon niet worden gelezen. Maak in Instellingen → Camera → Formaten de keuze "Meest compatibel", of deel de foto als JPEG.')
        }
        throw err
      }
    }
    ids.push(await nieuweBon({ source, pages, thumb: await makeThumb(pages[0]), transactionId }))
  }
  return ids
}

/**
 * Een tekst-PDF (de AH-app levert die) wordt zowel gerenderd als uitgelezen:
 * het beeld geeft de layout en het logo, de tekst de exacte bedragen. Gemeten
 * scoorde die combinatie als enige in alle varianten 10/10.
 */
export async function addReceiptFromPdf(file, { transactionId = null } = {}) {
  const buffer = await file.arrayBuffer()
  let rawText = ''
  try {
    const uit = await extractPdfText(buffer)
    rawText = uit.isTextPdf ? uit.text : ''
  } catch { /* scan-PDF of kapotte PDF: dan alleen het beeld */ }

  const pages = []
  let thumb = null
  try {
    const beeld = await renderPdfPage(buffer, { page: 1, maxSide: 1600, quality: 0.8 })
    pages.push(beeld)
    thumb = await makeThumb(beeld)
  } catch (err) {
    if (!rawText) throw new Error(`Deze PDF kon niet worden gelezen: ${err.message}`)
  }

  return nieuweBon({
    source: 'pdf',
    pages,
    pdf: new Blob([buffer], { type: 'application/pdf' }),
    thumb,
    rawText,
    transactionId,
  })
}

/**
 * De iPhone-route: de Shortcut zet het bonnetje op het klembord, hier halen we
 * het eraf. iOS levert `image/png`; MiniMax weigert PNG-data-URL's, dus alles
 * gaat sowieso door de canvas-omzetting naar JPEG.
 */
export async function addReceiptFromClipboard({ transactionId = null } = {}) {
  if (!navigator?.clipboard?.read) {
    throw new Error('Deze browser kan het klembord niet uitlezen. Gebruik "Uit bestand" of maak een foto.')
  }
  let items
  try {
    items = await navigator.clipboard.read()
  } catch (err) {
    throw new Error(`Het klembord kon niet worden gelezen: ${err?.message ?? 'geen toestemming'}.`)
  }
  const blobs = []
  for (const item of items ?? []) {
    const type = (item.types ?? []).find(t => t === 'image/png' || t === 'image/jpeg' || t.startsWith('image/'))
    if (!type) continue
    blobs.push(await item.getType(type))
  }
  if (!blobs.length) {
    throw new Error('Er staat geen afbeelding op het klembord. Deel de bon eerst via de Shortcut "Naar Budget".')
  }
  return addReceiptFromFiles(blobs, 'paste', { transactionId })
}

/**
 * Plak-vangnet: het `paste`-event levert de afbeelding zonder extra
 * toestemmingsvraag, omdat de plakactie zelf de toestemming is.
 */
export async function addReceiptFromPasteEvent(event, { transactionId = null } = {}) {
  const items = Array.from(event?.clipboardData?.items ?? [])
  const blobs = items.filter(i => i.kind === 'file' && (i.type ?? '').startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
  if (!blobs.length) return []
  return addReceiptFromFiles(blobs, 'paste', { transactionId })
}

/* ------------------------------------------------------------------ *
 * Uitlezen                                                             *
 * ------------------------------------------------------------------ */

function kostenVan(usage, model) {
  const prijs = MODEL_OPTIONS.find(m => m.id === model) ?? { in: 0.2, out: 0.6 }
  const inTok = Number(usage?.prompt_tokens) || 0
  const uitTok = Number(usage?.completion_tokens) || 0
  return { inTok, uitTok, cost: (inTok * prijs.in + uitTok * prijs.out) / 1_000_000 }
}

async function telStatsOp(usage, model) {
  const { inTok, uitTok, cost } = kostenVan(usage, model)
  const huidig = await getReceiptStats()
  const value = {
    count: (huidig.count ?? 0) + 1,
    tokensIn: (huidig.tokensIn ?? 0) + inTok,
    tokensOut: (huidig.tokensOut ?? 0) + uitTok,
    estCost: Math.round(((huidig.estCost ?? 0) + cost) * 1e6) / 1e6,
  }
  await db.settings.put({ key: STATS_SETTING, value })
  return value
}

/**
 * Leest één bon uit en slaat het resultaat op.
 * Status: `extracting` → `extracted` (validatie klopt) of `review` (verschil).
 * Mislukt het, dan blijft de bon staan met status `error` en een NL-melding.
 */
export async function extractReceiptById(receiptId, { model, signal, language = 'nl' } = {}) {
  const bon = await db.receipts.get(receiptId)
  if (!bon) throw new Error('Deze bon bestaat niet meer.')

  const ai = await getAiConfig()
  if (!ai.apiKey) {
    throw new ReceiptExtractError('auth', 'Er is nog geen API-sleutel ingesteld. Vul hem in bij Instellingen → AI & bonnetjes.')
  }
  const gekozenModel = model || ai.model
  await db.receipts.update(receiptId, { status: 'extracting', error: null })

  try {
    const uit = await extractReceipt({
      images: bon.pages ?? [],
      text: bon.rawText || undefined,
      ai: { ...ai, model: gekozenModel },
      signal,
      language,
    })

    const items = applyGroupOverrides(uit.items, await getGroupOverrides())
    const discounts = matchDiscounts(items, uit.discounts, { learned: await getDiscountLinks() })
    const validation = validateReceipt({ ...uit, items })
    const patch = {
      merchant: uit.merchant,
      // normalizeMerchant geeft { merchantKey, baseKey, tokens } terug; alleen
      // de string hoort in de index.
      merchantKey: uit.merchant ? normalizeMerchant(uit.merchant).merchantKey : '',
      date: uit.date,
      time: uit.time,
      total: uit.total,
      currency: uit.currency,
      items,
      discounts,
      discountTotal: discountTotalVan({ discounts }),
      validation,
      model: uit.raw?.model ?? gekozenModel,
      extractedAt: Date.now(),
      error: null,
    }
    patch.status = statusVoor({ ...bon, ...patch })

    // Alleen tekst bewaren: na een geslaagde uitlezing mogen de foto's weg.
    if (!(await getStoreImages())) {
      patch.pages = []
      patch.pdf = null
      patch.thumb = null
    }

    await db.receipts.update(receiptId, patch)
    const bijgewerkt = { ...bon, ...patch, id: receiptId }
    await syncReceiptItems(bijgewerkt)
    await telStatsOp(uit.raw?.usage, gekozenModel)
    return bijgewerkt
  } catch (err) {
    const { message } = receiptErrorMessage(err)
    await db.receipts.update(receiptId, { status: 'error', error: message })
    throw err
  }
}

/** Kleine tekst-only aanroep om sleutel, baseUrl en model te controleren. */
export async function testAiConnection({ baseUrl, apiKey, model } = {}) {
  const ai = { ...(await getAiConfig()), ...Object.fromEntries(Object.entries({ baseUrl, apiKey, model }).filter(([, v]) => v != null && v !== '')) }
  if (!ai.apiKey) throw new ReceiptExtractError('auth', 'Vul eerst een API-sleutel in.')
  const start = Date.now()
  const res = await fetch(`${String(ai.baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
    body: JSON.stringify({
      model: ai.model,
      messages: [{ role: 'user', content: 'Antwoord met exact het woord: ok' }],
      max_tokens: 8,
      temperature: 0,
      chat_template_kwargs: { enable_thinking: false },
    }),
  }).catch(err => {
    throw new ReceiptExtractError('network', 'Geen verbinding met de AI-dienst. Controleer de URL en je internetverbinding.', { cause: err })
  })
  const tekst = await res.text()
  if (res.status === 401 || res.status === 403) {
    throw new ReceiptExtractError('auth', 'De API-sleutel werd geweigerd.', { status: res.status, detail: tekst.slice(0, 200) })
  }
  if (!res.ok) {
    throw new ReceiptExtractError('network', `De AI-dienst gaf een fout terug (${res.status}).`, { status: res.status, detail: tekst.slice(0, 200) })
  }
  let antwoord = ''
  try { antwoord = JSON.parse(tekst)?.choices?.[0]?.message?.content ?? '' } catch { /* niet erg */ }
  return { ok: true, latencyMs: Date.now() - start, model: ai.model, answer: String(antwoord).trim().slice(0, 40) }
}

/* ------------------------------------------------------------------ *
 * Corrigeren                                                           *
 * ------------------------------------------------------------------ */

function normaliseerItem(item) {
  const naam = String(item?.name ?? '').trim()
  const qty = Number(item?.qty)
  const price = item?.price == null || item.price === '' ? null : rond(Number(item.price))
  const unitPrice = item?.unitPrice == null || item.unitPrice === '' ? null : rond(Number(item.unitPrice))
  const aantal = Number.isFinite(qty) && qty > 0 ? qty : 1
  return {
    name: naam,
    nameKey: productKey(naam),
    qty: aantal,
    price: Number.isFinite(price) ? price : null,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : (Number.isFinite(price) ? rond(price / aantal) : null),
    group: normalizeGroup(item?.group),
    isDiscount: item?.isDiscount === true,
  }
}

/**
 * Slaat gecorrigeerde regels op, spiegelt ze naar `receiptItems` en onthoudt
 * elke handmatig gewijzigde groep per `nameKey` — het model is daar volgens de
 * meting het minst betrouwbaar in, dus leren we het zelf.
 */
export async function updateReceiptItems(receiptId, items, { learnGroups = true } = {}) {
  const bon = await db.receipts.get(receiptId)
  if (!bon) throw new Error('Deze bon bestaat niet meer.')
  const nieuw = (Array.isArray(items) ? items : []).map(normaliseerItem)

  if (learnGroups) {
    const oud = new Map((bon.items ?? []).map(i => [i.nameKey || productKey(i.name), i.group]))
    const overrides = await getGroupOverrides()
    let gewijzigd = false
    for (const item of nieuw) {
      if (!item.nameKey) continue
      const voor = oud.get(item.nameKey)
      if (voor !== undefined && voor !== item.group && overrides[item.nameKey] !== item.group) {
        overrides[item.nameKey] = item.group
        gewijzigd = true
      }
    }
    if (gewijzigd) await db.settings.put({ key: GROUP_OVERRIDES_SETTING, value: overrides })
  }

  const validation = validateReceipt({ ...bon, items: nieuw })
  const patch = { items: nieuw, validation, discountTotal: discountTotalVan(bon) }
  patch.status = statusVoor({ ...bon, ...patch })
  await db.receipts.update(receiptId, patch)
  const bijgewerkt = { ...bon, ...patch }
  await syncReceiptItems(bijgewerkt)
  return bijgewerkt
}

/**
 * Handmatige koppeling van een korting aan een productregel (of `null` =
 * "los"). Spiegelt meteen naar `receiptItems` (nettoprijzen) en onthoudt de
 * keuze per kortingsnaam, zodat de heuristiek dezelfde koppeling voortaan
 * zelf voorstelt — ook als de productnaam op de bon net weer anders luidt.
 */
export async function updateDiscountLink(receiptId, discountIndex, itemIndex) {
  const bon = await db.receipts.get(receiptId)
  if (!bon) throw new Error('Deze bon bestaat niet meer.')
  const discounts = Array.isArray(bon.discounts) ? bon.discounts : []
  if (discountIndex < 0 || discountIndex >= discounts.length) return bon

  const items = Array.isArray(bon.items) ? bon.items : []
  const doel = itemIndex != null ? items[itemIndex] : null
  const nieuweItemIndex = doel ? itemIndex : null
  const nieuweDiscounts = discounts.map((d, i) => (i === discountIndex ? { ...d, itemIndex: nieuweItemIndex } : d))

  const dKey = productKey(discounts[discountIndex]?.name)
  if (dKey) await setDiscountLink(dKey, doel ? (doel.nameKey || productKey(doel.name)) : null)

  const patch = { discounts: nieuweDiscounts }
  await db.receipts.update(receiptId, patch)
  const bijgewerkt = { ...bon, ...patch }
  await syncReceiptItems(bijgewerkt)
  return bijgewerkt
}

/** Kopregel corrigeren (winkel, datum, tijd, totaal). */
export async function updateReceiptFields(receiptId, fields = {}) {
  const bon = await db.receipts.get(receiptId)
  if (!bon) throw new Error('Deze bon bestaat niet meer.')
  const patch = { ...fields }
  if ('merchant' in patch) {
    patch.merchant = String(patch.merchant ?? '').trim() || null
    patch.merchantKey = patch.merchant ? normalizeMerchant(patch.merchant).merchantKey : ''
  }
  if ('total' in patch) patch.total = patch.total == null || patch.total === '' ? null : rond(Number(patch.total))
  const samen = { ...bon, ...patch }
  patch.validation = validateReceipt(samen)
  patch.status = statusVoor({ ...samen, validation: patch.validation })
  await db.receipts.update(receiptId, patch)
  await syncReceiptItems({ ...samen, ...patch, id: receiptId })
  return { ...samen, ...patch }
}

/* ------------------------------------------------------------------ *
 * Koppelen                                                             *
 * ------------------------------------------------------------------ */

// Alle transacties rond de bondatum; ruim genomen zodat de kiezer ook
// "andere transactie" kan aanbieden zonder een tweede query.
export async function transactionsAround(date, days = 30) {
  if (!date) return db.transactions.orderBy('date').reverse().limit(200).toArray()
  const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return []
  const iso = ms => new Date(d.getTime() + ms).toISOString().slice(0, 10)
  return db.transactions.where('date').between(iso(-days * 86400000), iso(days * 86400000), true, true).toArray()
}

export async function findCandidates(receipt, { days = 3, windowDays = 30 } = {}) {
  const txs = await transactionsAround(receipt?.date, windowDays)
  return findTransactionCandidates(receipt, txs, { days })
}

/**
 * Koppelt bon en transactie aan elkaar en laat `merchantLearning` meekijken:
 * de winkelnaam van de bon is vaak schoner dan de omschrijving van de bank.
 */
export async function linkToTransaction(receiptId, transactionId) {
  const { bon, tx } = await db.transaction('rw', db.receipts, db.transactions, db.receiptItems, async () => {
    const bon = await db.receipts.get(receiptId)
    if (!bon) throw new Error('Deze bon bestaat niet meer.')
    const tx = await db.transactions.get(transactionId)
    if (!tx) throw new Error('Deze transactie bestaat niet meer.')

    // Eén bon per transactie en één transactie per bon: oude koppelingen los.
    if (tx.receiptId != null && tx.receiptId !== receiptId) {
      const oud = await db.receipts.get(tx.receiptId)
      if (oud) await db.receipts.update(oud.id, { transactionId: null, status: statusVoor({ ...oud, transactionId: null }) })
    }
    if (bon.transactionId != null && bon.transactionId !== transactionId) {
      await db.transactions.update(bon.transactionId, { receiptId: null })
    }

    await db.receipts.update(receiptId, { transactionId, status: 'linked' })
    await db.transactions.update(transactionId, { receiptId })
    await db.receiptItems.where('receiptId').equals(receiptId).modify({ transactionId })
    return { bon, tx }
  })

  // Buiten de transactie: een mislukte leerstap mag de koppeling niet terugdraaien.
  if (bon.merchant && tx.category) {
    recordEvent(bon.merchant, tx.category, tx.subcategory ?? '', tx.amount, tx.type, null, null)
  }
  return { receiptId, transactionId }
}

export async function unlinkReceipt(receiptId) {
  return db.transaction('rw', db.receipts, db.transactions, db.receiptItems, async () => {
    const bon = await db.receipts.get(receiptId)
    if (!bon) return false
    if (bon.transactionId != null) await db.transactions.update(bon.transactionId, { receiptId: null })
    await db.receipts.update(receiptId, { transactionId: null, status: statusVoor({ ...bon, transactionId: null }) })
    await db.receiptItems.where('receiptId').equals(receiptId).modify({ transactionId: null })
    return true
  })
}

export async function removeReceipt(receiptId) {
  return db.transaction('rw', db.receipts, db.transactions, db.receiptItems, async () => {
    const bon = await db.receipts.get(receiptId)
    if (!bon) return false
    if (bon.transactionId != null) await db.transactions.update(bon.transactionId, { receiptId: null })
    await db.receiptItems.where('receiptId').equals(receiptId).delete()
    await db.receipts.delete(receiptId)
    return true
  })
}

/**
 * Precies één uitgave binnen ±3 dagen met hetzelfde bedrag (op de cent) →
 * meteen koppelen. Anders een kandidatenlijst voor de kiezer.
 */
export async function autoLink(receiptId, { days = 3 } = {}) {
  const bon = await db.receipts.get(receiptId)
  if (!bon) throw new Error('Deze bon bestaat niet meer.')
  const txs = await transactionsAround(bon.date, 30)
  const beste = bestMatch(bon, txs, { days })
  if (beste) {
    await linkToTransaction(receiptId, beste.id)
    return { linked: true, transaction: beste, candidates: [] }
  }
  return { linked: false, transaction: null, candidates: findTransactionCandidates(bon, txs, { days }) }
}

/* ------------------------------------------------------------------ *
 * Live queries                                                         *
 * ------------------------------------------------------------------ */

export function useAiConfig() {
  return useLiveQuery(getAiConfig, [], null)
}

export function useReceiptStats() {
  return useLiveQuery(getReceiptStats, [], DEFAULT_STATS)
}

export function useStoreImages() {
  return useLiveQuery(getStoreImages, [], true)
}

export function useReceiptForTransaction(transactionId) {
  return useLiveQuery(
    () => (transactionId == null ? null : db.receipts.where('transactionId').equals(transactionId).first().then(r => r ?? null)),
    [transactionId],
    undefined,
  )
}

export function useReceipt(receiptId) {
  return useLiveQuery(() => (receiptId == null ? null : db.receipts.get(receiptId).then(r => r ?? null)), [receiptId], undefined)
}

/** De hele bonnetjes-API voor een scherm: live lijsten + alle acties. */
export function useReceipts({ limit = 200 } = {}) {
  const all = useLiveQuery(
    () => db.receipts.orderBy('id').reverse().limit(limit).toArray(),
    [limit],
    null,
  )
  const aiConfig = useAiConfig()
  const stats = useReceiptStats()

  const lijst = all ?? []
  return {
    all,
    loading: all === null,
    unlinked: lijst.filter(r => r.transactionId == null && r.status !== 'error'),
    review: lijst.filter(r => r.status === 'review'),
    byTransaction: id => lijst.find(r => r.transactionId === id) ?? null,
    aiConfig,
    hasKey: !!aiConfig?.apiKey,
    stats,
    setAiConfig,
    addReceiptFromFiles,
    addReceiptFromPdf,
    addReceiptFromClipboard,
    addReceiptFromPasteEvent,
    extract: extractReceiptById,
    linkToTransaction,
    unlink: unlinkReceipt,
    removeReceipt,
    updateItems: updateReceiptItems,
    updateFields: updateReceiptFields,
    updateDiscountLink,
    autoLink,
    findCandidates,
    storageEstimate,
    requestPersist,
  }
}
