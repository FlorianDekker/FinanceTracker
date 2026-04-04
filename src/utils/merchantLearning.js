import { db } from '../db/db'

// ─── Normalization ───────────────────────────────────────────────

const SEPA_NOISE = new Set([
  'betaling', 'overschrijving', 'overboeking', 'sepa', 'ideal',
  'incasso', 'machtiging', 'automatische', 'periodieke', 'naar',
  'van', 'voor', 'het', 'een', 'met', 'door',
])

/**
 * Normalize a merchant name into stable keys for matching.
 * Returns { merchantKey, baseKey, tokens }.
 */
export function normalizeMerchant(name) {
  let s = String(name ?? '').trim().toLowerCase()
  // Strip diacritics: NFD decompose then remove combining marks
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // Remove non-alphanumeric except spaces
  s = s.replace(/[^a-z0-9 ]/g, '')
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim()

  const tokens = s.split(' ').filter(t => t.length >= 2)
  const merchantKey = tokens.join('')
  // baseKey: drop trailing digit-only tokens (store/terminal IDs)
  const baseTokens = [...tokens]
  while (baseTokens.length > 1 && /^\d+$/.test(baseTokens[baseTokens.length - 1])) {
    baseTokens.pop()
  }
  const baseKey = baseTokens.join('')

  return { merchantKey, baseKey, tokens }
}

/**
 * Tokenize a REMI (remittance) field into meaningful keywords.
 */
export function tokenizeRemi(remi) {
  if (!remi) return []
  let s = String(remi).toLowerCase()
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  s = s.replace(/[^a-z0-9 ]/g, '')
  s = s.replace(/\s+/g, ' ').trim()
  return s.split(' ').filter(t => t.length >= 2 && !SEPA_NOISE.has(t))
}

// ─── Recording ───────────────────────────────────────────────────

/**
 * Record a single categorization event.
 * correction: { was: true, from: 'previousCategory' } or null
 */
export function recordEvent(merchantName, category, subcategory, amount, type, remi, correction) {
  const { merchantKey, baseKey } = normalizeMerchant(merchantName)
  if (!merchantKey) return

  return db.merchantHistory.add({
    merchantKey,
    baseKey,
    category,
    subcategory: subcategory || '',
    amount: amount ?? 0,
    dayOfMonth: new Date().getDate(),
    type: type || 'debit',
    remiTokens: tokenizeRemi(remi),
    wasCorrection: correction?.was ?? false,
    previousCategory: correction?.from ?? '',
    timestamp: Date.now(),
  })
}

/**
 * Bulk-record events from a list of pending import transactions.
 * Each tx should have: { merchant/note, category, subcategory, amount, type, remi?,
 *                        _originalCategory? (for correction tracking) }
 */
export async function bulkRecordEvents(transactions) {
  const events = []
  for (const tx of transactions) {
    const name = tx.merchant || tx.note
    if (!name) continue
    const { merchantKey, baseKey } = normalizeMerchant(name)
    if (!merchantKey) continue

    const wasCorrection = !!tx._originalCategory && tx._originalCategory !== tx.category
    events.push({
      merchantKey,
      baseKey,
      category: tx.category,
      subcategory: tx.subcategory || '',
      amount: tx.amount ?? 0,
      dayOfMonth: parseInt(String(tx.date ?? '').slice(8, 10), 10) || new Date().getDate(),
      type: tx.type || 'debit',
      remiTokens: tokenizeRemi(tx.remi),
      wasCorrection,
      previousCategory: wasCorrection ? tx._originalCategory : '',
      timestamp: Date.now(),
    })
  }
  if (events.length > 0) {
    await db.merchantHistory.bulkAdd(events)
  }
}

// ─── Prediction ──────────────────────────────────────────────────

const HALF_LIFE_DAYS = 90
const MS_PER_DAY = 86400000

