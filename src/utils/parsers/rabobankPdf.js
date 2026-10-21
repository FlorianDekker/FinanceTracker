// Rabobank-rekeningafschrift (PDF). De meeste particulieren kunnen bij
// Rabobank geen CSV-export maken (dat moet een zakelijke adviseur voor je
// aanzetten) — het PDF-afschrift is dan het enige dat je hebt.
//
// pdf.js geeft losse tekst-items terug (`extractPdfItems` in
// `../receipts/pdfText.js`), elk met een x/y-positie in PDF-punten. De kop en
// de tabel staan in vaste kolommen, maar de kolom-x'en staan niet vast (ze
// verschuiven per afschrift een paar punten) — we lezen ze daarom uit de
// kopregels van de pagina zelf i.p.v. met harde getallen te werken.
//
// Vorm, net als de andere bankparsers (zie common.js):
//   { date, amount, type, merchant, remi, raw, account, counterparty, balance }
import { toIsoDate, parseAmount, makeTransaction, collapse } from './common'
import { extractPdfItems } from '../receipts/pdfText'

const LABEL = {
  datumVanaf: 'datum vanaf',
  datumTot: 'datum tot en met',
  beginsaldo: 'beginsaldo',
  eindsaldo: 'eindsaldo',
  iban: 'iban / rekeningnummer',
  bic: 'bic',
  totaalAf: 'totaal afgeschreven',
  totaalBij: 'totaal bijgeschreven',
  tenNameVan: 'ten name van',
  rente: 'rente',
  type: 'type',
  tegenrekening: 'tegenrekening',
  naam: 'naam/omschrijving',
  bedragAf: 'bedrag af (debet)',
  bedragBij: 'bedrag bij (credit)',
}

const norm = s => collapse(s).toLowerCase().replace(/\s+/g, ' ')

/** Groepeert losse items in regels (per pagina), top naar beneden, links naar rechts. */
function toLines(items) {
  const perPagina = new Map()
  for (const it of items ?? []) {
    if (typeof it?.str !== 'string' || !it.str.trim()) continue
    const pagina = it.page ?? 1
    if (!perPagina.has(pagina)) perPagina.set(pagina, [])
    perPagina.get(pagina).push(it)
  }

  const paginas = []
  for (const [pagina, pItems] of [...perPagina.entries()].sort((a, b) => a[0] - b[0])) {
    const regels = []
    for (const it of pItems) {
      let regel = regels.find(r => Math.abs(r.y - it.y) <= 3)
      if (!regel) { regel = { y: it.y, items: [] }; regels.push(regel) }
      regel.items.push({ x: it.x, str: it.str })
    }
    regels.sort((a, b) => b.y - a.y)
    regels.forEach(r => r.items.sort((a, b) => a.x - b.x))
    paginas.push({ pagina, regels })
  }
  return paginas
}

const lineText = regel => collapse(regel.items.map(it => it.str).join(' '))

/** Items van een regel wiens x binnen [van, tot) valt, samengevoegd tot tekst. */
function sliceText(regel, van, tot = Infinity) {
  return collapse(regel.items.filter(it => it.x >= van && it.x < tot).map(it => it.str).join(' '))
}

/**
 * Zoekt een label-item op zijn genormaliseerde tekst en geeft de waarde terug
 * die op de eerstvolgende regel staat. De kolombreedte wordt bepaald door het
 * midden tussen dit label en zijn buren op diezelfde regel: een waarde staat
 * soms een stuk links van zijn eigen label (tot ~20pt verschoven), dus een
 * vast marge-getal knipt al snel in de buurkolom.
 */
function labelValue(regels, labelNorm) {
  for (let i = 0; i < regels.length - 1; i++) {
    const regel = regels[i]
    const idx = regel.items.findIndex(it => norm(it.str) === labelNorm)
    if (idx < 0) continue
    const x = regel.items[idx].x
    const vorige = idx > 0 ? regel.items[idx - 1].x : null
    const volgende = idx < regel.items.length - 1 ? regel.items[idx + 1].x : null
    const van = vorige != null ? (vorige + x) / 2 : -Infinity
    const tot = volgende != null ? (x + volgende) / 2 : Infinity
    return sliceText(regels[i + 1], van, tot)
  }
  return ''
}

/** x-positie van een kolomkop op de regel met "Bedrag af"/"Bedrag bij". */
function findColumnX(regel, labelNorm) {
  const it = regel.items.find(it2 => norm(it2.str).startsWith(labelNorm))
  return it ? it.x : null
}

