// Vaste productgroep-taxonomie voor bonregels (Fase 5).
//
// De keys zijn onveranderlijk: ze worden opgeslagen op `receiptItems.group` en
// gebruikt als index. Labels/iconen/kleuren mogen later wijzigen.
// `overig` is de restbak en bestaat altijd; een model dat iets onbekends
// verzint landt daar, zodat we nooit een ongeldige key in de DB krijgen.

export const RECEIPT_GROUPS = [
  { key: 'groente_fruit',      label: 'Groente & fruit',    icon: '🥦', color: '#34C759' },
  { key: 'zuivel_eieren',      label: 'Zuivel & eieren',    icon: '🥛', color: '#5AC8FA' },
  { key: 'vlees_vis_vega',     label: 'Vlees, vis & vega',  icon: '🍖', color: '#FF3B30' },
  { key: 'brood_bakkerij',     label: 'Brood & bakkerij',   icon: '🥖', color: '#D4A017' },
  { key: 'dranken',            label: 'Dranken',            icon: '🥤', color: '#007AFF' },
  { key: 'alcohol',            label: 'Alcohol',            icon: '🍷', color: '#8E44AD' },
  { key: 'snacks_snoep',       label: 'Snacks & snoep',     icon: '🍫', color: '#FF9500' },
  { key: 'kant_en_klaar',      label: 'Kant-en-klaar',      icon: '🍱', color: '#FF6B35' },
  { key: 'diepvries',          label: 'Diepvries',          icon: '🧊', color: '#64D2FF' },
  { key: 'huishouden',         label: 'Huishouden',         icon: '🧽', color: '#30B0C7' },
  { key: 'verzorging',         label: 'Verzorging',         icon: '🧴', color: '#FF2D92' },
  { key: 'huisdier',           label: 'Huisdier',           icon: '🐾', color: '#A2845E' },
  { key: 'baby',               label: 'Baby',               icon: '🍼', color: '#FFB6C1' },
  { key: 'non_food',           label: 'Non-food',           icon: '📦', color: '#8E8E93' },
  { key: 'statiegeld_korting', label: 'Statiegeld & korting', icon: '🏷️', color: '#AF52DE' },
  { key: 'overig',             label: 'Overig',             icon: '❓', color: '#6E6E73' },
]

export const GROUP_KEYS = RECEIPT_GROUPS.map(g => g.key)
export const GROUP_MAP = Object.fromEntries(RECEIPT_GROUPS.map(g => [g.key, g]))
export const FALLBACK_GROUP = 'overig'

// Synoniemen → key. Zowel Nederlands als Engels, want welk van beide een model
// teruggeeft hangt af van het model en de prompttaal. Alles wordt eerst
// genormaliseerd (lowercase, diakrieten weg, niet-alfanumeriek → spatie).
const SYNONYMS = {
  groente_fruit: [
    'groente', 'groenten', 'fruit', 'groente fruit', 'groenten fruit', 'agf',
    'aardappelen groente fruit', 'aardappelen', 'salade', 'vegetables', 'vegetable',
    'fruits', 'produce', 'fresh produce', 'veggies', 'noten', 'kruiden',
  ],
  zuivel_eieren: [
    'zuivel', 'eieren', 'zuivel eieren', 'zuivel en eieren', 'kaas', 'melk', 'yoghurt',
    'dairy', 'dairy eggs', 'eggs', 'cheese', 'milk', 'yogurt', 'dairy and eggs',
    'zuivelproducten', 'boter',
  ],
  vlees_vis_vega: [
    'vlees', 'vis', 'vega', 'vlees vis vega', 'vleeswaren', 'kip', 'gehakt',
    'vegetarisch', 'vleesvervangers', 'meat', 'fish', 'seafood', 'poultry',
    'meat fish', 'meat fish vegetarian', 'protein', 'vegan', 'vegetarian', 'tofu',
  ],
  brood_bakkerij: [
    'brood', 'bakkerij', 'brood bakkerij', 'brood en banket', 'banket', 'gebak',
    'bakery', 'bread', 'bread bakery', 'pastry', 'baked goods', 'beleg',
  ],
  dranken: [
    'dranken', 'drank', 'frisdrank', 'sappen', 'sap', 'water', 'koffie', 'thee',
    'drinks', 'beverages', 'beverage', 'soft drinks', 'juice', 'coffee', 'tea',
    'non alcoholic drinks', 'warme dranken',
  ],
  alcohol: [
    'alcohol', 'bier', 'wijn', 'sterke drank', 'alcoholische dranken',
    'beer', 'wine', 'spirits', 'liquor', 'alcoholic drinks', 'alcoholic beverages',
  ],
  snacks_snoep: [
    'snacks', 'snoep', 'snacks snoep', 'zoet', 'koek', 'koekjes', 'chocolade',
    'chips', 'candy', 'sweets', 'snacks candy', 'confectionery', 'chocolate',
    'biscuits', 'cookies', 'snoepgoed',
  ],
  kant_en_klaar: [
    'kant en klaar', 'kant klaar', 'kant-en-klaar', 'maaltijden', 'maaltijd',
    'gemaksvoeding', 'soep', 'ready meals', 'ready meal', 'prepared foods',
    'convenience', 'convenience food', 'deli', 'meals', 'takeaway',
  ],
  diepvries: [
    'diepvries', 'vries', 'bevroren', 'ijs', 'frozen', 'frozen food', 'freezer',
    'ice cream', 'frozen goods',
  ],
  huishouden: [
    'huishouden', 'schoonmaak', 'schoonmaakmiddelen', 'wasmiddel', 'papierwaren',
    'household', 'cleaning', 'cleaning supplies', 'home', 'laundry', 'paper goods',
    'huishoudelijk',
  ],
  verzorging: [
    'verzorging', 'persoonlijke verzorging', 'drogisterij', 'gezondheid',
    'cosmetica', 'personal care', 'health', 'health beauty', 'beauty',
    'toiletries', 'hygiene', 'pharmacy', 'drugstore',
  ],
  huisdier: [
    'huisdier', 'huisdieren', 'dierenvoeding', 'kattenvoer', 'hondenvoer',
    'pet', 'pets', 'pet food', 'pet supplies', 'animal',
  ],
  baby: [
    'baby', 'babyvoeding', 'luiers', 'kind', 'baby care', 'baby food', 'diapers',
    'infant', 'kids',
  ],
  non_food: [
    'non food', 'nonfood', 'non-food', 'overige non food', 'huis en tuin',
    'kleding', 'elektronica', 'speelgoed', 'tijdschrift', 'bloemen', 'planten',
    'general merchandise', 'household goods', 'other non food', 'clothing',
    'electronics', 'stationery', 'flowers',
  ],
  statiegeld_korting: [
    'statiegeld', 'korting', 'statiegeld korting', 'statiegeld/korting',
    'bonus', 'bonuskorting', 'emballage', 'retour', 'deposit', 'discount',
    'discounts', 'deposit discount', 'refund', 'coupon', 'promotion', 'rebate',
    'savings', 'voordeel',
  ],
  overig: ['overig', 'overige', 'onbekend', 'other', 'others', 'misc', 'miscellaneous', 'unknown', 'unknown group'],
}

