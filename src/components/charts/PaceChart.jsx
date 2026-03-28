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
import { usePaceData } from '../../hooks/usePaceData'
import { euroCompact, euro } from '../../utils/formatters'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

export function PaceChart({ year, month }) {
  const data = usePaceData(year, month)

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { actualCum, idealCum, daysInMonth, todayDay, diff, isAhead, actualToday } = data

  const labels = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Ideaal',
        data: idealCum,
        borderColor: 'rgba(170,170,170,0.6)',
        borderDash: [4, 4],
        borderWidth: 2,
        pointRadius: 0,
        tension: 0,
      },
      {
        label: 'Werkelijk',
        data: actualCum,
        borderWidth: 3,
        pointRadius: 0,
        tension: 0,
        segment: {
          borderColor: ctx => {
            const i = ctx.p0DataIndex
            return actualCum[i] <= idealCum[i] ? '#4CAF50' : '#D32F2F'
          },
        },
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 2,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => euro(ctx.parsed.y),
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: 'rgba(255,255,255,0.4)',
          maxTicksLimit: 6,
          font: { size: 10 },
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { display: false },
      },
      y: {
        ticks: {
          color: 'rgba(255,255,255,0.4)',
          font: { size: 10 },
          callback: v => euroCompact(v),
        },
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { display: false },
      },
    },
  }

  return (
    <div>
      <div className="flex justify-between items-baseline px-1 mb-2">
        <span className="text-xs text-muted">Budget pace (variabel)</span>
        <span className={`text-sm font-semibold ${isAhead ? 'text-green' : 'text-red'}`}>
          {isAhead ? `Ahead ${euro(Math.round(diff))}` : `Behind ${euro(Math.round(-diff))}`}
        </span>
      </div>
      <Line data={chartData} options={options} />
    </div>
  )
}
