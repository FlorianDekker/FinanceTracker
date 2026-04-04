export function BudgetBar({ ratio, bufferRatio, overspent, color }) {
  const greenPct = overspent ? 0 : Math.round(ratio * 100)

  return (
    <div className="relative h-[7px] rounded-full overflow-visible" style={{ backgroundColor: 'var(--color-surface-2)' }}>
      {overspent ? (
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: 'linear-gradient(90deg, var(--color-red) 0%, #ff6b6b 100%)', opacity: 0.9 }}
        />
      ) : (
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${greenPct}%`,
            background: color
              ? `linear-gradient(90deg, ${color}99 0%, ${color} 100%)`
              : 'linear-gradient(90deg, #25a244 0%, #30D158 100%)',
            boxShadow: greenPct > 5 ? `0 0 8px ${color ?? '#30D158'}40` : 'none',
          }}
        />
      )}

      {/* Pace knob */}
      {!overspent && bufferRatio > 0.01 && bufferRatio < 0.99 && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[3px] h-[11px] rounded-full"
          style={{ left: `calc(${Math.round(bufferRatio * 100)}% - 1.5px)`, backgroundColor: 'var(--color-text-dim)' }}
        />
      )}
    </div>
  )
}
