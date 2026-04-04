import { RULES } from '../constants/rules'
import { predictCategory } from './merchantLearning'

// Auto-categorize a transaction based on merchant name, amount, and type.
// Ported verbatim from ImportTransactions.js categorize() function.
export function categorize(merchant, amount, type, remi = '') {
  const m = String(merchant).toLowerCase()
  const r = String(remi).toLowerCase()

  // Salaris: credit + amount >= 2000
  if (type === 'credit' && amount >= 2000) {
    return { cat: 'salaris', sub: '', confidence: 'high', possiblySterre: false, matched: true }
  }

  // Other credits: still run rules first (e.g. Spotify shared payment via SEPA)
  for (const rule of RULES) {
    if (rule.kw.some(kw => m.includes(kw) || r.includes(kw))) {
      return {
        cat: rule.cat,
        sub: rule.sub || '',
        confidence: 'high',
        possiblySterre: rule.possiblySterre && amount < 150 ? true : false,
        needsManual: rule.needsManual ?? false,
        matched: true,
      }
    }
  }

  // Credits with no rule match → bankoverschrijving
  if (type === 'credit') {
    return { cat: 'bankoverschrijving', sub: '', confidence: 'low', possiblySterre: false, needsManual: false, matched: false }
  }

  for (const rule of RULES) {
    if (rule.kw.some(kw => m.includes(kw))) {
      return {
        cat: rule.cat,
        sub: rule.sub || '',
        confidence: 'high',
        possiblySterre: rule.possiblySterre && amount < 150 ? true : false,
        needsManual: rule.needsManual ?? false,
        matched: true,
      }
    }
  }

  return { cat: 'overige_kosten', sub: '', confidence: 'low', possiblySterre: false, needsManual: false, matched: false }
}

/**
 * Async wrapper: checks learned merchant history first, then falls back to rules.
 */
export async function categorizeWithLearning(merchant, amount, type, remi = '') {
  const prediction = await predictCategory(merchant, amount, type, remi)

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

  // Fall back to hardcoded rules
  const ruleResult = categorize(merchant, amount, type, remi)
  const { matched, ...rest } = ruleResult
  return {
    ...rest,
    source: matched ? 'rules' : 'unknown',
    confidencePct: matched ? 100 : 0,
    eventCount: 0,
    isRecurring: false,
  }
}
