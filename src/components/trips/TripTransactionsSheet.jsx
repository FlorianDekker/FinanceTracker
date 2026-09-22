import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { useCategories } from '../../hooks/useCategories'
import { euro, fmtDate } from '../../utils/formatters'
import { isOpenClaim } from '../../utils/claims'
import { flagOf, foreignCountryOf } from '../../utils/trips/country'

/**
 * "Welke transacties horen bij deze vakantie?" — de voorgevinkte kandidaten
 * bovenaan, de rest van de periode ingeklapt eronder. De aanroeper geeft de
 * lijsten mee (uit `useTripCandidates`) en krijgt bij Klaar de gekozen id's.
 */
export function TripTransactionsSheet({ suggested = [], others = [], value = [], onDone, onClose, loading = false }) {
  const [gekozen, setGekozen] = useState(() => new Set(value))
  const [toonRest, setToonRest] = useState(false)

  function toggle(id) {
    setGekozen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const alles = [...suggested, ...others]
  const totaal = alles
    .filter(tx => gekozen.has(tx.id) && !isOpenClaim(tx))
    .reduce((s, tx) => s + (tx.type === 'credit' ? -tx.amount : tx.amount), 0)

  return (
    <Sheet
      open
      onClose={onClose}
      title="Transacties kiezen"
      subtitle={`${gekozen.size} gekozen · ${euro(totaal)} netto`}
      maxHeight="85vh"
      footer={
        <button
          onClick={() => onDone([...gekozen])}
          className="w-full btn-accent rounded-2xl py-3 text-base"
        >
          Klaar · {gekozen.size}
        </button>
      }
    >
      {loading && <div className="text-center text-muted py-8 text-sm">Laden…</div>}

      {!loading && suggested.length === 0 && others.length === 0 && (
        <div className="text-center text-muted py-8 text-sm px-6">
          Geen transacties in deze periode. Klopt de van/tot-datum?
        </div>
      )}

      {suggested.length > 0 && (
        <>
          <Kop>Voorgesteld</Kop>
          <div className="divide-y divide-border">
            {suggested.map(tx => (
              <Rij key={tx.id} tx={tx} checked={gekozen.has(tx.id)} onToggle={() => toggle(tx.id)} />
            ))}
          </div>
        </>
      )}

      {others.length > 0 && (
        <>
          <button
            onClick={() => setToonRest(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-3 text-left"
            style={{ color: 'var(--color-accent)' }}
          >
            <span className="text-xs font-semibold flex-1">
              {toonRest ? '▾' : '▸'} Overige transacties in deze periode ({others.length})
            </span>
          </button>
          {toonRest && (
            <div className="divide-y divide-border">
              {others.map(tx => (
                <Rij key={tx.id} tx={tx} checked={gekozen.has(tx.id)} onToggle={() => toggle(tx.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}

function Kop({ children }) {
  return (
    <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
      {children}
    </div>
  )
}

function Rij({ tx, checked, onToggle }) {
  const { catMap } = useCategories()
  const cat = catMap[tx.category]
  const land = foreignCountryOf(tx)
  return (
    <button onClick={onToggle} className="w-full flex items-center gap-2 pl-2 pr-4 py-2.5 text-left">
      <span
        className="shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[13px] text-white"
        style={checked ? { background: 'var(--color-accent)' } : { border: '1.5px solid var(--color-border)' }}
        role="checkbox"
        aria-checked={checked}
      >
        {checked ? '✓' : ''}
      </span>
      <span className="text-lg w-7 text-center shrink-0">{land ? flagOf(land) : (cat?.icon ?? '💸')}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{tx.note || cat?.label || tx.category}</div>
        <div className="text-[11px] text-muted truncate">
          {fmtDate(tx.date)} · {cat?.label ?? tx.category}
          {isOpenClaim(tx) && ' · 💼 declaratie'}
        </div>
      </div>
      <span className={`text-sm font-semibold shrink-0 tabular-nums ${tx.type === 'credit' ? 'text-green' : ''}`}>
        {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
      </span>
    </button>
  )
}
