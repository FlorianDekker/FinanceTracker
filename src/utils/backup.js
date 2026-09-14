import { db } from '../db/db'
import { defaultCategoryDef, makeCategoryRow } from '../constants/categories'
import { dedupKey } from './importHelpers'

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
export const BACKUP_TABLES = ['transactions', 'categories', 'settings', 'merchantHistory', 'rules', 'claimBatches']
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
 * Backup maken                                                         *
 * ------------------------------------------------------------------ */

export async function createBackup() {
  const tables = {}
  await db.transaction('r', BACKUP_TABLES.map(name => db[name]), async () => {
    for (const name of BACKUP_TABLES) tables[name] = await db[name].toArray()
  })
  tables.settings = (tables.settings ?? []).filter(row => !isSecretSettingKey(row?.key))

  return {
    app: BACKUP_APP,
    schemaVersion: db.verno,
    exportedAt: new Date().toISOString(),
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
export async function downloadBackup() {
  const backup = await createBackup()
  const json = JSON.stringify(backup, null, 2)
  const fileName = backupFileName()
  let method = 'download'

  if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare) {
    const file = new File([json], fileName, { type: 'application/json' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName })
        method = 'share'
      } catch (err) {
        // Gebruiker heeft het deelmenu weggetikt: niets opslaan, niets downloaden.
        if (err?.name === 'AbortError') return { cancelled: true, fileName }
        method = 'download'
      }
    }
  }

  if (method === 'download') {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

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

function normalizeTables(tables) {
  const out = {}
  for (const name of BACKUP_TABLES) out[name] = Array.isArray(tables[name]) ? tables[name].filter(Boolean) : []
  out.categories = normalizeCategories(out.categories)
  out.settings = out.settings.filter(row => row?.key && !isSecretSettingKey(row.key))
  out.rules = normalizeRules(out.rules)
  out.claimBatches = normalizeClaimBatches(out.claimBatches)
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

// Voegt alleen rijen toe die er nog niet zijn (auto-increment tabellen).
async function mergeRows(table, rows, keyOf) {
  const existing = await table.toArray()
  const seen = new Set(existing.map(keyOf))
  const toAdd = []
  for (const row of rows) {
    const key = keyOf(row)
    if (seen.has(key)) continue
    seen.add(key)
    toAdd.push(withoutId(row))
  }
  if (toAdd.length) await table.bulkAdd(toAdd)
  return { added: toAdd.length, skipped: rows.length - toAdd.length }
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

    const incomingTransactions = src.transactions.map(tx => (
      tx.claimBatchId == null ? tx : { ...tx, claimBatchId: batchIdMap.get(tx.claimBatchId) ?? null }
    ))
    stats.transactions = await mergeRows(db.transactions, incomingTransactions, transactionKey)
    stats.merchantHistory = await mergeRows(db.merchantHistory, src.merchantHistory, historyKey)
    stats.rules = await mergeRows(db.rules, src.rules, ruleKey)

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
