import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { MONTHS } from '../../constants/categories'
import { euro, euroCompact } from '../../utils/formatters'
import { tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { averageLeadDays, claimMonthlySeries } from '../../utils/claims'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

/**
 * Per maand: wat je hebt voorgeschoten tegenover wat werk heeft terugbetaald.
 * De maanden hoeven niet bij elkaar te horen — een betaling in september kan
 * uitgaven van april afrekenen; daar is de doorlooptijd voor.
 */
export function ClaimsChart({ transactions, batches }) {
  const series = claimMonthlySeries(transactions ?? [])
  const leadDays = averageLeadDays(transactions ?? [], batches ?? [])
  const totaal = series.reduce((s, m) => s + m.advanced + m.received, 0)

  if (totaal === 0) return null

  const data = {
    labels: series.map(m => MONTHS[m.month - 1]),
    datasets: [
      {
        label: 'Voorgeschoten',
        data: series.map(m => m.advanced),
        backgroundColor: '#FF9F0A',
        borderRadius: 4,
      },
      {
        label: 'Terugontvangen',
        data: series.map(m => m.received),
        backgroundColor: '#30D158',
        borderRadius: 4,
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
        ...tooltipTheme(),
        callbacks: { label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}` },
      },
    },
    scales: {
      x: { ticks: tickTheme(), grid: { display: false }, border: { display: false } },
      y: {
        ticks: { ...tickTheme(), callback: v => euroCompact(v), maxTicksLimit: 4 },
        grid: gridTheme(),
        border: { display: false },
      },
    },
  }

  return (
    <div className="card p-4" data-chart-area>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
        Laatste 12 maanden
      </div>
      <Bar data={data} options={options} />
      <div className="flex gap-4 mt-3 justify-center">
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#FF9F0A' }} /> Voorgeschoten
        </span>
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
          <span className="w-2.5 h-2.5 rounded-sm inline-block bg-green" /> Terugontvangen
        </span>
      </div>
      <div className="text-[11px] text-center mt-2" style={{ color: 'var(--color-muted)' }}>
        {leadDays == null
          ? 'Gemiddelde doorlooptijd: nog niets uitbetaald'
          : `Gemiddelde doorlooptijd: ${leadDays} ${leadDays === 1 ? 'dag' : 'dagen'}`}
      </div>
    </div>
  )
}
