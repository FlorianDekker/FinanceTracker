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
import { useState } from 'react'
import { usePaceData, setPaceExcluded, DEFAULT_PACE_EXCLUDED } from '../../hooks/usePaceData'
import { euroCompact, euro, euroParts } from '../../utils/formatters'
import { chartColors, tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCategories } from '../../hooks/useCategories'
import { db } from '../../db/db'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const GREEN = '#30D158'
const RED = '#FF453A'

export function PaceChart({ year, month }) {
  const data = usePaceData(year, month)
  const categories = useCategories()
  const [showCats, setShowCats] = useState(false)
  const paceSetting = useLiveQuery(() => db.settings.get('paceExcluded'), [])
  const paceExcluded = new Set(paceSetting?.value ?? DEFAULT_PACE_EXCLUDED)
  const expenseCats = categories.filter(c => c.type === 'expense')

  async function togglePaceCategory(key) {
    const next = new Set(paceExcluded)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    await setPaceExcluded([...next])
  }

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { actualCum, idealCum, daysInMonth, todayDay, diff, isAhead, actualToday, totalBudgetVariable } = data

  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Today line plugin — only shown for the current month
  const todayLinePlugin = {
    id: 'todayLine',
    afterDraw(chart) {
      if (!isCurrentMonth) return
      const { ctx, chartArea, scales } = chart
      if (todayDay < 1 || todayDay > daysInMonth) return
      const x = scales.x.getPixelForValue(todayDay - 1)
      ctx.save()
      const cc = chartColors()
      ctx.strokeStyle = cc.axis
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
      ctx.stroke()
      ctx.fillStyle = cc.textDim
      ctx.font = '9px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('vandaag', x, chartArea.top - 4)
      ctx.restore()
    },
  }

  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#1E3A5F'

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Ideaal',
        data: idealCum,
        borderColor: chartColors().axis,
        borderDash: [6, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      },
      {
        label: 'Werkelijk',
        data: actualCum,
        borderColor: isAhead ? GREEN : RED,
        borderWidth: 2.5,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: isAhead ? GREEN : RED,
        tension: 0.35,
        fill: 'origin',
        backgroundColor: ctx => {
          const chart = ctx.chart
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'transparent'
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          if (isAhead) {
            gradient.addColorStop(0, 'rgba(48, 209, 88, 0.25)')
            gradient.addColorStop(0.6, 'rgba(48, 209, 88, 0.08)')
            gradient.addColorStop(1, 'rgba(48, 209, 88, 0)')
          } else {
            gradient.addColorStop(0, 'rgba(255, 69, 58, 0.25)')
            gradient.addColorStop(0.6, 'rgba(255, 69, 58, 0.08)')
            gradient.addColorStop(1, 'rgba(255, 69, 58, 0)')
          }
          return gradient
        },
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.8,
    animation: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: items => `Dag ${items[0].label}`,
          label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          ...tickTheme(),
          maxTicksLimit: 7,
        },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: {
          ...tickTheme(),
          callback: v => euroCompact(v),
          maxTicksLimit: 5,
        },
        grid: {
          ...gridTheme(),
          drawBorder: false,
        },
        border: { display: false },
      },
    },
  }

  const pctUsed = totalBudgetVariable > 0 ? Math.round((actualToday / totalBudgetVariable) * 100) : 0

  return (
    <div>
      {/* Stats card */}
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            {isAhead ? 'Onder budget' : 'Over budget'}
          </div>
          {(() => {
            const p = euroParts(Math.abs(diff))
            return (
              <div className={`tabular-nums tracking-tight ${isAhead ? 'text-green' : 'text-red'}`}>
                <span className="text-lg font-bold align-top">{isAhead ? '+' : '-'}€</span>
                <span className="text-4xl font-extrabold">{p.whole}</span>
                <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{p.dec}</span>
              </div>
            )
          })()}
          <div className={`text-sm font-bold tabular-nums mt-0.5 ${isAhead ? 'text-green' : 'text-red'}`} style={{ opacity: 0.3 }}>
            {pctUsed}%
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 h-[6px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(pctUsed, 100)}%`,
                background: isAhead ? 'var(--color-green)' : 'var(--color-red)',
              }}
            />
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {isCurrentMonth ? `Dag ${todayDay}` : 'Volledige maand'} · {euro(actualToday)}
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {euro(totalBudgetVariable)}
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="card p-4 mb-4">
        <Line data={chartData} options={options} plugins={[todayLinePlugin]} />
        <div className="flex gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: 'var(--color-muted)' }} />
            Ideaal
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-4 border-t-2 inline-block" style={{ borderColor: isAhead ? GREEN : RED }} />
            Werkelijk
          </span>
        </div>
      </div>

      {/* Category selector */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowCats(v => !v)}
          className="flex items-center justify-between w-full px-4 py-3.5"
        >
          <div>
            <div className="text-xs font-medium text-left" style={{ color: 'var(--color-text)' }}>Categorieën</div>
            <div className="text-[11px] text-muted mt-0.5 text-left">{expenseCats.filter(c => !paceExcluded.has(c.key)).length} van {expenseCats.length} geselecteerd</div>
          </div>
          <span className={`text-muted text-xs transition-transform duration-200 ${showCats ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {showCats && (
          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            {expenseCats.map((cat, i) => {
              const included = !paceExcluded.has(cat.key)
              return (
                <button
                  key={cat.key}
                  onClick={() => togglePaceCategory(cat.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  style={i < expenseCats.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                >
                  <span className="text-base w-6 text-center">{cat.icon}</span>
                  <span className="flex-1 text-sm" style={{ color: included ? 'var(--color-text)' : 'var(--color-muted)' }}>{cat.label}</span>
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center text-[10px]"
                    style={included
                      ? { background: 'var(--color-accent)', color: '#fff' }
                      : { border: '1.5px solid var(--color-border)' }
                    }
                  >
                    {included ? '✓' : ''}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
