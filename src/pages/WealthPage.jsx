import { useEffect, useRef, useState } from 'react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { WealthHeader } from '../components/wealth/WealthHeader'
import { BufferSheet } from '../components/wealth/BufferSheet'
import { ProjectionChart } from '../components/wealth/ProjectionChart'
import { AccountsCard } from '../components/wealth/AccountsCard'
import { ReservationsCard } from '../components/wealth/ReservationsCard'
import { GoalsCard } from '../components/wealth/GoalsCard'
import { useCashflowData } from '../hooks/useCashflowData'
import {
  initWealth,
  useAccounts,
  useGoals,
  useProjectionMonths,
  useReservations,
  useSnapshots,
  useWealthBuffer,
} from '../hooks/useWealth'
import { periodSavings } from '../utils/savings'
import { euro } from '../utils/formatters'
import { activeAccounts, totalWealth } from '../utils/wealth/accounts'
import { allocateGoals } from '../utils/wealth/goals'
import { wealthHistory } from '../utils/wealth/history'
import { monthLabelLong, monthOf, monthsBetween, round2 } from '../utils/wealth/months'
import { projectWealth } from '../utils/wealth/projection'
import { freeWealth, reservationTotals } from '../utils/wealth/reservations'

const SPAARVENSTER = 6      // maanden waarover we het verwachte spaarbedrag middelen
const MIN_VENSTER = 12
const MAX_VENSTER = 120

/**
 * Vermogen: wat heb ik, wat moet daar nog vanaf, waar spaar ik voor en hoe
 * loopt dat de komende jaren? Zie docs/VERMOGEN.md.
 */
export function WealthPage() {
  const accounts = useAccounts()
  const snapshots = useSnapshots()
  const reservations = useReservations()
  const goals = useGoals()
  const buffer = useWealthBuffer()
  const projectionMonths = useProjectionMonths()
  const [bufferOpen, setBufferOpen] = useState(false)
  const gestart = useRef(false)

  // Hoe ver moeten we terugkijken? Tot het oudste spaardoel begon.
  const starts = (goals ?? []).map(g => g.startMonth).filter(Boolean)
  const vroegste = starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : null
  const venster = Math.max(MIN_VENSTER, Math.min(MAX_VENSTER,
    vroegste ? monthsBetween(vroegste, monthOf()) + 1 : MIN_VENSTER))

  const cashflow = useCashflowData({ window: venster })
  // De lopende maand is nog niet voorbij en telt dus nergens mee.
  const volleMaanden = cashflow.slice(0, -1)

  // Eén keer per bezoek: ontbrekende bankrekeningen aanmaken en de stand van
  // vandaag vastleggen. Daarna groeit het verloop vanzelf.
  useEffect(() => {
    if (gestart.current) return
    gestart.current = true
    initWealth().catch(() => {})
  }, [])

  const laden = accounts == null || reservations == null || goals == null

  const actief = activeAccounts(accounts ?? [])
  const totaal = totalWealth(accounts ?? [])
  const totalen = reservationTotals(reservations ?? [])
  const vrij = freeWealth(totaal, buffer, reservations ?? [])

  const laatste6 = periodSavings(volleMaanden.slice(-SPAARVENSTER))
  const perMaand = laatste6.months > 0 ? round2(laatste6.saved / laatste6.months) : 0

  // Klein rekenwerk over hooguit een paar honderd rijen; memo's zouden hier
  // alleen maar afhankelijkheden verstoppen.
  const projectie = projectWealth({
    start: totaal,
    monthly: perMaand,
    reservations: reservations ?? [],
    months: projectionMonths,
    buffer,
  })
  const verdeling = allocateGoals(volleMaanden, goals ?? []).goals
  const verloop = wealthHistory(snapshots ?? [], actief.map(a => a.key))

  if (laden) {
    return (
      <PageWrapper title="Vermogen">
        <p className="text-sm text-muted px-4 py-10 text-center">Laden…</p>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper title="Vermogen">
      <div className="space-y-5">
        <WealthHeader
          total={totaal}
          free={vrij}
          buffer={buffer}
          reserved={totalen.open}
          onBuffer={() => setBufferOpen(true)}
        />

        <div className="px-4">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest m-0" style={{ color: 'var(--color-muted)' }}>
              Red ik het?
            </h2>
            <button onClick={() => setBufferOpen(true)} className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
              {projectionMonths} mnd
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-2">
            <Kengetal
              label="Per maand"
              waarde={euro(perMaand)}
              onder={laatste6.months > 0 ? `gem. ${laatste6.months} mnd` : 'nog geen maanden'}
            />
            <Kengetal
              label="Laagste punt"
              waarde={euro(projectie.low.balance)}
              onder={monthLabelLong(projectie.low.month)}
              toon={projectie.low.balance < buffer ? 'red' : 'green'}
            />
            <Kengetal
              label="Onder buffer"
              waarde={projectie.firstBelow ? monthLabelLong(projectie.firstBelow) : 'Nee'}
              onder={projectie.firstBelow ? 'let op' : 'blijft boven buffer'}
              toon={projectie.firstBelow ? 'red' : 'green'}
              klein
            />
          </div>

          <div className="card p-3">
            <ProjectionChart projection={projectie} />
            <p className="text-[11px] text-center mt-2" style={{ color: 'var(--color-muted)' }}>
              Vanaf volgende maand: {euro(perMaand)} erbij, reserveringen eraf. De stippellijn is je buffer.
            </p>
            {projectie.unplanned > 0 && (
              <div className="mt-2 rounded-xl px-3 py-2 text-[11px] flex justify-between"
                style={{ background: 'var(--color-orange-dim)', color: 'var(--color-text)' }}>
                <span>Nog ongepland (&ldquo;ooit&rdquo;)</span>
                <span className="tabular-nums font-semibold">{euro(projectie.unplanned)}</span>
              </div>
            )}
          </div>
        </div>

        <AccountsCard accounts={accounts} history={verloop} />
        <ReservationsCard reservations={reservations} />
        <GoalsCard goals={goals} allocations={verdeling} />
      </div>

      {bufferOpen && (
        <BufferSheet buffer={buffer} months={projectionMonths} onClose={() => setBufferOpen(false)} />
      )}
    </PageWrapper>
  )
}

function Kengetal({ label, waarde, onder, toon = 'neutral', klein = false }) {
  const kleur = toon === 'red' ? 'var(--color-red)' : toon === 'green' ? 'var(--color-green)' : 'var(--color-text)'
  return (
    <div className="card p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>{label}</div>
      <div className={`${klein ? 'text-sm' : 'text-base'} font-extrabold tabular-nums leading-tight mt-1`} style={{ color: kleur }}>
        {waarde}
      </div>
      <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>{onder}</div>
    </div>
  )
}
