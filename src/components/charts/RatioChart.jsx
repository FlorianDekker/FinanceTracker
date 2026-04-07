import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useBudgetStats } from '../../hooks/useBudgetStats'
import { euro, euroParts } from '../../utils/formatters'
import { FIXED_CATEGORIES } from '../../constants/categories'
import { chartColors, tooltipTheme } from '../../utils/theme'

ChartJS.register(ArcElement, Tooltip)

export function RatioChart({ year, month }) {
  const stats = useBudgetStats(year, month)

  const expenses = stats.filter(c => c.type === 'expense' && c.spent > 0)
  const fixed = expenses.filter(c => FIXED_CATEGORIES.has(c.key))
  const variable = expenses.filter(c => !FIXED_CATEGORIES.has(c.key))

  const fixedTotal = fixed.reduce((s, c) => s + c.spent, 0)
  const variableTotal = variable.reduce((s, c) => s + c.spent, 0)
  const total = fixedTotal + variableTotal

  const fixedPct = total > 0 ? Math.round((fixedTotal / total) * 100) : 0
  const variablePct = 100 - fixedPct

  const tp = euroParts(total)

  const chartData = {
    labels: ['Vast', 'Variabel'],
    datasets: [{
      data: [fixedTotal, variableTotal],
      backgroundColor: ['var(--color-accent)', 'var(--color-green)'],
      borderWidth: 0,
      hoverOffset: 6,
    }],
  }

  const centerPlugin = {
    id: 'ratioCenter',
    afterDraw(chart) {
      const { ctx, chartArea } = chart
      const cx = (chartArea.left + chartArea.right) / 2
      const cy = (chartArea.top + chartArea.bottom) / 2
      const cc = chartColors()
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = cc.textDim
      ctx.font = '10px -apple-system, sans-serif'
      ctx.fillText('Vast / Variabel', cx, cy - 10)
      ctx.fillStyle = cc.text
      ctx.font = 'bold 16px -apple-system, sans-serif'
      ctx.fillText(`${fixedPct}% / ${variablePct}%`, cx, cy + 8)
      ctx.restore()
    },
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '65%',
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          label: ctx => `${ctx.label}: ${euro(ctx.parsed)}`,
        },
      },
    },
  }

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Totaal uitgegeven
          </div>
          <div className="tabular-nums tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{tp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{tp.dec}</span>
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            {fixedPct}% vast · {variablePct}% variabel
          </div>
        </div>
      </div>

      <div data-chart-area className="card p-4 mb-4">
        <div className="mx-auto" style={{ maxWidth: 260 }}>
          <Doughnut data={chartData} options={options} plugins={[centerPlugin]} />
        </div>
        <div className="flex gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-accent)' }} /> Vast
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--color-green)' }} /> Variabel
          </span>
        </div>
      </div>

      {/* Fixed costs */}
      <div className="card overflow-hidden mb-4">
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>Vaste lasten · {euro(fixedTotal)}</span>
        </div>
        {fixed.sort((a, b) => b.spent - a.spent).map((c, i) => (
          <div key={c.key} className="flex items-center gap-3 px-4 py-2.5" style={i < fixed.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}>
            <span className="text-base">{c.icon}</span>
            <span className="text-sm flex-1" style={{ color: 'var(--color-text)' }}>{c.label}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(c.spent)}</span>
          </div>
        ))}
      </div>

      {/* Variable costs */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-xs font-semibold text-green">Variabele kosten · {euro(variableTotal)}</span>
        </div>
        {variable.sort((a, b) => b.spent - a.spent).map((c, i) => (
          <div key={c.key} className="flex items-center gap-3 px-4 py-2.5" style={i < variable.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}>
            <span className="text-base">{c.icon}</span>
            <span className="text-sm flex-1" style={{ color: 'var(--color-text)' }}>{c.label}</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(c.spent)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