// key → synoniem-lookup, één keer opgebouwd
const LOOKUP = new Map()
for (const g of RECEIPT_GROUPS) {
  LOOKUP.set(normalizeText(g.key), g.key)
  LOOKUP.set(normalizeText(g.label), g.key)
}
for (const [key, words] of Object.entries(SYNONYMS)) {
  for (const w of words) LOOKUP.set(normalizeText(w), key)
}

// Losse woorden die, als ze érgens in de string voorkomen, de groep bepalen.
// Volgorde telt: de eerste treffer wint, dus specifiek vóór generiek.
const KEYWORDS = [
  ['statiegeld_korting', ['statiegeld', 'emballage', 'korting', 'bonus', 'discount', 'deposit', 'coupon', 'voordeel']],
  ['alcohol', ['alcohol', 'bier', 'wijn', 'beer', 'wine', 'spirit', 'liquor']],
  ['diepvries', ['diepvries', 'frozen', 'vries']],
  ['baby', ['baby', 'luier', 'diaper', 'infant']],
  ['huisdier', ['huisdier', 'pet ', 'dieren']],
  ['zuivel_eieren', ['zuivel', 'dairy', 'eier', 'egg', 'kaas', 'cheese', 'melk', 'milk', 'yog']],
  ['groente_fruit', ['groente', 'fruit', 'vegetable', 'produce', 'veg ']],
  ['vlees_vis_vega', ['vlees', 'meat', 'vis', 'fish', 'vega', 'vegetarian', 'vegan', 'poultry', 'seafood']],
  ['brood_bakkerij', ['brood', 'bakker', 'bread', 'bakery', 'pastry']],
  ['snacks_snoep', ['snack', 'snoep', 'candy', 'sweet', 'chocola', 'chocolate', 'chips', 'koek', 'biscuit']],
  ['kant_en_klaar', ['kant en klaar', 'kant klaar', 'ready meal', 'ready made', 'maaltijd', 'convenience', 'deli']],
  ['huishouden', ['huishoud', 'household', 'schoonmaak', 'cleaning', 'laundry', 'was ']],
  ['verzorging', ['verzorging', 'personal care', 'drogist', 'beauty', 'hygien', 'health', 'toiletr']],
  ['non_food', ['non food', 'nonfood', 'non-food', 'merchandise', 'kleding', 'clothing', 'electronic']],
  ['dranken', ['drank', 'drink', 'beverage', 'sap', 'juice', 'water', 'koffie', 'coffee', 'thee', 'tea ']],
]

function normalizeText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Zet vrije modeloutput om naar een geldige groep-key.
 * Onbekende of lege invoer levert altijd `overig` (nooit undefined).
 */
export function normalizeGroup(str) {
  const n = normalizeText(str)
  if (!n) return FALLBACK_GROUP

  const direct = LOOKUP.get(n)
  if (direct) return direct

  // "groente & fruit / agf" of "Dairy, Eggs" → probeer de losse delen
  const parts = n.split(' ')
  if (parts.length > 1) {
    for (let i = parts.length; i > 0; i--) {
      const hit = LOOKUP.get(parts.slice(0, i).join(' '))
      if (hit) return hit
    }
  }

  const padded = ` ${n} `
  for (const [key, words] of KEYWORDS) {
    if (words.some(w => padded.includes(w.endsWith(' ') ? ` ${w.trim()} ` : w))) return key
  }
  return FALLBACK_GROUP
}

export function groupLabel(key) {
  return GROUP_MAP[key]?.label ?? GROUP_MAP[FALLBACK_GROUP].label
}

export function groupColor(key) {
  return GROUP_MAP[key]?.color ?? GROUP_MAP[FALLBACK_GROUP].color
}

export function groupIcon(key) {
  return GROUP_MAP[key]?.icon ?? GROUP_MAP[FALLBACK_GROUP].icon
}
