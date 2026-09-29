import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { applyAccentColor } from '../../utils/theme'

const ACCENT_OPTIONS = [
  { color: '#1E3A5F', label: 'Navy' },
  { color: '#0F172A', label: 'Charcoal' },
  { color: '#1E40AF', label: 'Blauw' },
  { color: '#4F46E5', label: 'Indigo' },
  { color: '#7C3AED', label: 'Paars' },
  { color: '#0D9488', label: 'Teal' },
  { color: '#059669', label: 'Smaragd' },
  { color: '#15803D', label: 'Groen' },
  { color: '#B45309', label: 'Amber' },
  { color: '#DC2626', label: 'Rood' },
  { color: '#BE185D', label: 'Roze' },
  { color: '#64748B', label: 'Slate' },
]

/**
 * Instellingen -> Weergave: accentkleur en thema (licht/donker).
 */
export function SettingsAppearance() {
  const theme = useLiveQuery(() => db.settings.get('theme').then(r => r?.value ?? 'light'), [])
  const accentColor = useLiveQuery(() => db.settings.get('accentColor').then(r => r?.value ?? '#1E3A5F'), [])

  async function setTheme(value) {
    await db.settings.put({ key: 'theme', value })
    document.documentElement.classList.remove('dark', 'light')
    if (value === 'dark') document.documentElement.classList.add('dark')
  }

  async function setAccent(color) {
    await db.settings.put({ key: 'accentColor', value: color })
    applyAccentColor(color)
  }

  return (
    <>
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Accentkleur</h2>
        <div className="card p-4">
          <div className="grid grid-cols-6 gap-2.5">
            {ACCENT_OPTIONS.map(opt => (
              <button
                key={opt.color}
                onClick={() => setAccent(opt.color)}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className="w-9 h-9 rounded-full transition-all duration-150"
                  style={{
                    backgroundColor: opt.color,
                    boxShadow: accentColor === opt.color ? `0 0 0 3px var(--color-bg), 0 0 0 5px ${opt.color}` : 'none',
                    transform: accentColor === opt.color ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
                <span className="text-[9px]" style={{ color: accentColor === opt.color ? 'var(--color-text)' : 'var(--color-muted)' }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Thema</h2>
        <div className="card px-4 py-3">
          <div className="flex bg-surface-2 rounded-full p-0.5">
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${theme === 'dark' ? 'btn-accent' : 'text-muted'}`}
            >
              Donker
            </button>
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${theme === 'light' ? 'btn-accent' : 'text-muted'}`}
            >
              Licht
            </button>
          </div>
        </div>
      </section>
    </>
  )
}
