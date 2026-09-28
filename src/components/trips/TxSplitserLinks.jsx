import { useState } from 'react'
import { DEFAULT_SPLITSER_NAME, toggleTripItemMatch, useTrip, useTripItems, useTripTransactions } from '../../hooks/useTrips'
import { matchedIdsOf, matchGroup } from '../../utils/trips/costs'
import { euro, fmtDate } from '../../utils/formatters'

/**
 * Vanaf de bankkant koppelen: bij welke Splitser-regels hoort deze
 * afschrijving? Zelfde koppeling als in `TripItemSheet`, andersom bekeken:
 * vink je hier twee regels aan (diner en wijn, één keer gepind), dan hangt
 * deze betaling aan allebei. Alleen regels die jij voorschoot kunnen een
 * bankregel van jou zijn.
 */
export function TxSplitserLinks({ tx }) {
  const trip = useTrip(tx?.tripId ?? null)
  const items = useTripItems(tx?.tripId ?? null)
  const txs = useTripTransactions(tx?.tripId ?? null)
  const [open, setOpen] = useState(false)

  if (!tx?.id || tx.type !== 'debit' || !trip || !items?.length) return null
  const naam = String(trip.splitser?.myName ?? DEFAULT_SPLITSER_NAME).toLowerCase()
  const mijn = items.filter(i => String(i.payer ?? '').toLowerCase() === naam)
  if (!mijn.length) return null

  const gekoppeld = mijn.filter(i => matchedIdsOf(i).includes(tx.id))
  // Over de hele groep: sluiten bank en Splitser op elkaar aan?
  const groep = gekoppeld.length ? matchGroup(gekoppeld[0].id, items, txs ?? []) : null
  const sluitAan = groep && Math.abs(groep.diff) <= 0.01

  const dagen = d => Math.abs((Date.parse(`${d}T00:00:00`) - Date.parse(`${tx.date}T00:00:00`)) / 86400000)
  const lijst = mijn
    .map(i => ({ i, aan: matchedIdsOf(i).includes(tx.id), zelfde: Math.abs((Number(i.amount) || 0) - (Number(tx.amount) || 0)) <= 0.01 }))
    // Gekoppeld bovenaan, dan hetzelfde bedrag, dan dichtstbijzijnde datum.
    .sort((a, b) => (a.aan !== b.aan ? (a.aan ? -1 : 1) : a.zelfde !== b.zelfde ? (a.zelfde ? -1 : 1) : dagen(a.i.date) - dagen(b.i.date)))

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left"
        style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
      >
        <span className="text-lg">🧾</span>
        <span className="flex-1 text-sm truncate">
          {gekoppeld.length === 0 ? 'Splitser-regels koppelen'
            : gekoppeld.length === 1 ? gekoppeld[0].description
            : `${gekoppeld.length} Splitser-regels`}
          <span className="block text-[11px] text-muted">
            {gekoppeld.length === 0
              ? 'welke regels uit Splitser betaalde je hiermee?'
              : sluitAan ? `✓ Splitser ${euro(groep.itemSum)} = bank ${euro(groep.txSum)}`
              : `Splitser ${euro(groep.itemSum)}, bank ${euro(groep.txSum)}`}
          </span>
        </span>
        <span className="text-muted">{open ? '▾' : '›'}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl overflow-hidden divide-y divide-border" style={{ background: 'var(--color-surface-2)' }}>
          <div className="px-3 py-2 text-[11px] text-muted">
            Vink meer regels aan als je ze in één keer betaalde.
          </div>
          {lijst.map(({ i, aan, zelfde }) => {
            const ook = matchedIdsOf(i).filter(id => id !== tx.id).length
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => toggleTripItemMatch(i.id, tx.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
              >
                <span
                  className="shrink-0 w-[20px] h-[20px] rounded-md flex items-center justify-center text-[12px] text-white"
                  style={aan ? { background: 'var(--color-accent)' } : { border: '1.5px solid var(--color-border)' }}
                  role="checkbox"
                  aria-checked={aan}
                >
                  {aan ? '✓' : ''}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{zelfde && !aan ? '★ ' : ''}{i.description}</div>
                  <div className="text-[11px] text-muted truncate">
                    {[fmtDate(i.date), euro(i.amount), zelfde && !aan && 'voorstel', ook > 0 && `ook ${ook} andere bankregel${ook === 1 ? '' : 's'}`]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
