import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { useState, useRef, useEffect } from 'react'
import { TransactionForm } from '../transactions/TransactionForm'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCashflowData } from '../../hooks/useCashflowData'
import { euro, euroCompact, fmtDate } from '../../utils/formatters'
import { chartColors, tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { useSheetGestures } from '../../hooks/useSheetGestures'
import { MONTHS, MONTHS_LONG, CATEGORY_MAP } from '../../constants/categories'
import { db } from '../../db/db'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

const now = new Date()
const EARNED_INCOME_KEYWORDS = ['salaris', 'salary', 'loon', 'overige_kosten']

export function CashflowChart() {
  const data = useCashflowData()
  const [selected, setSelected] = useState(null) // { monthData, mode: 'income'|'expenses' }

  if (!data.length) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const avgSavingsRate = Math.round(
    (data.reduce((s, d) => s + d.savingsRate, 0) / data.length) * 100
  )

  const current = data[data.length - 1]
  const labels = data.map(d => MONTHS[d.month - 1])

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Gespaard',
        data: data.map(d => d.saved),
        backgroundColor: '#30D158',
        borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 6, bottomRight: 6 },
        borderSkipped: 'top',
      },
      {
        label: 'Uitgaven',
        data: data.map(d => d.expenses),
        backgroundColor: '#FF453A',
        borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: 'bottom',
      },
    ],
  }

  const savingsRateLabelPlugin = {
    id: 'srLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart
      const metaGreen = chart.getDatasetMeta(0)
      const metaRed = chart.getDatasetMeta(1)
      metaRed.data.forEach((redBar, i) => {
        const rate = data[i]?.savingsRate ?? 0
        if (rate < 0.03) return
        const greenBar = metaGreen.data[i]
        const totalTop = redBar.y
        const totalBottom = greenBar.base
        const totalHeight = Math.abs(totalBottom - totalTop)
        if (totalHeight < 14) return
        const centerY = (totalTop + totalBottom) / 2
        ctx.save()
        ctx.fillStyle = chartColors().text
        ctx.font = `bold ${Math.min(11, totalHeight * 0.18)}px -apple-system, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`${Math.round(rate * 100)}%`, redBar.x, centerY)
        ctx.restore()
      })
    },
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.6,
    animation: false,
    onClick: (_, elements) => {
      if (!elements.length) return
      const { datasetIndex, index } = elements[0]
      const monthData = data[index]
      // dataset 0 = green (gespaard/income), dataset 1 = red (expenses)
      setSelected({ monthData, mode: datasetIndex === 0 ? 'income' : 'expenses' })
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: items => {
            const d = data[items[0].dataIndex]
            return `${MONTHS[d.month - 1]} — inkomen ${euro(d.income)}`
          },
          label: ctx => `${ctx.dataset.label}: ${euro(ctx.parsed.y)}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        ticks: tickTheme(),
        grid: { display: false },
        border: { display: false },
      },
      y: {
        stacked: true,
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
      <div className="bg-surface rounded-2xl p-4 mb-4">
        <div className="text-xs text-muted mb-1">Gemiddeld spaarpercentage {now.getFullYear()}</div>
        <div className="text-2xl font-bold text-green tabular-nums">{avgSavingsRate}%</div>
        {current && (
          <div className="text-xs text-muted mt-1">
            Deze maand: {euro(current.income)} inkomen · {euro(current.expenses)} uitgaven · <span className="text-green">{euro(current.saved)} gespaard</span>
          </div>
        )}
      </div>

      <Bar data={chartData} options={options} plugins={[savingsRateLabelPlugin]} />

      <div className="flex gap-5 mt-3 px-1">
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-red inline-block" /> Uitgaven
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted">
          <span className="w-2.5 h-2.5 rounded-sm bg-green inline-block" /> Gespaard
        </span>
      </div>

      {selected && (
        <CashflowSheet
          monthData={selected.monthData}
          mode={selected.mode}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

function CashflowSheet({ monthData, mode, onClose }) {
  const { year, month } = monthData
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const sheetRef = useSheetGestures(onClose)
  const [editing, setEditing] = useState(null)

  const txs = useLiveQuery(async () => {
    const all = await db.transactions.where('date').startsWith(prefix).toArray()
    if (mode === 'income') {
      return all
        .filter(tx => {
          if (tx.category === 'bankoverschrijving' || tx.category === 'voorschot') return false
          if (tx.type !== 'credit') return false
          const cat = (tx.category ?? '').toLowerCase()
          return EARNED_INCOME_KEYWORDS.some(kw => cat.includes(kw))
        })
        .sort((a, b) => b.amount - a.amount)
    } else {
      return all
        .filter(tx => {
          if (tx.category === 'bankoverschrijving' || tx.category === 'voorschot') return false
          const catType = CATEGORY_MAP[tx.category]?.type
          if (tx.type === 'debit') return true
          return tx.type === 'credit' && catType === 'expense'
        })
        .sort((a, b) => b.amount - a.amount)
    }
  }, [prefix, mode])

  const isIncome = mode === 'income'
  const debits = txs?.filter(t => t.type === 'debit') ?? []
  const credits = txs?.filter(t => t.type === 'credit') ?? []
  const totalOut = debits.reduce((s, t) => s + t.amount, 0)
  const totalIn = credits.reduce((s, t) => s + t.amount, 0)

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-50 bg-surface rounded-t-2xl max-h-[70vh] overflow-y-auto pb-24 animate-slide-up">
        <div className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex justify-between items-center">
          <div>
            <div className="font-semibold text-sm">{MONTHS_LONG[month - 1]} — {isIncome ? 'Inkomen' : 'Uitgaven'}</div>
            {txs && isIncome && (
              <div className="text-xs mt-0.5 text-green">{euro(totalIn)} · {txs.length} transacties</div>
            )}
            {txs && !isIncome && (
              <div className="text-xs mt-0.5 flex gap-2">
                <span className="text-red">-{euro(totalOut)} ({debits.length})</span>
                {credits.length > 0 && <span className="text-green">+{euro(totalIn)} ({credits.length})</span>}
                <span className="text-muted">= {euro(totalOut - totalIn)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-muted">✕</button>
        </div>

        {txs === undefined && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {txs?.length === 0 && <div className="text-center text-muted py-8 text-sm">Geen transacties</div>}
        {txs?.map(tx => {
          const cat = CATEGORY_MAP[tx.category]
          return (
            <button key={tx.id} onClick={() => setEditing(tx)} className="w-full flex items-center gap-3 px-4 py-3 border-b border-border text-left">
              <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💸'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{tx.note || cat?.label || tx.category}</div>
                <div className="text-xs text-muted">{fmtDate(tx.date)} · {cat?.label}</div>
              </div>
              <span className={`text-sm font-semibold shrink-0 tabular-nums ${isIncome || tx.type === 'credit' ? 'text-green' : 'text-red'}`}>
                {isIncome || tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
              </span>
            </button>
          )
        })}
      </div>
      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
