import { useState } from 'react'
import { GoalSheet } from './GoalSheet'
import { GoalDetailSheet } from './GoalDetailSheet'
import { euro } from '../../utils/formatters'
import { monthLabelLong } from '../../utils/wealth/months'
import { moveGoal } from '../../hooks/useWealth'

const REGEL_LABEL = {
  surplus: 'alles wat overblijft',
  fixed: 'vast per maand',
  surplus_above: 'overschot boven een bedrag',
}

/**
 * Je spaardoelen in de volgorde waarin ze gevuld worden. De pijltjes bepalen
 * die volgorde: het bovenste doel krijgt het overschot van een maand eerst.
 */
export function GoalsCard({ goals, allocations }) {
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [detail, setDetail] = useState(null)

  const lijst = goals ?? []
  const perId = Object.fromEntries((allocations ?? []).map(a => [a.id, a]))
  const huidig = detail ? lijst.find(g => g.id === detail) : null

  return (
    <>
      <div className="px-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest m-0" style={{ color: 'var(--color-muted)' }}>
            Spaardoelen
          </h2>
          <button onClick={() => setNieuwOpen(true)} className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            + Spaardoel
          </button>
        </div>

        {lijst.length === 0 ? (
          <div className="card px-4 py-5">
            <p className="text-xs text-muted text-center">
              Nog geen spaardoelen. Een doel verdeelt vanzelf wat je elke maand overhoudt.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {lijst.map((g, i) => (
              <GoalRow
                key={g.id}
                goal={g}
                alloc={perId[g.id]}
                eerste={i === 0}
                laatste={i === lijst.length - 1}
                onOpen={() => setDetail(g.id)}
              />
            ))}
            <p className="text-[11px] text-muted px-1">
              Het overschot van een maand gaat van boven naar beneden: is een doel vol, dan stroomt de rest door.
            </p>
          </div>
        )}
      </div>

      {nieuwOpen && <GoalSheet onClose={() => setNieuwOpen(false)} />}
      {huidig && <GoalDetailSheet goal={huidig} allocation={perId[huidig.id]} onClose={() => setDetail(null)} />}
    </>
  )
}

function GoalRow({ goal, alloc, eerste, laatste, onOpen }) {
  const a = alloc ?? { saved: 0, target: goal.target ?? 0, fraction: 0, remaining: goal.target ?? 0 }
  const procent = Math.round((a.fraction ?? 0) * 100)
  return (
    <div className="card px-4 py-3">
      <div className="flex items-center gap-3">
        <button onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left">
          <span className="text-xl">{goal.icon ?? '🎯'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{goal.name}</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>
              {REGEL_LABEL[goal.rule?.type] ?? 'alles wat overblijft'}
            </div>
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{procent}%</span>
        </button>
        <div className="flex flex-col gap-0.5">
          <button onClick={() => moveGoal(goal.id, -1)} disabled={eerste} aria-label="Omhoog"
            className="text-muted text-[10px] leading-none disabled:opacity-20 px-1">▲</button>
          <button onClick={() => moveGoal(goal.id, 1)} disabled={laatste} aria-label="Omlaag"
            className="text-muted text-[10px] leading-none disabled:opacity-20 px-1">▼</button>
        </div>
      </div>

      <button onClick={onOpen} className="w-full text-left mt-2">
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
          <div className="h-full rounded-full" style={{
            width: `${Math.max(2, Math.min(100, procent))}%`,
            background: a.reached ? 'var(--color-green)' : 'var(--color-accent)',
          }} />
        </div>
        <div className="flex justify-between text-[11px] mt-1.5" style={{ color: 'var(--color-muted)' }}>
          <span className="tabular-nums">{euro(a.saved)} van {euro(a.target)}</span>
          <span>
            {a.reached
              ? `bereikt ${monthLabelLong(a.reachedMonth)}`
              : a.etaMonth ? `klaar ${monthLabelLong(a.etaMonth)}` : 'nog geen tempo'}
          </span>
        </div>
      </button>
    </div>
  )
}
