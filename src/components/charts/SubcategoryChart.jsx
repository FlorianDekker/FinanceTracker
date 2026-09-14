import { useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro } from '../../utils/formatters'
import { useCategories } from '../../hooks/useCategories'
import { chartColors, tooltipTheme } from '../../utils/theme'
import { StatCard } from '../ui/StatCard'

ChartJS.register(ArcElement, Tooltip)

// Generate distinct colors for subcategories based on parent color
function subColors(baseColor, count) {
  const colors = []
  for (let i = 0; i < count; i++) {
    const opacity = 1 - (i * 0.15)
    colors.push(baseColor + Math.round(opacity * 255).toString(16).padStart(2, '0'))
  }
  return colors
}

export function SubcategoryChart({ year, month }) {
  // Picker toont actieve categorieen; catMap/colors resolven ook gearchiveerde.
  const { categories, catMap, colors: catColors } = useCategories()
  const [selectedCat, setSelectedCat] = useState('')
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const catsWithSubs = categories.filter(c => c.type === 'expense' && c.subs?.length > 0)
  const activeCat = selectedCat || catsWithSubs[0]?.key || ''

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix)
      .filter(t => t.type === 'debit' && t.category === activeCat)
      .toArray(),
    [prefix, activeCat]
  )

  const cat = catMap[activeCat]
  const color = catColors[activeCat] ?? '#8E8E93'

  if (!txs || !cat) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  // Group by subcategory
  const subMap = new Map()
  for (const tx of txs) {
    const subKey = tx.subcategory || '_none'
    subMap.set(subKey, (subMap.get(subKey) ?? 0) + tx.amount)
  }

  const subs = cat.subs
    .map(s => ({ key: s.key, label: s.label, amount: subMap.get(s.key) ?? 0 }))
    .filter(s => s.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  const noneAmount = subMap.get('_none') ?? 0
  if (noneAmount > 0) subs.push({ key: '_none', label: 'Overig', amount: noneAmount })

  const total = subs.reduce((s, c) => s + c.amount, 0)
  const colors = subColors(color, subs.length)

  const chartData = subs.length > 0 ? {
    labels: subs.map(s => s.label),
    datasets: [{
      data: subs.map(s => s.amount),
      backgroundColor: colors,
      borderWidth: 0,
      hoverOffset: 6,
    }],
  } : null

  const centerPlugin = {
    id: 'subCenter',
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
      ctx.fillText(cat.label, cx, cy - 10)
      ctx.fillStyle = cc.text
      ctx.font = 'bold 15px -apple-system, sans-serif'
      ctx.fillText(euro(total), cx, cy + 8)
      ctx.restore()
    },
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '60%',
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          label: ctx => {
            const pct = Math.round((ctx.parsed / total) * 100)
            return `${euro(ctx.parsed)} · ${pct}%`
          },
        },
      },
    },
  }

  return (
    <div>
      {/* Stat card */}
      <div className="card p-5 mb-4">
        <StatCard label={`${cat.icon} ${cat.label}`} value={total} delta={`${subs.length} subcategorieën`} />
      </div>

      {/* Category selector */}
      <div className="card mb-4">
        <select
          value={activeCat}
          onChange={e => setSelectedCat(e.target.value)}
          className="w-full px-4 py-3 rounded-2xl appearance-none font-semibold text-sm"
          style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)', border: 'none' }}
        >
          {catsWithSubs.map(c => (
            <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>

      {/* Donut + breakdown */}
      {chartData && subs.length > 0 ? (
        <div data-chart-area className="card pt-2 px-4 pb-4 mb-4 overflow-hidden">
          <div className="mx-auto mb-3" style={{ maxWidth: 260 }}>
            <Doughnut data={chartData} options={options} plugins={[centerPlugin]} />
          </div>

          <div className="space-y-1">
            {subs.map((s, i) => {
              const pct = total > 0 ? (s.amount / total) * 100 : 0
              return (
                <div key={s.key} className="relative overflow-hidden rounded-xl py-2.5 px-3 flex items-center gap-3">
                  <div className="absolute inset-y-0 left-0 rounded-xl" style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: colors[i], opacity: 0.15 }} />
                  <div className="w-3 h-3 rounded-full shrink-0 relative" style={{ backgroundColor: colors[i] }} />
                  <div className="flex-1 min-w-0 text-left relative">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{s.label}</div>
                  </div>
                  <div className="text-right relative">
                    <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(s.amount)}</div>
                    <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted)' }}>{Math.round(pct)}%</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="text-center text-muted py-8 text-sm">Geen uitgaven in deze categorie</div>
      )}
    </div>
  )
}
