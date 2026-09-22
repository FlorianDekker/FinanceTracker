/**
 * Maandrekenwerk voor Vermogen: een maand is overal een string 'YYYY-MM',
 * zodat sorteren en vergelijken gewoon met < en > kan.
 */
import { MONTHS, MONTHS_LONG } from '../../constants/categories'

/** 'YYYY-MM' van een Date of van een 'YYYY-MM-DD'-string. */
export function monthOf(date = new Date()) {
  if (typeof date === 'string') return date.slice(0, 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** `n` maanden verder (n mag negatief zijn). */
export function addMonths(month, n) {
  const [jaar, maand] = String(month ?? '').split('-').map(Number)
  if (!jaar || !maand) return month
  const d = new Date(jaar, maand - 1 + n, 1)
  return monthOf(d)
}

/** Aantal maanden van `a` naar `b` ('2026-01' → '2026-03' = 2). */
export function monthsBetween(a, b) {
  const [ja, ma] = String(a ?? '').split('-').map(Number)
  const [jb, mb] = String(b ?? '').split('-').map(Number)
  if (!ja || !jb) return 0
  return (jb - ja) * 12 + (mb - ma)
}

/** 'sep 26' — kort genoeg voor een as-label. */
export function monthLabel(month) {
  const [jaar, maand] = String(month ?? '').split('-').map(Number)
  if (!jaar || !maand) return String(month ?? '')
  return `${MONTHS[maand - 1]} ${String(jaar).slice(2)}`
}

/** 'september 2026' voor in tekst. */
export function monthLabelLong(month) {
  const [jaar, maand] = String(month ?? '').split('-').map(Number)
  if (!jaar || !maand) return String(month ?? '')
  return `${MONTHS_LONG[maand - 1].toLowerCase()} ${jaar}`
}

/** De laatste volle maand: de lopende maand telt pas als hij voorbij is. */
export function lastFullMonth(now = new Date()) {
  return addMonths(monthOf(now), -1)
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}
