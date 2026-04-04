import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { useState, useRef, useEffect } from 'react'
import { TransactionForm } from '../transactions/TransactionForm'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDailySpending, setDailyIncludeVoorschot } from '../../hooks/useDailySpending'
import { euro, euroCompact, fmtDate } from '../../utils/formatters'
import { chartColors, tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { CATEGORY_MAP } from '../../constants/categories'
import { useSheetGestures } from '../../hooks/useSheetGestures'
import { db } from '../../db/db'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

export function DailyChart({ year, month }) {
  const data = useDailySpending(year, month)
  const [selectedDay, setSelectedDay] = useState(null)

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { daily, daysInMonth, todayDay, average, total, includeVoorschot } = data

  const labels = Array.from({ length: todayDay }, (_, i) => i + 1)
  const amounts = daily.slice(0, todayDay)

  const maxSpend = Math.max(...amounts, 1)
  const highDay = amounts.indexOf(maxSpend) + 1

  const colors = amounts.map(v =>
    v === 0
      ? 'rgba(255,255,255,0.06)'
      : v > average * 1.5
      ? '#FF453A'
      : v > average
      ? '#FF9F0A'
      : '#30D158'
  )

  const chartData = {
    labels,
    datasets: [{
      label: 'Uitgaven',
      data: amounts,
      backgroundColor: colors,
      borderRadius: 4,
      borderSkipped: false,
    }],
  }

  const avgLinePlugin = {
    id: 'avgLine',
    afterDatasetsDraw(chart) {
      if (average <= 0) return
      const { ctx, chartArea, scales } = chart
      const y = scales.y.getPixelForValue(average)
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
      ctx.fillText(`gem. ${euroCompact(average)}`, chartArea.right, y - 4)
      ctx.restore()
    },
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.8,
    animation: false,
    onClick: (_, elements) => {
      if (!elements.length) return
      const day = labels[elements[0].index]
      setSelectedDay(day)
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: items => `Dag ${items[0].label}`,
          label: ctx => `Uitgaven: ${euro(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        ticks: {
          ...tickTheme(),
          maxTicksLimit: 10,
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
        grid: gridTheme(),
        border: { display: false },
      },
    },
  }

  return (
    <div>
      <div className="bg-surface rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted mb-1">Dagelijkse uitgaven</div>
        <div className="text-2xl font-bold tabular-nums text-white">{euro(total)}</div>
        <div className="text-xs text-muted mt-1">
          Gem. {euro(average)} / dag · Piekdag: dag {highDay} ({euro(maxSpend)})
        </div>
      </div>

      <Bar data={chartData} options={options} plugins={[avgLinePlugin]} />

      <div className="flex gap-4 mt-3 px-1">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-green inline-block" /> Onder gemiddelde
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-orange inline-block" /> Boven gemiddeld
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-red inline-block" /> Hoog
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <span className="text-xs text-muted">Voorschot meenemen</span>
        <button
          onClick={() => setDailyIncludeVoorschot(!includeVoorschot)}
          className={`w-11 h-6 rounded-full transition-colors relative ${includeVoorschot ? 'bg-green' : 'bg-surface-2'}`}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${includeVoorschot ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {selectedDay !== null && (
        <DayTransactionSheet
          day={selectedDay}
          year={year}
          month={month}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  )
}

function DayTransactionSheet({ day, year, month, onClose }) {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const sheetRef = useSheetGestures(onClose)
  const [editing, setEditing] = useState(null)

  const txs = useLiveQuery(
    () => db.transactions
      .where('date').equals(dateStr)
      .filter(t => t.type === 'debit' && CATEGORY_MAP[t.category]?.type === 'expense')
      .sortBy('amount'),
    [dateStr]
  )
  const sorted = txs ? [...txs].reverse() : null
  const dayTotal = sorted?.reduce((s, t) => s + t.amount, 0) ?? 0

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl max-h-[70vh] overflow-y-auto pb-24 animate-slide-up">
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex justify-between items-center">
          <div>
            <div className="font-semibold text-sm">{fmtDate(dateStr)}</div>
            {sorted && <div className="text-xs text-muted">{euro(dayTotal)} · {sorted.length} transacties</div>}
          </div>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        {sorted === null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {sorted?.length === 0 && <div className="text-center text-muted py-8 text-sm">Geen uitgaven op deze dag</div>}
        {sorted?.map(tx => {
          const cat = CATEGORY_MAP[tx.category]
          return (
            <button key={tx.id} onClick={() => setEditing(tx)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border text-left">
              <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💸'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{tx.note || cat?.label || tx.category}</div>
                <div className="text-xs text-muted">{cat?.label}</div>
              </div>
              <span className="text-sm font-semibold shrink-0 tabular-nums text-red">
                -{euro(tx.amount)}
              </span>
            </button>
          )
        })}
      </div>
      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
