import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { KNOWN_COUNTRIES, countryLabel, flagOf } from '../../utils/trips/country'

/**
 * Landen bij een vakantie kiezen. De lijst komt uit de tabel in
 * `utils/trips/country.js`; een land dat daar niet in staat (uit `Land: XXX`
 * van de bank) blijft gewoon bovenaan staan zodat je het niet kwijtraakt.
 */
export function CountryPickerSheet({ value = [], onChange, onClose }) {
  const [zoek, setZoek] = useState('')
  const gekozen = new Set(value)

  const onbekend = value
    .filter(code => !KNOWN_COUNTRIES.some(c => c.code === code))
    .map(code => ({ code, name: code }))
  const term = zoek.trim().toLowerCase()
  const lijst = [...onbekend, ...KNOWN_COUNTRIES]
    .filter(c => !term || c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term))

  function toggle(code) {
    onChange(gekozen.has(code) ? value.filter(c => c !== code) : [...value, code])
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Landen"
      subtitle={value.length ? value.map(countryLabel).join(' · ') : 'Waar was je?'}
      maxHeight="80vh"
      footer={
        <button onClick={onClose} className="w-full btn-accent rounded-2xl py-3 text-base">Klaar</button>
      }
    >
      <div className="px-4 py-3">
        <input
          type="text"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="Zoek land…"
          className="w-full rounded-lg px-3 py-2"
          style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
        />
      </div>
      <div className="divide-y divide-border">
        {lijst.map(c => (
          <button
            key={c.code}
            onClick={() => toggle(c.code)}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
          >
            <span className="text-xl w-7 text-center shrink-0">{flagOf(c.code)}</span>
            <span className="flex-1 text-sm truncate">{c.name}</span>
            <span className="text-[10px] text-muted tabular-nums">{c.code}</span>
            {gekozen.has(c.code) && <span className="text-sm" style={{ color: 'var(--color-accent)' }}>✓</span>}
          </button>
        ))}
        {lijst.length === 0 && <div className="text-center text-muted py-8 text-sm">Niets gevonden</div>}
      </div>
    </Sheet>
  )
}
