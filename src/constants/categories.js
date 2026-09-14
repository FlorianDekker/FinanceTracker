// Master category + subcategory list, ported from ImportTransactions.js

export const DEFAULT_CATEGORIES = [
  {
    key: 'woning',
    label: 'Woning',
    icon: '🏠',
    order: 0,
    type: 'expense',
    subs: [
      { key: 'huur', label: 'Huur' },
      { key: 'energie', label: 'Energie' },
      { key: 'afvalstoffenheffing', label: 'Afvalstoffenheffing' },
      { key: 'waterschapbelasting', label: 'Waterschapbelasting' },
      { key: 'woning_kopen', label: 'Woning kopen' },
    ],
  },
  {
    key: 'abonnementen',
    label: 'Abonnementen',
    icon: '📱',
    order: 1,
    type: 'expense',
    subs: [
      { key: 'spotify', label: 'Spotify' },
      { key: 'sportabonnement', label: 'Sportabonnement' },
      { key: 'telefoonabonnement', label: 'Telefoon abonnement' },
      { key: 'zorgverzekering', label: 'Zorgverzekering' },
      { key: 'aansprakelijkheidsverzekering', label: 'Aansprakelijkheidsverzekering' },
    ],
  },
  {
    key: 'boodschappen',
    label: 'Boodschappen',
    icon: '🛒',
    order: 2,
    type: 'expense',
    subs: [
      { key: 'supermarkt', label: 'Supermarkt' },
      { key: 'eten_onderweg', label: 'Eten onderweg' },
      { key: 'met_vrienden', label: 'Met vrienden' },
    ],
  },
  {
    key: 'reiskosten',
    label: 'Reiskosten',
    icon: '🚆',
    order: 3,
    type: 'expense',
    subs: [],
  },
  {
    key: 'cadeaus_overig',
    label: "Cadeau's overig",
    icon: '🎁',
    order: 4,
    type: 'expense',
    subs: [],
  },
  {
    key: 'gezondheid_verzorging',
    label: 'Gezondheid & verzorging',
    icon: '💊',
    order: 5,
    type: 'expense',
    subs: [
      { key: 'kapper', label: 'Kapper' },
      { key: 'toilet', label: 'Toilet' },
      { key: 'wasserette', label: 'Wasserette' },
    ],
  },
  {
    key: 'vakantie',
    label: 'Vakantie',
    icon: '✈️',
    order: 6,
    type: 'expense',
    subs: [],
  },
  {
    key: 'afspreken_vrienden',
    label: 'Afspreken vrienden',
    icon: '👬',
    order: 7,
    type: 'expense',
    subs: [
      { key: 'cafe', label: 'Café' },
      { key: 'concerten', label: 'Concerten' },
      { key: 'thuis', label: 'Thuis' },
      { key: 'uiteten_afhalen', label: 'Uiteten & afhalen' },
    ],
  },
  {
    key: 'kleding',
    label: 'Kleding',
    icon: '👕',
    order: 8,
    type: 'expense',
    subs: [],
  },
  {
    key: 'overige_kosten',
    label: 'Overige kosten',
    icon: '💸',
    order: 9,
    type: 'expense',
    subs: [
      { key: 'boete', label: 'Boete' },
      { key: 'doneren', label: 'Doneren' },
      { key: 'belasting', label: 'Belasting' },
      { key: 'werkgerelateerde_kosten', label: 'Werkgerelateerde kosten' },
    ],
  },
  {
    key: 'hobbys',
    label: "Hobby's",
    icon: '🎨',
    order: 10,
    type: 'expense',
    subs: [
      { key: 'hobby_projecten', label: 'Hobby projecten' },
      { key: 'gamen', label: 'Gamen' },
      { key: 'boeken', label: 'Boeken' },
      { key: 'planten', label: 'Planten' },
      { key: 'sporten', label: 'Sporten' },
      { key: 'interieur', label: 'Interieur' },
    ],
  },
  {
    key: 'investeren',
    label: 'Investeren',
    icon: '📈',
    order: 11,
    type: 'expense',
    subs: [],
  },
  {
    key: 'bankoverschrijving',
    label: 'Bankoverschrijving',
    icon: '🏦',
    order: 12,
    type: 'transfer',
    subs: [],
  },
  {
    key: 'voorschot',
    label: 'Voorschot',
    icon: '🤝',
    order: 14,
    type: 'transfer',
    subs: [],
  },
  {
    key: 'salaris',
    label: 'Salaris',
    icon: '💰',
    order: 13,
    type: 'income',
    subs: [],
  },
]

