import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { PageWrapper } from '../components/layout/PageWrapper'
import { TransactionForm } from '../components/transactions/TransactionForm'
import { euro, fmtDate } from '../utils/formatters'
import { CATEGORY_MAP, MONTHS } from '../constants/categories'

const now = new Date()

export function TransactionsPage() {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [showAdd, setShowAdd] = useState(false)

  const prefix = `${year}-${String(month).padStart(2, '0')}`
  const txs = useLiveQuery(async () => {
    const all = await db.transactions.where('date').startsWith(prefix).sortBy('date')
    return all.reverse()
  }, [prefix])

  const filtered = (txs ?? []).filter(tx => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (tx.note ?? '').toLowerCase().includes(q) ||
      (tx.category ?? '').toLowerCase().includes(q)
    )
  })

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  return (
    <PageWrapper>
      {/* Month selector */}
      <div className="sticky top-0 z-10 bg-bg px-4 py-2 safe-top border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMonth} className="text-muted px-2 py-1">‹</button>
          <span className="font-medium capitalize">{MONTHS[month - 1]} {year}</span>
          <button onClick={nextMonth} className="text-muted px-2 py-1">›</button>
        </div>
        <input
          type="search"
          placeholder="Zoeken…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface rounded-lg px-3 py-2 text-sm text-white placeholder-muted border border-border"
        />
      </div>

      {/* List */}
      <div className="divide-y divide-border">
        {filtered.length === 0 && (
          <div className="text-center text-muted py-12 text-sm">Geen transacties</div>
        )}
        {filtered.map(tx => {
          const cat = CATEGORY_MAP[tx.category]
          return (
            <button
              key={tx.id}
              onClick={() => setEditing(tx)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface"
            >
              <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💸'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{tx.note || cat?.label || tx.category}</div>
                <div className="text-xs text-muted">{fmtDate(tx.date)} · {cat?.label}</div>
              </div>
              <span className={`text-sm font-semibold shrink-0 ${tx.type === 'credit' ? 'text-green' : 'text-white'}`}>
                {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
              </span>
            </button>
          )
        })}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-green text-white text-2xl flex items-center justify-center shadow-lg z-40"
        style={{ boxShadow: '0 4px 20px rgba(76,175,80,0.4)' }}
      >
        +
      </button>

      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
      {showAdd && <TransactionForm onClose={() => setShowAdd(false)} />}
    </PageWrapper>
  )
}
