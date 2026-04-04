import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { CATEGORY_MAP } from '../../constants/categories'
import { euro, fmtDate } from '../../utils/formatters'
import { useSheetGestures } from '../../hooks/useSheetGestures'
import { TransactionForm } from '../transactions/TransactionForm'

const DAYS_NL = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

export function CalendarChart({ year, month }) {
  const [selectedDay, setSelectedDay] = useState(null)

  const data = useLiveQuery(async () => {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    const txs = await db.transactions.where('date').startsWith(prefix).toArray()

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

  const maxSpent = Math.max(...spent.slice(1), 1)

  // Totals
  const totalSpent = spent.reduce((s, v) => s + v, 0)
  const totalEarned = earned.reduce((s, v) => s + v, 0)

  return (
    <div>
      <div className="card p-4 mb-4">
        <div className="text-xs text-muted mb-1">Kalender overzicht</div>
        <div className="flex items-baseline gap-3">
          <div className="text-2xl font-bold tabular-nums text-red">{euro(totalSpent)}</div>
          {totalEarned > 0 && <div className="text-sm font-semibold tabular-nums text-green">+{euro(totalEarned)}</div>}
        </div>
      </div>

      {/* Day headers */}
      <div className="bg-surface rounded-2xl overflow-hidden border border-border">
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
  const sheetRef = useSheetGestures(onClose)
  const [editing, setEditing] = useState(null)

  const txs = useLiveQuery(
    () => db.transactions.where('date').equals(dateStr)
      .filter(t => t.category !== 'bankoverschrijving')
      .sortBy('amount'),
    [dateStr]
  )
  const sorted = txs ? [...txs].reverse() : null
  const totalSpent = sorted?.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0) ?? 0
  const totalEarned = sorted?.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0) ?? 0

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} />
      <div ref={sheetRef} className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl sheet-handle max-h-[70vh] overflow-y-auto pb-24 animate-slide-up" style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sheet)' }}>
        <div className="sticky top-0 z-10">
          <div className="px-5 pt-4 pb-4 flex items-center justify-between" style={{ background: 'var(--color-accent)' }}>
            <div>
              <div className="text-base font-bold text-white">{fmtDate(dateStr)}</div>
              <div className="text-xs text-white/70 mt-0.5 flex gap-2">
                {totalSpent > 0 && <span>-{euro(totalSpent)}</span>}
                {totalEarned > 0 && <span>+{euro(totalEarned)}</span>}
                <span>{sorted?.length ?? 0} transacties</span>
              </div>
            </div>
            <button onClick={onClose} className="text-white/80 text-lg font-medium w-8 h-8 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }}>✕</button>
          </div>
        </div>

        {sorted === null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {sorted?.length === 0 && <div className="text-center text-muted py-8 text-sm">Geen transacties</div>}
        {sorted?.map(tx => {
          const cat = CATEGORY_MAP[tx.category]
          return (
            <button key={tx.id} onClick={() => setEditing(tx)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💸'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{tx.note || cat?.label || tx.category}</div>
                <div className="text-xs text-muted">{cat?.label}</div>
              </div>
              <span className={`text-sm font-semibold shrink-0 tabular-nums ${tx.type === 'credit' ? 'text-green' : 'text-red'}`}>
                {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
              </span>
            </button>
          )
        })}
      </div>
      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
