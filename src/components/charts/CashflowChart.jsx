import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  BarElement,
  LinearScale,
  CategoryScale,
  Tooltip,
} from 'chart.js'
import { useState } from 'react'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCashflowData } from '../../hooks/useCashflowData'
import { euro, euroCompact } from '../../utils/formatters'
import { tooltipTheme, tickTheme, gridTheme } from '../../utils/theme'
import { MONTHS, MONTHS_LONG } from '../../constants/categories'
import { useCategories } from '../../hooks/useCategories'
import { db } from '../../db/db'
import { countsInTotals } from '../../utils/claims'
import { StatCard } from '../ui/StatCard'

ChartJS.register(BarElement, LinearScale, CategoryScale, Tooltip)

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
        ctx.fillStyle = '#ffffff'
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

  const currentSaved = current?.saved ?? 0

  return (
    <div>
      {/* Stats card */}
      <div className="card p-5 mb-4">
        <StatCard
          label="Gespaard deze maand"
          value={Math.abs(currentSaved)}
          tone={currentSaved >= 0 ? 'green' : 'red'}
          delta={`${avgSavingsRate}%`}
          deltaTone={currentSaved >= 0 ? 'green' : 'red'}
          deltaOpacity={0.3}
        />
        <div className="flex items-center gap-3 mt-3">
          <div className="flex-1 h-[6px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(Math.max(avgSavingsRate, 0), 100)}%`,
                background: avgSavingsRate > 0 ? 'var(--color-green)' : 'var(--color-red)',
              }}
            />
          </div>
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {euro(current?.expenses ?? 0)} uitgaven
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {euro(current?.income ?? 0)} inkomen
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="card p-4 mb-4">
        <Bar data={chartData} options={options} plugins={[savingsRateLabelPlugin]} />
        <div className="flex gap-4 mt-3 justify-center">
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-2.5 h-2.5 rounded-sm bg-red inline-block" /> Uitgaven
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-2.5 h-2.5 rounded-sm bg-green inline-block" /> Gespaard
          </span>
        </div>
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
  const { catMap } = useCategories()
  const { year, month } = monthData
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(async () => {
    const all = await db.transactions.where('date').startsWith(prefix).filter(countsInTotals).toArray()
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
          const catType = catMap[tx.category]?.type
          if (tx.type === 'debit') return true
          return tx.type === 'credit' && catType === 'expense'
        })
        .sort((a, b) => b.amount - a.amount)
    }
  }, [prefix, mode, catMap])

  const isIncome = mode === 'income'
  const debits = txs?.filter(t => t.type === 'debit') ?? []
  const credits = txs?.filter(t => t.type === 'credit') ?? []
  const totalOut = debits.reduce((s, t) => s + t.amount, 0)
  const totalIn = credits.reduce((s, t) => s + t.amount, 0)

  const subtitle = !txs ? undefined : isIncome
    ? `${euro(totalIn)} · ${txs.length} transacties`
    : (
      <span className="flex gap-2">
        <span>-{euro(totalOut)} ({debits.length})</span>
        {credits.length > 0 && <span>+{euro(totalIn)} ({credits.length})</span>}
        <span>= {euro(totalOut - totalIn)}</span>
      </span>
    )

  return (
    <TransactionListSheet
      onClose={onClose}
      accent="var(--color-accent)"
      title={`${MONTHS_LONG[month - 1]} — ${isIncome ? 'Inkomen' : 'Uitgaven'}`}
      subtitle={subtitle}
      transactions={txs ?? null}
      signOf={tx => (isIncome || tx.type === 'credit' ? '+' : '-')}
      toneOf={tx => (isIncome || tx.type === 'credit' ? 'text-green' : 'text-red')}
    />
  )
}