// De actuele categorieen komen uit de database via `useCategories()`; alles
// hieronder beschrijft alleen nog de standaardwaarden voor seeds en migraties.
const DEFAULT_FIXED_KEYS = new Set(['woning', 'abonnementen', 'vakantie', 'reiskosten'])

// Zoekt de standaarddefinitie van een key op (seed/migratie, niet voor de UI).
export function defaultCategoryDef(key) {
  return DEFAULT_CATEGORIES.find(c => c.key === key) ?? null
}

export const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
export const DAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']   // maandag eerst (ISO)
export const MONTHS_LONG = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December']

const DEFAULT_COLORS = {
  woning:               '#FF9F0A',
  abonnementen:         '#5E5CE6',
  boodschappen:         '#16A34A',
  reiskosten:           '#64D2FF',
  cadeaus_overig:       '#BF5AF2',
  sterre:               '#FF375F',   // legacy: niet meer geseed, wel voor bestaande data
  gezondheid_verzorging:'#34C759',
  vakantie:             '#0A84FF',
  afspreken_vrienden:   '#FF6B6B',
  kleding:              '#FFD60A',
  overige_kosten:       '#8E8E93',
  hobbys:               '#FF453A',
  investeren:           '#30B0C7',
  voorschot:            '#AC8E68',
  salaris:              '#32D74B',
  bankoverschrijving:   '#636366',
}

export const DEFAULT_CATEGORY_COLOR = '#8E8E93'
export const DEFAULT_CATEGORY_ICON = '📦'

// Systeemrollen: code verwijst naar rollen i.p.v. hardgecodeerde slugs.
// 'uncategorized' = restbak, 'transfer' = geen inkomen/uitgave, 'income' = inkomen.
export const ROLE_BY_KEY = {
  overige_kosten: 'uncategorized',
  bankoverschrijving: 'transfer',
  salaris: 'income',
}

// Sleutels die ooit in DEFAULT_CATEGORIES stonden maar niet meer geseed worden.
// Bestaande databases (en teruggezette backups) houden zo'n rij; zonder deze map
// zou hij na een migratie met de kale sleutel als label in beeld komen.
export const LEGACY_LABELS = {
  sterre: {
    label: 'Sterre',
    icon: '🥰',
    subs: [
      { key: 'cadeaus_sterre', label: "Cadeau's Sterre" },
      { key: 'dates_sterre', label: 'Dates Sterre' },
    ],
  },
}

// Bouwt een volledige categorie-rij (db-vorm) uit een (gedeeltelijke) definitie.
export function makeCategoryRow(def, budget = 0) {
  const legacy = LEGACY_LABELS[def.key] ?? {}
  return {
    key: def.key,
    label: def.label ?? legacy.label ?? def.key,
    icon: def.icon ?? legacy.icon ?? DEFAULT_CATEGORY_ICON,
    color: def.color ?? DEFAULT_COLORS[def.key] ?? DEFAULT_CATEGORY_COLOR,
    type: def.type ?? 'expense',
    order: def.order ?? 0,
    isFixed: def.isFixed ?? DEFAULT_FIXED_KEYS.has(def.key),
    archived: def.archived ?? false,
    role: def.role ?? ROLE_BY_KEY[def.key] ?? null,
    subs: Array.isArray(def.subs) ? def.subs : (legacy.subs ?? []),
    budget: Number(budget) || 0,
  }
}

// Gedeelde seed-helper: gebruikt door de Dexie v3-upgrade en door de eerste-start-seed.
// `existingBudgets` is een map key -> budget en blijft behouden.
export function buildDefaultCategoryRows(existingBudgets = {}) {
  return DEFAULT_CATEGORIES.map(d => makeCategoryRow(d, existingBudgets[d.key] ?? 0))
}
