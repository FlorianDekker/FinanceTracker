import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { useState } from 'react'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDailySpending, setDailyIncludeVoorschot } from '../../hooks/useDailySpending'
import { euro, euroCompact, fmtDate } from '../../utils/formatters'
import { chartColors, tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { useCategories } from '../../hooks/useCategories'
import { db } from '../../db/db'
import { isCountedExpense } from '../../utils/claims'
import { StatCard } from '../ui/StatCard'

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

  const progressPct = Math.min(100, (todayDay / daysInMonth) * 100)

  return (
    <div>
      <div className="card p-5 mb-4">
        <StatCard label="Totaal uitgegeven" value={total} delta={`Gem. ${euro(average)} / dag`} />
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 h-[6px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: 'var(--color-accent)',
              }}
            />
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            Dag {todayDay}/{daysInMonth}
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            Piekdag: {highDay}
          </span>
        </div>
      </div>

      <div data-chart-area className="card p-4 mb-4">
        <Bar data={chartData} options={options} plugins={[avgLinePlugin]} />
        <div className="flex gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-2.5 h-2.5 rounded-sm bg-green inline-block" /> Onder gemiddelde
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-2.5 h-2.5 rounded-sm bg-orange inline-block" /> Boven gemiddeld
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-2.5 h-2.5 rounded-sm bg-red inline-block" /> Hoog
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="card overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>Gem. per uitgavendag</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(average)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>Duurste dag</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>Dag {highDay} · {euro(maxSpend)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>Transacties</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{data.totalTransactions ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-muted">Voorschot meenemen</span>
          <button
            onClick={() => setDailyIncludeVoorschot(!includeVoorschot)}
            className={`w-11 h-6 rounded-full transition-colors relative ${includeVoorschot ? 'bg-green' : 'bg-surface-2'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${includeVoorschot ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </div>
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
  const { catMap } = useCategories()
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions
      .where('date').equals(dateStr)
      .filter(t => isCountedExpense(t) && catMap[t.category]?.type === 'expense')
      .sortBy('amount'),
    [dateStr, catMap]
  )
  const sorted = txs ? [...txs].reverse() : null
  const dayTotal = sorted?.reduce((s, t) => s + t.amount, 0) ?? 0

  return (
    <TransactionListSheet
      onClose={onClose}
      accent="var(--color-accent)"
      title={fmtDate(dateStr)}
      subtitle={sorted ? `${euro(dayTotal)} · ${sorted.length} transacties` : undefined}
      transactions={sorted}
      emptyText="Geen uitgaven op deze dag"
      renderMeta={(tx, cat) => cat?.label}
      signOf={() => '-'}
      toneOf={() => 'text-red'}
    />
  )
}
