import { RULES } from '../constants/rules'
import { predictCategory } from './merchantLearning'

// Credits vanaf dit bedrag gelden als inkomen (salaris). Standaardwaarde;
// per gebruiker instelbaar via de setting `salaryThreshold` en doorgegeven
// als `options.salaryThreshold`.
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

function ruleResult(rule, resolve) {
  const target = ruleCategory(rule)
  const cat = resolve(target)
  const hit = cat === target
  return {
    cat,
    sub: hit ? (ruleSubcategory(rule) || '') : '',
    // Een regel die naar een verwijderde/gearchiveerde categorie wijst belandt in
    // de restbak; dat is geen betrouwbare suggestie meer, dus 'low' + matched:false.
    confidence: hit ? 'high' : 'low',
    needsManual: rule.needsManual ?? false,
    matched: hit,
  }
}

const unmatched = cat => ({ cat, sub: '', confidence: 'low', needsManual: false, matched: false })

// Sleutels die niet (meer) actief zijn belanden in de restbak.
const makeResolve = (byRole, isActiveKey) => {
  const uncategorizedKey = byRole?.uncategorized?.key ?? 'overige_kosten'
  return key => (key && isActiveKey(key) ? key : uncategorizedKey)
}

// Credits lopen ook langs de regels (bijv. een gedeelde Spotify-betaling via
// SEPA); daar telt het REMI-veld mee, bij afschrijvingen alleen de tegenpartij.
function applyRules(rules, merchant, type, remi, resolve) {
  const m = String(merchant).toLowerCase()
  const r = String(remi).toLowerCase()
  const rule = findRule(rules, type === 'credit' ? [m, r] : [m])
  return rule ? ruleResult(rule, resolve) : null
}

// Zet een `categorize`-resultaat om naar de vorm die de import-UI verwacht.
function asLearningResult({ matched, ...rest }) {
  return {
    ...rest,
    source: matched ? 'rules' : 'unknown',
    confidencePct: matched ? 100 : 0,
    eventCount: 0,
    isRecurring: false,
  }
}

/**
 * Categoriseert een transactie op basis van naam, bedrag en type.
 *
 * @param byRole  { uncategorized, transfer, income } — categorie-rijen of null.
 *                Code verwijst naar systeemrollen i.p.v. hardgecodeerde slugs;
 *                de string-fallbacks zijn het laatste vangnet.
 * @param options { isActiveKey?(key): boolean, rules?: gebruikersregels,
 *                  salaryThreshold?: drempel waarboven een credit salaris is }
 */
export function categorize(merchant, amount, type, remi = '', byRole = null, options = {}) {
  const { isActiveKey = ALWAYS_ACTIVE, rules: userRules = [], salaryThreshold = SALARY_THRESHOLD } = options
  const resolve = makeResolve(byRole, isActiveKey)

  // Eigen herkenningsregels winnen altijd — ook van de salarisdrempel.
  if (userRules.length) {
    const own = applyRules(userRules, merchant, type, remi, resolve)
    if (own) return own
  }

  if (type === 'credit' && amount >= (Number(salaryThreshold) || SALARY_THRESHOLD)) {
    return {
      cat: resolve(byRole?.income?.key ?? 'salaris'),
      sub: '', confidence: 'high', needsManual: false, matched: true,
    }
  }

  const rule = applyRules(RULES, merchant, type, remi, resolve)
  if (rule) return rule

  if (type === 'credit') return unmatched(resolve(byRole?.transfer?.key ?? 'bankoverschrijving'))
  return unmatched(resolve(null))
}

/**
 * Async wrapper. Volgorde: eigen herkenningsregels → geleerde merchant-historie
 * → ingebouwde regels. De gebruiker heeft zijn eigen regels expliciet ingesteld,
 * dus die mogen nooit door de leerdata overruled worden.
 */
export async function categorizeWithLearning(merchant, amount, type, remi = '', byRole = null, options = {}) {
  const { isActiveKey = ALWAYS_ACTIVE, rules: userRules = [] } = options

  if (userRules.length) {
    const own = applyRules(userRules, merchant, type, remi, makeResolve(byRole, isActiveKey))
    if (own) return asLearningResult(own)
  }

  const prediction = await predictCategory(merchant, amount, type, remi, isActiveKey)

  if (prediction) {
    const confidencePct = Math.round(prediction.confidence * 100)
    if (prediction.source === 'recurring' || prediction.confidence >= 0.7) {
      return {
        cat: prediction.cat,
        sub: prediction.sub,
        confidence: 'high',
        confidencePct,
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
        needsManual: true,
        source: prediction.source,
        eventCount: prediction.eventCount,
        isRecurring: false,
      }
    }
  }

  // Terugvallen op de regels (eigen regels zijn hierboven al afgehandeld)
  return asLearningResult(categorize(merchant, amount, type, remi, byRole, options))
}
