// Android/Chrome Web Share Target: vangt de POST op die Chrome doet wanneer de
// gebruiker een foto/PDF "deelt met" de geïnstalleerde PWA (zie manifest
// `share_target` in vite.config.js). iOS/Safari kent deze API niet, dus dit
// script doet daar simpelweg niets — het fetch-event met deze vorm komt er
// nooit voor.
//
// Dit bestand wordt door Workbox met `importScripts('sw-share.js')` ingeladen
// in het gegenereerde sw.js (zie vite.config.js). Het staat daarom in dezelfde
// worker-scope en mag zelf `self.addEventListener` gebruiken.
//
// We schrijven de gedeelde bestanden weg in een EIGEN, kleine IndexedDB-store
// (database `FinanceTrackerShare`, store `shareInbox`) via de rauwe
// IndexedDB-API — expliciet niet de `BudgetTracker`-database die de app met
// Dexie beheert. Dexie onderhandelt zelf over databaseversies en schema; een
// tweede, onafhankelijke schrijver (deze service worker, los van de Dexie
// runtime) zou die versie-onderhandeling kunnen verstoren of op een
// upgrade-blokkade kunnen stuiten. Een eigen, ongerelateerde database
// voorkomt dat risico volledig.

const SHARE_DB_NAME = 'FinanceTrackerShare'
const SHARE_DB_VERSION = 1
const SHARE_STORE_NAME = 'shareInbox'
const SHARE_TARGET_PATH = '/FinanceTracker/bon'

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, SHARE_DB_VERSION)
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

async function bewaarGedeeldBestand(db, file) {
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE_NAME, 'readwrite')
    tx.objectStore(SHARE_STORE_NAME).add({
      file,
      name: file.name || '',
      type: file.type || '',
      receivedAt: Date.now(),
    })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function verwerkGedeeldeBon(event) {
  const formData = await event.request.formData()

  // `receipt` is de naam uit `share_target.params.files` in het manifest,
  // maar we pakken als vangnet ook alle overige File-entries mee — sommige
  // afzenders (of toekomstige manifest-varianten) gebruiken mogelijk een
  // andere veldnaam.
  const files = new Set(formData.getAll('receipt').filter((v) => v instanceof File))
  for (const value of formData.values()) {
    if (value instanceof File) {
      files.add(value)
    }
  }

  const db = await openShareDb()
  try {
    for (const file of files) {
      await bewaarGedeeldBestand(db, file)
    }
  } finally {
    db.close()
  }

  return Response.redirect(`${SHARE_TARGET_PATH}?share=1`, 303)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'POST') return
  const url = new URL(request.url)
  if (!url.pathname.endsWith(SHARE_TARGET_PATH)) return

  event.respondWith(
    verwerkGedeeldeBon(event).catch(() =>
      // Iets ging mis (bijv. IndexedDB geblokkeerd of formData corrupt) — stuur
      // alsnog door naar de app in plaats van de gebruiker op een witte/foute
      // pagina te laten stranden. De app kan dan zelf een nette melding tonen.
      Response.redirect(`${SHARE_TARGET_PATH}?share=1&shareError=1`, 303)
    )
  )
})
