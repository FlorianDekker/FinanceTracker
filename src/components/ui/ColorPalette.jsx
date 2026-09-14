// Vaste tinten uit het bestaande categoriepalet, aangevuld met een paar
// kleuren die in dezelfde iOS-achtige familie passen.
const COLOR_CHOICES = [
  { color: '#FF453A', label: 'Rood' },
  { color: '#FF9F0A', label: 'Oranje' },
  { color: '#FFD60A', label: 'Geel' },
  { color: '#34C759', label: 'Groen' },
  { color: '#16A34A', label: 'Bosgroen' },
  { color: '#30B0C7', label: 'Turquoise' },
  { color: '#64D2FF', label: 'Lichtblauw' },
  { color: '#0A84FF', label: 'Blauw' },
  { color: '#5E5CE6', label: 'Indigo' },
  { color: '#BF5AF2', label: 'Paars' },
  { color: '#FF375F', label: 'Roze' },
  { color: '#8E8E93', label: 'Grijs' },
]

export function ColorPalette({ value, onChange }) {
  const isPreset = COLOR_CHOICES.some(c => c.color.toLowerCase() === String(value ?? '').toLowerCase())

  return (
    <div>
      <div className="grid grid-cols-6 gap-2.5">
        {COLOR_CHOICES.map(opt => {
          const active = opt.color.toLowerCase() === String(value ?? '').toLowerCase()
          return (
            <button
              key={opt.color}
              type="button"
              aria-label={opt.label}
              onClick={() => onChange(opt.color)}
              className="w-9 h-9 rounded-full mx-auto transition-all duration-150"
              style={{
                backgroundColor: opt.color,
                boxShadow: active ? `0 0 0 3px var(--color-surface), 0 0 0 5px ${opt.color}` : 'none',
                transform: active ? 'scale(1.1)' : 'scale(1)',
              }}
            />
          )
        })}
      </div>

      <label className="flex items-center gap-3 mt-4">
        <span
          className="w-9 h-9 rounded-full shrink-0 relative overflow-hidden"
          style={{
            backgroundColor: value || '#8E8E93',
            boxShadow: !isPreset ? `0 0 0 3px var(--color-surface), 0 0 0 5px ${value || '#8E8E93'}` : 'none',
          }}
        >
          <input
            type="color"
            value={value || '#8E8E93'}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full"
          />
        </span>
        <span className="text-sm">Aangepast</span>
        <span className="text-xs text-muted ml-auto tabular-nums uppercase">{value}</span>
      </label>
    </div>
  )
}
