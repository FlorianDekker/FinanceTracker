import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, euroParts, fmtDate } from '../../utils/formatters'
import { CATEGORY_MAP, CAT_COLORS } from '../../constants/categories'

export function IncomeChart({ year, month }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions
      .where('date').startsWith(prefix)
      .filter(t => t.type === 'credit' && t.category !== 'bankoverschrijving' && t.category !== 'voorschot')
      .sortBy('amount'),
    [prefix]
  )

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const sorted = [...txs].reverse()
  const total = sorted.reduce((s, t) => s + t.amount, 0)
  const tp = euroParts(total)

  // Group by category
  const catMap = new Map()
  for (const tx of sorted) {
    if (!catMap.has(tx.category)) catMap.set(tx.category, { amount: 0, count: 0 })
    const g = catMap.get(tx.category)
    g.amount += tx.amount
    g.count++
  }
  const catGroups = [...catMap.entries()]
    .map(([key, data]) => ({ key, ...data, cat: CATEGORY_MAP[key] }))
    .sort((a, b) => b.amount - a.amount)
  const maxCatAmount = catGroups[0]?.amount ?? 1

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Totaal inkomen
          </div>
          <div className="tabular-nums tracking-tight leading-none text-green">
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{tp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{tp.dec}</span>
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            {sorted.length} transacties
          </div>
        </div>
      </div>

      {/* Category breakdown */}
      {catGroups.length > 0 && (
        <div className="card overflow-hidden mb-4">
          {catGroups.map((g, i) => {
            const color = CAT_COLORS[g.key] ?? '#8E8E93'
            const barPct = Math.max((g.amount / maxCatAmount) * 100, 3)
            const pct = total > 0 ? Math.round((g.amount / total) * 100) : 0
            return (
              <div
                key={g.key}
                className="flex items-center gap-3 px-4 py-3 relative overflow-hidden"
                style={i < catGroups.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
              >
                <div className="absolute inset-y-0 left-0" style={{ width: `${barPct}%`, backgroundColor: color, opacity: 0.08 }} />
                <span className="text-base relative">{g.cat?.icon ?? '💰'}</span>
                <div className="flex-1 min-w-0 relative">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{g.cat?.label ?? g.key}</div>
                  <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{g.count} transacties</div>
                </div>
                <div className="text-right relative">
                  <div className="text-sm font-bold tabular-nums text-green">{euro(g.amount)}</div>
                  <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted)' }}>{pct}%</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Individual transactions */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>Alle transacties</span>
        </div>
        {sorted.map((tx, i) => {
          const cat = CATEGORY_MAP[tx.category]
          return (
            <div
              key={tx.id}
              className="flex items-center gap-3 px-4 py-3"
              style={i < sorted.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <span className="text-base">{cat?.icon ?? '💰'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{tx.note || cat?.label || tx.category}</div>
                <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>{fmtDate(tx.date)}</div>
              </div>
              <span className="text-sm font-bold tabular-nums text-green">+{euro(tx.amount)}</span>
            </div>
          )
        })}
        {sorted.length === 0 && (
          <div className="text-center text-muted py-8 text-sm">Geen inkomen deze maand</div>
        )}
      </div>
    </div>
  )
}
