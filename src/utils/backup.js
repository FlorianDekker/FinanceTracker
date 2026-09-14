import { db } from '../db/db'
import { defaultCategoryDef, makeCategoryRow } from '../constants/categories'
import { receiptItemRows } from './receipts/items'
import { dedupKey } from './importHelpers'
import { downloadFile } from './download'

/**
 * Volledige backup/restore van de lokale database.
 *
 * Formaat:
 *   {
 *     app: 'FinanceTracker',
 *     schemaVersion: <Dexie-versie waarmee geexporteerd is>,
 *     exportedAt: <ISO-datum>,
 *     tables: { transactions: [...], categories: [...], settings: [...], merchantHistory: [...], rules: [...] }
 *   }
 */

export const BACKUP_APP = 'FinanceTracker'
export const BACKUP_TABLES = ['transactions', 'categories', 'settings', 'merchantHistory', 'rules', 'claimBatches', 'receipts', 'receiptItems']
export const LAST_BACKUP_KEY = 'lastBackupAt'
export const BACKUP_REMINDER_DAYS = 30

/**
 * Instellingen waarvan de sleutel met 'ai' begint of 'apikey' bevat gaan NOOIT
 * mee in een backup. Daar komt vanaf Fase 5 de API-key van de bonnetjes-AI in
 * te staan; een backup moet je veilig kunnen delen of in iCloud kunnen zetten.
 * Ook bij terugzetten worden zulke sleutels genegeerd.
 */
export function isSecretSettingKey(key) {
  const k = String(key ?? '').toLowerCase()
  return k.startsWith('ai') || k.includes('apikey')
}

/* ------------------------------------------------------------------ *
 * Bon-afbeeldingen: Blob <-> base64                                    *
 * ------------------------------------------------------------------ */

// JSON kent geen Blob. Met afbeeldingen worden `pages`/`pdf`/`thumb` daarom
// { $blob: '<mimetype>', data: '<base64>' }; zonder afbeeldingen laten we die
// velden helemaal weg (de regels en de ruwe tekst gaan altijd mee).
export const RECEIPT_BLOB_FIELDS = ['pages', 'pdf', 'thumb']

function bytesToBase64(bytes) {
  const B = globalThis.Buffer
  if (B) return B.from(bytes).toString('base64')
  let s = ''
  const stap = 0x8000
  for (let i = 0; i < bytes.length; i += stap) s += String.fromCharCode.apply(null, bytes.subarray(i, i + stap))
  return globalThis.btoa(s)
}

