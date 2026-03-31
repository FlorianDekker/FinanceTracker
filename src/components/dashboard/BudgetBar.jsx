export function BudgetBar({ ratio, bufferRatio, overspent }) {
  const greenPct = overspent ? 0 : Math.round(ratio * 100)

  return (
    <div className="relative h-[6px] rounded-full bg-surface-2 overflow-visible">
      {overspent ? (
        <div className="absolute inset-0 rounded-full bg-red opacity-90" />
      ) : (
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${greenPct}%`,
            background: 'linear-gradient(90deg, #25a244 0%, #30D158 100%)',
          }}
        />
      )}

      {/* Pace knob */}
      {!overspent && bufferRatio > 0.01 && bufferRatio < 0.99 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[10px] rounded-full bg-white/60"
          style={{ left: `calc(${Math.round(bufferRatio * 100)}% - 1.5px)` }}
        />
      )}
    </div>
  )
}
