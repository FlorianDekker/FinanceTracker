// Categorie-templates voor de onboarding.
//
// Elke template is een transformatie op DEFAULT_CATEGORIES, niet een losse
// kopie: zo houden nieuwe gebruikers altijd de systeemrollen (restbak, inkomen,
// overboeking) en blijven de ingebouwde herkenningsregels (die naar deze
// sleutels wijzen) werken. Sleutels veranderen nooit — alleen labels, subs en
// welke categorieën meedoen.
import { DEFAULT_CATEGORIES, makeCategoryRow } from './categories'

const byKey = Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.key, c]))

// Categorieën die een systeemrol dragen en dus in élke template moeten zitten.
const ROLE_KEYS = ['overige_kosten', 'salaris', 'bankoverschrijving']

/** Alleen deze sleutels, in deze volgorde, met optionele aanpassingen. */
function pick(keys, tweaks = {}) {
  return keys.map((key, order) => {
    const base = byKey[key]
    if (!base) throw new Error(`Onbekende standaardcategorie '${key}'`)
    return { ...base, ...(tweaks[key] ?? {}), key, order }
  })
}

const MINIMAAL_KEYS = [
  'woning', 'boodschappen', 'afspreken_vrienden', 'reiskosten',
  'abonnementen', 'hobbys', 'overige_kosten', 'salaris', 'bankoverschrijving',
]

// De minimale set hergebruikt bestaande sleutels met een breder label, zodat de
// ingebouwde regels blijven matchen (NS -> reiskosten, Ikea -> hobbys, ...).
const MINIMAAL_TWEAKS = {
  woning: { subs: [{ key: 'huur', label: 'Huur' }, { key: 'energie', label: 'Energie' }] },
  boodschappen: {
    label: 'Boodschappen & eten',
    subs: [
      { key: 'supermarkt', label: 'Supermarkt' },
      { key: 'eten_onderweg', label: 'Eten onderweg' },
    ],
  },
  afspreken_vrienden: { label: 'Uit eten & horeca', icon: '🍽️', subs: [] },
  reiskosten: { label: 'Vervoer', icon: '🚌', subs: [] },
  abonnementen: { subs: [] },
  hobbys: { label: 'Vrije tijd', icon: '🎨', subs: [] },
  overige_kosten: { subs: [] },
}

const STUDIE = {
  key: 'studie',
  label: 'Studie',
  icon: '🎓',
  color: '#00C7BE',
  type: 'expense',
  subs: [
    { key: 'collegegeld', label: 'Collegegeld' },
    { key: 'boeken', label: 'Boeken & materiaal' },
  ],
}

function studentDefs() {
  const defs = DEFAULT_CATEGORIES.map(c => (
    c.key === 'salaris'
      ? { ...c, label: 'Inkomen', subs: [{ key: 'salaris', label: 'Salaris' }, { key: 'duo', label: 'DUO' }] }
      : c
  ))
  // Studie komt direct na Woning te staan.
  const out = [...defs]
  out.splice(1, 0, STUDIE)
  return out.map((c, order) => ({ ...c, order }))
}

export const TEMPLATES = [
  {
    id: 'standaard',
    label: 'Standaard',
    description: `${DEFAULT_CATEGORIES.length} categorieën voor een gewoon huishouden`,
    defs: () => DEFAULT_CATEGORIES.map((c, order) => ({ ...c, order })),
  },
  {
    id: 'minimaal',
    label: 'Minimaal',
    description: '8 categorieën, snel bij te houden',
    defs: () => pick(MINIMAAL_KEYS, MINIMAAL_TWEAKS),
  },
  {
    id: 'student',
    label: 'Student',
    description: 'Standaard plus Studie en DUO',
    defs: studentDefs,
  },
]

export const DEFAULT_TEMPLATE_ID = 'standaard'

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) ?? TEMPLATES.find(t => t.id === DEFAULT_TEMPLATE_ID)
}

/** De categorie-definities van een template (voor de iconen in de wizard). */
export function templateDefs(id) {
  return getTemplate(id).defs()
}

/**
 * De database-rijen van een template.
 * @param budgets  map key -> maandbudget (optioneel)
 */
export function buildTemplateRows(id, budgets = {}) {
  return templateDefs(id).map(def => makeCategoryRow(def, budgets[def.key] ?? 0))
}

/**
 * Controleert de regels waar de rest van de app op vertrouwt: precies één
 * restbak, minstens één inkomen en één overboeking, en unieke sleutels.
 * @returns string[] met problemen (leeg = in orde)
 */
export function validateTemplateRows(rows) {
  const problems = []
  const count = role => rows.filter(r => r.role === role).length

  if (count('uncategorized') !== 1) problems.push(`precies één restcategorie verwacht, gevonden ${count('uncategorized')}`)
  if (count('income') < 1) problems.push('geen inkomenscategorie')
  if (count('transfer') < 1) problems.push('geen overboekingscategorie')

  const keys = rows.map(r => r.key)
  const dubbel = keys.filter((k, i) => keys.indexOf(k) !== i)
  if (dubbel.length) problems.push(`dubbele sleutels: ${[...new Set(dubbel)].join(', ')}`)

  for (const row of rows) {
    const subKeys = (row.subs ?? []).map(s => s.key)
    const dub = subKeys.filter((k, i) => subKeys.indexOf(k) !== i)
    if (dub.length) problems.push(`${row.key}: dubbele subcategorieën ${[...new Set(dub)].join(', ')}`)
    if (!row.label) problems.push(`${row.key}: geen label`)
  }

  for (const key of ROLE_KEYS) {
    if (!keys.includes(key)) problems.push(`sleutel met systeemrol ontbreekt: ${key}`)
  }
  return problems
}
