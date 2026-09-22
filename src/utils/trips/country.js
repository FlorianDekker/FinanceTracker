/**
 * Landen bij een vakantie.
 *
 * ABN zet bij een buitenlandse pinbetaling `Land: FRA` (ISO-3166 alpha-3) in de
 * omschrijving; die belandt bij ons in `tx.note`. Dit bestand is bewust puur
 * (geen db, geen React) zodat de clustering en de tests er los op kunnen bouwen.
 *
 * De tabel hoeft niet compleet te zijn: onbekende codes krijgen 🌍 en hun eigen
 * code als naam, zodat er nooit iets verdwijnt.
 */

/** Thuis; telt nooit als "buitenland" en dus nooit als vakantie-signaal. */
export const HOME_COUNTRY = 'NLD'

// alpha-3 -> [alpha-2, Nederlandse naam]. De gangbare vakantielanden plus de
// buurlanden; aanvullen mag altijd.
const COUNTRIES = {
  NLD: ['NL', 'Nederland'],
  BEL: ['BE', 'België'],
  DEU: ['DE', 'Duitsland'],
  LUX: ['LU', 'Luxemburg'],
  FRA: ['FR', 'Frankrijk'],
  ESP: ['ES', 'Spanje'],
  PRT: ['PT', 'Portugal'],
  ITA: ['IT', 'Italië'],
  GRC: ['GR', 'Griekenland'],
  GBR: ['GB', 'Verenigd Koninkrijk'],
  IRL: ['IE', 'Ierland'],
  AUT: ['AT', 'Oostenrijk'],
  CHE: ['CH', 'Zwitserland'],
  CZE: ['CZ', 'Tsjechië'],
  POL: ['PL', 'Polen'],
  HUN: ['HU', 'Hongarije'],
  SVK: ['SK', 'Slowakije'],
  SVN: ['SI', 'Slovenië'],
  HRV: ['HR', 'Kroatië'],
  BIH: ['BA', 'Bosnië en Herzegovina'],
  SRB: ['RS', 'Servië'],
  MNE: ['ME', 'Montenegro'],
  ALB: ['AL', 'Albanië'],
  MKD: ['MK', 'Noord-Macedonië'],
  ROU: ['RO', 'Roemenië'],
  BGR: ['BG', 'Bulgarije'],
  DNK: ['DK', 'Denemarken'],
  SWE: ['SE', 'Zweden'],
  NOR: ['NO', 'Noorwegen'],
  FIN: ['FI', 'Finland'],
  ISL: ['IS', 'IJsland'],
  EST: ['EE', 'Estland'],
  LVA: ['LV', 'Letland'],
  LTU: ['LT', 'Litouwen'],
  MLT: ['MT', 'Malta'],
  CYP: ['CY', 'Cyprus'],
  MCO: ['MC', 'Monaco'],
  AND: ['AD', 'Andorra'],
  TUR: ['TR', 'Turkije'],
  MAR: ['MA', 'Marokko'],
  TUN: ['TN', 'Tunesië'],
  EGY: ['EG', 'Egypte'],
  ZAF: ['ZA', 'Zuid-Afrika'],
  CPV: ['CV', 'Kaapverdië'],
  USA: ['US', 'Verenigde Staten'],
  CAN: ['CA', 'Canada'],
  MEX: ['MX', 'Mexico'],
  BRA: ['BR', 'Brazilië'],
  ARG: ['AR', 'Argentinië'],
  CUW: ['CW', 'Curaçao'],
  ABW: ['AW', 'Aruba'],
  SXM: ['SX', 'Sint Maarten'],
  SUR: ['SR', 'Suriname'],
  ISR: ['IL', 'Israël'],
  ARE: ['AE', 'Verenigde Arabische Emiraten'],
  THA: ['TH', 'Thailand'],
  IDN: ['ID', 'Indonesië'],
  JPN: ['JP', 'Japan'],
  AUS: ['AU', 'Australië'],
  NZL: ['NZ', 'Nieuw-Zeeland'],
}

/** Alle landen die we bij naam kennen, alfabetisch — voor de landenkiezer. */
export const KNOWN_COUNTRIES = Object.keys(COUNTRIES)
  .map(code => ({ code, alpha2: COUNTRIES[code][0], name: COUNTRIES[code][1] }))
  .sort((a, b) => a.name.localeCompare(b.name, 'nl'))

const LAND_RE = /\bLand:\s*([A-Z]{3})\b/

/**
 * Het land uit de omschrijving van een banktransactie.
 * @returns {string|null} alpha-3 (bijv. 'FRA'), of null als er niets staat.
 */
export function countryOf(tx) {
  const tekst = `${tx?.note ?? ''} ${tx?.remi ?? ''}`
  const m = LAND_RE.exec(tekst)
  return m ? m[1] : null
}

/** Buitenland = een land gevonden dat niet Nederland is. */
export function isForeign(code) {
  return !!code && code !== HOME_COUNTRY
}

/** Handig op een transactie: buitenlands land of null. */
export function foreignCountryOf(tx) {
  const code = countryOf(tx)
  return isForeign(code) ? code : null
}

/** Nederlandse naam; onbekende codes houden hun eigen code. */
export function countryName(code) {
  const c = String(code ?? '').toUpperCase()
  return COUNTRIES[c]?.[1] ?? (c || 'Onbekend')
}

/**
 * Vlag-emoji: alpha-3 -> alpha-2 -> twee regional-indicator-tekens.
 * Onbekend land: de wereldbol.
 */
export function flagOf(code) {
  const alpha2 = COUNTRIES[String(code ?? '').toUpperCase()]?.[0]
  if (!alpha2) return '🌍'
  return String.fromCodePoint(...[...alpha2].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

/** "🇫🇷 Frankrijk" — of "🌍 XXX" als we het land niet kennen. */
export function countryLabel(code) {
  return `${flagOf(code)} ${countryName(code)}`
}

/** De vlaggen van een vakantie achter elkaar: "🇫🇷🇧🇪". */
export function flagsOf(codes) {
  const lijst = (Array.isArray(codes) ? codes : []).filter(Boolean)
  return lijst.length ? lijst.map(flagOf).join('') : '🧳'
}
