// Tekstextractie uit PDF-bonnen (AH-app levert een tekst-PDF, geen scan).
//
// Werkt in de browser én in Node:
// - browser: `pdfjs-dist/build/pdf.mjs` + worker via `?url` (Vite bundelt die apart)
// - Node:    `pdfjs-dist/legacy/build/pdf.mjs` (fake worker, geen DOM nodig)
//
// pdf.js geeft losse tekst-items met een transformatiematrix terug, niet regels.
// We reconstrueren regels op y-coördinaat en sorteren binnen een regel op x,
// zodat de kolommen van een kassabon (`AANTAL OMSCHRIJVING PRIJS BEDRAG`)
// als leesbare regels bij het model aankomen.

let pdfjsPromise = null

function isNodeRuntime() {
  return typeof window === 'undefined' || typeof document === 'undefined'
}

/** Laadt pdf.js lui en precies één keer. */
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      if (isNodeRuntime()) {
        // Variabele specifier + @vite-ignore: Vite mag deze Node-only build
        // niet mee bundelen (scheelt een dubbele ~1 MB chunk in de PWA).
        const spec = 'pdfjs-dist/legacy/build/pdf.mjs'
        return await import(/* @vite-ignore */ spec)
      }
      const mod = await import('pdfjs-dist/build/pdf.mjs')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      mod.GlobalWorkerOptions.workerSrc = worker.default
      return mod
    })().catch(err => { pdfjsPromise = null; throw err })
  }
  return pdfjsPromise
}

/** Alleen voor tests: injecteer een eigen pdf.js-module. */
export function setPdfjs(mod) {
  pdfjsPromise = mod ? Promise.resolve(mod) : null
}

// pdf.js verhuist de buffer naar de worker en laat het origineel gedetacheerd
// achter. We werken daarom altijd op een kopie, zodat dezelfde File eerst
// uitgelezen en daarna nog gerenderd kan worden.
function toUint8(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input.slice(0))
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength))
  throw new TypeError('extractPdfText verwacht een ArrayBuffer of Uint8Array')
}

/**
 * Bouwt regels uit losse pdf.js-tekstitems.
 * @param {Array} items textContent.items
 * @returns {string[]}
 */
export function itemsToLines(items) {
  const rijen = []
  for (const item of items) {
    if (typeof item?.str !== 'string') continue
    const t = item.transform
    if (!t) continue
    const y = t[5]
    const x = t[4]
    const hoogte = Math.abs(item.height || t[3] || 10)
    const tol = Math.max(2, hoogte * 0.5)
    let rij = rijen.find(r => Math.abs(r.y - y) <= Math.max(tol, r.tol))
    if (!rij) {
      rij = { y, tol, items: [] }
      rijen.push(rij)
    }
    // Middel de y zodat een regel met licht verschoven items niet wegdrijft
    rij.y = (rij.y * rij.items.length + y) / (rij.items.length + 1)
    rij.tol = Math.max(rij.tol, tol)
    rij.items.push({ x, str: item.str, width: item.width ?? 0 })
  }

  rijen.sort((a, b) => b.y - a.y) // PDF-oorsprong ligt linksonder
  return rijen.map(rij => {
    rij.items.sort((a, b) => a.x - b.x)
    let uit = ''
    let eind = null
    for (const it of rij.items) {
      if (eind !== null && it.x - eind > 1.5 && !/\s$/.test(uit) && !/^\s/.test(it.str)) uit += ' '
      uit += it.str
      eind = it.x + (it.width || 0)
    }
    return uit.replace(/[ \t]+/g, ' ').trim()
  }).filter(r => r.length > 0)
}

/**
 * @param {ArrayBuffer|Uint8Array} arrayBuffer
 * @param {{ maxPages?: number, pdfjs?: object }} [opties]
 * @returns {Promise<{ text: string, pages: number, isTextPdf: boolean, pageTexts: string[] }>}
 */
export async function extractPdfText(arrayBuffer, opties = {}) {
  const pdfjs = opties.pdfjs ?? await loadPdfjs()
  const data = toUint8(arrayBuffer)

  const taak = pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: false,
    // De PWA levert geen losse cmaps/standaardfonts mee; voor tekstextractie
    // is dat niet nodig (alleen voor exotische CJK-encodings).
    disableFontFace: true,
  })
  const doc = await taak.promise
  try {
    const totaal = doc.numPages
    const max = Math.min(totaal, opties.maxPages ?? 20)
    const pageTexts = []
    for (let p = 1; p <= max; p++) {
      const page = await doc.getPage(p)
      try {
        const content = await page.getTextContent()
        pageTexts.push(itemsToLines(content.items).join('\n'))
      } finally {
        page.cleanup?.()
      }
    }
    const text = pageTexts.join('\n\n──── pagina ────\n\n').trim()
    const tekens = text.replace(/\s/g, '').length
    return {
      text,
      pages: totaal,
      isTextPdf: tekens >= 40,
      pageTexts,
    }
  } finally {
    await doc.destroy?.()
  }
}

/**
 * Rendert één PDF-pagina naar een JPEG-Blob (thumbnail of vision-invoer).
 * Alleen in de browser: er is een canvas nodig.
 */
export async function renderPdfPage(arrayBuffer, { page = 1, maxSide = 1600, quality = 0.8, type = 'image/jpeg' } = {}) {
  if (isNodeRuntime() || typeof document === 'undefined') {
    throw new Error('renderPdfPage werkt alleen in de browser (canvas vereist)')
  }
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data: toUint8(arrayBuffer), isEvalSupported: false, disableFontFace: false }).promise
  try {
    const pg = await doc.getPage(Math.min(page, doc.numPages))
    const basis = pg.getViewport({ scale: 1 })
    const schaal = Math.min(maxSide / Math.max(basis.width, basis.height), 4)
    const viewport = pg.getViewport({ scale: schaal > 0 ? schaal : 1 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await pg.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise
    return await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Renderen van de PDF-pagina is mislukt'))), type, quality)
    })
  } finally {
    await doc.destroy?.()
  }
}
