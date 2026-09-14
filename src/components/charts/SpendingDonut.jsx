import { useRef, useState } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCategories } from '../../hooks/useCategories'
import { useBudgetStats } from '../../hooks/useBudgetStats'
import { euro, fmtDate } from '../../utils/formatters'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { DetailChart } from './DetailChart'
import { db } from '../../db/db'
import { countsInTotals } from '../../utils/claims'
import { chartColors, tooltipTheme } from '../../utils/theme'

ChartJS.register(ArcElement, Tooltip)


/**
 * Verdeling van de maand. Donut en de uitgeklapte lijst (DetailChart) zijn
 * twee vensters op dezelfde maanddata; ze zaten eerder als twee losse tabs in
 * de tabbalk en zitten nu achter een schakelaar.
 */
export function SpendingDonut({ year, month }) {
  const [view, setView] = useState('donut')
  return (
    <div>
      <div className="flex justify-center mb-3">
        <div className="flex rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
          {[['donut', 'Donut'], ['lijst', 'Lijst']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-5 py-1 rounded-full text-xs font-semibold transition-all duration-200 ${view === v ? 'btn-accent' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'lijst'
        ? <DetailChart year={year} month={month} />
        : <DonutView year={year} month={month} />}
    </div>
  )
}

function DonutView({ year, month }) {
  const stats = useBudgetStats(year, month)
  const { colors } = useCategories()
  const [selectedCat, setSelectedCat] = useState(null)
  const chartRef = useRef(null)

  if (!stats.length) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const cats = stats
    .filter(c => c.key !== 'bankoverschrijving' && c.spent > 0)
    .sort((a, b) => b.spent - a.spent)

  const earned = stats
    .filter(c => c.key !== 'bankoverschrijving' && c.spent < 0)
    .sort((a, b) => a.spent - b.spent)

  const total = cats.reduce((s, c) => s + c.spent, 0)

  if (cats.length === 0) return (
    <div className="flex items-center justify-center h-40 text-muted text-sm">Geen uitgaven deze maand</div>
  )

  const chartData = {
    labels: cats.map(c => c.label),
    datasets: [{
      data: cats.map(c => c.spent),
      backgroundColor: cats.map(c => colors[c.key] ?? '#8E8E93'),
      borderWidth: 0,
      hoverOffset: 8,
      // De label-plugin heeft icoon en sleutel nodig; via de dataset blijft dat
      // synchroon met wat er getekend wordt (chart.js krijgt bij elke render
      // nieuwe data) zonder een ref tijdens de render te muteren.
      cats,
    }],
  }

  const centerTextPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx, chartArea } = chart
      const cx = (chartArea.left + chartArea.right) / 2
      const cy = (chartArea.top + chartArea.bottom) / 2
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const cc = chartColors()
      ctx.fillStyle = cc.textDim
      ctx.font = '11px -apple-system, sans-serif'
      ctx.fillText('Totaal', cx, cy - 10)
      ctx.fillStyle = cc.text
      ctx.font = 'bold 17px -apple-system, sans-serif'
      ctx.fillText(euro(total), cx, cy + 8)
      ctx.restore()
    },
  }

  const labelLinesPlugin = {
    id: 'labelLines',
    afterDraw(chart) {
      const { ctx } = chart
      const meta = chart.getDatasetMeta(0)
      if (!meta.data.length) return
      const currentCats = chart.data.datasets[0]?.cats ?? []
      const currentTotal = currentCats.reduce((s, c) => s + c.spent, 0)

      // Only label segments that are big enough (>5%)
      meta.data.forEach((arc, i) => {
        const cat = currentCats[i]
        if (!cat) return
        const pct = currentTotal > 0 ? (cat.spent / currentTotal) * 100 : 0
        if (pct < 5) return

        const { x, y, startAngle, endAngle, innerRadius, outerRadius } = arc.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'])
        const midAngle = (startAngle + endAngle) / 2
        const midRadius = (innerRadius + outerRadius) / 2

        // Point on the arc
        const arcX = x + Math.cos(midAngle) * midRadius
        const arcY = y + Math.sin(midAngle) * midRadius

        // End point for the line (outside the chart)
        const lineLen = outerRadius + 18
        let endX = x + Math.cos(midAngle) * lineLen
        const endY = y + Math.sin(midAngle) * lineLen

        // Horizontal tail
        const isRight = endX > x
        let tailX = endX + (isRight ? 16 : -16)

        // Clamp so icon + tail stay within canvas
        const canvasW = chart.width
        if (isRight) {
          const maxX = canvasW - 22
          if (tailX > maxX) { tailX = maxX; endX = Math.min(endX, tailX - 16) }
        } else {
          const minX = 30 // emojis are wider on the left (right-aligned text)
          if (tailX < minX) { tailX = minX; endX = Math.max(endX, tailX + 16) }
        }

        const color = colors[cat.key] ?? '#8E8E93'

        ctx.save()
        // Line from arc to outside
        ctx.strokeStyle = color
        ctx.lineWidth = 1
        ctx.globalAlpha = 0.6
        ctx.beginPath()
        ctx.moveTo(arcX, arcY)
        ctx.lineTo(endX, endY)
        ctx.lineTo(tailX, endY)
        ctx.stroke()

        // Dot at the arc
        ctx.globalAlpha = 1
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(arcX, arcY, 2, 0, Math.PI * 2)
        ctx.fill()

        // Icon label
        ctx.font = '14px -apple-system, sans-serif'
        ctx.textAlign = isRight ? 'left' : 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(cat.icon, tailX + (isRight ? 3 : -3), endY)

        ctx.restore()
      })
    },
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '62%',
    animation: false,
    layout: { padding: { top: 30, bottom: 30, left: 50, right: 50 } },
    onClick: (_, elements) => {
      if (!elements.length) return
      setSelectedCat(cats[elements[0].index])
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(28,28,30,0.95)',
        ...tooltipTheme(),
        callbacks: {
          label: ctx => {
            const pct = Math.round((ctx.parsed / total) * 100)
            return `${euro(ctx.parsed)} · ${pct}%`
          },
        },
      },
    },
  }


  return (
    <div>
      <div data-chart-area className="card pt-2 px-4 pb-4 mb-4 overflow-hidden">
        <div className="mx-auto mb-3" style={{ maxWidth: 320 }}>
          <Doughnut ref={chartRef} data={chartData} options={options} plugins={[centerTextPlugin, labelLinesPlugin]} />
        </div>

        <div className="space-y-1">
          {cats.map(c => {
            const pct = total > 0 ? (c.spent / total) * 100 : 0
            const color = colors[c.key] ?? '#8E8E93'
            return (
              <button
                key={c.key}
                onClick={() => setSelectedCat(c)}
                className="w-full relative overflow-hidden rounded-xl py-2.5 px-3 flex items-center gap-3"
              >
                <div
                  className="absolute inset-y-0 left-0 rounded-xl"
                  style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color, opacity: 0.15 }}
                />
                <div className="w-3 h-3 rounded-full shrink-0 relative" style={{ backgroundColor: color }} />
                <div className="flex-1 min-w-0 text-left relative">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{c.icon} {c.label}</div>
                </div>
                <div className="text-right relative">
                  <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(c.spent)}</div>
                  <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted)' }}>{Math.round(pct)}%</div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {earned.length > 0 && (
        <div className="mt-4 card p-3">
          <div className="text-xs text-muted mb-2 uppercase tracking-wider">Terugontvangen</div>
          <div className="space-y-1.5">
            {earned.map(c => (
              <button
                key={c.key}
                onClick={() => setSelectedCat(c)}
                className="w-full flex items-center gap-3"
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue" />
                <span className="text-sm flex-1 truncate text-left" style={{ color: 'var(--color-text)' }}>{c.icon} {c.label}</span>
                <span className="text-sm font-semibold tabular-nums text-blue">+{euro(Math.abs(c.spent))}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedCat && (
        <CategoryTransactionSheet
          cat={selectedCat}
          year={year}
          month={month}
          color={colors[selectedCat.key] ?? '#8E8E93'}
          onClose={() => setSelectedCat(null)}
        />
      )}
    </div>
  )
}

function CategoryTransactionSheet({ cat, year, month, color, onClose }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix).filter(t => t.category === cat.key && countsInTotals(t)).sortBy('date'),
    [prefix, cat.key]
  )
  const sorted = txs ? [...txs].reverse() : null
  const totalSpent = sorted?.reduce((s, t) => s + (t.type === 'debit' ? t.amount : -t.amount), 0) ?? 0

  return (
    <TransactionListSheet
      onClose={onClose}
      accent={color}
      leading={<span className="text-2xl">{cat.icon}</span>}
      title={cat.label}
      subtitle={sorted ? `${euro(Math.abs(totalSpent))} · ${sorted.length} transacties` : undefined}
      transactions={sorted}
      emptyText="Geen transacties deze maand"
      showIcon={false}
      renderLabel={tx => tx.note || cat.label}
      renderMeta={tx => fmtDate(tx.date)}
    />
  )
}
