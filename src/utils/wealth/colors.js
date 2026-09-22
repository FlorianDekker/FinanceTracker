/**
 * Chart.js tekent op een canvas en kent geen CSS-variabelen; de accentkleur is
 * bovendien instelbaar (zie applyAccentColor). Daarom lezen we hem uit, net als
 * de prijsgrafiek bij de bonnetjes doet.
 */
export function cssColor(naam, fallback) {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(naam).trim() || fallback
}

export const accentColor = () => cssColor('--color-accent', '#1E3A5F')
export const redColor = () => cssColor('--color-red', '#EF4444')
export const greenColor = () => cssColor('--color-green', '#10B981')

/** Hex + doorzichtigheid → rgba(); een niet-hex waarde geeft hij ongemoeid terug. */
export function alpha(hex, a) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
