import { useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, euroParts } from '../../utils/formatters'
import { CATEGORIES, CAT_COLORS, CATEGORY_MAP } from '../../constants/categories'
import { chartColors, tooltipTheme } from '../../utils/theme'

ChartJS.register(ArcElement, Tooltip)

const EXPENSE_CATS_WITH_SUBS = CATEGORIES.filter(c => c.type === 'expense' && c.subs.length > 0)

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
  const [selectedCat, setSelectedCat] = useState(EXPENSE_CATS_WITH_SUBS[0]?.key ?? '')
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix)
      .filter(t => t.type === 'debit' && t.category === selectedCat)
      .toArray(),
    [prefix, selectedCat]
  )

  const cat = CATEGORY_MAP[selectedCat]
  const color = CAT_COLORS[selectedCat] ?? '#8E8E93'

  if (!txs || !cat) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  // Group by subcategory
  const subMap = new Map()
  let noSubTotal = 0
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
  const tp = euroParts(total)
  const colors = subColors(color, subs.length)
  const maxAmount = subs[0]?.amount ?? 1

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
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            {cat.icon} {cat.label}
          </div>
          <div className="tabular-nums tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{tp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{tp.dec}</span>
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            {subs.length} subcategorieën
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