function timeWeight(timestamp) {
  const days = (Date.now() - timestamp) / MS_PER_DAY
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

function amountSimilarity(a, b) {
  if (a <= 0 || b <= 0) return 0.5
  return 1 / (1 + Math.abs(Math.log(a) - Math.log(b)))
}

function remiOverlap(currentTokens, eventTokens) {
  if (!currentTokens.length || !eventTokens.length) return 1.0
  const evSet = new Set(eventTokens)
  const overlap = currentTokens.filter(t => evSet.has(t)).length
  return 1.0 + 0.3 * (overlap / Math.max(currentTokens.length, 1))
}

/**
 * Check if events indicate a recurring transaction pattern.
 * Returns the best recurring group or null.
 */
function detectRecurring(events, amount) {
  // Group by category+subcategory
  const groups = new Map()
  for (const ev of events) {
    const key = `${ev.category}|${ev.subcategory}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(ev)
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue

    // Check amount similarity (within 10% or €2)
    const amountMatch = group.filter(ev => {
      const diff = Math.abs(ev.amount - amount)
      return diff <= 2 || diff <= amount * 0.1
    })
    if (amountMatch.length < 2) continue

    // Check if events span multiple months
    const months = new Set(amountMatch.map(ev => {
      const d = new Date(ev.timestamp)
      return `${d.getFullYear()}-${d.getMonth()}`
    }))
    if (months.size < 2) continue

    const [cat, sub] = key.split('|')
    return { cat, sub, eventCount: amountMatch.length }
  }
  return null
}

/**
 * Predict the best category for a merchant using learned history.
 */
export async function predictCategory(merchantName, amount, type, remi) {
  const { baseKey, tokens } = normalizeMerchant(merchantName)
  if (!baseKey) return null

  // Query events by baseKey
  let events = await db.merchantHistory.where('baseKey').equals(baseKey).toArray()

  if (events.length > 0) {
    // Step 1: Recurring check
    const recurring = detectRecurring(events, amount)
    if (recurring) {
      return {
        cat: recurring.cat,
        sub: recurring.sub,
        confidence: 0.98,
        source: 'recurring',
        eventCount: recurring.eventCount,
        isRecurring: true,
      }
    }

    // Step 2: Multi-signal weighted voting
    return scoredPrediction(events, amount, type, remi, 'learned')
  }

  // Step 3: Similar merchant fallback
  return similarMerchantFallback(tokens, amount, type, remi)
}

/**
 * Score events and produce a prediction.
 */
function scoredPrediction(events, amount, type, remi, source) {
  const currentRemiTokens = tokenizeRemi(remi)
  const catScores = new Map()    // category → total positive score
  const catPenalties = new Map() // category → total penalty from negative evidence
  const subScores = new Map()    // "cat|sub" → total score (for subcategory selection)

  for (const ev of events) {
    const tw = timeWeight(ev.timestamp)
    const aw = amountSimilarity(amount, ev.amount)
    const tb = (type === ev.type) ? 1.2 : 0.8
    const rb = remiOverlap(currentRemiTokens, ev.remiTokens)

    const score = tw * aw * tb * rb

    // Positive vote for the event's category
    catScores.set(ev.category, (catScores.get(ev.category) ?? 0) + score)

    // Subcategory scoring within category
    const subKey = `${ev.category}|${ev.subcategory}`
    subScores.set(subKey, (subScores.get(subKey) ?? 0) + score * amountSimilarity(amount, ev.amount))

    // Negative evidence: if this was a correction, penalize the previous category
    if (ev.wasCorrection && ev.previousCategory) {
      catPenalties.set(ev.previousCategory, (catPenalties.get(ev.previousCategory) ?? 0) + score * 0.5)
    }
  }

  // Apply penalties
  for (const [cat, penalty] of catPenalties) {
    if (catScores.has(cat)) {
      catScores.set(cat, Math.max(0, catScores.get(cat) - penalty))
    }
  }

  // Find winner
  let totalScore = 0
  let bestCat = null
  let bestScore = 0
  for (const [cat, score] of catScores) {
    totalScore += score
    if (score > bestScore) { bestScore = score; bestCat = cat }
  }

  if (!bestCat || totalScore === 0) return null

  // Pick best subcategory within winning category
  let bestSub = ''
  let bestSubScore = -1
  for (const [key, score] of subScores) {
    if (key.startsWith(bestCat + '|') && score > bestSubScore) {
      bestSubScore = score
      bestSub = key.split('|')[1]
    }
  }

  const confidence = bestScore / totalScore
  return {
    cat: bestCat,
    sub: bestSub,
    confidence,
    source,
    eventCount: events.length,
    isRecurring: false,
  }
}

// ─── Similar Merchant Fallback ───────────────────────────────────

function jaccard(a, b) {
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const t of setA) if (setB.has(t)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

async function similarMerchantFallback(tokens, amount, type, remi) {
  // Get all distinct baseKeys with their tokens
  // For performance: sample recent events only (last 2000)
  const recentEvents = await db.merchantHistory
    .orderBy('timestamp')
    .reverse()
    .limit(2000)
    .toArray()

  if (recentEvents.length === 0) return null

  // Group by baseKey, compute tokens for each
  const baseKeyMap = new Map() // baseKey → { tokens, events }
  for (const ev of recentEvents) {
    if (!baseKeyMap.has(ev.baseKey)) {
      // Reconstruct tokens from baseKey via a simple split isn't possible,
      // so we store events and use the merchantKey to approximate
      baseKeyMap.set(ev.baseKey, { events: [] })
    }
    baseKeyMap.get(ev.baseKey).events.push(ev)
  }

  // For each known baseKey, compute similarity
  let bestMatch = null
  let bestSim = 0

  // Filter tokens to non-numeric for comparison
  const queryTokens = tokens.filter(t => !/^\d+$/.test(t))
  if (queryTokens.length === 0) return null

  for (const [bk, data] of baseKeyMap) {
    // Reconstruct base tokens from baseKey characters isn't great,
    // so use the merchant name from the most recent event
    const latestEvent = data.events[0]
    const { tokens: knownTokens } = normalizeMerchant(
      // baseKey is already normalized, but we need original tokens
      // Use merchantKey and try to find meaningful segments
      latestEvent.merchantKey
    )
    const knownNonNumeric = knownTokens.filter(t => !/^\d+$/.test(t))

    const sim = jaccard(queryTokens, knownNonNumeric)
    if (sim > bestSim && sim >= 0.5) {
      bestSim = sim
      bestMatch = data
    }
  }

  if (!bestMatch) return null

  // Use the similar merchant's events to predict, but cap confidence
  const prediction = scoredPrediction(bestMatch.events, amount, type, remi, 'similar')
  if (prediction) {
    prediction.confidence = Math.min(prediction.confidence, 0.6)
  }
  return prediction
}

// ─── Bootstrap Migration ─────────────────────────────────────────

export async function bootstrapFromHistory() {
  try {
    const done = await db.settings.get('learning_bootstrapped')
    if (done) return
  } catch {
    // settings table might be empty, continue
  }

  const allTx = await db.transactions.toArray()
  const events = []

  for (const tx of allTx) {
    const name = tx.note
    if (!name || !tx.category) continue

    const { merchantKey, baseKey } = normalizeMerchant(name)
    if (!merchantKey) continue

    const day = parseInt(String(tx.date ?? '').slice(8, 10), 10) || 1
    events.push({
      merchantKey,
      baseKey,
      category: tx.category,
      subcategory: tx.subcategory || '',
      amount: tx.amount ?? 0,
      dayOfMonth: day,
      type: tx.type || 'debit',
      remiTokens: [],
      wasCorrection: false,
      previousCategory: '',
      timestamp: tx.importedAt || Date.now(),
    })
  }

  if (events.length > 0) {
    await db.merchantHistory.bulkAdd(events)
  }
  await db.settings.put({ key: 'learning_bootstrapped', value: true })
}
