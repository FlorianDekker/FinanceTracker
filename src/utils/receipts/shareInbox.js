// Client-kant tegenhanger van public/sw-share.js: leest de bestanden die de
// Android/Chrome-share-target-service-worker in een eigen IndexedDB-store
// heeft gezet, zodat ReceiptsPage er bonnen van kan maken.
//
// Bewust géén Dexie hier: dezelfde overweging als in sw-share.js — dit is een
// aparte, kleine database (`FinanceTrackerShare` / store `shareInbox`) die
// puur als postbus tussen service worker en app dient, los van de
// Dexie-beheerde `BudgetTracker`-database.
//
// Alles hieronder is bewust defensief: dit pad wordt alleen op Android/Chrome
// gebruikt (zie docs/android-share.md), maar mag op elk ander platform
// (inclusief browsers zonder IndexedDB, of wanneer de service worker nog nooit
// geschreven heeft) nooit een fout gooien.

const SHARE_DB_NAME = 'FinanceTrackerShare'
const SHARE_DB_VERSION = 1
const SHARE_STORE_NAME = 'shareInbox'

function heeftIndexedDb() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null
}

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION)
    // Als de service worker nog nooit heeft geschreven, bestaat de store nog
    // niet — dan maken we hem hier alsnog aan zodat lezen niet crasht.
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SHARE_STORE_NAME)) {
        db.createObjectStore(SHARE_STORE_NAME, { keyPath: 'id', autoIncrement: true })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function haalAlleOp(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, 'readonly')
    const req = tx.objectStore(SHARE_STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result || [])
    req.onerror = () => reject(req.error)
  })
}

function maakLeeg(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, 'readwrite')
    tx.objectStore(SHARE_STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Alle gedeelde bestanden lezen zonder de inbox te legen. `[]` bij afwezigheid/fout. */
export async function readShareInbox() {
  if (!heeftIndexedDb()) return []
  try {
    const db = await openShareDb()
    try {
      const rijen = await haalAlleOp(db)
      return rijen.map((rij) => ({
        id: rij.id,
        file: rij.file,
        name: rij.name,
        type: rij.type,
        receivedAt: rij.receivedAt,
      }))
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

/** De inbox-store volledig legen. Faalt stil als IndexedDB niet werkt. */
export async function clearShareInbox() {
  if (!heeftIndexedDb()) return
  try {
    const db = await openShareDb()
    try {
      await maakLeeg(db)
    } finally {
      db.close()
    }
  } catch {
    // Niets te legen of IndexedDB niet beschikbaar — geen probleem, er was
    // dan toch niets bruikbaars om te lezen.
  }
}

/**
 * Leest de inbox, maakt hem leeg en geeft de bestanden terug (`File`/`Blob`).
 * Geeft `[]` terug zodra er niets is of iets misgaat — nooit een throw, dit
 * wordt aangeroepen vanaf een gewone paginalading.
 */
export async function takeShareInbox() {
  const rijen = await readShareInbox()
  if (rijen.length === 0) return []
  await clearShareInbox()
  return rijen.map((rij) => rij.file)
}
