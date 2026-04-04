import { MONTHS } from '../constants/categories'

export function euro(n) {
  const v = Math.round(n * 100) / 100
  let s = String(v)
  if (s.includes('.')) {
    const [a, b] = s.split('.')
    s = a + ',' + (b.length === 1 ? b + '0' : b.slice(0, 2))
  } else {
    s = s + ',00'
  }
  return '€' + s
}

// Returns { whole: '1.234', decimal: ',56', sign: '€' } for split rendering
export function euroParts(n) {
  const v = Math.round(n * 100) / 100
  const abs = Math.abs(v)
  let s = String(abs)
  let whole, dec
  if (s.includes('.')) {
    const [a, b] = s.split('.')
    whole = a
    dec = ',' + (b.length === 1 ? b + '0' : b.slice(0, 2))
  } else {
    whole = s
    dec = ',00'
  }
  // Add thousand separators
  whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return { whole, dec, sign: v < 0 ? '-€' : '€' }
}

export function euroCompact(n) {
  const v = Math.round(n)
  if (v >= 10000) return `${Math.round(v / 1000)}k`
  if (v >= 1000) return `${(Math.round(v / 100) / 10).toFixed(1)}k`
  return String(v)
}

export function fmtDate(d) {
  const p = d.split('-')
  if (p.length !== 3) return d
  return `${parseInt(p[2])} ${MONTHS[parseInt(p[1]) - 1]}`
}

export function fmtMonthYear(year, month) {
  return `${MONTHS[month - 1]} ${year}`
}

// Today as YYYY-MM-DD string
export function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
