// Voorbeelddata: een half jaar verzonnen transacties om de app te proberen
// zonder je eigen bankexport. Alles is fictief maar Nederlands en plausibel,
// inclusief vaste lasten (huur, energie, abonnementen), salaris op de 25e,
// een paar Tikkies en drie openstaande declaraties.
//
// De generator is deterministisch: dezelfde seed levert exact dezelfde rijen.
import { db } from '../db/db'
import { bulkRecordEvents } from './merchantLearning'

export const DEMO_MODE_KEY = 'demoMode'

/* ── Kleine PRNG (mulberry32) ─────────────────────────────────────────── */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = n => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const round2 = v => Math.round(v * 100) / 100

/* ── Vaste lasten: elke maand op dezelfde dag, (bijna) hetzelfde bedrag ── */
const RECURRING = [
  { day: 1, merchant: 'Woningstichting De Sleutel', amount: 1150, category: 'woning', subcategory: 'huur' },
  { day: 3, merchant: 'Vattenfall', amount: 132.5, category: 'woning', subcategory: 'energie' },
  { day: 5, merchant: 'Basic-Fit', amount: 24.99, category: 'abonnementen', subcategory: 'sportabonnement' },
  { day: 8, merchant: 'Spotify', amount: 11.99, category: 'abonnementen', subcategory: 'spotify' },
  { day: 12, merchant: 'Odido', amount: 18.5, category: 'abonnementen', subcategory: 'telefoonabonnement' },
  { day: 25, merchant: 'Salaris Werkgever BV', amount: 2450, category: 'salaris', subcategory: '', type: 'credit' },
]

/* ── Losse uitgaven per categorie ─────────────────────────────────────── */
const GROEPEN = [
  {
    min: 16, max: 20, category: 'boodschappen', subcategory: 'supermarkt',
    merchants: ['Albert Heijn', 'Jumbo', 'Lidl', 'Dirk van den Broek', 'Albert Heijn to go'],
    low: 6, high: 62,
  },
  {
    min: 3, max: 6, category: 'boodschappen', subcategory: 'eten_onderweg',
    merchants: ['Thuisbezorgd.nl', 'Domino’s Pizza', 'Bakkerij Van Dam', 'Subway'],
    low: 8, high: 32,
  },
  {
    min: 2, max: 5, category: 'afspreken_vrienden', subcategory: 'uiteten_afhalen',
    merchants: ['Restaurant De Kade', 'Cafe Zeezicht', 'Eetcafe Klein Amsterdam'],
    low: 14, high: 68,
  },
  {
    min: 1, max: 3, category: 'afspreken_vrienden', subcategory: 'cafe',
    merchants: ['Bar De Molen', 'Brouwerij Het Anker', 'Pathe Bioscoop'],
    low: 9, high: 45,
  },
  {
    min: 6, max: 9, category: 'reiskosten', subcategory: '',
    merchants: ['NS Groep', 'NS OV-Chipkaart', 'GVB Amsterdam', 'Q-Park parkeren'],
    low: 2.6, high: 28,
  },
  {
    min: 1, max: 3, category: 'cadeaus_overig', subcategory: '',
    merchants: ['Bol.com', 'Coolblue', 'HEMA'],
    low: 12, high: 85,
  },
  {
    min: 1, max: 3, category: 'gezondheid_verzorging', subcategory: '',
    merchants: ['Kruidvat', 'Etos', 'Apotheek De Linde'],
    low: 4, high: 38,
  },
  {
    min: 0, max: 2, category: 'kleding', subcategory: '',
    merchants: ['Zara', 'H&M', 'Uniqlo'],
    low: 18, high: 95,
  },
  {
    min: 0, max: 2, category: 'hobbys', subcategory: 'interieur',
    merchants: ['IKEA', 'Praxis', 'Gamma'],
    low: 9, high: 120,
  },
  {
    min: 0, max: 2, category: 'overige_kosten', subcategory: '',
    merchants: ['Postkantoor', 'Gemeente leges', 'Reparatie fiets'],
    low: 5, high: 40,
  },
  {
    min: 1, max: 3, category: 'voorschot', subcategory: '', type: 'credit',
    merchants: ['Tikkie K. de Vries', 'Tikkie S. Bakker', 'Tikkie M. Jansen'],
    low: 6, high: 42,
  },
  {
    min: 1, max: 1, category: 'bankoverschrijving', subcategory: '',
    merchants: ['Spaarrekening'],
    low: 150, high: 300,
  },
]

// Openstaande declaraties (werk): reiskosten die je nog terugkrijgt.
const CLAIMS = [
  { merchant: 'NS Groep zakelijke reis', amount: 38.4, offset: 0, day: 6 },
  { merchant: 'NS Groep zakelijke reis', amount: 24.2, offset: 1, day: 14 },
  { merchant: 'Hotel Zakelijk Utrecht', amount: 96.5, offset: 1, day: 21 },
]

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * @param months  aantal maanden terug (inclusief de huidige)
 * @param seed    zelfde seed = zelfde transacties
 * @param today   referentiedatum (voor tests)
 * @returns rijen in databasevorm: { date, amount, type, category, subcategory, note, claimStatus? }
 */
