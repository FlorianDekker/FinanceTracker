/**
 * Declaraties (werkkosten die je voorschiet en terugkrijgt).
 *
 * Een transactie krijgt een `claimStatus`:
 *   null        gewone transactie
 *   'open'      gemarkeerd als declaratie, nog niet ingediend
 *   'submitted' ingediend bij werk (zit in een batch)
 *   'paid'      terugbetaald door werk
 *   'rejected'  afgekeurd -> telt gewoon mee als uitgave in zijn categorie
 *   'payout'    de inkomende bulkbetaling van werk; telt niet als inkomen
 *
 * Alles wat "telt deze transactie mee in de cijfers?" moet weten gebruikt de
 * helpers hieronder. Geen losse claimStatus-vergelijkingen in hooks of charts.
 *
 * Dit bestand is bewust vrij van database- en React-imports zodat het overal
 * (en in tests) zonder Dexie te gebruiken is. De instelling `claimExpiryMonths`
 * leeft in `src/hooks/useClaims.js`.
 */

export const CLAIM_STATUSES = ['open', 'submitted', 'paid', 'rejected', 'payout']

export const CLAIM_STATUS_LABELS = {
  open: 'Open',
  submitted: 'Ingediend',
  paid: 'Uitbetaald',
  rejected: 'Afgekeurd',
  payout: 'Uitbetaling',
}

// Klassen uit de Tailwind-laag van de app (zie index.css).
export const CLAIM_STATUS_CLASSES = {
  open: 'bg-accent-dim text-accent',
  submitted: 'bg-orange-dim text-orange',
  paid: 'bg-green-dim text-green',
  rejected: 'bg-red-dim text-red',
  payout: 'bg-surface-2 text-muted',
}

// Statussen waarin de uitgave (nog) door werk vergoed wordt en dus niet meetelt.
const NOT_MY_EXPENSE = new Set(['open', 'submitted', 'paid'])

export const DEFAULT_CLAIM_EXPIRY_MONTHS = 6

/** Altijd via deze functie lezen: oude rijen hebben geen claimStatus-veld. */
export function claimStatusOf(tx) {
  const status = tx?.claimStatus ?? null
  return CLAIM_STATUSES.includes(status) ? status : null
}

/** Een declaratie (dus niet de inkomende uitbetaling), ongeacht de fase. */
export function isClaim(tx) {
  const status = claimStatusOf(tx)
  return status !== null && status !== 'payout'
}

/**
 * Loopt er nog een vergoeding op deze uitgave (open/ingediend/uitbetaald)?
 * Zo ja: de uitgave is niet van jou en telt nergens mee.
 */
export function isOpenClaim(tx) {
  return NOT_MY_EXPENSE.has(claimStatusOf(tx))
}

/** De inkomende bulkbetaling van werk. */
export function isPayout(tx) {
  return claimStatusOf(tx) === 'payout'
}

/** Telt deze afschrijving mee als uitgave? (afgekeurde declaraties: ja) */
export function isCountedExpense(tx) {
  return tx?.type === 'debit' && !isOpenClaim(tx)
}

/** Telt deze bijschrijving mee als inkomen/correctie? (uitbetaling: nee) */
export function isCountedIncome(tx) {
  return tx?.type === 'credit' && !isPayout(tx) && !isOpenClaim(tx)
}

/**
 * Eén predicaat voor alle totalen, grafieken en budgetten: sluit lopende
 * declaraties en declaratie-uitbetalingen uit, laat de rest ongemoeid.
 */
export function countsInTotals(tx) {
  return !isOpenClaim(tx) && !isPayout(tx)
}

/** Handig voor in-memory lijsten; Dexie-queries gebruiken .filter(countsInTotals). */
export function onlyCounted(txs) {
  return (txs ?? []).filter(countsInTotals)
}

/** Volledige maanden tussen de transactiedatum en nu. */
export function claimAgeMonths(tx, now = new Date()) {
  const date = String(tx?.date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}/.test(date)) return 0
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const d = Number(date.slice(8, 10))
  const ref = now instanceof Date ? now : new Date(now)
  let months = (ref.getFullYear() - y) * 12 + (ref.getMonth() + 1 - m)
  if (ref.getDate() < d) months -= 1
  return Math.max(0, months)
}