/** CR = tegoed (positief), D = tekort (negatief). */
function signedSaldo(raw) {
  const m = collapse(raw).match(/^([\d.,]+)\s*(CR|D)\b/i)
  if (!m) return null
  const bedrag = parseAmount(m[1], ',')
  return /^D$/i.test(m[2]) ? -bedrag : bedrag
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Jaartal bij een DD-MM zonder jaar, afgeleid uit de periode (met jaarwisseling). */
function inferYear(ddmm, periodeVan, periodeTot) {
  const [, dag, maand] = ddmm.match(/^(\d{2})-(\d{2})$/) ?? []
  if (!dag) return ''
  const jaren = new Set()
  if (periodeVan) jaren.add(Number(periodeVan.slice(0, 4)))
  if (periodeTot) jaren.add(Number(periodeTot.slice(0, 4)))
  for (const jaar of jaren) {
    const kandidaat = `${jaar}-${maand}-${dag}`
    if ((!periodeVan || kandidaat >= periodeVan) && (!periodeTot || kandidaat <= periodeTot)) return kandidaat
  }
  const jaar = [...jaren][0] ?? new Date().getFullYear()
  return `${jaar}-${maand}-${dag}`
}

/**
 * Pure parser: verwacht de platte lijst tekst-items die `extractPdfItems`
 * (zie `../receipts/pdfText.js`) uit het PDF-afschrift haalt.
 * @param {{ str: string, x: number, y: number, page: number }[]} items
 */
export function parseRabobankPdfItems(items) {
  const warnings = []
  const paginas = toLines(items)
  const alleRegels = paginas.flatMap(p => p.regels)

  if (!alleRegels.length) return { transactions: [], warnings: ['Geen tekst gevonden in dit PDF-bestand.'] }

  const datumVanafRaw = labelValue(alleRegels, LABEL.datumVanaf)
  const datumTotRaw = labelValue(alleRegels, LABEL.datumTot)
  const periodeVan = toIsoDate(datumVanafRaw, 'DD-MM-YYYY')
  const periodeTot = toIsoDate(datumTotRaw, 'DD-MM-YYYY')
  const beginsaldo = signedSaldo(labelValue(alleRegels, LABEL.beginsaldo))
  const eindsaldo = signedSaldo(labelValue(alleRegels, LABEL.eindsaldo))
  const ibanRaw = labelValue(alleRegels, LABEL.iban)
  const ibanMatch = ibanRaw.match(/^(NL\d{2})\s*([A-Z]{4}\s?[\d\s]{6,14})\s*EUR/i)
  const account = ibanMatch ? `${ibanMatch[1]}${ibanMatch[2]}`.replace(/\s+/g, '').toUpperCase() : ''
  const totaalAf = parseAmount(labelValue(alleRegels, LABEL.totaalAf), ',')
  const totaalBij = parseAmount(labelValue(alleRegels, LABEL.totaalBij), ',')
  const tenNameVan = labelValue(alleRegels, LABEL.tenNameVan)

  if (beginsaldo == null) warnings.push('Kon het beginsaldo niet uit het afschrift lezen.')
  if (!account) warnings.push('Kon de IBAN niet uit het afschrift lezen.')

  const transactions = []
  let lopendSaldo = beginsaldo ?? 0
  let sumAf = 0
  let sumBij = 0
  let skipped = 0

  // Kolom-x'en: per pagina opnieuw lezen (kop herhaalt zich), anders de
  // laatst bekende waarden aanhouden.
  let kolommen = null

  for (const { regels } of paginas) {
    let actief = false // pas true ná de tabelkop; false ná de voettekst-legenda
    for (let i = 0; i < regels.length; i++) {
      const regel = regels[i]
      const tekst = lineText(regel)

      if (norm(tekst).includes(LABEL.bedragAf) && norm(tekst).includes(LABEL.bedragBij)) {
        kolommen = {
          datum: findColumnX(regel, LABEL.rente) ?? 37,
          type: findColumnX(regel, LABEL.type) ?? 69,
          tegen: findColumnX(regel, LABEL.tegenrekening) ?? 89,
          naam: findColumnX(regel, LABEL.naam) ?? 206,
          af: findColumnX(regel, LABEL.bedragAf),
          bij: findColumnX(regel, LABEL.bedragBij),
        }
        actief = true
        continue
      }
      // Voettekst: typecode-legenda ("ba = betaalautomaat", …) of de CR/D-uitleg.
      if (/^[a-z]{2}\s*=\s*\S/i.test(tekst) || /^(cr|d)\s*=\s*\S/i.test(tekst)) { actief = false; continue }
      if (!actief || !kolommen || kolommen.af == null || kolommen.bij == null) continue

      const datumItem = regel.items.find(it => Math.abs(it.x - kolommen.datum) <= 10 && /^\d{2}-\d{2}$/.test(it.str.trim()))
      if (!datumItem) continue // vervolgregel van de vorige mutatie — hieronder afgehandeld

      const typeItem = regel.items.find(it => Math.abs(it.x - kolommen.type) <= 15)
      const bankType = typeItem ? collapse(typeItem.str).toLowerCase() : ''
      const tegenrekening = sliceText(regel, kolommen.tegen - 10, kolommen.naam - 10).replace(/\s+/g, '')
      const amountStart = Math.min(kolommen.af, kolommen.bij) - 15
      const merchantFirst = sliceText(regel, kolommen.naam - 10, amountStart)
      const midden = (kolommen.af + kolommen.bij) / 2
      const amountItems = regel.items.filter(it => it.x >= amountStart)
      let bedrag = 0
      let type = null
      if (amountItems.length) {
        const tekstBedrag = collapse(amountItems.map(it => it.str).join('')).replace(/[^\d.,]/g, '')
        bedrag = parseAmount(tekstBedrag, ',')
        type = amountItems[0].x < midden ? 'debit' : 'credit'
      }

      // Vervolgregels: tot de volgende mutatie (nieuwe datum in de datumkolom)
      // of het einde van de tabel. "Verwerkingsdatum: DD-MM-YYYY" levert het
      // jaar (en gaat niet mee in de omschrijving).
      const omschrijving = []
      let verwerkingsdatum = ''
      let j = i + 1
      for (; j < regels.length; j++) {
        const volgende = regels[j]
        const volgendeTekst = lineText(volgende)
        if (/^[a-z]{2}\s*=\s*\S/i.test(volgendeTekst)) break
        if (norm(volgendeTekst).includes(LABEL.bedragAf)) break
        const heeftNieuweDatum = volgende.items.some(it => Math.abs(it.x - kolommen.datum) <= 10 && /^\d{2}-\d{2}$/.test(it.str.trim()))
        if (heeftNieuweDatum) break
        const stuk = sliceText(volgende, kolommen.naam - 10, amountStart)
        if (!stuk) continue
        const verwMatch = stuk.match(/^Verwerkingsdatum:?\s*(\d{2}-\d{2}-\d{4})/i)
        if (verwMatch) { verwerkingsdatum = verwMatch[1]; continue }
        omschrijving.push(stuk)
      }

      let date = ''
      if (verwerkingsdatum) date = toIsoDate(verwerkingsdatum, 'DD-MM-YYYY')
      else date = inferYear(datumItem.str.trim(), periodeVan, periodeTot)

      if (type === 'credit') { lopendSaldo = round2(lopendSaldo + bedrag); sumBij = round2(sumBij + bedrag) }
      else { lopendSaldo = round2(lopendSaldo - bedrag); sumAf = round2(sumAf + bedrag) }

      const tx = makeTransaction({
        date,
        amount: bedrag,
        type,
        merchant: merchantFirst,
        remi: omschrijving.join(' '),
        raw: [tekst, ...omschrijving].join(' | '),
        account,
        counterparty: tegenrekening,
        balance: lopendSaldo,
      })
      if (tx) {
        if (bankType) tx.bankType = bankType
        transactions.push(tx)
      } else skipped++
      i = j - 1 // de vervolgregels zijn verwerkt; niet nog eens als nieuwe mutatie proberen
    }
  }

  if (skipped) warnings.push(`${skipped} regel(s) overgeslagen (geen geldige datum of bedrag).`)

  if (beginsaldo != null && eindsaldo != null) {
    const verwacht = round2(beginsaldo + sumBij - sumAf)
    if (Math.abs(verwacht - eindsaldo) >= 0.01) {
      warnings.push(`Saldocontrole klopt niet: beginsaldo + bij − af (${verwacht}) ≠ eindsaldo (${eindsaldo}) volgens het afschrift.`)
    }
  }
  if (totaalAf && Math.abs(sumAf - totaalAf) >= 0.01) {
    warnings.push(`Totaal afgeschreven in het afschrift (${totaalAf}) komt niet overeen met de som van de mutaties (${sumAf}).`)
  }
  if (totaalBij && Math.abs(sumBij - totaalBij) >= 0.01) {
    warnings.push(`Totaal bijgeschreven in het afschrift (${totaalBij}) komt niet overeen met de som van de mutaties (${sumBij}).`)
  }
  if (!transactions.length) warnings.push('Geen mutaties gevonden in dit afschrift.')

  return { transactions, warnings, tenNameVan: tenNameVan || '' }
}

/** Herkent of de tekst van een PDF een Rabobank-rekeningafschrift is. */
export function looksLikeRabobankStatement(fullText) {
  const t = norm(fullText)
  return t.includes('rekeningafschrift') && (t.includes('rabobank') || t.includes('rabo'))
}

/**
 * Leest en parseert een Rabobank-PDF-afschrift in één stap (browser + Node).
 * @param {ArrayBuffer|Uint8Array} arrayBuffer
 */
export async function parseRabobankPdf(arrayBuffer) {
  const items = await extractPdfItems(arrayBuffer)
  const fullText = items.map(it => it.str).join(' ')
  if (!looksLikeRabobankStatement(fullText)) {
    return {
      transactions: [],
      warnings: ['Dit lijkt geen Rabobank-afschrift; van ABN en Revolut kun je een CSV/TAB exporteren.'],
      isRabobank: false,
    }
  }
  const result = parseRabobankPdfItems(items)
  return { ...result, isRabobank: true }
}
