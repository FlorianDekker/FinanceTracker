import { BudgetBar } from './BudgetBar'
import { euro } from '../../utils/formatters'

export function CategoryRow({ category }) {
  const { icon, label, budget, remaining, ratio, bufferRatio, overspent } = category

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* Icon badge */}
      <div className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0 text-lg leading-none">
        {icon}
      </div>

      {/* Bar + label */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-sm text-white/80 truncate">{label}</span>
          {budget > 0 ? (
            <span className={`text-sm font-semibold ml-2 shrink-0 tabular-nums ${overspent ? 'text-red' : 'text-white'}`}>
              {overspent ? `-${euro(Math.abs(remaining))}` : euro(remaining)}
            </span>
          ) : remaining < 0 ? (
            <span className="text-sm font-semibold ml-2 shrink-0 text-muted tabular-nums">
              {euro(Math.abs(remaining))}
            </span>
          ) : null}
        </div>
        <BudgetBar ratio={ratio} bufferRatio={bufferRatio} overspent={overspent} />
      </div>
    </div>
  )
}
