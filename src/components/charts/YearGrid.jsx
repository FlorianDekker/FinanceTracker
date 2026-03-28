import { useYearGrid } from '../../hooks/useYearGrid'
import { euro } from '../../utils/formatters'
import { EXPENSE_CATEGORIES, MONTHS } from '../../constants/categories'
import { useCategories } from '../../hooks/useCategories'

export function YearGrid({ year }) {
  const data = useYearGrid(year)
  const categories = useCategories()

  if (!data) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const { matrix, monthTotals } = data
  const now = new Date()
  const currentMonth = year === now.getFullYear() ? now.getMonth() : 11

  const budgetMap = Object.fromEntries(categories.map(c => [c.key, c.budget]))

  function heatColor(spent, budget) {
    if (!budget || spent === 0) return 'rgba(255,255,255,0.04)'
    const ratio = spent / budget
    if (ratio <= 0.5) return 'rgba(76,175,80,0.2)'
    if (ratio <= 1.0) return 'rgba(76,175,80,0.4)'
    if (ratio <= 1.3) return 'rgba(211,47,47,0.35)'
    return 'rgba(211,47,47,0.6)'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse min-w-[320px]">
        <thead>
          <tr>
            <th className="text-left text-muted font-normal py-1 pr-2 w-[90px] sticky left-0 bg-bg">Categorie</th>
            {MONTHS.slice(0, currentMonth + 1).map(m => (
              <th key={m} className="text-muted font-normal py-1 px-0.5 text-center">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EXPENSE_CATEGORIES.map(cat => {
            const row = matrix[cat.key] ?? Array(12).fill(0)
            const budget = budgetMap[cat.key] ?? 0
            return (
              <tr key={cat.key}>
                <td className="py-0.5 pr-2 text-muted sticky left-0 bg-bg truncate max-w-[90px]">
                  {cat.icon} {cat.label}
                </td>
                {row.slice(0, currentMonth + 1).map((spent, m) => (
                  <td
                    key={m}
                    className="py-0.5 px-0.5 text-center rounded"
                    style={{ backgroundColor: heatColor(spent, budget) }}
                  >
                    {spent > 0 ? euroCompact(spent) : ''}
                  </td>
                ))}
              </tr>
            )
          })}
          {/* Totals row */}
          <tr className="border-t border-border">
            <td className="py-1 pr-2 text-muted font-medium sticky left-0 bg-bg">Totaal</td>
            {monthTotals.slice(0, currentMonth + 1).map((total, m) => (
              <td key={m} className="py-1 px-0.5 text-center text-white font-medium">
                {total > 0 ? euroCompact(total) : '-'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function euroCompact(n) {
  const v = Math.round(n)
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`
  return String(v)
}
