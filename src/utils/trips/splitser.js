/**
 * Splitser-PDF ("Settlement") lezen.
 *
 * De tekst komt uit `extractPdfText` (regels per pagina). Wat we eruit halen:
 *  - de naam van de groep ("Settlement - Parijs");
 *  - de sectie `Balance`: per lid het saldo en Expenses +/− (controlegetallen);
 *  - de sectie `Expenses`: de losse regels met betaler, bedrag, datum en
 *    de deelnemers met hun aandeel;
 *  - `Total spent €x` als tweede controle.
 *
 * Puur: geen db, geen React, geen pdf.js. Zie `docs/voorbeelden/splitser-parijs.txt`
 * voor de fixture waar dit bestand tegenaan getest wordt.
 */

const MAANDEN_EN = ['january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december']

// Kopregels en ruis die nooit een uitgave zijn.
const SKIP = [
  /^Continuing on next page$/i,
  /^Payer\s+Description\s+Amount\s+Date\s+Participants$/i,
  /^Member\s+Balance/i,
  /^Expenses\s+Incomes\s+Payments$/i,
  /^Settlement\b/i,
  /^Page\s+\d+/i,
]

const ROW_RE = /^(.+?)\s+€\s*(-?[\d.,]+)\s+(\d{2}-\d{2}-\d{4})\s+(.+)$/
const PARTICIPANT_RE = /([^,()]+?)\s*\(\s*€\s*(-?[\d.,]+)\s*\)/g
const BALANCE_RE = /^(.+?)\s+(-?€\s*[\d.,]+)((?:\s+-?€\s*[\d.,]+){6})\s*$/
const TOTAL_RE = /^Total spent\s+€\s*(-?[\d.,]+)/i
const NAME_RE = /^Settlement\s*-\s*(.+?)\s*$/i
const HEAD_DATE_RE = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/

/**
 * '1.234,56' / '1,234.56' / '318.96' → 318.96. Splitser rekent in euro's met
 * een punt als decimaalteken, maar we accepteren beide schrijfwijzen.
 */
