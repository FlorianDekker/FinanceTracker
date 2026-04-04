import { BudgetBar } from './BudgetBar'
import { euro } from '../../utils/formatters'
import { CAT_COLORS } from '../../constants/categories'

export function CategoryRow({ category }) {
  const { icon, label, key, budget, remaining, ratio, bufferRatio, overspent } = category
  const color = CAT_COLORS[key] ?? '#8E8E93'

  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5">
      {/* Circular icon badge with color tint */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg"
        style={{ backgroundColor: color + '18' }}
      >
        {icon}
      </div>

      {/* Bar + label */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{label}</span>
          {budget > 0 ? (
            <span className={`text-sm font-semibold ml-2 shrink-0 tabular-nums ${overspent ? 'text-red' : ''}`} style={!overspent ? { color: 'var(--color-text)' } : {}}>
              {overspent ? `-${euro(Math.abs(remaining))}` : euro(remaining)}
            </span>
          ) : remaining < 0 ? (
            <span className="text-sm font-semibold ml-2 shrink-0 text-muted tabular-nums">
              {euro(Math.abs(remaining))}
            </span>
          ) : null}
        </div>
        <BudgetBar ratio={ratio} bufferRatio={bufferRatio} overspent={overspent} color={color} />
      </div>
    </div>
  )
}
