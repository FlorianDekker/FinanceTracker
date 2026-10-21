/**
 * Overboekingen tussen je eigen rekeningen (ABN ↔ Revolut ↔ Rabobank): die
 * mogen nergens als inkomen of uitgave meetellen. Wordt bij het importeren
 * (vóór opslaan) herkend, zodat de review de rij meteen de overboekings-
 * categorie (rol `transfer`) kan geven met een "eigen rekening"-label dat je
 * kunt uitzetten.
 *
 * Herkenning, in deze volgorde:
 *  1. de tegenrekening is een rekening die de app al van jou kent (elk
 *     `tx.account` dat al in de database staat, plus de rekeningen uit het
 *     bestand dat je nu importeert);
 *  2. de omschrijving/naam bevat een naam uit "Mijn namen" (instelling
 *     `ownNames`), ook in "To <naam>"/"Transfer to <naam>"/"Transfer from
 *     <naam>" — dat werkt vanzelf, want zo'n naam staat dan gewoon ergens in
 *     de tekst;
 *  3. Revolut-topup die overduidelijk van een eigen bankrekening komt
 *     ("Money added via …", "Apple Pay top-up", "Open banking top-up");
 *  4. een afschrijving waarvan de omschrijving "Revolut" noemt (de ABN-kant
 *     van een overboeking náár Revolut).
 *
 * Bewust zonder Dexie/React, zodat het testbaar is.
 */

const TUSSENVOEGSELS = new Set(['de', 'der', 'den', 'van', 'het', 'ten', 'ter', 'te', 'en'])

/** "NL91 RABO 0300 0654 32" en "nl91rabo0300065432" worden dezelfde sleutel. */
export function normalizeAccount(value) {
  const s = String(value ?? '').toUpperCase().replace(/\s+/g, '').trim()
  return s || null
}

/**
 * Alle rekeningen die de app al als "van jou" kent: wat al in de database
 * staat, plus de rekeningen uit het bestand dat je nu importeert.
 */
export function collectKnownAccounts(existingTxs = [], newTxs = []) {
  const set = new Set()
  for (const tx of existingTxs ?? []) {
    const a = normalizeAccount(tx?.account)
    if (a) set.add(a)
  }
  for (const tx of newTxs ?? []) {
    const a = normalizeAccount(tx?.account)
    if (a) set.add(a)
  }
  return set
}

// Woorden van 2+ letters, punten/komma's eraf; "F." en lidwoorden tellen niet
// als "significant" — anders matcht elke "F." of "de" per ongeluk overal.
function words(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[.,;:()]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(Boolean)
}

function significantNameTokens(name) {
  return words(name).filter(w => w.length > 1 && !TUSSENVOEGSELS.has(w))
}

/**
 * Staat (de significante woorden van) een van de `ownNames` in `text`? Een
 * naam als "F. Dekker" levert dan alleen "dekker" op, en dat matcht ook in
 * "To Jan Pieter de Vries" of "Transfer from Jan Pieter de Vries" — de
 * prefix hoeft niet apart herkend te worden, dat zijn gewoon extra woorden.
 */
export function matchesOwnName(text, ownNames = []) {
  const tokens = new Set(words(text))
  if (!tokens.size) return false
  for (const naam of ownNames ?? []) {
    const sig = significantNameTokens(naam)
    if (sig.length && sig.every(t => tokens.has(t))) return true
  }
  return false
}

const TOPUP_PATRONEN = /money added via|apple pay top-up|open banking top-up/i

/**
 * @param tx       een geparste (nog niet opgeslagen) transactie
 * @param context  { knownAccounts: Set<string>, ownNames: string[] }
 * @returns { isOwn: boolean, reason: string|null }
 */
export function detectOwnTransfer(tx, { knownAccounts = new Set(), ownNames = [] } = {}) {
  const cp = normalizeAccount(tx?.counterparty)
  if (cp && knownAccounts.has(cp)) return { isOwn: true, reason: 'eigen-rekening' }

  const haystack = `${tx?.merchant ?? ''} ${tx?.remi ?? ''}`.trim()

  if (ownNames.length && matchesOwnName(haystack, ownNames)) {
    return { isOwn: true, reason: 'eigen-naam' }
  }

  if (tx?.bankType === 'Topup' && TOPUP_PATRONEN.test(haystack)) {
    return { isOwn: true, reason: 'revolut-topup' }
  }

  if (tx?.type === 'debit' && /revolut/i.test(haystack)) {
    return { isOwn: true, reason: 'naar-revolut' }
  }

  return { isOwn: false, reason: null }
}

/**
 * Markeert elke transactie die als eigen overboeking herkend wordt. Verandert
 * geen velden die al gezet zijn (categorie etc.) — dat doet de aanroeper
 * (ImportPage), hier wordt alleen aangegeven *of* het er een is en waarom.
 * @returns nieuwe array, elke transactie met `isOwnTransfer` en `ownTransferReason` erbij
 */
export function markOwnTransfers(transactions, context) {
  return (transactions ?? []).map(tx => {
    const { isOwn, reason } = detectOwnTransfer(tx, context)
    return { ...tx, isOwnTransfer: isOwn, ownTransferReason: reason }
  })
}
