import { useState } from 'react'
import { ReservationSheet } from './ReservationSheet'
import { euro } from '../../utils/formatters'
import { reservationTotals, sortReservations } from '../../utils/wealth/reservations'
import { monthLabelLong } from '../../utils/wealth/months'
import { toggleReservationDone } from '../../hooks/useWealth'

/**
 * Wat er nog van je vermogen af moet. Afgevinkte reserveringen blijven staan
 * (doorgestreept, ingeklapt) zodat je kunt terugkijken wat je al gehad hebt.
 */
export function ReservationsCard({ reservations }) {
  const [sheet, setSheet] = useState(null)
  const [gedaanOpen, setGedaanOpen] = useState(false)

  const lijst = sortReservations(reservations ?? [])
  const open = lijst.filter(r => !r.done)
  const gedaan = lijst.filter(r => r.done)
  const totalen = reservationTotals(reservations ?? [])

  return (
    <>
      <div className="px-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest m-0" style={{ color: 'var(--color-muted)' }}>
            Reserveringen
          </h2>
          <button onClick={() => setSheet({ nieuw: true })} className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            + Reservering
          </button>
        </div>

        <div className="card overflow-hidden">
          {open.length === 0 && (
            <p className="text-xs text-muted px-4 py-5 text-center">
              Niets gereserveerd. Zet hier de kosten neer die je al ziet aankomen.
            </p>
          )}
          {open.map((r, i) => (
            <Rij key={r.id} reservation={r} onOpen={() => setSheet({ reservation: r })} laatste={i === open.length - 1 && !gedaan.length} />
          ))}

          {(open.length > 0 || gedaan.length > 0) && (
            <div className="px-4 py-2.5 flex justify-between text-[11px]"
              style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
              <span>Gepland {euro(totalen.planned)} · ooit {euro(totalen.unplanned)}</span>
              <span className="tabular-nums font-semibold">Totaal {euro(totalen.open)}</span>
            </div>
          )}

          {gedaan.length > 0 && (
            <>
              <button
                onClick={() => setGedaanOpen(o => !o)}
                className="w-full px-4 py-2.5 text-left text-[11px] text-muted"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                {gedaanOpen ? '▾' : '▸'} Gedaan ({gedaan.length})
              </button>
              {gedaanOpen && gedaan.map((r, i) => (
                <Rij key={r.id} reservation={r} onOpen={() => setSheet({ reservation: r })} laatste={i === gedaan.length - 1} />
              ))}
            </>
          )}
        </div>
      </div>

      {sheet && <ReservationSheet reservation={sheet.reservation ?? null} onClose={() => setSheet(null)} />}
    </>
  )
}

function Rij({ reservation, onOpen, laatste }) {
  const r = reservation
  return (
    <div className="flex items-center gap-3 px-4 py-3"
      style={laatste ? undefined : { borderBottom: '1px solid var(--color-border)' }}>
      <button
        onClick={() => toggleReservationDone(r)}
        aria-label={r.done ? 'Terugzetten' : 'Afvinken'}
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs"
        style={r.done
          ? { background: 'var(--color-green)', color: 'white' }
          : { border: '1.5px solid var(--color-border)', color: 'transparent' }}
      >
        ✓
      </button>
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-medium truncate ${r.done ? 'line-through text-muted' : ''}`}
          style={r.done ? undefined : { color: 'var(--color-text)' }}>
          {r.name}
        </div>
        <div className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>
          {r.dueMonth ? monthLabelLong(r.dueMonth) : 'ooit'}{r.note ? ` · ${r.note}` : ''}
        </div>
      </button>
      <span className={`text-sm font-bold tabular-nums ${r.done ? 'text-muted line-through' : ''}`}
        style={r.done ? undefined : { color: 'var(--color-text)' }}>
        {euro(r.amount)}
      </span>
    </div>
  )
}
