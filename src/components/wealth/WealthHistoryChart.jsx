import { useState } from 'react'
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
import { DEFAULT_HISTORY_PERIOD, HISTORY_PERIODS, filterHistoryPeriod } from '../../utils/wealth/history'
import { round2 } from '../../utils/wealth/months'

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip)

/** '29 sep 2025' — net als fmtDate, met het jaartal erbij: nodig zodra de reeks meer dan een jaar beslaat. */
function fmtDateMetJaar(date) {
  return `${fmtDate(date)} ${String(date ?? '').slice(0, 4)}`
}

/**
 * Het verloop van je totale vermogen. Bankrekeningen tekenen terug tot hun
 * eerste import-anker, handmatige rekeningen vanaf hun eerste saldo-invoer
 * (zie `combinedWealthHistory`). Leeg alleen als er echt geen enkel punt is;
 * met maar één rekening of één punt werkt hij ook, dan is er alleen niets om
 * de verandering mee te vergelijken.
 */
export function WealthHistoryChart({ history }) {
  const [periode, setPeriode] = useState(DEFAULT_HISTORY_PERIOD)
  const alles = history?.points ?? []

  if (alles.length === 0) {
    return (
      <p className="text-xs text-muted px-4 py-6 text-center">
        Het verloop verschijnt zodra er iets bekend is: importeer je bank of werk het saldo van een rekening bij.
      </p>
    )
  }

  const punten = filterHistoryPeriod(alles, periode)
  const eerste = punten[0]
  const laatste = punten[punten.length - 1]
  const verandering = round2(laatste.total - eerste.total)
  // Compleet-vanaf ligt vóór wat we nu tonen? Dan is de uitleg niet meer relevant.
  const compleetLater = history?.completeFrom && history.completeFrom > eerste.date

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
      tension: 0.3,
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
        callbacks: {
          title: ctx => fmtDateMetJaar(punten[ctx[0]?.dataIndex]?.date),
          label: ctx => euro(ctx.parsed.y),
        },
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

  return (
    <div>
      <div className="flex gap-1.5 mb-2">
        {HISTORY_PERIODS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriode(p.key)}
            className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
            style={p.key === periode
              ? { background: 'var(--color-accent)', color: 'white' }
              : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <Line data={data} options={options} />

      <p className="text-[11px] text-center mt-2" style={{ color: 'var(--color-muted)' }}>
        {punten.length > 1
          ? `${verandering >= 0 ? '+' : ''}${euro(verandering)} sinds ${fmtDateMetJaar(eerste.date)}`
          : `${euro(laatste.total)} op ${fmtDateMetJaar(laatste.date)}`}
      </p>
      {compleetLater && (
        <p className="text-[11px] text-center mt-1" style={{ color: 'var(--color-muted)' }}>
          Totaal pas compleet vanaf {fmtDateMetJaar(history.completeFrom)}: daarvoor ontbrak het saldo van
          een rekening die later is toegevoegd.
        </p>
      )}
    </div>
  )
}
