import { RULES } from '../constants/rules'
import { predictCategory } from './merchantLearning'

// Credits vanaf dit bedrag gelden als inkomen (salaris).
// Staat hier als benoemde constante; wordt later een instelling per gebruiker.
export const SALARY_THRESHOLD = 2000

// Zonder catMap weten we niets over archivering: dan is elke sleutel geldig.
const ALWAYS_ACTIVE = () => true

/* ------------------------------------------------------------------ *
 * Regels: ingebouwd ({ kw, cat, sub }) en uit de database              *
 * ({ keywords, category, subcategory }). Beide vormen hier afgevlakt.  *
 * ------------------------------------------------------------------ */
const ruleKeywords = rule => rule.keywords ?? rule.kw ?? []
const ruleCategory = rule => rule.category ?? rule.cat ?? ''
const ruleSubcategory = rule => rule.subcategory ?? rule.sub ?? ''

// Let op: trefwoorden worden bewust niet getrimd — 'ns ', 'bar ' en 'cos '
// hebben hun spatie nodig om niet in willekeurige woorden te matchen.
function findRule(rules, haystacks) {
  for (const rule of rules) {
    for (const raw of ruleKeywords(rule)) {
      const kw = String(raw ?? '').toLowerCase()
      if (!kw) continue
      if (haystacks.some(h => h.includes(kw))) return rule
    }
  }
  return null
}

function ruleResult(rule, amount, resolve) {
  const target = ruleCategory(rule)
  const cat = resolve(target)
  const hit = cat === target
  return {
    cat,
    sub: hit ? (ruleSubcategory(rule) || '') : '',
    // Een regel die naar een verwijderde/gearchiveerde categorie wijst belandt in
    // de restbak; dat is geen betrouwbare suggestie meer, dus 'low' + matched:false.
    confidence: hit ? 'high' : 'low',
    possiblySterre: !!rule.possiblySterre && amount < 150,
    needsManual: rule.needsManual ?? false,
    matched: hit,
  }
}

const unmatched = cat => ({ cat, sub: '', confidence: 'low', possiblySterre: false, needsManual: false, matched: false })

/**
 * Categoriseert een transactie op basis van naam, bedrag en type.
 *
 * @param byRole  { uncategorized, transfer, income } — categorie-rijen of null.
 *                Code verwijst naar systeemrollen i.p.v. hardgecodeerde slugs;
 *                de string-fallbacks zijn het laatste vangnet.
 * @param options { isActiveKey?(key): boolean, rules?: gebruikersregels }
 */
export function categorize(merchant, amount, type, remi = '', byRole = null, options = {}) {
  const { isActiveKey = ALWAYS_ACTIVE, rules: userRules = [] } = options
  const m = String(merchant).toLowerCase()
  const r = String(remi).toLowerCase()

  const uncategorizedKey = byRole?.uncategorized?.key ?? 'overige_kosten'
  const resolve = key => (key && isActiveKey(key) ? key : uncategorizedKey)

  // Gebruikersregels gaan vóór de ingebouwde regels.
  const rules = userRules.length ? [...userRules, ...RULES] : RULES

  if (type === 'credit' && amount >= SALARY_THRESHOLD) {
    return {
      cat: resolve(byRole?.income?.key ?? 'salaris'),
      sub: '', confidence: 'high', possiblySterre: false, needsManual: false, matched: true,
    }
  }

  // Credits lopen ook langs de regels (bijv. een gedeelde Spotify-betaling via
  // SEPA); daar telt het REMI-veld mee, bij afschrijvingen alleen de tegenpartij.
  const rule = findRule(rules, type === 'credit' ? [m, r] : [m])
  if (rule) return ruleResult(rule, amount, resolve)

  if (type === 'credit') return unmatched(resolve(byRole?.transfer?.key ?? 'bankoverschrijving'))
  return unmatched(uncategorizedKey)
}

/**
 * Async wrapper: eerst de geleerde merchant-historie, daarna de regels.
 */
export async function categorizeWithLearning(merchant, amount, type, remi = '', byRole = null, options = {}) {
  const { isActiveKey = ALWAYS_ACTIVE } = options
  const prediction = await predictCategory(merchant, amount, type, remi, isActiveKey)

  if (prediction) {
    const confidencePct = Math.round(prediction.confidence * 100)
    if (prediction.source === 'recurring' || prediction.confidence >= 0.7) {
      return {
        cat: prediction.cat,
        sub: prediction.sub,
        confidence: 'high',
        confidencePct,
        possiblySterre: false,
        needsManual: false,
        source: prediction.source,
        eventCount: prediction.eventCount,
        isRecurring: prediction.isRecurring,
      }
    }
    if (prediction.confidence >= 0.5) {
      return {
        cat: prediction.cat,
        sub: prediction.sub,
        confidence: 'low',
        confidencePct,
        possiblySterre: false,
        needsManual: true,
        source: prediction.source,
        eventCount: prediction.eventCount,
        isRecurring: false,
      }
    }
  }

  // Terugvallen op de regels
  const { matched, ...rest } = categorize(merchant, amount, type, remi, byRole, options)
  return {
    ...rest,
    source: matched ? 'rules' : 'unknown',
    confidencePct: matched ? 100 : 0,
    eventCount: 0,
    isRecurring: false,
  }
}
