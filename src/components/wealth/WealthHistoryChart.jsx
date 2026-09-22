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
import { euro, euroCompact, fmtDate } from '../../utils/formatters'
import { gridTheme, tickTheme, tooltipTheme } from '../../utils/theme'
import { accentColor, alpha } from '../../utils/wealth/colors'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

/**
 * Het verloop van je totale vermogen: één punt per dag waarop er iets gemeten
 * is. Zolang je nog maar één meting hebt is er niets te tekenen — dan zie je
 * alleen de uitleg.
 */
export function WealthHistoryChart({ history }) {
  const punten = history ?? []
  if (punten.length < 2) {
    return (
      <p className="text-xs text-muted px-4 py-6 text-center">
        Het verloop verschijnt zodra er meerdere metingen zijn. Elke dag dat je dit scherm opent,
        wordt de stand van vandaag vastgelegd.
      </p>
    )
  }

  const accent = accentColor()
  const data = {
    labels: punten.map(p => fmtDate(p.date)),
    datasets: [{
      label: 'Vermogen',
      data: punten.map(p => p.total),
      borderColor: accent,
      backgroundColor: alpha(accent, 0.12),
      borderWidth: 2,
      fill: true,
      tension: 0.25,
      pointRadius: punten.length > 30 ? 0 : 2,
      pointHoverRadius: 5,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.9,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: { label: ctx => euro(ctx.parsed.y) },
      },
    },
    scales: {
      x: { ticks: { ...tickTheme(), maxTicksLimit: 6 }, grid: { display: false }, border: { display: false } },
      y: {
        ticks: { ...tickTheme(), callback: v => euroCompact(v), maxTicksLimit: 5 },
        grid: gridTheme(),
        border: { display: false },
      },
    },
  }

  return <Line data={data} options={options} />
}
