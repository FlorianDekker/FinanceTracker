// Eigen kolomindelingen voor CSV-bestanden die geen enkele bankparser herkent.
//
// De gebruiker wijst in de kolommapper eenmalig aan welke kolom de datum, het
// bedrag en de omschrijving is. Die indeling bewaren we onder een handtekening
// van de kopregel (`settings.csvMappings`), zodat hetzelfde exportbestand de
// volgende maand meteen goed gaat.
//
// Dit bestand bevat alleen pure functies (geen database, geen React) zodat het
// los te testen is.
import { firstLine, normHeader, parseCsv, sniffDelimiter } from './parsers/csv'

// Meer dan dit aantal indelingen bewaren heeft geen zin; de oudste valt af.
export const MAX_MAPPINGS = 20

/**
 * Handtekening van een kopregel: genormaliseerde kolomnamen, gescheiden door |.
 * Werkt op een rij (array) of op de ruwe bestandstekst.
 *
 * @param input      array met kolomnamen, of de hele CSV-tekst
 * @param delimiter  optioneel; anders wordt het scheidingsteken geraden
 */
export function headerSignature(input, delimiter) {
  const cells = Array.isArray(input)
    ? input
    : (parseCsv(firstLine(input), delimiter || sniffDelimiter(input))[0] ?? [])
  const names = cells.map(normHeader)
  while (names.length && names[names.length - 1] === '') names.pop()   // lege staartkolommen negeren
  return names.join('|')
}

// Een indeling is bruikbaar zodra datum en bedrag aangewezen zijn (en bij
// Af/Bij-modus ook de kolom die de richting bepaalt).
export function isCompleteMapping(mapping) {
  if (!mapping || typeof mapping !== 'object') return false
  const hasCol = v => typeof v === 'number' ? v >= 0 : !!v
  if (!hasCol(mapping.dateCol) || !hasCol(mapping.amountCol)) return false
  if (mapping.signMode === 'debitCreditCol' && !hasCol(mapping.debitCreditCol)) return false
  return true
}

// Ruimt een (mogelijk uit de database gelezen) indeling op tot de velden die
// `parseGenericCsv` kent.
export function normalizeMapping(mapping = {}) {
  const col = v => (v === undefined || v === null || v === '' ? undefined : (typeof v === 'number' ? v : String(v)))
  const out = {
    delimiter: mapping.delimiter || undefined,
    hasHeader: mapping.hasHeader !== false,
    dateCol: col(mapping.dateCol) ?? 0,
    dateFormat: mapping.dateFormat || '',
    amountCol: col(mapping.amountCol) ?? 1,
    signMode: mapping.signMode === 'debitCreditCol' ? 'debitCreditCol' : 'signed',
    debitCreditCol: col(mapping.debitCreditCol),
    debitValue: mapping.debitValue || 'Af',
    descriptionCols: (Array.isArray(mapping.descriptionCols) ? mapping.descriptionCols : [])
      .map(col).filter(v => v !== undefined),
    counterpartyCol: col(mapping.counterpartyCol),
  }
  if (out.signMode !== 'debitCreditCol') {
    delete out.debitCreditCol
    delete out.debitValue
  }
  return out
}

/** De bewaarde indeling bij een kopregel, of null. */
export function getMapping(mappings, signature) {
  if (!signature || !mappings || typeof mappings !== 'object') return null
  const entry = mappings[signature]
  if (!entry) return null
  const mapping = normalizeMapping(entry.mapping ?? entry)
  return isCompleteMapping(mapping) ? mapping : null
}

/**
 * Nieuwe verzameling indelingen met deze erbij (onveranderlijk: de aanroeper
 * schrijft het resultaat zelf naar de settings).
 */
export function saveMapping(mappings, signature, mapping, now = Date.now()) {
  const base = (mappings && typeof mappings === 'object') ? mappings : {}
  if (!signature || !isCompleteMapping(mapping)) return base

  const next = { ...base, [signature]: { mapping: normalizeMapping(mapping), savedAt: now } }
  const keys = Object.keys(next)
  if (keys.length > MAX_MAPPINGS) {
    keys
      .sort((a, b) => (next[a].savedAt ?? 0) - (next[b].savedAt ?? 0))
      .slice(0, keys.length - MAX_MAPPINGS)
      .forEach(key => { delete next[key] })
  }
  return next
}
