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
import { euroCompact, euro } from '../../utils/formatters'
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

  const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  // Today line plugin
  const todayLinePlugin = {
    id: 'todayLine',
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart
      if (todayDay < 1 || todayDay > daysInMonth) return
      const x = scales.x.getPixelForValue(todayDay - 1)
      ctx.save()
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
      ctx.stroke()
      // "Vandaag" label
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.font = '9px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('vandaag', x, chartArea.top - 4)
      ctx.restore()
    },
  }

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Ideaal',
        data: idealCum,
        borderColor: 'rgba(255,255,255,0.2)',
        borderDash: [5, 5],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0,
        fill: false,
      },
      {
        label: 'Werkelijk',
        data: actualCum,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0,
        fill: 'origin',
        backgroundColor: ctx => {
          const chart = ctx.chart
          const { ctx: c, chartArea } = chart
          if (!chartArea) return 'transparent'
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, isAhead ? 'rgba(48,209,88,0.18)' : 'rgba(255,69,58,0.18)')
          gradient.addColorStop(1, 'rgba(0,0,0,0)')
          return gradient
        },
        segment: {
          borderColor: ctx => {
            const i = ctx.p0DataIndex
            return actualCum[i] <= idealCum[i] ? GREEN : RED
          },
        },
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.9,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(28,28,30,0.95)',
        titleColor: 'rgba(255,255,255,0.5)',
        bodyColor: '#ffffff',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          title: items => `Dag ${items[0].label}`,
          label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'rgba(255,255,255,0.3)',
          maxTicksLimit: 8,
          font: { size: 10 },
        },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        ticks: {
          color: 'rgba(255,255,255,0.3)',
          font: { size: 10 },
          callback: v => euroCompact(v),
          maxTicksLimit: 5,
        },
        grid: { color: 'rgba(255,255,255,0.04)' },
        border: { display: false },
      },
    },
  }

  return (
    <div>
      {/* Stats header */}
      <div className="bg-surface rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted mb-1">
          {isAhead
            ? `Op dit tempo houd je ${euro(diff)} over`
            : `Op dit tempo ga je ${euro(-diff)} over budget`
          }
        </div>
        <div className={`text-2xl font-bold tabular-nums ${isAhead ? 'text-green' : 'text-red'}`}>
          {isAhead ? `+${euro(diff)}` : `-${euro(-diff)}`}
        </div>
        <div className="text-xs text-muted mt-1">
          Dag {todayDay}/{daysInMonth} · {euro(actualToday)} van {euro(totalBudgetVariable)}
        </div>
      </div>

      <Line data={chartData} options={options} plugins={[todayLinePlugin]} />

      <div className="flex gap-4 mt-3 px-1">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-4 border-t-2 border-dashed border-white/30 inline-block" />
          Ideaal tempo
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-4 border-t-2 border-green inline-block" />
          Werkelijk
        </span>
      </div>

      {/* Category selector dropdown */}
      <div className="mt-5">
        <button
          onClick={() => setShowCats(v => !v)}
          className="flex items-center justify-between w-full bg-surface rounded-xl px-4 py-3"
        >
          <div>
            <div className="text-xs text-muted text-left">Categorieën meegenomen in budgettempo</div>
            <div className="text-xs text-white/60 mt-0.5 text-left">{expenseCats.filter(c => !paceExcluded.has(c.key)).length} van {expenseCats.length} categorieën</div>
          </div>
          <span className={`text-muted text-sm transition-transform ${showCats ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {showCats && (
          <div className="bg-surface rounded-xl mt-1 divide-y divide-border overflow-hidden">
            {expenseCats.map(cat => {
              const included = !paceExcluded.has(cat.key)
              return (
                <button
                  key={cat.key}
                  onClick={() => togglePaceCategory(cat.key)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span className="text-base w-6 text-center">{cat.icon}</span>
                  <span className={`flex-1 text-xs ${included ? 'text-white' : 'text-muted'}`}>{cat.label}</span>
                  <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${included ? 'bg-green border-green text-white' : 'border-border'}`}>
                    {included ? '✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
