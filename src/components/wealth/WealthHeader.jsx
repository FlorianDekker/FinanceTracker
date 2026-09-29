import { StatCard } from '../ui/StatCard'
import { euro } from '../../utils/formatters'

/**
 * De kop van het scherm: wat je hebt, en wat daarvan echt vrij is — dus ná je
 * buffer en alles wat je al gereserveerd hebt.
 *
 * Zonder rekeningen is "vrij vermogen" zinloos: het totaal is dan 0 en de
 * buffer (standaard €1.000) maakt hem alleen maar negatief. Dan tonen we een
 * uitnodiging in plaats van dat rode bedrag.
 */
export function WealthHeader({ total, free, buffer, reserved, onBuffer, hasAccounts = true }) {
  return (
    <div className="px-4 pb-3">
      <div className="card p-4">
        <StatCard label="Totaal vermogen" value={total} />
        {hasAccounts ? (
          <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
                Vrij vermogen
              </div>
              <button onClick={onBuffer} className="text-[11px] text-left" style={{ color: 'var(--color-muted)' }}>
                na buffer {euro(buffer)} en {euro(reserved)} gereserveerd ›
              </button>
            </div>
            <span className={`text-xl font-extrabold tabular-nums ${free < 0 ? 'text-red' : 'text-green'}`}>
              {euro(free)}
            </span>
          </div>
        ) : (
          <p className="mt-3 pt-3 text-[11px] text-center" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
            Voeg hieronder een rekening toe of importeer je bank om je vrije vermogen te zien.
          </p>
        )}
      </div>
    </div>
  )
}
