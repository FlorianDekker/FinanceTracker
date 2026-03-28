import { RULES } from '../constants/rules'

// Auto-categorize a transaction based on merchant name, amount, and type.
// Ported verbatim from ImportTransactions.js categorize() function.
export function categorize(merchant, amount, type) {
  const m = String(merchant).toLowerCase()

  // Salaris: credit + amount >= 2000
  if (type === 'credit' && amount >= 2000) {
    return { cat: 'salaris', sub: '', confidence: 'high', possiblySterre: false }
  }

  // Other credits → bankoverschrijving
  if (type === 'credit') {
    return { cat: 'bankoverschrijving', sub: '', confidence: 'low', possiblySterre: false }
  }

  for (const rule of RULES) {
    if (rule.kw.some(kw => m.includes(kw))) {
      return {
        cat: rule.cat,
        sub: rule.sub || '',
        confidence: 'high',
        possiblySterre: rule.possiblySterre && amount < 150 ? true : false,
      }
    }
  }

  return { cat: 'overige_kosten', sub: '', confidence: 'low', possiblySterre: false }
}
