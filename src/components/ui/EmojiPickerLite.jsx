// Kleine, gecureerde emoji-kiezer: alle iconen die de app al gebruikt plus
// gangbare extra's. Wie iets anders wil, tikt het in het vrije veld.
const EMOJI_CHOICES = [
  '🏠', '📱', '🛒', '🚆', '🎁', '🥰', '💊', '✈️',
  '👬', '👕', '💸', '🎨', '📈', '🏦', '🤝', '💰',
  '🍿', '🎬', '🚗', '⚽', '🐶', '🎓', '💻', '🧾',
  '🧻', '🧴', '🎵', '🍺', '🍰', '🚲', '✂️', '📚',
  '🧘', '🏥', '🏋️', '🛠️', '🎮', '🖥️', '🎸', '🌱',
  '🧳', '👶', '🐾', '💡', '🔧', '🎯', '🏆', '🎂',
  '📷', '🛍️', '🌍', '🚌', '🚕', '⛽', '💳', '📦',
  '🧢', '☕', '🍕', '🥦', '🎟️',
]

export function EmojiPickerLite({ value, onChange }) {
  return (
    <div>
      <div className="grid grid-cols-8 gap-1.5">
        {EMOJI_CHOICES.map(emoji => {
          const active = emoji === value
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              className="aspect-square rounded-xl text-xl flex items-center justify-center"
              style={{
                background: active ? 'var(--color-accent-light)' : 'var(--color-surface-2)',
                boxShadow: active ? '0 0 0 2px var(--color-accent)' : 'none',
              }}
            >
              {emoji}
            </button>
          )
        })}
      </div>

      <label className="flex items-center gap-3 mt-3">
        <span className="text-xs text-muted shrink-0">Zelf invoeren</span>
        <input
          type="text"
          maxLength={4}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder="📦"
          className="w-20 rounded-lg px-3 py-2 text-center"
          style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
        />
      </label>
    </div>
  )
}
