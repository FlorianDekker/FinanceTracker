import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, euroParts } from '../../utils/formatters'
import { CATEGORIES, CAT_COLORS } from '../../constants/categories'

export function DetailChart({ year, month }) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`

  const txs = useLiveQuery(
    () => db.transactions.where('date').startsWith(prefix)
      .filter(t => t.type === 'debit' && t.category !== 'bankoverschrijving')
      .toArray(),
    [prefix]
  )

  if (!txs) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  // Build category → subcategory totals
  const catTotals = new Map()
  const subTotals = new Map()
  for (const tx of txs) {
    catTotals.set(tx.category, (catTotals.get(tx.category) ?? 0) + tx.amount)
    const subKey = `${tx.category}|${tx.subcategory || '_none'}`
    subTotals.set(subKey, (subTotals.get(subKey) ?? 0) + tx.amount)
  }

  const expenseCats = CATEGORIES
    .filter(c => c.type === 'expense' && (catTotals.get(c.key) ?? 0) > 0)
    .map(c => ({ ...c, total: catTotals.get(c.key) ?? 0 }))
    .sort((a, b) => b.total - a.total)

  const grandTotal = expenseCats.reduce((s, c) => s + c.total, 0)
  const tp = euroParts(grandTotal)
  const maxTotal = expenseCats[0]?.total ?? 1

  return (
    <div>
      <div className="card p-5 mb-4">
        <div className="text-center mb-1">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Detail overzicht
          </div>
          <div className="tabular-nums tracking-tight leading-none" style={{ color: 'var(--color-text)' }}>
            <span className="text-lg font-bold align-top">€</span>
            <span className="text-4xl font-extrabold">{tp.whole}</span>
            <span className="text-base font-semibold align-top" style={{ opacity: 0.4 }}>{tp.dec}</span>
          </div>
          <div className="text-sm font-bold tabular-nums mt-0.5 text-muted" style={{ opacity: 0.5 }}>
            {expenseCats.length} categorieën
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {expenseCats.map(cat => {
          const color = CAT_COLORS[cat.key] ?? '#8E8E93'
          const catPct = grandTotal > 0 ? Math.round((cat.total / grandTotal) * 100) : 0

          // Get subcategories for this category
          const subs = (cat.subs ?? [])
            .map(s => ({ ...s, amount: subTotals.get(`${cat.key}|${s.key}`) ?? 0 }))
            .filter(s => s.amount > 0)
            .sort((a, b) => b.amount - a.amount)
          const noneAmount = subTotals.get(`${cat.key}|_none`) ?? 0
          if (noneAmount > 0) subs.push({ key: '_none', label: 'Overig', amount: noneAmount })

          return (
            <div key={cat.key} className="card overflow-hidden">
              {/* Category header */}
              <div className="px-4 py-3 flex items-center gap-3 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(catPct, 3)}%`, backgroundColor: color, opacity: 0.1 }} />
                <span className="text-lg relative">{cat.icon}</span>
                <div className="flex-1 min-w-0 relative">
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{cat.label}</div>
                </div>
                <div className="text-right relative">
                  <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(cat.total)}</div>
                  <div className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted)' }}>{catPct}%</div>
                </div>
              </div>

              {/* Subcategories */}
              {subs.length > 1 && (
                <div style={{ borderTop: '1px solid var(--color-border)' }}>
                  {subs.map((s, i) => {
                    const subPct = cat.total > 0 ? (s.amount / cat.total) * 100 : 0
                    return (
                      <div
                        key={s.key}
                        className="flex items-center gap-3 px-4 py-2 pl-12 relative overflow-hidden"
                        style={i < subs.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
                      >
                        <div className="absolute inset-y-0 left-0" style={{ width: `${Math.max(subPct * 0.6, 1)}%`, backgroundColor: color, opacity: 0.05 }} />
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 relative" style={{ backgroundColor: color, opacity: 0.5 }} />
                        <span className="flex-1 text-xs relative" style={{ color: 'var(--color-text-secondary)' }}>{s.label}</span>
                        <div className="text-right relative">
                          <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(s.amount)}</span>
                          <span className="text-[9px] tabular-nums ml-1.5" style={{ color: 'var(--color-muted)' }}>{Math.round(subPct)}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {expenseCats.length === 0 && (
        <div className="text-center text-muted py-12 text-sm">Geen uitgaven deze maand</div>
      )}
    </div>
  )
}
