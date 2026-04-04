// Theme-aware colors for chart canvas rendering and Chart.js options.
// Reads CSS variables so charts adapt to dark/light mode.

function getVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function isLightMode() {
  return !document.documentElement.classList.contains('dark')
}

/** Colors for use in Chart.js canvas plugins (ctx.fillStyle etc.) */
export function chartColors() {
  const light = isLightMode()
  return {
    text:        getVar('--chart-text') || (light ? '#1d1d1f' : '#ffffff'),
    textDim:     getVar('--chart-text-dim') || (light ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)'),
    grid:        getVar('--chart-grid') || (light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'),
    axis:        getVar('--chart-axis') || (light ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.10)'),
    tooltipBg:   light ? 'rgba(255,255,255,0.95)' : 'rgba(28,28,30,0.95)',
    tooltipText: light ? '#1d1d1f' : '#ffffff',
    tooltipDim:  light ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)',
    tooltipBorder: light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
    surface:     getVar('--color-surface') || (light ? '#ffffff' : '#1c1c1e'),
  }
}

/** Common Chart.js tooltip config */
export function tooltipTheme() {
  const c = chartColors()
  return {
    backgroundColor: c.tooltipBg,
    titleColor: c.tooltipDim,
    bodyColor: c.tooltipText,
    borderColor: c.tooltipBorder,
    borderWidth: 1,
    padding: 10,
  }
}

/** Common Chart.js scale tick config */
export function tickTheme() {
  const c = chartColors()
  return { color: c.textDim, font: { size: 10 } }
}

/** Common Chart.js grid config */
export function gridTheme() {
  const c = chartColors()
  return { color: c.grid }
}
