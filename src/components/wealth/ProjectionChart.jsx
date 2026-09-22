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
import { euro, euroCompact } from '../../utils/formatters'
import { gridTheme, tickTheme, tooltipTheme } from '../../utils/theme'
import { accentColor, alpha, redColor } from '../../utils/wealth/colors'
import { monthLabel, monthLabelLong } from '../../utils/wealth/months'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

/**
 * "Red ik het?" — je vermogen doorgetrokken: elke maand je gemiddelde
 * spaarbedrag erbij, de reserveringen van die maand eraf. De stippellijn is je
 * buffer; zodra de lijn daaronder duikt kleurt hij rood. Dikke punten zijn
 * maanden met een reservering (tik erop voor naam en bedrag).
 */
export function ProjectionChart({ projection }) {
  const punten = projection?.points ?? []
  if (punten.length < 2) return null

  const accent = accentColor()
  const rood = redColor()
  const buffer = projection.buffer
  const onderBuffer = p => p.balance < buffer

  const data = {
    labels: punten.map(p => monthLabel(p.month)),
    datasets: [
      {
        label: 'Vermogen',
        data: punten.map(p => p.balance),
        borderColor: accent,
        backgroundColor: alpha(accent, 0.1),
        borderWidth: 2,
        fill: true,
        tension: 0.2,
        pointRadius: punten.map(p => (p.due?.length ? 4 : p.now ? 3 : 0)),
        pointHoverRadius: 6,
        pointBackgroundColor: punten.map(p => (onderBuffer(p) ? rood : accent)),
        // Een segment dat onder de buffer eindigt kleurt rood — dát is het stuk
        // waar je in de problemen komt.
        segment: {
          borderColor: ctx => (ctx.p1.parsed.y < buffer || ctx.p0.parsed.y < buffer ? rood : accent),
        },
      },
      {
        label: 'Buffer',
        data: punten.map(() => buffer),
        borderColor: alpha(rood, 0.55),
        borderDash: [4, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.7,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: items => monthLabelLong(punten[items[0].dataIndex].month),
          label: ctx => (ctx.datasetIndex === 0 ? euro(ctx.parsed.y) : `Buffer ${euro(buffer)}`),
          afterBody: items => {
            const p = punten[items[0].dataIndex]
            return (p.due ?? []).map(r => `− ${euro(r.amount)} ${r.name}`)
          },
        },
      },
    },
    scales: {
      x: { ticks: { ...tickTheme(), maxTicksLimit: 7 }, grid: { display: false }, border: { display: false } },
      y: {
        ticks: { ...tickTheme(), callback: v => euroCompact(v), maxTicksLimit: 5 },
        grid: gridTheme(),
        border: { display: false },
      },
    },
  }

  return <Line data={data} options={options} />
}