/**
 * Nog niet ingediend en bijna te oud om te declareren: vanaf één maand voor
 * de vervaltermijn waarschuwen.
 */
export function isExpiringSoon(tx, expiryMonths = DEFAULT_CLAIM_EXPIRY_MONTHS, now = new Date()) {
  if (claimStatusOf(tx) !== 'open') return false
  const limit = Math.max(1, Number(expiryMonths) || DEFAULT_CLAIM_EXPIRY_MONTHS) - 1
  return claimAgeMonths(tx, now) >= limit
}

/** Totaal + aantal van alles wat nog bij werk uitstaat (open + ingediend). */
export function outstandingClaims(txs) {
  let total = 0
  let count = 0
  for (const tx of txs ?? []) {
    const status = claimStatusOf(tx)
    if (status !== 'open' && status !== 'submitted') continue
    total += tx.amount ?? 0
    count += 1
  }
  return { total, count }
}

/* ------------------------------------------------------------------ *
 * Batches: een bundel declaraties die je in één keer indient.          *
 *   open       nog aan het samenstellen (bestaat in de praktijk niet;  *
 *              een batch ontstaat pas bij het indienen)                *
 *   submitted  ingediend bij werk, wacht op de bulkbetaling            *
 *   closed     uitbetaald en afgehandeld                               *
 * ------------------------------------------------------------------ */

export const BATCH_STATUS_LABELS = {
  open: 'Concept',
  submitted: 'Ingediend',
  closed: 'Afgehandeld',
}

/** Twee decimalen, zodat 0,1 + 0,2 nooit als verschil opduikt. */
export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/** Bedragen gelden als gelijk zodra ze binnen een cent van elkaar liggen. */
export function amountsMatch(a, b) {
  return Math.abs(round2(a) - round2(b)) <= 0.01
}

export function sumAmount(txs) {
  return round2((txs ?? []).reduce((s, tx) => s + (tx?.amount ?? 0), 0))
}

/** Is deze open declaratie over de termijn heen (dus niet meer in te dienen)? */
export function isExpired(tx, expiryMonths = DEFAULT_CLAIM_EXPIRY_MONTHS, now = new Date()) {
  if (claimStatusOf(tx) !== 'open') return false
  const limit = Math.max(1, Number(expiryMonths) || DEFAULT_CLAIM_EXPIRY_MONTHS)
  return claimAgeMonths(tx, now) >= limit
}

/* ------------------------------------------------------------------ *
 * Welke categorie stellen we voor bij afkeuren?                        *
 * ------------------------------------------------------------------ */

/**
 * De oude werkwijze: werkkosten boekten op de categorie Voorschot. Bij het
 * afkeuren wil je juist de échte categorie kiezen, dus zo'n uitgave heeft een
 * voorstel nodig. `VOORSCHOT_KEY` staat hier (en niet in de hooks) zodat de
 * logica zonder Dexie te testen is.
 */
export const VOORSCHOT_KEY = 'voorschot'

/**
 * Een categorie die niets zegt over wáár de uitgave thuishoort: leeg, Voorschot
 * of de restbak. Alleen dan is een voorstel zinvol — en zo'n voorstel zelf mag
 * er nooit een zijn, anders leert de app van zijn eigen verlegenheid.
 */
export function isVagueCategory(key, { voorschotKey = VOORSCHOT_KEY, uncategorizedKey = '' } = {}) {
  if (!key) return true
  if (voorschotKey && key === voorschotKey) return true
  return !!uncategorizedKey && key === uncategorizedKey
}

/**
 * Pure keuzelogica voor de afkeur-flow.
 *
 * @param tx  de declaratie die wordt afgekeurd
 * @param ctx { suggestion: { cat, sub } | null, uncategorizedKey?, voorschotKey? }
 *            `suggestion` komt van `categorizeWithLearning`; de aanroeper doet
 *            het async werk, deze functie beslist alleen.
 * @returns { category, subcategory, isSuggestion }
 */
export function suggestRejectCategory(tx, ctx = {}) {
  const huidig = {
    category: tx?.category ?? '',
    subcategory: tx?.subcategory ?? '',
    isSuggestion: false,
  }
  // Een uitgave die al een echte categorie heeft, houdt die gewoon.
  if (!isVagueCategory(huidig.category, ctx)) return huidig

  const cat = ctx.suggestion?.cat ?? ''
  if (!cat || isVagueCategory(cat, ctx)) return huidig
  return { category: cat, subcategory: ctx.suggestion?.sub ?? '', isSuggestion: true }
}

