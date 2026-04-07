import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, fmtDate } from '../../utils/formatters'

export function StreaksChart({ year, month }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const todayDay = isCurrentMonth ? now.getDate() : daysInMonth

  const txs = useLiveQuery(
    () => db.transactions
      .where('date').startsWith(prefix)
      .filter(t => t.type === 'debit' && t.category !== 'bankoverschrijving')
      .toArray(),
    [prefix]
  )

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  // Build daily spending map
  const daySpend = Array(daysInMonth + 1).fill(0)
  const dayCount = Array(daysInMonth + 1).fill(0)
  for (const tx of txs) {
    const day = parseInt(tx.date.slice(8, 10), 10)
    if (day >= 1 && day <= daysInMonth) {
      daySpend[day] += tx.amount
      dayCount[day]++
    }
  }

  // Calculate streaks (up to today)
  let currentSpendStreak = 0
  let currentNoSpendStreak = 0
  let longestSpendStreak = 0
  let longestNoSpendStreak = 0
  let tempSpend = 0
  let tempNoSpend = 0
  let totalSpendDays = 0
  let totalNoSpendDays = 0
  let biggestDay = { day: 0, amount: 0 }

  for (let d = 1; d <= todayDay; d++) {
    if (daySpend[d] > 0) {
      totalSpendDays++
      tempSpend++
      tempNoSpend = 0
      if (tempSpend > longestSpendStreak) longestSpendStreak = tempSpend
      if (daySpend[d] > biggestDay.amount) biggestDay = { day: d, amount: daySpend[d] }
    } else {
      totalNoSpendDays++
      tempNoSpend++
      tempSpend = 0
      if (tempNoSpend > longestNoSpendStreak) longestNoSpendStreak = tempNoSpend
    }
  }
  currentSpendStreak = tempSpend
  currentNoSpendStreak = tempNoSpend

  const avgPerSpendDay = totalSpendDays > 0 ? Math.round(txs.reduce((s, t) => s + t.amount, 0) / totalSpendDays) : 0

  return (
    <div>
      {/* Main stat */}
      <div className="card p-5 mb-4">
        <div className="text-center">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            {currentNoSpendStreak > 0 ? 'Geen uitgaven' : 'Uitgaven streak'}
          </div>
          <div className="text-5xl font-extrabold leading-none" style={{ color: currentNoSpendStreak > 0 ? 'var(--color-green)' : 'var(--color-text)' }}>
            {currentNoSpendStreak > 0 ? currentNoSpendStreak : currentSpendStreak}
          </div>
          <div className="text-sm font-bold mt-1" style={{ color: 'var(--color-muted)', opacity: 0.5 }}>
            {currentNoSpendStreak > 0 ? 'dagen zonder uitgaven' : 'dagen op rij uitgegeven'}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="card p-4 text-center">
          <div className="text-2xl font-extrabold" style={{ color: 'var(--color-green)' }}>{longestNoSpendStreak}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--color-muted)' }}>Langste zonder</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-extrabold" style={{ color: 'var(--color-red)' }}>{longestSpendStreak}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--color-muted)' }}>Langste met</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>{totalSpendDays}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--color-muted)' }}>Dagen uitgegeven</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>{totalNoSpendDays}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mt-1" style={{ color: 'var(--color-muted)' }}>Vrije dagen</div>
        </div>
      </div>

      {/* Day grid visualization */}
      <div data-chart-area className="card p-4 mb-4">
        <div className="text-xs font-semibold mb-3" style={{ color: 'var(--color-muted)' }}>Dagelijkse activiteit</div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1
            const spent = daySpend[d]
            const isFuture = d > todayDay
            const isToday = d === todayDay && isCurrentMonth
            const maxDaySpend = Math.max(...daySpend.slice(1), 1)
            const intensity = spent > 0 ? Math.max(0.2, spent / maxDaySpend) : 0

            return (
              <div
                key={d}
                className="aspect-square rounded-lg flex flex-col items-center justify-center"
                style={{
                  backgroundColor: isFuture
                    ? 'var(--color-surface-2)'
                    : spent > 0
                    ? `rgba(239, 68, 68, ${intensity * 0.5})`
                    : 'rgba(16, 185, 129, 0.15)',
                  border: isToday ? '2px solid var(--color-accent)' : 'none',
                }}
              >
                <span className="text-[9px] font-bold" style={{ color: isFuture ? 'var(--color-text-dim)' : 'var(--color-text)' }}>{d}</span>
                {!isFuture && spent > 0 && (
                  <span className="text-[7px] font-semibold tabular-nums" style={{ color: 'var(--color-red)' }}>
                    {spent >= 100 ? Math.round(spent) : spent.toFixed(0)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex justify-center gap-4 mt-3">
          <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }} /> Geen uitgaven
          </span>
          <span className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-muted)' }}>
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.3)' }} /> Uitgegeven
          </span>
        </div>
      </div>

      {/* Extra stats */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>Gem. per uitgavendag</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(avgPerSpendDay)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>Duurste dag</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>Dag {biggestDay.day} · {euro(biggestDay.amount)}</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>Transacties</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{txs.length}</span>
        </div>
      </div>
    </div>
  )
}
