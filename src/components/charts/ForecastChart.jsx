import { useBudgetStats } from '../../hooks/useBudgetStats'
import { euro, euroParts } from '../../utils/formatters'
import { CAT_COLORS, EXPENSE_CATEGORIES } from '../../constants/categories'

export function ForecastChart({ year, month }) {
  const stats = useBudgetStats(year, month)
  const now = new Date()
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const todayDay = isCurrentMonth ? now.getDate() : daysInMonth
  const ratio = todayDay / daysInMonth

  const expenses = stats.filter(c => c.type === 'expense')
  const totalSpent = expenses.reduce((s, c) => s + c.spent, 0)
  const totalBudget = expenses.reduce((s, c) => s + c.budget, 0)
  const predicted = ratio > 0 ? Math.round(totalSpent / ratio) : totalSpent
  const predictedDiff = predicted - totalBudget
  const pp = euroParts(predicted)

  const cats = expenses
    .map(c => {
      const forecast = ratio > 0 ? Math.round(c.spent / ratio) : c.spent
      return { ...c, forecast, overBudget: c.budget > 0 && forecast > c.budget }
    })
    .sort((a, b) => b.forecast - a.forecast)

  const maxForecast = Math.max(...cats.map(c => c.forecast), 1)

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Verwachte uitgaven einde maand
          </div>
          <div className={`tabular-nums tracking-tight leading-none ${predictedDiff > 0 ? 'text-red' : 'text-green'}`}>
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{pp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{pp.dec}</span>
          </div>
          <div className={`text-sm font-bold tabular-nums mt-0.5 ${predictedDiff > 0 ? 'text-red' : 'text-green'}`} style={{ opacity: 0.5 }}>
            {predictedDiff > 0 ? '+' : ''}{euro(predictedDiff)} vs budget
          </div>
        </div>
        <div className="flex justify-between mt-3">
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            Nu: {euro(totalSpent)} (dag {todayDay})
          </span>
          <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-muted)' }}>
            Budget: {euro(totalBudget)}
          </span>
        </div>
      </div>

      <div data-chart-area className="card overflow-hidden">
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Voorspelling per categorie</span>
        </div>
        {cats.map((cat, i) => {
          const color = CAT_COLORS[cat.key] ?? '#8E8E93'
          const barPct = Math.max((cat.forecast / maxForecast) * 100, 2)
          const budgetPct = cat.budget > 0 ? Math.round((cat.forecast / cat.budget) * 100) : null

          return (
            <div
              key={cat.key}
              className="px-4 py-3 relative overflow-hidden"
              style={i < cats.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="absolute inset-y-0 left-0" style={{ width: `${barPct}%`, backgroundColor: color, opacity: 0.06 }} />
              <div className="flex items-center justify-between relative mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{cat.icon}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{cat.label}</span>
                </div>
                <span className={`text-sm font-bold tabular-nums ${cat.overBudget ? 'text-red' : ''}`} style={!cat.overBudget ? { color: 'var(--color-text)' } : {}}>
                  {euro(cat.forecast)}
                </span>
              </div>
              <div className="flex items-center gap-2 relative">
                <div className="flex-1 h-[4px] rounded-full" style={{ background: 'var(--color-surface-2)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(budgetPct ?? 0, 100)}%`,
                      backgroundColor: cat.overBudget ? 'var(--color-red)' : 'var(--color-green)',
                    }}
                  />
                </div>
                <span className="text-[10px] tabular-nums w-12 text-right" style={{ color: 'var(--color-muted)' }}>
                  {cat.budget > 0 ? `${budgetPct}%` : `Nu: ${euro(cat.spent)}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {!isCurrentMonth && (
        <div className="text-center text-muted text-xs mt-3">
          Voorspelling is exacte eindstand (maand is voorbij)
        </div>
      )}
    </div>
  )
}
