// Progress bar with pace knob, replicating Budget Widget 2.js rendering

export function BudgetBar({ ratio, bufferRatio, overspent }) {
  const fillPct = overspent ? 100 : Math.round((1 - ratio) * 100)
  // Green fill goes from left = ratio * 100% width
  const greenPct = Math.round(ratio * 100)
  const redPct = overspent ? Math.round(Math.min(100, (1 - ratio) * 100)) : 0

  return (
    <div className="relative h-[17px] rounded-full bg-border overflow-hidden">
      {overspent ? (
        // Red bar for overspent
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-red"
          style={{ width: '100%' }}
        />
      ) : (
        // Green fill
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-green"
          style={{ width: `${greenPct}%` }}
        />
      )}

      {/* Pace knob: grey pill showing where you need to be to stay on pace */}
      {!overspent && bufferRatio > 0 && bufferRatio < 1 && (
        <div
          className="absolute top-[2px] bottom-[2px] w-[5px] rounded-full bg-[#bdbdbd] opacity-90"
          style={{ left: `calc(${Math.round(bufferRatio * 100)}% - 3px)` }}
        />
      )}
    </div>
  )
}
