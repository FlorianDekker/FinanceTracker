import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { countsInTotals } from '../../utils/claims'
import { euro, fmtDate } from '../../utils/formatters'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { StatCard } from '../ui/StatCard'
import { DAYS_NL } from '../../constants/categories'

export function CalendarChart({ year, month }) {
  const [selectedDay, setSelectedDay] = useState(null)

  const data = useLiveQuery(async () => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const txs = await db.transactions.where('date').startsWith(prefix).filter(countsInTotals).toArray()

    const daysInMonth = new Date(year, month, 0).getDate()
    const spent = Array(daysInMonth + 1).fill(0)
    const earned = Array(daysInMonth + 1).fill(0)

    for (const tx of txs) {
      if (tx.category === 'bankoverschrijving') continue
      const day = parseInt(tx.date.slice(8, 10), 10)
      if (day < 1 || day > daysInMonth) continue
      if (tx.type === 'debit') spent[day] += tx.amount
      else earned[day] += tx.amount
    }

    return { daysInMonth, spent, earned }
  }, [year, month])

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { daysInMonth, spent, earned } = data
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const todayDay = isCurrentMonth ? now.getDate() : null

  // First day of month: 0=Mon, 6=Sun (ISO weeks)
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7

  // Build weeks grid
  const weeks = []
  let week = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week) }


  // Totals
  const totalSpent = spent.reduce((s, v) => s + v, 0)
  const totalEarned = earned.reduce((s, v) => s + v, 0)


  return (
    <div>
      <div className="card p-5 mb-4">
        <StatCard
          label="Totaal uitgegeven"
          value={totalSpent}
          delta={totalEarned > 0 ? `+${euro(totalEarned)} terugontvangen` : null}
          deltaTone="green"
        />
      </div>

      {/* Day headers */}
      <div data-chart-area className="card p-4 mb-4 overflow-hidden">
        <div className="grid grid-cols-7">
          {DAYS_NL.map(d => (
            <div key={d} className="text-center text-[11px] text-muted font-semibold py-2 border-b border-border">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        {weeks.map((week, wi) => (
          <div key={wi} className={`grid grid-cols-7 ${wi < weeks.length - 1 ? 'border-b border-border' : ''}`}>
            {week.map((day, di) => {
              if (day === null) return <div key={di} className={di < 6 ? 'border-r border-border' : ''} />
              const s = spent[day]
              const e = earned[day]
              const isToday = day === todayDay
              const hasActivity = s > 0 || e > 0

              return (
                <button
                  key={di}
                  onClick={() => hasActivity && setSelectedDay(day)}
                  className={`flex flex-col items-center py-1.5 transition-opacity active:opacity-60 ${
                    di < 6 ? 'border-r border-border' : ''
                  } ${isToday ? 'bg-green/15' : ''}`}
                  style={{ minHeight: 54 }}
                >
                  <span className={`text-sm font-semibold tabular-nums ${
                    isToday ? 'text-green' : hasActivity ? 'text-white' : 'text-white/30'
                  }`}>{day}</span>
                  {s > 0 && (
                    <span className="text-[10px] tabular-nums text-red font-medium mt-0.5">
                      {euro(s)}
                    </span>
                  )}
                  {e > 0 && (
                    <span className="text-[10px] tabular-nums text-green font-medium">
                      {euro(e)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {selectedDay !== null && (
        <DaySheet day={selectedDay} year={year} month={month} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  )
}

function DaySheet({ day, year, month, onClose }) {
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions.where('date').equals(dateStr)
      .filter(t => t.category !== 'bankoverschrijving' && countsInTotals(t))
      .sortBy('amount'),
    [dateStr]
  )
  const sorted = txs ? [...txs].reverse() : null
  const totalSpent = sorted?.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0) ?? 0
  const totalEarned = sorted?.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0) ?? 0

  return (
    <TransactionListSheet
      onClose={onClose}
      accent="var(--color-accent)"
      title={fmtDate(dateStr)}
      subtitle={
        <span className="flex gap-2">
          {totalSpent > 0 && <span>-{euro(totalSpent)}</span>}
          {totalEarned > 0 && <span>+{euro(totalEarned)}</span>}
          <span>{sorted?.length ?? 0} transacties</span>
        </span>
      }
      transactions={sorted}
      renderMeta={(tx, cat) => cat?.label}
    />
  )
}
