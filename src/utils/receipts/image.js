// Bonfoto's klein maken vóór ze naar het model en naar IndexedDB gaan.
//
// Waarom verkleinen: een iPhone-foto is 3-4 MB / 4032px. Vision-modellen
// tegelen naar 560px-blokken, dus boven ~1600px betaal je alleen maar meer
// tokens zonder extra leesbaarheid. 1600px @ q0.8 ≈ 150-300 KB per bon.
//
// Canvas-only: dit werkt alleen in de browser. In Node gooien de functies een
// duidelijke fout in plaats van stilletjes iets halfs te doen.

const HEEFT_CANVAS = typeof document !== 'undefined' && typeof createImageBitmap !== 'undefined'

function eisBrowser(naam) {
  if (typeof document === 'undefined') {
    throw new Error(`${naam} werkt alleen in de browser: er is een <canvas> nodig om afbeeldingen te schalen.`)
  }
}

/** Leest een File/Blob als ImageBitmap, met <img>-fallback voor oudere Safari. */
async function naarBitmap(fileOrBlob) {
  if (HEEFT_CANVAS) {
    try {
      return await createImageBitmap(fileOrBlob)
    } catch {
      // Safari faalt op sommige HEIC/exotische types → val terug op <img>
    }
  }
  const url = URL.createObjectURL(fileOrBlob)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Deze afbeelding kon niet worden gelezen.'))
      el.src = url
    })
    return img
  } finally {
    // De browser heeft de pixels al; de URL mag weg zodra de load klaar is.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function afmetingen(bron) {
  const w = bron.width ?? bron.naturalWidth
  const h = bron.height ?? bron.naturalHeight
  if (!w || !h) throw new Error('Deze afbeelding heeft geen bruikbare afmetingen.')
  return { w, h }
}

function tekenNaarCanvas(bron, breedte, hoogte) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(breedte))
  canvas.height = Math.max(1, Math.round(hoogte))
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bron, 0, 0, canvas.width, canvas.height)
  return canvas
}

function canvasNaarBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Het verkleinen van de afbeelding is mislukt.'))), type, quality)
  })
}

/**
 * Schaalt een foto terug tot `maxSide` op de langste zijde en hercomprimeert
 * naar JPEG. Kleinere afbeeldingen worden nog steeds hergecodeerd, zodat HEIC
 * of PNG-screenshots altijd als JPEG de deur uit gaan.
 *
 * @param {File|Blob} fileOrBlob
 * @param {{maxSide?: number, quality?: number, type?: string}} [opties]
 * @returns {Promise<Blob>}
 */
export async function downscaleImage(fileOrBlob, { maxSide = 1600, quality = 0.8, type = 'image/jpeg' } = {}) {
  eisBrowser('downscaleImage')
  if (!fileOrBlob) throw new Error('downscaleImage kreeg geen bestand.')

  const bron = await naarBitmap(fileOrBlob)
  try {
    const { w, h } = afmetingen(bron)
    const factor = Math.min(1, maxSide / Math.max(w, h))
    const canvas = tekenNaarCanvas(bron, w * factor, h * factor)
    const blob = await canvasNaarBlob(canvas, type, quality)
    // Als de hercodering groter uitvalt dan het origineel én er niet geschaald
    // is, houden we het origineel (komt voor bij al sterk gecomprimeerde JPEG).
    if (factor === 1 && fileOrBlob.size && blob.size > fileOrBlob.size && /^image\/jpe?g$/.test(fileOrBlob.type)) {
      return fileOrBlob
    }
    return blob
  } finally {
    bron.close?.()
  }
}

/**
 * Vierkante thumbnail (center-crop) voor het bonnetjes-grid.
 * @param {File|Blob} blob
 * @param {number} [size=300]
 * @returns {Promise<Blob>}
 */
export async function makeThumb(blob, size = 300) {
  eisBrowser('makeThumb')
  if (!blob) throw new Error('makeThumb kreeg geen bestand.')

  const bron = await naarBitmap(blob)
  try {
    const { w, h } = afmetingen(bron)
    const zijde = Math.min(w, h)
    const sx = (w - zijde) / 2
    const sy = (h - zijde) / 2

    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(bron, sx, sy, zijde, zijde, 0, 0, size, size)
    return await canvasNaarBlob(canvas, 'image/jpeg', 0.75)
  } finally {
    bron.close?.()
  }
}

/** Blob → data-URL (`data:image/jpeg;base64,…`) voor de `image_url`-payload. */
export function blobToDataUrl(blob) {
  if (typeof FileReader === 'undefined') {
    throw new Error('blobToDataUrl werkt alleen in de browser (FileReader vereist).')
  }
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('Het inlezen van de afbeelding is mislukt.'))
    fr.readAsDataURL(blob)
  })
}

/**
 * HEIC: iOS Safari converteert een HEIC-foto uit de fotobibliotheek zelf naar
 * JPEG zodra het `<input type="file">` `accept="image/*"` (of image/jpeg) heeft;
 * de webpagina krijgt dan een `image/jpeg`-File. Zie docs/ios-shortcut-bon.md.
 * Deze helper is het vangnet voor de gevallen waarin dat níét gebeurt
 * (bv. Android-bestandskiezer of een gedeeld .heic-bestand): dan kan het canvas
 * de bytes niet decoderen en willen we een begrijpelijke Nederlandse fout.
 */
export function isWaarschijnlijkHeic(file) {
  const type = (file?.type ?? '').toLowerCase()
  const naam = (file?.name ?? '').toLowerCase()
  return type.includes('heic') || type.includes('heif') || /\.hei[cf]$/.test(naam)
}
