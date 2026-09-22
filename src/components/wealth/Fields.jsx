/**
 * De invoervelden die de Vermogen-sheets delen. Alles op 16px: kleiner laat
 * Safari op de iPhone inzoomen zodra je een veld aantikt.
 */

const INPUT_STYLE = {
  fontSize: '16px',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  height: 44,
}

export function Veld({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </label>
  )
}

export function TekstVeld({ label, hint, value, onChange, placeholder = '', autoFocus = false }) {
  return (
    <Veld label={label} hint={hint}>
      <input
        type="text"
        value={value ?? ''}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl px-3"
        style={INPUT_STYLE}
      />
    </Veld>
  )
}

/** Vrije tekst, want een komma moet gewoon kunnen (zie parseBalanceInput). */
export function BedragVeld({ label, hint, value, onChange, placeholder = '0,00' }) {
  return (
    <Veld label={label} hint={hint}>
      <div className="flex items-center rounded-xl px-3" style={{ background: 'var(--color-surface-2)', height: 44 }}>
        <span className="text-muted mr-1">€</span>
        <input
          type="text"
          inputMode="decimal"
          value={value ?? ''}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-transparent tabular-nums"
          style={{ fontSize: '16px', color: 'var(--color-text)' }}
        />
      </div>
    </Veld>
  )
}

export function MaandVeld({ label, hint, value, onChange }) {
  return (
    <Veld label={label} hint={hint}>
      <input
        type="month"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl px-3"
        style={INPUT_STYLE}
      />
    </Veld>
  )
}

export function DatumVeld({ label, hint, value, onChange }) {
  return (
    <Veld label={label} hint={hint}>
      <input
        type="date"
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl px-3"
        style={INPUT_STYLE}
      />
    </Veld>
  )
}

/** Rij met keuzepillen (rekeningsoort, vulregel). */
export function Pillen({ label, options, value, onChange }) {
  return (
    <Veld label={label}>
      <div className="flex gap-2 flex-wrap">
        {options.map(o => {
          const actief = o.key === value
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className="text-xs rounded-full px-3 py-2"
              style={actief
                ? { background: 'var(--color-accent)', color: 'white' }
                : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
            >
              {o.icon ? `${o.icon} ` : ''}{o.label}
            </button>
          )
        })}
      </div>
    </Veld>
  )
}

/** Vaste voet van een sheet: bewaren (en desgewenst verwijderen). */
export function SheetVoet({ onSave, saveLabel = 'Bewaren', disabled = false, extra = null }) {
  return (
    <div className="space-y-2">
      <button
        onClick={onSave}
        disabled={disabled}
        className="btn-accent w-full rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
      >
        {saveLabel}
      </button>
      {extra}
    </div>
  )
}

export function Foutmelding({ children }) {
  if (!children) return null
  return <p className="text-xs text-red">{children}</p>
}
