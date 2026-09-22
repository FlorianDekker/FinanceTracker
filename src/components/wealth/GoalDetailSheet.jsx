import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { GoalSheet } from './GoalSheet'
import { BedragVeld, DatumVeld, Foutmelding, TekstVeld } from './Fields'
import { parseBalanceInput } from '../../utils/balance'
import { euro, fmtDate, today } from '../../utils/formatters'
import { monthLabelLong } from '../../utils/wealth/months'
import { addManualDeposit, removeManualDeposit } from '../../hooks/useWealth'

const REGEL_TEKST = {
  surplus: 'alles wat overblijft',
  fixed: 'vast bedrag per maand',
  surplus_above: 'het overschot boven een bedrag',
}

/**
 * Eén spaardoel van dichtbij: hoe ver je bent, wat elke maand bijdroeg en de
 * stortingen die je er zelf los in deed.
 */
export function GoalDetailSheet({ goal, allocation, onClose }) {
  const [stortOpen, setStortOpen] = useState(false)
  const [bewerken, setBewerken] = useState(false)
  const [bedrag, setBedrag] = useState('')
  const [datum, setDatum] = useState(today())
  const [notitie, setNotitie] = useState('')
  const [fout, setFout] = useState('')

  const a = allocation ?? { saved: 0, target: goal.target ?? 0, fraction: 0, remaining: 0, perMonth: {}, pace: 0 }
  const maanden = Object.entries(a.perMonth ?? {}).sort((x, y) => (x[0] < y[0] ? 1 : -1))
  const deposits = Array.isArray(goal.manualDeposits) ? goal.manualDeposits : []

  async function stort() {
    try {
      setFout('')
      await addManualDeposit(goal.id, { date: datum, amount: parseBalanceInput(bedrag), note: notitie })
      setBedrag(''); setNotitie(''); setStortOpen(false)
    } catch (e) {
      setFout(e.message)
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={`${goal.icon ?? '🎯'} ${goal.name}`}
        subtitle={`${REGEL_TEKST[a.rule ?? goal.rule?.type] ?? ''} · vanaf ${monthLabelLong(goal.startMonth)}`}
      >
        <div className="px-4 py-4 space-y-4">
          <div className="card p-4">
            <div className="flex items-end justify-between mb-2">
              <span className="text-2xl font-extrabold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(a.saved)}</span>
              <span className="text-xs text-muted tabular-nums">van {euro(a.target)}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
              <div className="h-full rounded-full" style={{
                width: `${Math.max(2, Math.round((a.fraction ?? 0) * 100))}%`,
                background: a.reached ? 'var(--color-green)' : 'var(--color-accent)',
              }} />
            </div>
            <div className="flex justify-between text-[11px] mt-2" style={{ color: 'var(--color-muted)' }}>
              <span>{a.reached ? `Bereikt in ${monthLabelLong(a.reachedMonth)}` : `Nog ${euro(a.remaining)}`}</span>
              <span>
                {a.reached ? '🎉' : a.etaMonth ? `verwacht klaar ${monthLabelLong(a.etaMonth)}` : 'tempo nog onbekend'}
              </span>
            </div>
          </div>

          <button
            onClick={() => setStortOpen(o => !o)}
            className="w-full rounded-xl py-2.5 text-sm font-medium"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-accent)' }}
          >
            {stortOpen ? 'Annuleren' : '+ Handmatig storten'}
          </button>

          {stortOpen && (
            <div className="space-y-3 rounded-xl p-3" style={{ background: 'var(--color-surface-2)' }}>
              <BedragVeld label="Bedrag" value={bedrag} onChange={setBedrag} />
              <DatumVeld label="Datum" value={datum} onChange={setDatum} />
              <TekstVeld label="Notitie" value={notitie} onChange={setNotitie} placeholder="bonus" />
              <Foutmelding>{fout}</Foutmelding>
              <button onClick={stort} className="btn-accent w-full rounded-xl py-2.5 text-sm font-semibold">Storten</button>
              <p className="text-[11px] text-muted">
                Een storting telt los van de maandregel mee — handig voor een bonus of een cadeau.
              </p>
            </div>
          )}

          {deposits.length > 0 && (
            <Blok titel="Handmatige stortingen">
              {deposits.map((d, i) => (
                <div key={`${d.date}-${i}`} className="flex items-center gap-2 px-4 py-2.5"
                  style={i < deposits.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : undefined}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{fmtDate(d.date)}</div>
                    {d.note && <div className="text-[11px] text-muted truncate">{d.note}</div>}
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{euro(d.amount)}</span>
                  <button onClick={() => removeManualDeposit(goal.id, i)} aria-label="Verwijderen"
                    className="text-muted text-sm px-1">✕</button>
                </div>
              ))}
            </Blok>
          )}

          <Blok titel="Per maand uit je overschot">
            {maanden.length === 0 && (
              <p className="text-xs text-muted px-4 py-4 text-center">
                Nog geen maand waarin er iets naar dit doel ging.
              </p>
            )}
            {maanden.map(([maand, waarde], i) => (
              <div key={maand} className="flex justify-between px-4 py-2.5"
                style={i < maanden.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : undefined}>
                <span className="text-sm">{monthLabelLong(maand)}</span>
                <span className="text-sm font-semibold tabular-nums">{euro(waarde)}</span>
              </div>
            ))}
          </Blok>

          <button onClick={() => setBewerken(true)} className="w-full rounded-xl py-2.5 text-sm font-medium"
            style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
            Doel bewerken
          </button>
        </div>
      </Sheet>

      {bewerken && <GoalSheet goal={goal} onClose={() => { setBewerken(false); onClose() }} />}
    </>
  )
}

function Blok({ titel, children }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-1 px-1" style={{ color: 'var(--color-muted)' }}>
        {titel}
      </div>
      <div className="card overflow-hidden">{children}</div>
    </div>
  )
}
