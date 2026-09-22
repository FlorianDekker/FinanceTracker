import { StatCard } from '../ui/StatCard'
import { euro } from '../../utils/formatters'

/**
 * De kop van het scherm: wat je hebt, en wat daarvan echt vrij is — dus ná je
 * buffer en alles wat je al gereserveerd hebt.
 */
export function WealthHeader({ total, free, buffer, reserved, onBuffer }) {
  return (
    <div className="px-4 pb-3">
      <div className="card p-4">
        <StatCard label="Totaal vermogen" value={total} />
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
      </div>
    </div>
  )
}