export function generateDemoTransactions({ months = 6, seed = 20260914, today = new Date() } = {}) {
  const rand = rng(seed)
  const pick = list => list[Math.floor(rand() * list.length)]
  const between = (low, high) => round2(low + rand() * (high - low))
  const count = (min, max) => min + Math.floor(rand() * (max - min + 1))

  const out = []
  const jaar = today.getFullYear()
  const maand = today.getMonth() + 1     // 1-based
  const vandaag = today.getDate()

  for (let back = months - 1; back >= 0; back--) {
    const totaalMaanden = jaar * 12 + (maand - 1) - back
    const y = Math.floor(totaalMaanden / 12)
    const m = (totaalMaanden % 12) + 1
    const huidig = back === 0
    const totaalDagen = daysInMonth(y, m)
    const laatsteDag = huidig ? Math.min(vandaag, totaalDagen) : totaalDagen
    // De lopende maand is nog niet voorbij: naar rato minder losse uitgaven.
    const deelMaand = laatsteDag / totaalDagen

    for (const vast of RECURRING) {
      if (vast.day > laatsteDag) continue
      // Kleine ruis op het salaris zodat het realistisch blijft, maar klein
      // genoeg om als terugkerende post herkend te worden.
      const ruis = vast.type === 'credit' ? between(-25, 25) : 0
      out.push({
        date: iso(y, m, vast.day),
        amount: round2(vast.amount + ruis),
        type: vast.type ?? 'debit',
        category: vast.category,
        subcategory: vast.subcategory,
        note: vast.merchant,
      })
    }

    for (const groep of GROEPEN) {
      const n = Math.round(count(groep.min, groep.max) * deelMaand)
      for (let i = 0; i < n; i++) {
        const day = 1 + Math.floor(rand() * laatsteDag)
        out.push({
          date: iso(y, m, day),
          amount: between(groep.low, groep.high),
          type: groep.type ?? 'debit',
          category: groep.category,
          subcategory: groep.subcategory,
          note: pick(groep.merchants),
        })
      }
    }
  }

  // Drie openstaande declaraties in de laatste twee maanden.
  for (const claim of CLAIMS) {
    const totaalMaanden = jaar * 12 + (maand - 1) - claim.offset
    const y = Math.floor(totaalMaanden / 12)
    const m = (totaalMaanden % 12) + 1
    const laatsteDag = claim.offset === 0 ? vandaag : daysInMonth(y, m)
    out.push({
      date: iso(y, m, Math.min(claim.day, laatsteDag)),
      amount: claim.amount,
      type: 'debit',
      category: 'reiskosten',
      subcategory: '',
      note: claim.merchant,
      claimStatus: 'open',
      claimBatchId: null,
    })
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/* ── In de database zetten ────────────────────────────────────────────── */

// Categorieën die in de gekozen template niet bestaan vallen terug op de
// systeemrollen, zodat voorbeelddata ook bij "Minimaal" klopt.
function resolver(categories) {
  const byKey = new Map(categories.map(c => [c.key, c]))
  const roleKey = (role, fallback) => categories.find(c => c.role === role)?.key ?? fallback
  const rest = roleKey('uncategorized', 'overige_kosten')
  const income = roleKey('income', 'salaris')
  const transfer = roleKey('transfer', 'bankoverschrijving')

  return tx => {
    const cat = byKey.get(tx.category)
    if (cat) {
      const heeftSub = (cat.subs ?? []).some(s => s.key === tx.subcategory)
      return { ...tx, subcategory: heeftSub ? tx.subcategory : '' }
    }
    if (tx.category === 'salaris') return { ...tx, category: income, subcategory: '' }
    if (tx.category === 'bankoverschrijving' || tx.category === 'voorschot') {
      return { ...tx, category: transfer, subcategory: '' }
    }
    return { ...tx, category: rest, subcategory: '' }
  }
}

/** Zet de voorbeelddata in de database en markeert de app als demo. */
export async function loadDemoData(options = {}) {
  const categories = await db.categories.toArray()
  const map = resolver(categories)
  const txs = generateDemoTransactions(options).map(map)

  const now = Date.now()
  await db.transactions.bulkAdd(txs.map(t => ({ ...t, importedAt: now })))
  // Leerdata meteen vullen: dan herkent de app vaste lasten en "Verwacht".
  await bulkRecordEvents(txs)
  await db.settings.put({ key: DEMO_MODE_KEY, value: true })
  return txs.length
}

/**
 * Voorbeelddata weggooien: alles behalve de categorieën en de instellingen,
 * zodat je met je eigen bankbestand verder kunt. Eigen herkenningsregels
 * blijven staan (die maakt de demo niet aan).
 */
export async function clearDemoData() {
  await db.transaction('rw', db.transactions, db.merchantHistory, db.claimBatches, db.settings, async () => {
    await db.transactions.clear()
    await db.merchantHistory.clear()
    await db.claimBatches.clear()
    await db.settings.delete(DEMO_MODE_KEY)
  })
}
