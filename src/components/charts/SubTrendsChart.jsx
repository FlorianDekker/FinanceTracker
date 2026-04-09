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

// Generate distinct sub-colors from a base
function generateSubColors(base, count) {
  // Parse hex
  const r = parseInt(base.slice(1, 3), 16)
  const g = parseInt(base.slice(3, 5), 16)
  const b = parseInt(base.slice(5, 7), 16)
  const colors = []
  for (let i = 0; i < count; i++) {
    const shift = i * 35
    const nr = Math.min(255, Math.max(0, r + shift - (count > 3 ? i * 15 : 0)))
    const ng = Math.min(255, Math.max(0, g - shift * 0.3))
    const nb = Math.min(255, Math.max(0, b + shift * 0.5))
    colors.push(`rgb(${nr}, ${ng}, ${nb})`)
  }
  return colors
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

  const subColors = generateSubColors(color, activeSubs.length)

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
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-none -mx-4 px-4">
        {EXPENSE_CATS_WITH_SUBS.map(c => (
          <button
            key={c.key}
            onClick={() => setSelectedCat(c.key)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selectedCat === c.key ? 'btn-accent' : 'text-muted'}`}
            style={selectedCat !== c.key ? { background: 'var(--color-surface-2)' } : {}}
          >
            {c.icon} {c.label}
          </button>
        ))}
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
