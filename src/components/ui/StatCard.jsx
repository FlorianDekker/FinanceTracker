import { euroParts } from '../../utils/formatters'

const TONE_CLASS = {
  neutral: '',
  green: 'text-green',
  red: 'text-red',
  muted: 'text-muted',
}

/**
 * De kop die boven bijna elke grafiek staat: klein muted label, groot bedrag
 * en een optionele regel eronder. Zit bewust *in* de kaart en niet eromheen,
 * want veel grafieken zetten er nog een voortgangsbalk of extra regels bij.
 *
 * @param label         korte omschrijving boven het bedrag
 * @param value         bedrag; het teken bepaal je zelf via `tone`
 * @param tone          'neutral' | 'green' | 'red' — kleur van het bedrag
 * @param delta         optionele regel onder het bedrag
 * @param deltaTone     'muted' | 'green' | 'red'
 * @param deltaOpacity  doorzichtigheid van die regel (per grafiek verschillend)
 * @param deltaMargin   marge-klasse van die regel
 */
export function StatCard({
  label,
  value,
  tone = 'neutral',
  delta = null,
  deltaTone = 'muted',
  deltaOpacity = 0.5,
  deltaMargin = 'mt-0.5',
}) {
  const p = euroParts(value)
  return (
    <div className="text-center mb-1">
      <div
        className="text-[10px] font-semibold uppercase tracking-widest mb-1"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </div>
      <div
        className={`tabular-nums tracking-tight leading-none ${TONE_CLASS[tone]}`}
        style={tone === 'neutral' ? { color: 'var(--color-text)' } : undefined}
      >
        <span className="text-lg font-bold align-top">€</span>
        <span className="text-4xl font-extrabold">{p.whole}</span>
        <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{p.dec}</span>
      </div>
      {delta != null && (
        <div
          className={`text-sm font-bold tabular-nums ${deltaMargin} ${TONE_CLASS[deltaTone]}`}
          style={{ opacity: deltaOpacity }}
        >
          {delta}
        </div>
      )}
    </div>
  )
}