export function parseBedrag(raw) {
  let s = String(raw ?? '').replace(/[€\s]/g, '')
  const negatief = s.startsWith('-')
  if (negatief) s = s.slice(1)
  const komma = s.lastIndexOf(',')
  const punt = s.lastIndexOf('.')
  if (komma >= 0 && punt >= 0) {
    // Het laatste scheidingsteken is de decimaal, de andere zijn duizendtallen.
    const dec = Math.max(komma, punt)
    s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1)
  } else if (komma >= 0) {
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (punt >= 0 && s.split('.').length > 2) {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negatief ? -n : n
}

/** '14-07-2026' → '2026-07-14'. */
export function parseDatum(raw) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(String(raw ?? '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export const round2 = n => Math.round((Number(n) || 0) * 100) / 100

function parseKopDatum(regel) {
  const m = HEAD_DATE_RE.exec(regel)
  if (!m) return null
  const maand = MAANDEN_EN.indexOf(m[2].toLowerCase())
  if (maand < 0) return null
  return `${m[3]}-${String(maand + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
}

function parseDeelnemers(staart) {
  const rest = String(staart)
  const deelnemers = []
  let gedekt = 0
  PARTICIPANT_RE.lastIndex = 0
  let m
  while ((m = PARTICIPANT_RE.exec(rest)) !== null) {
    const naam = m[1].replace(/^[,\s]+/, '').trim()
    const share = parseBedrag(m[2])
    if (!naam || share == null) return null
    deelnemers.push({ name: naam, share: round2(share) })
    gedekt += m[0].length
  }
  // De staart moet (op komma's en spaties na) helemaal uit deelnemers bestaan;
  // anders is de regel afgebroken en horen we hem aan de volgende te plakken.
  if (!deelnemers.length) return null
  const overig = rest.replace(PARTICIPANT_RE, '').replace(/[,\s]/g, '')
  if (overig.length > 0 || gedekt === 0) return null
  return deelnemers
}

// De betaler is het eerste woord, tenzij een bekend lid met een spatie in de
// naam beter past ("Jan Willem Boodschappen €10 …").
function splitsBetaler(kop, leden) {
  const tekst = kop.trim()
  const kandidaat = leden
    .filter(lid => tekst.toLowerCase().startsWith(`${lid.toLowerCase()} `))
    .sort((a, b) => b.length - a.length)[0]
  if (kandidaat) return { payer: kandidaat, description: tekst.slice(kandidaat.length).trim() }
  const spatie = tekst.indexOf(' ')
  if (spatie < 0) return { payer: tekst, description: '' }
  return { payer: tekst.slice(0, spatie), description: tekst.slice(spatie + 1).trim() }
}

function parseRegel(regel, leden) {
  const m = ROW_RE.exec(regel)
  if (!m) return null
  const amount = parseBedrag(m[2])
  const date = parseDatum(m[3])
  const participants = parseDeelnemers(m[4])
  if (amount == null || !date || !participants) return null
  const { payer, description } = splitsBetaler(m[1], leden)
  if (!payer || !description) return null
  return { date, description, amount: round2(amount), payer, participants }
}

function toRegels(input) {
  const tekst = Array.isArray(input) ? input.join('\n') : String(input ?? '')
  return tekst
    .split(/\r?\n/)
    .map(r => r.replace(/\u00a0/g, ' ').trim())
    .filter(Boolean)
    .filter(r => !/^─+\s*pagina\s*─+$/i.test(r))
}

/**
 * Leest de tekst van een Splitser-settlement.
 *
 * @param {string|string[]} input  tekst uit extractPdfText
 * @returns {{
 *   name: string|null, settledOn: string|null, members: string[],
 *   balance: Object<string, {balance, expensesPlus, expensesMinus}>,
 *   rows: Array<{date, description, amount, payer, participants}>,
 *   totalSpent: number|null, sumAmounts: number,
 *   from: string|null, to: string|null, warnings: string[]
 * }}
 */
export function parseSplitserPdf(input) {
  const regels = toRegels(input)
  const warnings = []

  let name = null
  let settledOn = null
  let totalSpent = null
  const balance = {}
  const members = []

  // Eerste ronde: kop, de balans-sectie en de controlegetallen. We hebben de
  // ledennamen nodig vóór we de uitgaven lezen (de betaler kan een spatie bevatten).
  let modus = 'kop'
  for (const regel of regels) {
    if (/^Balance$/i.test(regel)) { modus = 'balance'; continue }
    if (/^Expenses$/i.test(regel)) { modus = 'expenses'; continue }
    if (!name) {
      const n = NAME_RE.exec(regel)
      if (n) { name = n[1]; continue }
    }
    if (!settledOn) {
      const d = parseKopDatum(regel)
      if (d) { settledOn = d; continue }
    }
    const t = TOTAL_RE.exec(regel)
    if (t) { totalSpent = round2(parseBedrag(t[1])); continue }
    if (modus !== 'balance') continue
    if (SKIP.some(re => re.test(regel))) continue
    const b = BALANCE_RE.exec(regel)
    if (!b) continue
    const bedragen = [b[2], ...b[3].trim().split(/\s+(?=-?€)/)].map(parseBedrag)
    const lid = b[1].trim()
    if (!lid || bedragen.some(x => x == null)) continue
    members.push(lid)
    balance[lid] = {
      balance: round2(bedragen[0]),
      expensesPlus: round2(bedragen[1]),
      expensesMinus: round2(bedragen[2]),
    }
  }

  // Tweede ronde: de uitgaven zelf. Een regel die niet matcht plakken we aan de
  // volgende — lange omschrijvingen breken in de PDF over twee tekstregels.
  const rows = []
  const overgeslagen = []
  let inExpenses = false
  let rest = ''
  for (const regel of regels) {
    if (/^Expenses$/i.test(regel)) { inExpenses = true; rest = ''; continue }
    if (/^Balance$/i.test(regel)) { inExpenses = false; rest = ''; continue }
    if (!inExpenses) continue
    if (TOTAL_RE.test(regel)) { inExpenses = false; rest = ''; continue }
    if (SKIP.some(re => re.test(regel))) continue
    if (parseKopDatum(regel)) continue

    const kandidaat = rest ? `${rest} ${regel}` : regel
    const rij = parseRegel(kandidaat, members)
    if (rij) {
      rows.push(rij)
      rest = ''
    } else if (rest) {
      // Twee regels achter elkaar onbruikbaar: de oudste laten vallen.
      overgeslagen.push(rest)
      rest = regel
    } else {
      rest = regel
    }
  }
  if (rest) overgeslagen.push(rest)

  // Een in Splitser verwijderde uitgave staat doorgestreept in de PDF, maar
  // in de tekstlaag als gewone regel. Als precies één regel het verschil met
  // "Total spent" (en de balans per lid) verklaart, is dat die regel.
  const verwijderd = findDeletedRow(rows, totalSpent, balance)
  if (verwijderd) {
    rows.splice(rows.indexOf(verwijderd), 1)
    warnings.push(`Doorgestreepte regel overgeslagen: "${verwijderd.description}" €${verwijderd.amount.toFixed(2)} (verwijderd in Splitser).`)
  }

  const sumAmounts = round2(rows.reduce((s, r) => s + r.amount, 0))
  const datums = rows.map(r => r.date).sort()

  if (!rows.length) warnings.push('Geen uitgaven gevonden in dit bestand. Is dit een Splitser-settlement?')
  if (totalSpent != null && Math.abs(totalSpent - sumAmounts) > 0.01) {
    warnings.push(`De regels tellen op tot €${sumAmounts.toFixed(2)}, terwijl er "Total spent €${totalSpent.toFixed(2)}" staat.`)
  }
  for (const regel of overgeslagen) warnings.push(`Niet begrepen regel: "${regel}"`)

  return {
    name,
    settledOn,
    members,
    balance,
    rows,
    totalSpent,
    sumAmounts,
    from: datums[0] ?? null,
    to: datums[datums.length - 1] ?? null,
    warnings,
  }
}

/**
 * Welke regel is in Splitser verwijderd (doorgestreept)? Alleen als het
 * verschil tussen de regels en "Total spent" door precies één regel wordt
 * verklaard — en, als de Balance-sectie er is, ook ieders aandeel klopt.
 * @returns de rij, of null
 */
export function findDeletedRow(rows, totalSpent, balance = {}) {
  if (totalSpent == null || !rows?.length) return null
  const som = round2(rows.reduce((s, r) => s + r.amount, 0))
  const verschil = round2(som - totalSpent)
  if (verschil <= 0.01) return null
  const kandidaten = rows.filter(r => Math.abs(r.amount - verschil) <= 0.01)
  const leden = Object.keys(balance ?? {}).filter(m => balance[m]?.expensesMinus != null)
  const passend = kandidaten.filter(r => leden.every(m => {
    const aandeel = round2(rows.reduce((s, x) => s + shareOf(x, m), 0))
    return Math.abs(round2(aandeel - shareOf(r, m)) - balance[m].expensesMinus) <= 0.01
  }))
  return passend.length === 1 ? passend[0] : null
}

/** Het aandeel van `naam` in één regel (0 als hij niet meedeed). */
export function shareOf(row, naam) {
  if (!naam) return 0
  const hit = (row?.participants ?? []).find(p => p.name.toLowerCase() === String(naam).toLowerCase())
  return round2(hit?.share ?? 0)
}

/** Σ myShare over alle regels. */
export function totalShareOf(rows, naam) {
  return round2((rows ?? []).reduce((s, r) => s + shareOf(r, naam), 0))
}

/**
 * Controle tegen de Balance-sectie: wat ik volgens de balans uitgegeven heb
 * (`Expenses −`) hoort gelijk te zijn aan Σ myShare.
 * @returns {{ ok: boolean, expected: number|null, actual: number, diff: number }}
 */
export function checkMyShare(parsed, naam) {
  const actual = totalShareOf(parsed?.rows ?? [], naam)
  const expected = parsed?.balance?.[naam]?.expensesMinus ?? null
  const diff = expected == null ? 0 : round2(actual - expected)
  return { ok: expected == null || Math.abs(diff) <= 0.01, expected, actual, diff }
}

/** Sleutel waarop we een regel herkennen bij een tweede import. */
export const rowKey = row => `${row?.date ?? ''}|${String(row?.description ?? '').trim().toLowerCase()}|${round2(row?.amount).toFixed(2)}`

/**
 * Vergelijkt een nieuwe import met wat er al in de database staat.
 * Bestaande regels blijven (met hun categorie en koppeling), nieuwe komen
 * erbij, regels die niet meer in de PDF staan verdwijnen.
 *
 * @param {Array} bestaand  rijen uit `tripItems` (met id)
 * @param {Array} nieuw     rijen uit `parseSplitserPdf`
 * @returns {{ toAdd: Array, kept: Array<{id, row}>, keptIds: number[], toRemove: number[] }}
 */
export function diffSplitserRows(bestaand, nieuw) {
  const byKey = new Map()
  for (const rij of (bestaand ?? [])) {
    const key = rowKey(rij)
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(rij)
  }
  const toAdd = []
  const kept = []
  for (const row of (nieuw ?? [])) {
    const lijst = byKey.get(rowKey(row))
    const hit = lijst?.shift()
    if (hit) kept.push({ id: hit.id, row })
    else toAdd.push(row)
  }
  const gehouden = new Set(kept.map(k => k.id))
  const toRemove = (bestaand ?? []).filter(r => !gehouden.has(r.id)).map(r => r.id)
  return { toAdd, kept, keptIds: [...gehouden], toRemove }
}
