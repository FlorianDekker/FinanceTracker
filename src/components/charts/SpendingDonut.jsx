import { useRef, useState, useEffect } from 'react'
import { Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { CAT_COLORS } from '../../constants/categories'
import { useBudgetStats } from '../../hooks/useBudgetStats'
import { euro, fmtDate } from '../../utils/formatters'
import { useSheetGestures } from '../../hooks/useSheetGestures'
import { TransactionForm } from '../transactions/TransactionForm'
import { db } from '../../db/db'

ChartJS.register(ArcElement, Tooltip)


export function SpendingDonut({ year, month }) {
  const stats = useBudgetStats(year, month)
  const [selectedCat, setSelectedCat] = useState(null)
  const chartRef = useRef(null)
  const catsRef = useRef([])

  if (!stats.length) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const cats = stats
    .filter(c => c.key !== 'bankoverschrijving' && c.spent > 0)
    .sort((a, b) => b.spent - a.spent)

  const earned = stats
    .filter(c => c.key !== 'bankoverschrijving' && c.spent < 0)
    .sort((a, b) => a.spent - b.spent)

  catsRef.current = cats
  const total = cats.reduce((s, c) => s + c.spent, 0)

  if (cats.length === 0) return (
    <div className="flex items-center justify-center h-40 text-muted text-sm">Geen uitgaven deze maand</div>
  )

  const chartData = {
    labels: cats.map(c => c.label),
    datasets: [{
      data: cats.map(c => c.spent),
      backgroundColor: cats.map(c => CAT_COLORS[c.key] ?? '#8E8E93'),
      borderWidth: 0,
      hoverOffset: 8,
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
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.font = '11px -apple-system, sans-serif'
      ctx.fillText('Totaal', cx, cy - 10)
      ctx.fillStyle = '#ffffff'
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
      const currentCats = catsRef.current
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
        const iconMargin = 20 // space for the emoji
        if (isRight) {
          const maxX = canvasW - iconMargin
          if (tailX > maxX) { tailX = maxX; endX = Math.min(endX, tailX - 16) }
        } else {
          const minX = iconMargin
          if (tailX < minX) { tailX = minX; endX = Math.max(endX, tailX + 16) }
        }

        const color = CAT_COLORS[cat.key] ?? '#8E8E93'

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
        titleColor: 'rgba(255,255,255,0.5)',
        bodyColor: '#ffffff',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        padding: 10,
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
      <div className="bg-surface rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted mb-1">Totaal uitgegeven</div>
        <div className="text-2xl font-bold tabular-nums text-white">{euro(total)}</div>
        <div className="text-xs text-muted mt-1">
          {cats.length} categorieën · meeste in {cats[0]?.label}
          {earned.length > 0 && <span className="text-green"> · +{euro(Math.abs(earned.reduce((s, c) => s + c.spent, 0)))} terugontvangen</span>}
        </div>
      </div>

      <div className="mx-auto mb-5" style={{ maxWidth: 320 }}>
        <Doughnut ref={chartRef} data={chartData} options={options} plugins={[centerTextPlugin, labelLinesPlugin]} />
      </div>

      <div className="space-y-2">
        {cats.map(c => {
          const pct = total > 0 ? (c.spent / total) * 100 : 0
          const color = CAT_COLORS[c.key] ?? '#8E8E93'
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
              <div className="w-2.5 h-2.5 rounded-full shrink-0 relative" style={{ backgroundColor: color }} />
              <span className="text-sm text-white/80 flex-1 truncate text-left relative">{c.icon} {c.label}</span>
              <span className="text-xs text-muted tabular-nums relative">{Math.round(pct)}%</span>
              <span className="text-sm font-semibold tabular-nums w-16 text-right relative">{euro(c.spent)}</span>
            </button>
          )
        })}
      </div>

      {earned.length > 0 && (
        <div className="mt-4 bg-surface rounded-2xl p-3">
          <div className="text-xs text-muted mb-2 uppercase tracking-wider">Terugontvangen</div>
          <div className="space-y-1.5">
            {earned.map(c => (
              <button
                key={c.key}
                onClick={() => setSelectedCat(c)}
                className="w-full flex items-center gap-3"
              >
                <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue" />
                <span className="text-sm text-white/80 flex-1 truncate text-left">{c.icon} {c.label}</span>
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
          color={CAT_COLORS[selectedCat.key] ?? '#8E8E93'}
          onClose={() => setSelectedCat(null)}
        />
      )}
    </div>
  )
}

function CategoryTransactionSheet({ cat, year, month, color, onClose }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const sheetRef = useSheetGestures(onClose)
  const [editing, setEditing] = useState(null)

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix).filter(t => t.category === cat.key).sortBy('date'),
    [prefix, cat.key]
  )
  const sorted = txs ? [...txs].reverse() : null
  const totalSpent = sorted?.reduce((s, t) => s + (t.type === 'debit' ? t.amount : -t.amount), 0) ?? 0

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-40 bg-surface rounded-t-2xl max-h-[70vh] overflow-y-auto pb-24 animate-slide-up">
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-semibold text-sm">{cat.icon} {cat.label}</span>
            </div>
            {sorted && (
              <div className="text-xs text-muted mt-0.5 ml-5">
                {euro(Math.abs(totalSpent))} · {sorted.length} transacties
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        {sorted === null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {sorted?.length === 0 && <div className="text-center text-muted py-8 text-sm">Geen transacties deze maand</div>}
        {sorted?.map(tx => (
          <button key={tx.id} onClick={() => setEditing(tx)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border text-left">
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{tx.note || cat.label}</div>
              <div className="text-xs text-muted">{fmtDate(tx.date)}</div>
            </div>
            <span className={`text-sm font-semibold shrink-0 tabular-nums ${tx.type === 'credit' ? 'text-green' : 'text-red'}`}>
              {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
            </span>
          </button>
        ))}
      </div>
      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
