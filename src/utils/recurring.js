import { normalizeMerchant } from './merchantLearning'
import { countsInTotals } from './claims'

const DAG = 24 * 60 * 60 * 1000

/** Hoeveel dagen na de verwachte dag een post als "gemist" geldt. */
export const GEMIST_SPELING = 5
/** Na zoveel dagen zonder betaling gaan we ervan uit dat de post is opgezegd. */
const OPGEZEGD_NA_DAGEN = 70

/**
 * Sleutel waaronder betalingen van dezelfde vaste last samenkomen:
 * categorie + subcategorie + de genormaliseerde omschrijving. Zonder
 * omschrijving valt hij terug op het afgeronde bedrag, want dan is dat het
 * enige onderscheid tussen bijvoorbeeld huur (€816) en energie (€8).
 *
 * De omschrijving wint van het bedrag zodat "Spotify" één regel blijft als de
 * prijs omhoog gaat — precies het geval dat we willen signaleren.
 */
export function groepSleutel(tx) {
  const { baseKey } = normalizeMerchant(tx.note)
  return `${tx.category}|${tx.subcategory || '_none'}|${baseKey || `#${Math.round(tx.amount)}`}`
}

/** Mediaan; bij een even aantal het gemiddelde van de twee middelste. */
export function mediaan(getallen) {
  if (!getallen.length) return 0
  const s = [...getallen].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const pad = n => String(n).padStart(2, '0')
const dagenIn = (jaar, maand) => new Date(jaar, maand, 0).getDate()
const alsDatum = ymd => new Date(`${ymd}T12:00:00`)

/** Vandaag als YYYY-MM-DD (los van formatters zodat dit bestand puur blijft). */
export function vandaag(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Vindt terugkerende posten in een lijst transacties.
 *
 * Een groep is terugkerend zodra er in ≥ `minMaanden` verschillende maanden
 * een betaling zit. Per post wordt bepaald:
 *  - `amount`     het maandbedrag (mediaan van alle betalingen);
 *  - `verhoogd`   de laatste betaling is hoger dan de laatste andere daarvoor;
 *  - `paid`       er is in `maand` betaald;
 *  - `gemist`     er werd in `maand` rond de gebruikelijke dag een betaling
 *                 verwacht, die dag is voorbij en er is niets afgeschreven
 *                 (en de post lijkt niet opgezegd).
 *
 * @param txs          alle transacties (ongefilterd)
 * @param categoryKeys Set met categorieën die als vaste last gelden; leeg/weg
 *                     = alle categorieën
 * @param transferKey  sleutel van de overboekingscategorie
 * @param maand        'YYYY-MM' waarvoor betaald/gemist wordt bepaald
 * @param today        'YYYY-MM-DD', standaard vandaag
 * @param catMap       key -> categorie, voor label en icoon (optioneel)
 */
export function detecteerVasteLasten(txs, {
  categoryKeys = null,
  transferKey = null,
  maand = null,
  today = null,
  catMap = {},
  minMaanden = 2,
} = {}) {
  const nu = today ?? vandaag()
  const maandPrefix = maand ?? nu.slice(0, 7)

  const groepen = new Map()
  for (const tx of txs ?? []) {
    // Alleen echte eigen afschrijvingen: geen bijschrijvingen, geen lopende
    // declaraties of hun uitbetaling, en niet de overboekingscategorie.
    if (tx.type !== 'debit' || !countsInTotals(tx)) continue
    if (transferKey && tx.category === transferKey) continue
    if (categoryKeys && categoryKeys.size && !categoryKeys.has(tx.category)) continue
    const sleutel = groepSleutel(tx)
    if (!groepen.has(sleutel)) groepen.set(sleutel, [])
    groepen.get(sleutel).push(tx)
  }

  const posten = []
  for (const [sleutel, betalingen] of groepen) {
    betalingen.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const maanden = new Set(betalingen.map(t => t.date.slice(0, 7)))
    if (maanden.size < minMaanden) continue

    const bedragen = betalingen.map(t => t.amount)
    const amount = mediaan(bedragen)
    const laatste = betalingen[betalingen.length - 1]

    // Prijsstijging: vergelijk de laatste betaling met de meest recente
    // betaling daarvoor die een ánder bedrag had.
    let vorigBedrag = null
    for (let i = betalingen.length - 2; i >= 0; i--) {
      if (betalingen[i].amount !== laatste.amount) { vorigBedrag = betalingen[i].amount; break }
    }
    const verhoogd = vorigBedrag != null && laatste.amount > vorigBedrag

    // Verwachte dag van de maand = mediaan van de dagen waarop betaald werd.
    const dag = Math.round(mediaan(betalingen.map(t => Number(t.date.slice(8, 10)))))
    const [jaar, mnd] = maandPrefix.split('-').map(Number)
    const verwachteDag = Math.min(Math.max(dag, 1), dagenIn(jaar, mnd))
    const verwachteDatum = `${maandPrefix}-${pad(verwachteDag)}`

    const paid = maanden.has(maandPrefix)
    const dagenVoorbij = (alsDatum(nu) - alsDatum(verwachteDatum)) / DAG
    const stilVanaf = (alsDatum(verwachteDatum) - alsDatum(laatste.date)) / DAG
    const gemist = !paid && dagenVoorbij > GEMIST_SPELING && stilVanaf <= OPGEZEGD_NA_DAGEN

    const cat = catMap[laatste.category]
    const sub = cat?.subs?.find(s => s.key === laatste.subcategory)
    const note = [...betalingen].reverse().find(t => t.note)?.note ?? ''

    posten.push({
      id: sleutel,
      category: laatste.category,
      subcategory: laatste.subcategory || '',
      label: sub?.label || note || cat?.label || laatste.category,
      icon: cat?.icon ?? '📄',
      note,
      amount,
      perJaar: amount * 12,
      lastAmount: laatste.amount,
      vorigBedrag,
      verhoogd,
      verschil: verhoogd ? laatste.amount - vorigBedrag : 0,
      lastDate: laatste.date,
      verwachteDag,
      maanden: [...maanden].sort(),
      monthCount: maanden.size,
      paid,
      gemist,
      transactions: betalingen,
    })
  }

  return posten.sort((a, b) => b.amount - a.amount)
}
