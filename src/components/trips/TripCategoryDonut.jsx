import { useMemo } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useCategories } from '../../hooks/useCategories'
import { findTripCategory, subLabelOf } from '../../utils/trips/subcategory'
import { euro } from '../../utils/formatters'
import { chartColors, tooltipTheme } from '../../utils/theme'

ChartJS.register(ArcElement, Tooltip)

/**
 * Waar ging het geld van deze vakantie heen? Zelfde donut-stijl als de
 * maandverdeling: kleuren uit de categorieën, totaal in het midden, de rijen
 * eronder als balkjes.
 *
 * Binnen een vakantie staat bijna alles in dezelfde categorie, dus tonen we
 * het label van de subcategorie (Vlucht, Vervoer, …) en houden we de partjes
 * uit elkaar met een oplopende tint van de vakantiekleur.
 *
 * @param perCategory [{ key, category, subcategory, amount, mine, bank }] uit `tripCosts`
 * @param showBank    tweede kolom "Bank" tonen (alleen zinvol mét Splitser)
 */
export function TripCategoryDonut({ perCategory = [], showBank = false, onSelect }) {
  const { catMap, colors, allCategories } = useCategories()
  const vakantie = useMemo(() => findTripCategory(allCategories), [allCategories])

  const catKeyOf = r => r.category ?? r.key
  const rijen = perCategory.filter(r => r.amount > 0 || (showBank && (r.bank ?? 0) > 0))
  const partjes = rijen.filter(r => r.amount > 0)
  const totaal = partjes.reduce((s, r) => s + r.amount, 0)

  if (!rijen.length) {
    return <div className="text-center text-muted py-8 text-sm">Nog niets te verdelen</div>
  }

  const isVakantie = r => vakantie && catKeyOf(r) === vakantie.key && r.subcategory
  const label = r => (isVakantie(r)
    ? subLabelOf(vakantie, r.subcategory)
    : catMap[catKeyOf(r)]?.label ?? catKeyOf(r) ?? 'Onbekend')
  const kleur = r => {
    const basis = colors[catKeyOf(r)] ?? '#8E8E93'
    if (!isVakantie(r)) return basis
    const subs = vakantie.subs ?? []
    return tint(basis, Math.max(0, subs.findIndex(s => s.key === r.subcategory)))
  }

  const data = {
    labels: partjes.map(label),
    datasets: [{
      data: partjes.map(r => r.amount),
      backgroundColor: partjes.map(kleur),
      borderWidth: 0,
      spacing: 2,
    }],
  }

  const midden = {
    id: 'tripCenter',
    afterDraw(chart) {
      const { ctx, chartArea } = chart
      const cx = (chartArea.left + chartArea.right) / 2
      const cy = (chartArea.top + chartArea.bottom) / 2
      const cc = chartColors()
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = cc.textDim
      ctx.font = '11px -apple-system, sans-serif'
      ctx.fillText('Voor jou', cx, cy - 10)
      ctx.fillStyle = cc.text
      ctx.font = 'bold 17px -apple-system, sans-serif'
      ctx.fillText(euro(totaal), cx, cy + 8)
      ctx.restore()
    },
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '66%',
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          label: ctx => `${euro(ctx.parsed)} · ${Math.round((ctx.parsed / totaal) * 100)}%`,
        },
      },
    },
  }

  return (
    <div>
      {partjes.length > 0 && (
        <div className="mx-auto mb-3" style={{ maxWidth: 240 }}>
          <Doughnut data={data} options={options} plugins={[midden]} />
        </div>
      )}
      {showBank && (
        <div className="flex justify-end gap-3 pr-3 mb-1 text-[9px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
          <span>Voor jou</span>
          <span>Bank</span>
        </div>
      )}
      <div className="space-y-1">
        {rijen.map(r => {
          const pct = totaal > 0 ? (r.amount / totaal) * 100 : 0
          return (
            <button
              key={r.key || 'onbekend'}
              onClick={() => onSelect?.(r)}
              className="w-full relative overflow-hidden rounded-xl py-2 px-3 flex items-center gap-3"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-xl"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: kleur(r), opacity: 0.15 }}
              />
              <div className="w-2.5 h-2.5 rounded-full shrink-0 relative" style={{ backgroundColor: kleur(r) }} />
              <div className="flex-1 min-w-0 text-left relative text-sm truncate">
                {catMap[catKeyOf(r)]?.icon ?? '📦'} {label(r)}
              </div>
              {showBank ? (
                <div className="flex items-baseline gap-3 relative shrink-0">
                  <span className="text-sm font-bold tabular-nums">{euro(r.amount)}</span>
                  <span className="text-[11px] text-muted tabular-nums" style={{ minWidth: 54, textAlign: 'right' }}>
                    {euro(r.bank ?? 0)}
                  </span>
                </div>
              ) : (
                <div className="text-right relative">
                  <div className="text-sm font-bold tabular-nums">{euro(r.amount)}</div>
                  <div className="text-[10px] text-muted tabular-nums">{Math.round(pct)}%</div>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Zelfde kleur, iets lichter per stap: alle vakantie-subs delen immers de
// kleur van Vakantie en zouden anders één massief rondje vormen.
function tint(hex, stap) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''))
  if (!stap || !m) return hex
  const n = parseInt(m[1], 16)
  const mix = Math.min(0.5, stap * 0.13)
  const kanaal = v => Math.round(v + (255 - v) * mix).toString(16).padStart(2, '0')
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(kanaal).join('')}`
}
