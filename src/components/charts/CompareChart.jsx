import { useBudgetStats } from '../../hooks/useBudgetStats'
import { euro, euroParts } from '../../utils/formatters'
import { CAT_COLORS, MONTHS_LONG } from '../../constants/categories'

export function CompareChart({ year, month }) {
  // Current month
  const currentStats = useBudgetStats(year, month)
  // Previous month
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevStats = useBudgetStats(prevYear, prevMonth)

  const currentExpenses = currentStats.filter(c => c.type === 'expense')
  const prevExpenses = prevStats.filter(c => c.type === 'expense')

  const currentTotal = currentExpenses.reduce((s, c) => s + c.spent, 0)
  const prevTotal = prevExpenses.reduce((s, c) => s + c.spent, 0)
  const diff = currentTotal - prevTotal
  const diffPct = prevTotal > 0 ? Math.round((diff / prevTotal) * 100) : 0

  const tp = euroParts(currentTotal)
  const maxSpent = Math.max(currentTotal, prevTotal, 1)

  // Per-category comparison
  const catMap = new Map()
  for (const c of currentExpenses) catMap.set(c.key, { ...c, currentSpent: c.spent, prevSpent: 0 })
  for (const c of prevExpenses) {
    if (catMap.has(c.key)) catMap.get(c.key).prevSpent = c.spent
    else catMap.set(c.key, { ...c, currentSpent: 0, prevSpent: c.spent })
  }
  const compared = [...catMap.values()]
    .filter(c => c.currentSpent > 0 || c.prevSpent > 0)
    .sort((a, b) => b.currentSpent - a.currentSpent)

  return (
    <div>
      {/* Summary */}
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            {MONTHS_LONG[month - 1]} vs {MONTHS_LONG[prevMonth - 1]}
          </div>
          <div className="tabular-nums tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{tp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{tp.dec}</span>
          </div>
          <div className={`text-sm font-bold tabular-nums mt-1 ${diff > 0 ? 'text-red' : 'text-green'}`} style={{ opacity: 0.7 }}>
            {diff > 0 ? '+' : ''}{euro(diff)} ({diff > 0 ? '+' : ''}{diffPct}%)
          </div>
        </div>

        {/* Comparison bars */}
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] w-12 text-right" style={{ color: 'var(--color-muted)' }}>{MONTHS_LONG[month - 1].slice(0, 3)}</span>
            <div className="flex-1 h-[8px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(currentTotal / maxSpent) * 100}%`, background: 'var(--color-accent)' }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums w-16 text-right" style={{ color: 'var(--color-text)' }}>{euro(currentTotal)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] w-12 text-right" style={{ color: 'var(--color-muted)' }}>{MONTHS_LONG[prevMonth - 1].slice(0, 3)}</span>
            <div className="flex-1 h-[8px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(prevTotal / maxSpent) * 100}%`, background: 'var(--color-muted)' }} />
            </div>
            <span className="text-[11px] font-bold tabular-nums w-16 text-right" style={{ color: 'var(--color-muted)' }}>{euro(prevTotal)}</span>
          </div>
        </div>
      </div>

      {/* Per-category comparison */}
      <div className="card overflow-hidden">
        {compared.map((cat, i) => {
          const color = CAT_COLORS[cat.key] ?? '#8E8E93'
          const catDiff = cat.currentSpent - cat.prevSpent
          const catMax = Math.max(cat.currentSpent, cat.prevSpent, 1)

          return (
            <div
              key={cat.key}
              className="px-4 py-3"
              style={i < compared.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{cat.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{cat.label}</span>
                </div>
                <span className={`text-xs font-bold tabular-nums ${catDiff > 0 ? 'text-red' : catDiff < 0 ? 'text-green' : 'text-muted'}`}>
                  {catDiff > 0 ? '+' : ''}{euro(catDiff)}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[5px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(cat.currentSpent / catMax) * 100}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums w-14 text-right" style={{ color: 'var(--color-text)' }}>{euro(cat.currentSpent)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-[5px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(cat.prevSpent / catMax) * 100}%`, backgroundColor: color, opacity: 0.35 }} />
                  </div>
                  <span className="text-[10px] tabular-nums w-14 text-right" style={{ color: 'var(--color-muted)' }}>{euro(cat.prevSpent)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {compared.length === 0 && (
        <div className="text-center text-muted py-12 text-sm">Geen uitgaven om te vergelijken</div>
      )}
    </div>
  )
}
