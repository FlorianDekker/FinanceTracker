import { BudgetBar } from './BudgetBar'
import { euro } from '../../utils/formatters'

export function CategoryRow({ category }) {
  const { icon, label, budget, remaining, ratio, bufferRatio, overspent } = category

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {/* Icon */}
      <span className="text-xl w-7 text-center leading-none">{icon}</span>

      {/* Bar + label */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs text-muted truncate">{label}</span>
          {budget > 0 && (
            <span className={`text-xs font-medium ml-2 shrink-0 ${overspent ? 'text-red' : 'text-white'}`}>
              {overspent ? `-${euro(Math.abs(remaining))}` : euro(remaining)}
            </span>
          )}
        </div>
        {budget > 0 ? (
          <BudgetBar ratio={ratio} bufferRatio={bufferRatio} overspent={overspent} />
        ) : (
          <div className="h-[17px] rounded-full bg-border" />
        )}
      </div>
    </div>
  )
}
