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
} from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, euroCompact } from '../../utils/formatters'
import { CATEGORIES, CAT_COLORS, MONTHS } from '../../constants/categories'
import { tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const now = new Date()
const EXPENSE_CATS_WITH_SUBS = CATEGORIES.filter(c => c.type === 'expense' && c.subs.length > 0)

// Distinct colors that work well together regardless of parent category
const DISTINCT_SUB_COLORS = [
  '#2563EB', // blue
  '#DC2626', // red
  '#16A34A', // green
  '#D97706', // amber
  '#9333EA', // purple
  '#0891B2', // cyan
  '#E11D48', // rose
  '#4F46E5', // indigo
  '#059669', // emerald
  '#EA580C', // orange
]

function getSubColors(count) {
  return DISTINCT_SUB_COLORS.slice(0, count)
}

export function SubTrendsChart() {
  const [selectedCat, setSelectedCat] = useState(EXPENSE_CATS_WITH_SUBS[0]?.key ?? '')

  const year = now.getFullYear()
  const currentMonth = now.getMonth()

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(`${year}-`).toArray(),
    [year]
  )

  const cat = CATEGORIES.find(c => c.key === selectedCat)
  const color = CAT_COLORS[selectedCat] ?? '#8E8E93'

  if (!txs || !cat) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const subs = cat.subs
  const visibleMonths = MONTHS.slice(0, currentMonth + 1)

  // Build monthly totals per subcategory
  const subMonthly = {}
  for (const s of subs) subMonthly[s.key] = Array(currentMonth + 1).fill(0)
  subMonthly['_none'] = Array(currentMonth + 1).fill(0)

  for (const tx of txs) {
    if (tx.type !== 'debit' || tx.category !== selectedCat) continue
    const m = parseInt(tx.date.slice(5, 7), 10) - 1
    if (m > currentMonth) continue
    const subKey = tx.subcategory || '_none'
    if (subMonthly[subKey]) subMonthly[subKey][m] += tx.amount
  }

  // Filter to subs that have data
  const activeSubs = subs.filter(s => subMonthly[s.key].some(v => v > 0))
  const noneHasData = subMonthly['_none'].some(v => v > 0)
  if (noneHasData) activeSubs.push({ key: '_none', label: 'Overig' })

  const subColors = getSubColors(activeSubs.length)

  const chartData = {
    labels: visibleMonths,
    datasets: activeSubs.map((s, i) => ({
      label: s.label,
      data: subMonthly[s.key],
      borderColor: subColors[i],
      backgroundColor: subColors[i] + '20',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
    })),
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.6,
    animation: false,
    interaction: { intersect: false, mode: 'index' },
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

  // Yearly totals per sub
  const subYearTotals = activeSubs.map(s => ({
    ...s,
    total: subMonthly[s.key].reduce((a, b) => a + b, 0),
  })).sort((a, b) => b.total - a.total)
  const totalAll = subYearTotals.reduce((s, c) => s + c.total, 0)

  return (
    <div>
      {/* Stat card */}
      <div className="card p-5 mb-4">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            {cat.icon} {cat.label} — Trends {year}
          </div>
          <div className="text-3xl font-extrabold leading-none" style={{ color: 'var(--color-text)' }}>
            {euro(totalAll)}
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            {activeSubs.length} subcategorieën
          </div>
        </div>
      </div>

      {/* Category selector */}
      <div className="card mb-4">
        <select
          value={selectedCat}
          onChange={e => setSelectedCat(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl appearance-none font-semibold text-sm"
          style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)', border: 'none' }}
        >
          {EXPENSE_CATS_WITH_SUBS.map(c => (
            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>

      {/* Chart */}
      <div data-chart-area className="card p-4 mb-4">
        <Line data={chartData} options={options} />
      </div>

      {/* Legend + totals */}
      <div className="card overflow-hidden">
        {subYearTotals.map((s, i) => {
          const pct = totalAll > 0 ? Math.round((s.total / totalAll) * 100) : 0
          const ci = activeSubs.findIndex(a => a.key === s.key)
          return (
            <div
              key={s.key}
              className="flex items-center gap-3 px-4 py-2.5"
              style={i < subYearTotals.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: subColors[ci] }} />
              <span className="flex-1 text-sm" style={{ color: 'var(--color-text)' }}>{s.label}</span>
              <span className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted)' }}>{pct}%</span>
              <span className="text-sm font-bold tabular-nums w-16 text-right" style={{ color: 'var(--color-text)' }}>{euro(s.total)}</span>
            </div>
          )
        })}
      </div>

      {activeSubs.length === 0 && (
        <div className="text-center text-muted py-8 text-sm">Geen uitgaven in deze categorie</div>
      )}
    </div>
  )
}
