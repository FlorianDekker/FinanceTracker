import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, euroParts, euroCompact } from '../../utils/formatters'
import { tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

const DAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export function WeekdayChart({ year, month }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions
      .where('date').startsWith(prefix)
      .filter(t => t.type === 'debit' && t.category !== 'bankoverschrijving')
      .toArray(),
    [prefix]
  )

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  // Group spending by day of week (0=Mon, 6=Sun)
  const dayTotals = Array(7).fill(0)
  const dayCounts = Array(7).fill(0)
  for (const tx of txs) {
    const d = new Date(tx.date)
    const dow = (d.getDay() + 6) % 7 // Convert Sun=0 to Mon=0
    dayTotals[dow] += tx.amount
    dayCounts[dow]++
  }

  const total = dayTotals.reduce((s, v) => s + v, 0)
  const maxDay = dayTotals.indexOf(Math.max(...dayTotals))
  const minDay = dayTotals.indexOf(Math.min(...dayTotals.filter(v => v > 0)))
  const tp = euroParts(total)

  const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#1E3A5F'

  const chartData = {
    labels: DAYS_NL,
    datasets: [{
      data: dayTotals,
      backgroundColor: dayTotals.map((_, i) => i === maxDay ? accentColor : accentColor + '40'),
      borderRadius: 8,
      borderSkipped: false,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.8,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: items => DAYS_NL[items[0].dataIndex],
          label: ctx => `${euro(ctx.parsed.y)} (${dayCounts[ctx.dataIndex]} transacties)`,
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

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Totaal uitgegeven
          </div>
          <div className="tabular-nums tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{tp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{tp.dec}</span>
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            Duurste dag: {DAYS_NL[maxDay]}
          </div>
        </div>
        <div className="flex justify-between mt-3">
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {txs.length} transacties
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            Goedkoopste: {DAYS_NL[minDay]}
          </span>
        </div>
      </div>

      <div data-chart-area className="card p-4 mb-4">
        <Bar data={chartData} options={options} />
      </div>

      {/* Day breakdown */}
      <div className="card overflow-hidden">
        {DAYS_NL.map((day, i) => {
          const pct = total > 0 ? (dayTotals[i] / total) * 100 : 0
          return (
            <div
              key={day}
              className="flex items-center gap-3 px-4 py-2.5 relative overflow-hidden"
              style={i < 6 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: accentColor, opacity: 0.06 }} />
              <span className="text-sm font-semibold w-6 relative" style={{ color: i === maxDay ? accentColor : 'var(--color-text)' }}>{day}</span>
              <div className="flex-1 relative">
                <div className="h-[4px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: accentColor, opacity: i === maxDay ? 1 : 0.4 }} />
                </div>
              </div>
              <span className="text-sm font-bold tabular-nums relative" style={{ color: 'var(--color-text)' }}>{euro(dayTotals[i])}</span>
              <span className="text-[10px] tabular-nums w-8 text-right relative" style={{ color: 'var(--color-muted)' }}>{Math.round(pct)}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