function base64ToBytes(base64) {
  const B = globalThis.Buffer
  if (B) return new Uint8Array(B.from(String(base64 ?? ''), 'base64'))
  const bin = globalThis.atob(String(base64 ?? ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function encodeBlob(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') return null
  return { $blob: blob.type || 'application/octet-stream', data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) }
}

export function decodeBlob(value) {
  if (!value) return null
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value
  if (typeof value !== 'object' || typeof value.$blob !== 'string') return null
  return new Blob([base64ToBytes(value.data)], { type: value.$blob })
}

async function encodeReceipt(row, includeImages) {
  const out = { ...row }
  if (!includeImages) {
    for (const veld of RECEIPT_BLOB_FIELDS) delete out[veld]
    return out
  }
  out.pages = (await Promise.all((Array.isArray(row.pages) ? row.pages : []).map(encodeBlob))).filter(Boolean)
  out.pdf = await encodeBlob(row.pdf)
  out.thumb = await encodeBlob(row.thumb)
  return out
}

/** Hoeveel bytes aan bon-afbeeldingen staan er in de database? */
export async function receiptImageBytes() {
  const rows = await db.receipts.toArray()
  let bytes = 0
  for (const r of rows) {
    for (const p of (Array.isArray(r.pages) ? r.pages : [])) bytes += p?.size ?? 0
    bytes += r.pdf?.size ?? 0
    bytes += r.thumb?.size ?? 0
  }
  return bytes
}

/**
 * Ruwe schatting van de bestandsgrootte, voor de toggle in de backup-UI.
 * base64 kost een derde extra; de rest van de JSON meten we gewoon echt.
 */
export async function estimateBackupBytes({ includeImages = false } = {}) {
  const basis = JSON.stringify(await createBackup({ includeImages: false })).length
  if (!includeImages) return basis
  return basis + Math.round(await receiptImageBytes() * 4 / 3)
}

/* ------------------------------------------------------------------ *
 * Backup maken                                                         *
 * ------------------------------------------------------------------ */

/**
 * @param {{ includeImages?: boolean }} [opties] bon-afbeeldingen meenemen als
 *   base64. Standaard uit: 20 bonnen zijn al snel enkele megabytes.
 */
export async function createBackup({ includeImages = false } = {}) {
  const tables = {}
  await db.transaction('r', BACKUP_TABLES.map(name => db[name]), async () => {
    for (const name of BACKUP_TABLES) tables[name] = await db[name].toArray()
  })
  tables.settings = (tables.settings ?? []).filter(row => !isSecretSettingKey(row?.key))
  // Bewust buiten de Dexie-transactie: await op een niet-Dexie promise (blob.arrayBuffer)
  // sluit de transactie en zou een TransactionInactiveError opleveren.
  tables.receipts = await Promise.all((tables.receipts ?? []).map(row => encodeReceipt(row, includeImages)))

  return {
    app: BACKUP_APP,
    schemaVersion: db.verno,
    exportedAt: new Date().toISOString(),
    includesImages: includeImages,
    tables,
  }
}

export function countRows(backup) {
  const counts = {}
  for (const name of BACKUP_TABLES) counts[name] = backup?.tables?.[name]?.length ?? 0
  return counts
}

export function backupFileName(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `financetracker-backup-${stamp}.json`
}

/**
 * Maakt een backup en biedt hem aan. Op iOS/Safari eerst via het deelmenu
 * (dan kan het bestand naar Bestanden/iCloud Drive), anders een gewone download.
 * Zet `lastBackupAt` zodra het bestand daadwerkelijk is aangeboden.
 */
export async function downloadBackup({ includeImages = false } = {}) {
  const backup = await createBackup({ includeImages })
  // Met afbeeldingen erin is de JSON megabytes groot; dan geen inspringing.
  const json = JSON.stringify(backup, null, includeImages ? 0 : 2)
  const fileName = backupFileName()

  const { method } = await downloadFile(new Blob([json], { type: 'application/json' }), fileName)
  // Deelmenu weggetikt: niets opslaan, niets downloaden, geen nieuwe backupdatum.
  if (method === 'cancelled') return { cancelled: true, fileName }

  const at = Date.now()
  await db.settings.put({ key: LAST_BACKUP_KEY, value: at })
  return { method, fileName, at, counts: countRows(backup), bytes: json.length }
}

export async function getLastBackupAt() {
  const row = await db.settings.get(LAST_BACKUP_KEY)
  return row?.value ?? null
}

export function daysSince(timestamp) {
  if (!timestamp) return null
  return Math.floor((Date.now() - timestamp) / 86400000)
}

/* ------------------------------------------------------------------ *
 * Backup lezen en valideren                                            *
 * ------------------------------------------------------------------ */

export function parseBackup(input) {
  let data = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch {
      throw new Error('Dit bestand is geen geldige JSON. Kies het backup-bestand dat de app zelf gemaakt heeft.')
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Dit bestand bevat geen backup-gegevens.')
  }
  if (data.app !== BACKUP_APP) {
    throw new Error('Dit is geen FinanceTracker-backup (het kenmerk "app" ontbreekt of klopt niet).')
  }
  if (!data.tables || typeof data.tables !== 'object' || Array.isArray(data.tables)) {
    throw new Error('De backup mist het onderdeel "tables" en kan niet worden teruggezet.')
  }
  for (const name of BACKUP_TABLES) {
    const value = data.tables[name]
    if (value !== undefined && !Array.isArray(value)) {
      throw new Error(`De backup is beschadigd: "${name}" is geen lijst.`)
    }
  }
  const version = Number(data.schemaVersion)
  if (Number.isFinite(version) && version > db.verno) {
    throw new Error(
      `Deze backup komt uit een nieuwere versie van de app (schemaversie ${version}, deze app kan ${db.verno}). ` +
      'Werk de app eerst bij en probeer het daarna opnieuw.'
    )
  }
  return data
}

export function summarizeBackup(input) {
  const backup = parseBackup(input)
  return {
    backup,
    schemaVersion: backup.schemaVersion ?? null,
    exportedAt: backup.exportedAt ?? null,
    counts: countRows(backup),
    total: Object.values(countRows(backup)).reduce((a, b) => a + b, 0),
  }
}

/* ------------------------------------------------------------------ *
 * Backup terugzetten                                                   *
 * ------------------------------------------------------------------ */

// Oudere backups bevatten categorieen in de {key, budget}-vorm (Dexie v1/v2).
// De standaarddefinitie vult dan label/icoon/kleur/type/subs/rol aan; wat de
// backup zelf meegeeft wint altijd.
function normalizeCategories(rows) {
  return rows
    .filter(row => row && row.key)
    .map((row, i) => {
      const def = defaultCategoryDef(row.key) ?? {}
      const merged = { ...def, ...row }
      if (!Number.isFinite(merged.order)) merged.order = i
      return makeCategoryRow(merged, row.budget ?? 0)
    })
}

function normalizeRules(rows) {
  return rows
    .map(row => ({
      ...row,
      keywords: (Array.isArray(row.keywords) ? row.keywords : [])
        .map(kw => String(kw ?? '').trim().toLowerCase())
        .filter(Boolean),
      category: String(row.category ?? ''),
      subcategory: String(row.subcategory ?? ''),
      createdAt: row.createdAt ?? Date.now(),
    }))
    .filter(row => row.keywords.length && row.category)
}

// Backups van voor Fase 2 hebben geen claimBatches; die tabel is dan gewoon leeg.
function normalizeClaimBatches(rows) {
  return rows
    .filter(row => row && (row.name || row.createdAt))
    .map(row => ({
      ...row,
      name: String(row.name ?? ''),
      status: ['open', 'submitted', 'closed'].includes(row.status) ? row.status : 'open',
      createdAt: row.createdAt ?? Date.now(),
    }))
}

// Bonnen uit een backup zonder afbeeldingen hebben geen pages/pdf/thumb; die
// worden hier lege waarden in plaats van undefined, zodat de UI niet hoeft te
// raden of een bon "geen foto" of "een kapotte foto" heeft.
function normalizeReceipts(rows) {
  return rows.map(row => ({
    ...row,
    pages: (Array.isArray(row.pages) ? row.pages : []).map(decodeBlob).filter(Boolean),
    pdf: decodeBlob(row.pdf),
    thumb: decodeBlob(row.thumb),
    items: Array.isArray(row.items) ? row.items : [],
    transactionId: row.transactionId ?? null,
    status: typeof row.status === 'string' ? row.status : 'new',
  }))
}

function normalizeReceiptItems(rows) {
  return rows.filter(row => row && row.receiptId != null)
}

function normalizeTables(tables) {
  const out = {}
  for (const name of BACKUP_TABLES) out[name] = Array.isArray(tables[name]) ? tables[name].filter(Boolean) : []
  out.categories = normalizeCategories(out.categories)
  out.settings = out.settings.filter(row => row?.key && !isSecretSettingKey(row.key))
  out.rules = normalizeRules(out.rules)
  out.claimBatches = normalizeClaimBatches(out.claimBatches)
  out.receipts = normalizeReceipts(out.receipts)
  out.receiptItems = normalizeReceiptItems(out.receiptItems)
  return out
}

function withoutId(row) {
  const copy = { ...row }
  delete copy.id
  return copy
}

const transactionKey = tx => dedupKey(tx.date, tx.amount, tx.type, String(tx.note ?? ''))
const historyKey = ev => `${ev.merchantKey}|${ev.timestamp}|${ev.category}`
const ruleKey = rule => `${(rule.keywords ?? []).join(',')}|${rule.category}|${rule.subcategory ?? ''}`
const batchKey = batch => `${batch.name ?? ''}|${batch.createdAt ?? ''}`
// Dezelfde winkel, dezelfde dag, hetzelfde totaal = dezelfde bon.
const receiptKey = r => `${r.merchantKey ?? ''}|${r.date ?? ''}|${r.total ?? ''}`

/**
 * Voegt alleen rijen toe die er nog niet zijn (auto-increment tabellen).
 * `idMap` koppelt het id uit de backup aan het id in deze database, zodat
 * verwijzingen (claimBatchId, receiptId) mee kunnen verhuizen.
 */
async function mergeRows(table, rows, keyOf) {
  const existing = await table.toArray()
  const byKey = new Map(existing.map(r => [keyOf(r), r.id]))
  const idMap = new Map()
  const toAdd = []
  const oudeIds = []
  for (const row of rows) {
    const key = keyOf(row)
    if (byKey.has(key)) {
      const bestaand = byKey.get(key)
      if (row.id != null && bestaand != null) idMap.set(row.id, bestaand)
      continue
    }
    byKey.set(key, null)               // gereserveerd: dubbele rijen binnen de backup zelf
    toAdd.push(withoutId(row))
    oudeIds.push(row.id ?? null)
  }
  if (toAdd.length) {
    const nieuweIds = await table.bulkAdd(toAdd, { allKeys: true })
    nieuweIds.forEach((nieuw, i) => { if (oudeIds[i] != null) idMap.set(oudeIds[i], nieuw) })
  }
  return { added: toAdd.length, skipped: rows.length - toAdd.length, idMap }
}

/**
 * @param mode 'replace' = alles wissen en vervangen, 'merge' = samenvoegen.
 * @returns { mode, stats: { <tabel>: { added, skipped } } }
 */
export async function restoreBackup(input, { mode = 'merge' } = {}) {
  if (mode !== 'merge' && mode !== 'replace') {
    throw new Error(`Onbekende herstelmodus '${mode}'.`)
  }
  const backup = parseBackup(input)
  const src = normalizeTables(backup.tables)
  const stats = {}

  await db.transaction('rw', BACKUP_TABLES.map(name => db[name]), async () => {
    if (mode === 'replace') {
      // Lokale geheimen (bv. AI-API-key) zitten nooit in een backup en mogen dus ook niet
      // verloren gaan bij "alles vervangen": bewaar ze en zet ze na het wissen terug.
      const secrets = (await db.settings.toArray()).filter(s => isSecretSettingKey(s.key))
      for (const name of BACKUP_TABLES) {
        await db[name].clear()
        if (src[name].length) await db[name].bulkPut(src[name])
        stats[name] = { added: src[name].length, skipped: 0 }
      }
      if (secrets.length) await db.settings.bulkPut(secrets)
      return
    }

    // Declaratie-batches eerst: bij samenvoegen krijgen ze nieuwe id's, dus de
    // claimBatchId van de binnenkomende transacties moet mee verhuizen.
    const batchIdMap = new Map()
    const existingBatches = await db.claimBatches.toArray()
    const byBatchKey = new Map(existingBatches.map(b => [batchKey(b), b.id]))
    const newBatches = []
    for (const batch of src.claimBatches) {
      const key = batchKey(batch)
      if (byBatchKey.has(key)) {
        batchIdMap.set(batch.id, byBatchKey.get(key))
        continue
      }
      newBatches.push(batch)
    }
    for (const batch of newBatches) {
      const newId = await db.claimBatches.add(withoutId(batch))
      byBatchKey.set(batchKey(batch), newId)
      batchIdMap.set(batch.id, newId)
    }
    stats.claimBatches = { added: newBatches.length, skipped: src.claimBatches.length - newBatches.length }

    // Bonnen vóór de transacties: die krijgen ook nieuwe id's, en een transactie
    // verwijst met `receiptId` terug. De andere kant (`receipts.transactionId`)
    // vullen we daarna in, zodra we de nieuwe transactie-id's kennen.
    const receiptIdMap = new Map()
    const bestaandeBonnen = await db.receipts.toArray()
    const byReceiptKey = new Map(bestaandeBonnen.map(r => [receiptKey(r), r.id]))
    const nieuweBonnen = []
    for (const bon of src.receipts) {
      const key = receiptKey(bon)
      if (byReceiptKey.has(key)) {
        if (bon.id != null) receiptIdMap.set(bon.id, byReceiptKey.get(key))
        continue
      }
      byReceiptKey.set(key, null)
      nieuweBonnen.push(bon)
    }
    const nieuweBonIds = []
    for (const bon of nieuweBonnen) {
      const nieuwId = await db.receipts.add({ ...withoutId(bon), transactionId: null })
      byReceiptKey.set(receiptKey(bon), nieuwId)
      nieuweBonIds.push(nieuwId)
      if (bon.id != null) receiptIdMap.set(bon.id, nieuwId)
    }
    stats.receipts = { added: nieuweBonnen.length, skipped: src.receipts.length - nieuweBonnen.length }

    const incomingTransactions = src.transactions.map(tx => {
      const out = { ...tx }
      if (out.claimBatchId != null) out.claimBatchId = batchIdMap.get(out.claimBatchId) ?? null
      if (out.receiptId != null) out.receiptId = receiptIdMap.get(out.receiptId) ?? null
      return out
    })
    const txMerge = await mergeRows(db.transactions, incomingTransactions, transactionKey)
    stats.transactions = { added: txMerge.added, skipped: txMerge.skipped }

    // Nu pas: de nieuwe bonnen aan hun (mogelijk hernummerde) transactie hangen
    // en hun regels opnieuw platslaan. `receiptItems` uit de backup zelf gooien
    // we weg — afleiden uit `items` kan niet uit de pas lopen.
    let regels = 0
    for (let i = 0; i < nieuweBonnen.length; i++) {
      const bon = nieuweBonnen[i]
      const id = nieuweBonIds[i]
      const txId = bon.transactionId == null ? null : (txMerge.idMap.get(bon.transactionId) ?? null)
      if (txId != null) await db.receipts.update(id, { transactionId: txId })
      const rijen = receiptItemRows({ ...bon, id, transactionId: txId })
      if (rijen.length) { await db.receiptItems.bulkAdd(rijen); regels += rijen.length }
    }
    stats.receiptItems = { added: regels, skipped: Math.max(0, src.receiptItems.length - regels) }

    const history = await mergeRows(db.merchantHistory, src.merchantHistory, historyKey)
    stats.merchantHistory = { added: history.added, skipped: history.skipped }
    const rules = await mergeRows(db.rules, src.rules, ruleKey)
    stats.rules = { added: rules.added, skipped: rules.skipped }

    // Categorieen: de bestaande rij wint, ontbrekende sleutels worden toegevoegd.
    const haveCats = new Set((await db.categories.toArray()).map(c => c.key))
    const newCats = src.categories.filter(c => !haveCats.has(c.key))
    if (newCats.length) await db.categories.bulkPut(newCats)
    stats.categories = { added: newCats.length, skipped: src.categories.length - newCats.length }

    // Instellingen: alleen toevoegen als de sleutel nog niet bestaat.
    const haveSettings = new Set((await db.settings.toArray()).map(s => s.key))
    const newSettings = src.settings.filter(s => !haveSettings.has(s.key))
    if (newSettings.length) await db.settings.bulkPut(newSettings)
    stats.settings = { added: newSettings.length, skipped: src.settings.length - newSettings.length }
  })

  return { mode, stats }
}
