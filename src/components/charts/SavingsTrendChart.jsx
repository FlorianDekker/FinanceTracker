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
import { useCashflowData } from '../../hooks/useCashflowData'
import { monthRate, periodSavings, pct, rollingRates } from '../../utils/savings'
import { euro } from '../../utils/formatters'
import { tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { MONTHS } from '../../constants/categories'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

const VENSTER = 24   // maanden in beeld
const ROLLING = 12   // lengte van het voortschrijdend gemiddelde

/**
 * Spaarpercentage door de tijd: per maand (punten) en het gewogen gemiddelde
 * over de laatste twaalf maanden (stippellijn). Maanden zonder inkomen
 * krijgen geen punt — een 0% zou daar liegen.
 */
export function SavingsTrendChart() {
  const data = useCashflowData({ window: VENSTER })
  if (!data.length) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const perMaand = data.map(d => pct(monthRate(d)))
  const rolling = rollingRates(data, ROLLING).map(pct)
  const labels = data.map(d => (d.month === 1 ? `${MONTHS[0]} '${String(d.year).slice(2)}` : MONTHS[d.month - 1]))

  const laatste12 = periodSavings(data.slice(-ROLLING))
  const heleVenster = periodSavings(data)
  const metInkomen = data.filter(d => monthRate(d) != null)
  const beste = metInkomen.reduce((b, d) => (b == null || monthRate(d) > monthRate(b) ? d : b), null)

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Per maand',
        data: perMaand,
        borderColor: '#30D158',
        backgroundColor: 'rgba(48, 209, 88, 0.12)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
        spanGaps: true,
      },
      {
        label: `Gemiddeld ${ROLLING} mnd`,
        data: rolling,
        borderColor: '#8E8E93',
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.6,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: items => {
            const d = data[items[0].dataIndex]
            return `${MONTHS[d.month - 1]} ${d.year} — ${euro(d.income)} in · ${euro(d.expenses)} uit`
          },
          label: ctx => (ctx.parsed.y == null ? null : `${ctx.dataset.label}: ${ctx.parsed.y}%`),
        },
      },
    },
    scales: {
      x: { ticks: { ...tickTheme(), maxTicksLimit: 8 }, grid: { display: false }, border: { display: false } },
      y: {
        suggestedMin: 0,
        suggestedMax: 50,
        ticks: { ...tickTheme(), callback: v => `${v}%`, maxTicksLimit: 6 },
        grid: gridTheme(),
        border: { display: false },
      },
    },
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Kengetal label={`Laatste ${ROLLING} mnd`} value={pct(laatste12.rate)} sub={`${euro(laatste12.saved)} gespaard`} />
        <Kengetal label={`${VENSTER} maanden`} value={pct(heleVenster.rate)} sub={`${heleVenster.months} mnd met inkomen`} />
        <Kengetal
          label="Beste maand"
          value={beste ? pct(monthRate(beste)) : null}
          sub={beste ? `${MONTHS[beste.month - 1]} ${beste.year}` : '—'}
        />
      </div>

      <div className="card p-4 mb-4">
        <Line data={chartData} options={options} />
        <div className="flex gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-2.5 h-2.5 rounded-full bg-green inline-block" /> Per maand
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-3 border-t border-dashed inline-block" style={{ borderColor: '#8E8E93' }} /> Gemiddeld {ROLLING} mnd
          </span>
        </div>
        <p className="text-[11px] text-center mt-2" style={{ color: 'var(--color-muted)' }}>
          Spaarpercentage = (inkomen − uitgaven) ÷ inkomen. Maanden zonder inkomen krijgen geen punt.
        </p>
      </div>
    </div>
  )
}

function Kengetal({ label, value, sub }) {
  const toon = value == null ? 'var(--color-muted)' : value >= 0 ? 'var(--color-green)' : 'var(--color-red)'
  return (
    <div className="card p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>{label}</div>
      <div className="text-2xl font-extrabold tabular-nums leading-tight mt-1" style={{ color: toon }}>
        {value == null ? '—' : `${value}%`}
      </div>
      <div className="text-[10px] tabular-nums mt-0.5" style={{ color: 'var(--color-muted)' }}>{sub}</div>
    </div>
  )
}
