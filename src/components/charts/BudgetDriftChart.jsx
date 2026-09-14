import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { useCategories, setCategoryBudget } from '../../hooks/useCategories'
import { euro } from '../../utils/formatters'
import { berekenDrift, volledigeMaanden } from '../../utils/budgetDrift'
import { vandaag } from '../../utils/recurring'
import { StatCard } from '../ui/StatCard'

const MAANDEN = 6

/**
 * Budget-drift: staat het maandbudget per categorie nog in verhouding tot wat
 * er de laatste zes volledige maanden werkelijk uitging? Per rij een voorstel
 * dat met een tik overgenomen kan worden.
 */
export function BudgetDriftChart() {
  const { allCategories, colors, getByRole } = useCategories()
  const transferKey = getByRole('transfer')?.key ?? null
  const maanden = useMemo(() => volledigeMaanden(MAANDEN, vandaag().slice(0, 7)), [])
  const txs = useLiveQuery(
    () => db.transactions.where('date').between(`${maanden[0]}-00`, `${maanden[maanden.length - 1]}-99`).toArray(),
    [maanden],
  )

  const rijen = useMemo(
    () => (txs ? berekenDrift(txs, allCategories, { maanden, transferKey }) : []),
    [txs, allCategories, maanden, transferKey],
  )

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const totaalBudget = rijen.reduce((s, r) => s + r.budget, 0)
  const totaalMediaan = rijen.reduce((s, r) => s + r.mediaanBedrag, 0)
  const schaal = Math.max(1, ...rijen.map(r => Math.max(r.budget, r.mediaanBedrag)))

  async function neemOver(rij) {
    const ok = window.confirm(
      `Budget voor ${rij.label} van ${euro(rij.budget)} naar ${euro(rij.voorstel)} per maand?`,
    )
    if (!ok) return
    await setCategoryBudget(rij.key, rij.voorstel)
  }

  return (
    <div>
      <div className="card p-5 mb-4">
        <StatCard
          label={`Mediaan per maand (${MAANDEN} maanden)`}
          value={totaalMediaan}
          tone={totaalMediaan > totaalBudget ? 'red' : 'neutral'}
          delta={`budget ${euro(totaalBudget)} · ${rijen.length} categorieën`}
        />
      </div>

      <div data-chart-area className="card overflow-hidden">
        {rijen.map((r, i) => {
          const color = colors[r.key] ?? '#8E8E93'
          const over = r.afwijking > 0
          return (
            <div
              key={r.key}
              className="px-4 py-3"
              style={i < rijen.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-base shrink-0">{r.icon}</span>
                <span className="flex-1 min-w-0 text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                  {r.label}
                </span>
                <span className={`text-sm font-bold tabular-nums shrink-0 ${over ? 'text-red' : 'text-green'}`}>
                  {over ? '+' : '−'}{euro(Math.abs(r.afwijking))}
                </span>
              </div>

              {/* Balk = mediane maanduitgave, streepje = het budget */}
              <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${Math.max((r.mediaanBedrag / schaal) * 100, 1)}%`, backgroundColor: color, opacity: 0.85 }}
                />
                <div
                  className="absolute inset-y-0 w-[2px]"
                  style={{ left: `${Math.min((r.budget / schaal) * 100, 99.5)}%`, background: 'var(--color-text)', opacity: 0.55 }}
                />
              </div>

              <div className="flex items-center gap-2 mt-2">
                <span className="flex-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  mediaan {euro(r.mediaanBedrag)} · budget {euro(r.budget)}
                </span>
                {r.voorstel !== r.budget && (
                  <button
                    onClick={() => neemOver(r)}
                    className="text-[11px] font-semibold rounded-full px-2.5 py-1 btn-accent shrink-0"
                  >
                    Zet budget op {euro(r.voorstel)}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {rijen.length === 0 && (
        <div className="text-center text-muted py-12 text-sm">
          Nog geen categorieën met een maandbudget. Zet er een in Instellingen, dan kan
          deze grafiek het met je werkelijke uitgaven vergelijken.
        </div>
      )}
    </div>
  )
}
