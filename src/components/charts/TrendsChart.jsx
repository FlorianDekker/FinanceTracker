import { useState } from 'react'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js'
import { useYearGrid } from '../../hooks/useYearGrid'
import { euro, euroCompact } from '../../utils/formatters'
import { tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { EXPENSE_CATEGORIES, MONTHS, CAT_COLORS } from '../../constants/categories'
import { useCategories } from '../../hooks/useCategories'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip, Legend)

const now = new Date()


export function TrendsChart({ year }) {
  const data = useYearGrid(year)
  const categories = useCategories()
  const [hidden, setHidden] = useState(new Set())

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { matrix } = data
  const currentMonth = year === now.getFullYear() ? now.getMonth() : 11
  const visibleMonths = MONTHS.slice(0, currentMonth + 1)
  const budgetMap = Object.fromEntries(categories.map(c => [c.key, c.budget]))

  // Sort categories by total spend (descending)
  const ranked = EXPENSE_CATEGORIES
    .map(cat => ({
      ...cat,
      total: (matrix[cat.key] ?? []).slice(0, currentMonth + 1).reduce((s, v) => s + Math.max(0, v), 0),
    }))
    .sort((a, b) => b.total - a.total)

  const toggleCat = key => {
    setHidden(h => {
      const next = new Set(h)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // Use stable EXPENSE_CATEGORIES order for datasets so lines don't swap
  const chartData = {
    labels: visibleMonths,
    datasets: EXPENSE_CATEGORIES
      .filter(cat => !hidden.has(cat.key))
      .map(cat => {
        const row = (matrix[cat.key] ?? []).slice(0, currentMonth + 1)
        const color = CAT_COLORS[cat.key] ?? '#8E8E93'
        return {
          label: cat.label,
          data: row.map(v => Math.max(0, v)),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: color,
          tension: 0.3,
          fill: false,
        }
      }),
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.4,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: tickTheme(),
        grid: { display: false },
        border: { display: false },
      },
      y: {
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

  // Top spender stats
  const topCat = ranked[0]
  const avgMonthly = topCat ? Math.round(topCat.total / (currentMonth + 1)) : 0

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Meeste uitgaven
          </div>
          <div className="text-3xl font-extrabold leading-none" style={{ color: 'var(--color-text)' }}>
            {topCat?.icon} {topCat?.label}
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            Gem. {euro(avgMonthly)} / maand
          </div>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <Line data={chartData} options={options} />
      </div>

      {/* Category toggles — 3-column grid */}
      <div className="card p-3 mb-4 grid grid-cols-3 gap-1.5">
        {ranked.map(cat => {
          const isHidden = hidden.has(cat.key)
          const color = CAT_COLORS[cat.key] ?? '#8E8E93'
          return (
            <button
              key={cat.key}
              onClick={() => toggleCat(cat.key)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium transition-all ${
                isHidden ? 'bg-surface text-muted opacity-40' : ''
              }`}
              style={isHidden ? {} : { backgroundColor: color + '20', color }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isHidden ? 'rgba(255,255,255,0.2)' : color }} />
              {cat.icon} {euro(cat.total)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
