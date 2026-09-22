import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useCategories } from '../../hooks/useCategories'
import { euro } from '../../utils/formatters'
import { chartColors, tooltipTheme } from '../../utils/theme'

ChartJS.register(ArcElement, Tooltip)

/**
 * Waar ging het geld van deze vakantie heen? Zelfde donut-stijl als de
 * maandverdeling: kleuren uit de categorieën, totaal in het midden, de rijen
 * eronder als balkjes.
 *
 * @param perCategory [{ key, amount }] uit `tripCosts`
 */
export function TripCategoryDonut({ perCategory = [], onSelect }) {
  const { catMap, colors } = useCategories()
  const rijen = perCategory.filter(r => r.amount > 0)
  const totaal = rijen.reduce((s, r) => s + r.amount, 0)

  if (!rijen.length) {
    return <div className="text-center text-muted py-8 text-sm">Nog niets te verdelen</div>
  }

  const kleur = key => colors[key] ?? '#8E8E93'
  const label = key => catMap[key]?.label ?? key ?? 'Onbekend'

  const data = {
    labels: rijen.map(r => label(r.key)),
    datasets: [{
      data: rijen.map(r => r.amount),
      backgroundColor: rijen.map(r => kleur(r.key)),
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
      <div className="mx-auto mb-3" style={{ maxWidth: 240 }}>
        <Doughnut data={data} options={options} plugins={[midden]} />
      </div>
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
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: kleur(r.key), opacity: 0.15 }}
              />
              <div className="w-2.5 h-2.5 rounded-full shrink-0 relative" style={{ backgroundColor: kleur(r.key) }} />
              <div className="flex-1 min-w-0 text-left relative text-sm truncate">
                {catMap[r.key]?.icon ?? '📦'} {label(r.key)}
              </div>
              <div className="text-right relative">
                <div className="text-sm font-bold tabular-nums">{euro(r.amount)}</div>
                <div className="text-[10px] text-muted tabular-nums">{Math.round(pct)}%</div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
