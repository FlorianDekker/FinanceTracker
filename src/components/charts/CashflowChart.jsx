import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { useCashflowData } from '../../hooks/useCashflowData'
import { euro, euroCompact } from '../../utils/formatters'
import { MONTHS } from '../../constants/categories'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

export function CashflowChart() {
  const data = useCashflowData(6)

  if (!data.length) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const avgSavingsRate = data.length
    ? Math.round((data.reduce((s, d) => s + d.savingsRate, 0) / data.length) * 100)
    : 0

  const labels = data.map(d => MONTHS[d.month - 1])

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Uitgaven',
        data: data.map(d => d.expenses),
        backgroundColor: '#D32F2F',
      },
      {
        label: 'Gespaard',
        data: data.map(d => d.saved),
        backgroundColor: '#4CAF50',
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.8,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 } },
        grid: { display: false },
        border: { display: false },
      },
      y: {
        stacked: true,
        ticks: { color: 'rgba(255,255,255,0.4)', font: { size: 10 }, callback: v => euroCompact(v) },
        grid: { color: 'rgba(255,255,255,0.05)' },
        border: { display: false },
      },
    },
  }

  return (
    <div>
      <div className="flex justify-between items-baseline px-1 mb-2">
        <span className="text-xs text-muted">Maandelijkse cashflow</span>
        <span className="text-sm font-semibold text-green">Gem. spaarquote: {avgSavingsRate}%</span>
      </div>
      <Bar data={chartData} options={options} />
      <div className="flex gap-4 mt-2 px-1">
        <span className="flex items-center gap-1 text-xs text-muted">
          <span className="w-2 h-2 rounded-sm bg-red inline-block" /> Uitgaven
        </span>
        <span className="flex items-center gap-1 text-xs text-muted">
          <span className="w-2 h-2 rounded-sm bg-green inline-block" /> Gespaard
        </span>
      </div>
    </div>
  )
}