/** Korte leeftijd voor in een lijst: "deze maand", "1 mnd", "4 mnd". */
export function claimAgeLabel(tx, now = new Date()) {
  const months = claimAgeMonths(tx, now)
  return months === 0 ? 'deze maand' : `${months} mnd`
}

const MONTH_NAMES_LONG = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

/** Standaardnaam van een nieuwe batch: "Declaratie september 2026". */
export function defaultBatchName(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now)
  return `Declaratie ${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`
}

/** Bestandsnaam-veilige variant van een batchnaam. */
export function slugifyName(name) {
  const s = String(name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'declaratie'
}

// De standaardnaam begint al met "Declaratie", dus niet nog een keer.
export function claimBatchFileName(name) {
  const slug = slugifyName(name)
  return slug.startsWith('declaratie') ? `${slug}.csv` : `declaratie-${slug}.csv`
}

/* ------------------------------------------------------------------ *
 * CSV voor werk                                                        *
 * ------------------------------------------------------------------ */

// Nederlands Excel verwacht puntkomma's, een decimale komma en een BOM,
// anders worden accenten en bedragen verkeerd ingelezen.
const BOM = '\uFEFF'

function csvCell(value) {
  const s = String(value ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvAmount(n) {
  return round2(n).toFixed(2).replace('.', ',')
}

/**
 * @param items   transacties van de batch
 * @param catMap  { key: { label, subs } } uit useCategories, voor leesbare namen
 */
export function claimBatchCsv(items, catMap = {}) {
  const header = ['datum', 'omschrijving', 'categorie', 'subcategorie', 'bedrag']
  const rows = (items ?? []).map(tx => {
    const cat = catMap[tx.category]
    const sub = cat?.subs?.find(s => s.key === tx.subcategory)
    return [
      tx.date ?? '',
      tx.note ?? '',
      cat?.label ?? tx.category ?? '',
      sub?.label ?? '',
      csvAmount(tx.amount),
    ]
  })
  return BOM + [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n'
}

/* ------------------------------------------------------------------ *
 * Cijfers voor het staafdiagram                                        *
 * ------------------------------------------------------------------ */

/**
 * Per maand: wat heb je voorgeschoten (gemarkeerde afschrijvingen) en wat heb
 * je terugontvangen (uitbetalingen). Beide op transactiedatum.
 */
export function claimMonthlySeries(txs, { months = 12, now = new Date() } = {}) {
  const ref = now instanceof Date ? now : new Date(now)
  const buckets = []
  const index = new Map()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const row = { key, year: d.getFullYear(), month: d.getMonth() + 1, advanced: 0, received: 0 }
    buckets.push(row)
    index.set(key, row)
  }
  for (const tx of txs ?? []) {
    const row = index.get(String(tx?.date ?? '').slice(0, 7))
    if (!row) continue
    if (isPayout(tx)) row.received += tx.amount ?? 0
    else if (isClaim(tx) && tx.type === 'debit') row.advanced += tx.amount ?? 0
  }
  for (const row of buckets) {
    row.advanced = round2(row.advanced)
    row.received = round2(row.received)
  }
  return buckets
}

/**
 * Gemiddeld aantal dagen tussen de uitgave en de bulkbetaling waarmee die
 * declaratie werd afgerekend. `null` zolang er nog niets is uitbetaald.
 */
export function averageLeadDays(txs, batches) {
  const paidAt = new Map((batches ?? []).filter(b => b?.paidAt).map(b => [b.id, b.paidAt]))
  let total = 0
  let count = 0
  for (const tx of txs ?? []) {
    if (claimStatusOf(tx) !== 'paid') continue
    const at = paidAt.get(tx.claimBatchId)
    if (!at) continue
    const start = Date.parse(`${String(tx.date).slice(0, 10)}T00:00:00`)
    if (!Number.isFinite(start)) continue
    total += Math.max(0, (at - start) / 86400000)
    count += 1
  }
  return count ? Math.round(total / count) : null
}
