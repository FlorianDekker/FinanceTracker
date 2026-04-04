import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { useYearGrid } from '../../hooks/useYearGrid'
import { euro, euroCompact } from '../../utils/formatters'
import { chartColors, tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { EXPENSE_CATEGORIES, MONTHS, CAT_COLORS } from '../../constants/categories'
import { useCategories } from '../../hooks/useCategories'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

const now = new Date()


export function StackedChart({ year }) {
  const data = useYearGrid(year)
  const categories = useCategories()

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { matrix, monthTotals } = data
  const currentMonth = year === now.getFullYear() ? now.getMonth() : 11
  const visibleMonths = MONTHS.slice(0, currentMonth + 1)

  // Sort by total spend so biggest category is at the bottom (most visible)
  const ranked = EXPENSE_CATEGORIES
    .map(cat => ({
      ...cat,
      total: (matrix[cat.key] ?? []).slice(0, currentMonth + 1).reduce((s, v) => s + Math.max(0, v), 0),
    }))
    .sort((a, b) => a.total - b.total) // smallest on top

  const chartData = {
    labels: visibleMonths,
    datasets: ranked.map((cat, i) => {
      const row = (matrix[cat.key] ?? []).slice(0, currentMonth + 1)
      const color = CAT_COLORS[cat.key] ?? '#8E8E93'
      const isLast = i === ranked.length - 1
      const isFirst = i === 0
      return {
        label: `${cat.icon} ${cat.label}`,
        data: row.map(v => Math.max(0, v)),
        backgroundColor: color + 'CC',
        borderRadius: isFirst ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : isLast ? { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 } : 0,
        borderSkipped: true,
      }
    }),
  }

  // Monthly average line plugin
  const avgPlugin = {
    id: 'monthlyAvg',
    afterDatasetsDraw(chart) {
      const totals = monthTotals.slice(0, currentMonth + 1)
      const avg = totals.reduce((s, v) => s + v, 0) / totals.length
      if (avg <= 0) return
      const { ctx, chartArea, scales } = chart
      const y = scales.y.getPixelForValue(avg)
      ctx.save()
      const cc = chartColors()
      ctx.strokeStyle = cc.axis
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(chartArea.left, y)
      ctx.lineTo(chartArea.right, y)
      ctx.stroke()
      ctx.fillStyle = cc.textDim
      ctx.font = '9px -apple-system, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(`gem. ${euroCompact(avg)}`, chartArea.right, y - 4)
      ctx.restore()
    },
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.4,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        filter: item => item.parsed.y > 0,
        callbacks: {
          label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}`,
          afterBody: items => {
            const total = items.reduce((s, i) => s + i.parsed.y, 0)
            return `\nTotaal: ${euro(total)}`
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: tickTheme(),
        grid: { display: false },
        border: { display: false },
      },
      y: {
        stacked: true,
        ticks: {
          ...tickTheme(),
          callback: v => euroCompact(v),
          maxTicksLimit: 5,
        },
        grid: gridTheme(),
        border: { display: false },
      },
    },
  }

  // Stats
  const totals = monthTotals.slice(0, currentMonth + 1)
  const yearTotal = totals.reduce((s, v) => s + v, 0)
  const avgMonthly = Math.round(yearTotal / totals.length)
  const maxMonth = totals.indexOf(Math.max(...totals))
  const minMonth = totals.indexOf(Math.min(...totals.filter(v => v > 0)))

  // Category breakdown for legend (sorted by total desc)
  const legendCats = [...ranked].reverse()

  return (
    <div>
      <div className="bg-surface rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted mb-1">Totale uitgaven in {year}</div>
        <div className="text-2xl font-bold tabular-nums">{euro(yearTotal)}</div>
        <div className="text-xs text-muted mt-1">
          Gem. {euro(avgMonthly)}/mnd · Duurste: {MONTHS[maxMonth]} · Goedkoopste: {MONTHS[minMonth]}
        </div>
      </div>

      <Bar data={chartData} options={options} plugins={[avgPlugin]} />

      {/* Category legend sorted by total */}
      <div className="mt-4 space-y-2">
        {legendCats.filter(c => c.total > 0).map(cat => {
          const color = CAT_COLORS[cat.key] ?? '#8E8E93'
          const pct = yearTotal > 0 ? (cat.total / yearTotal) * 100 : 0
          return (
            <div key={cat.key} className="relative overflow-hidden rounded-xl py-2.5 px-3 flex items-center gap-3">
              <div
                className="absolute inset-y-0 left-0 rounded-xl"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color, opacity: 0.15 }}
              />
              <div className="w-2.5 h-2.5 rounded-full shrink-0 relative" style={{ backgroundColor: color }} />
              <span className="text-sm flex-1 truncate relative" style={{ color: 'var(--color-text)' }}>{cat.icon} {cat.label}</span>
              <span className="text-xs text-muted tabular-nums relative">{Math.round(pct)}%</span>
              <span className="text-sm font-semibold tabular-nums w-16 text-right relative">{euro(cat.total)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
