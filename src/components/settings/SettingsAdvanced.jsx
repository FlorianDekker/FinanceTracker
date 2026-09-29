import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { SALARY_THRESHOLD } from '../../utils/categorizer'

/**
 * Instellingen -> Geavanceerd: betrouwbaarheid tonen bij het importeren en de
 * salarisdrempel. (Was voorheen "Admin"; het thema staat nu bij Weergave.)
 */
export function SettingsAdvanced() {
  const showConfidence = useLiveQuery(() => db.settings.get('showConfidence').then(r => r?.value ?? false), [])
  const salaryThreshold = useLiveQuery(
    () => db.settings.get('salaryThreshold').then(r => Number(r?.value) || SALARY_THRESHOLD), [])

  async function toggleConfidence() {
    const current = showConfidence ?? false
    await db.settings.put({ key: 'showConfidence', value: !current })
  }

  // Bijschrijvingen vanaf dit bedrag gelden bij het importeren als inkomen.
  async function saveSalaryThreshold(value) {
    const val = Math.round(parseFloat(String(value).replace(',', '.')))
    if (!Number.isFinite(val) || val <= 0) return
    await db.settings.put({ key: 'salaryThreshold', value: val })
  }

  return (
    <section className="px-4 pt-4 pb-2">
      <div className="card divide-y divide-border overflow-hidden">
        {/* Confidence toggle */}
        <button onClick={toggleConfidence} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-xl">🧠</span>
          <div className="flex-1">
            <div className="text-sm">Toon betrouwbaarheid bij het importeren</div>
            <div className="text-xs text-muted">Geef per categorie-suggestie de bron en het percentage weer</div>
          </div>
          <div className={`w-11 h-6 rounded-full relative transition-colors ${showConfidence ? 'bg-green' : 'bg-border'}`}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showConfidence ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {/* Salarisdrempel */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-xl">💰</span>
          <div className="flex-1">
            <div className="text-sm">Bijschrijving vanaf € telt als salaris</div>
            <div className="text-xs text-muted">Grote bedragen die binnenkomen worden bij het importeren inkomen</div>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted">€</span>
            <input
              type="number"
              min="1"
              step="50"
              inputMode="numeric"
              key={salaryThreshold}
              defaultValue={salaryThreshold ?? SALARY_THRESHOLD}
              onBlur={e => saveSalaryThreshold(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-20 rounded-lg px-2 py-1 text-sm text-right"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
