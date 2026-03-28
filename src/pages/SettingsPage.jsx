import { useState } from 'react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { useCategories, setCategoryBudget } from '../hooks/useCategories'
import { exportToCsv } from '../utils/importHelpers'
import { euro } from '../utils/formatters'
import { EXPENSE_CATEGORIES } from '../constants/categories'
import { db } from '../db/db'

export function SettingsPage() {
  const categories = useCategories()
  const [editing, setEditing] = useState(null)
  const [inputVal, setInputVal] = useState('')

  function startEdit(cat) {
    setEditing(cat.key)
    setInputVal(String(cat.budget).replace('.', ','))
  }

  async function saveEdit() {
    if (!editing) return
    const val = parseFloat(String(inputVal).replace(',', '.'))
    if (!isNaN(val)) await setCategoryBudget(editing, val)
    setEditing(null)
  }

  async function handleExport() {
    const csv = await exportToCsv()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleClearData() {
    if (!window.confirm('Weet je zeker dat je ALLE transacties wil verwijderen? Dit kan niet ongedaan worden gemaakt.')) return
    await db.transactions.clear()
  }

  const expenseCats = categories.filter(c => c.type === 'expense')

  return (
    <PageWrapper title="Instellingen">
      {/* Budget per category */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Maandbudget</h2>
        <div className="bg-surface rounded-xl divide-y divide-border overflow-hidden">
          {expenseCats.map(cat => (
            <div key={cat.key} className="flex items-center gap-3 px-4 py-3">
              <span className="text-xl w-7 text-center">{cat.icon}</span>
              <span className="flex-1 text-sm">{cat.label}</span>
              {editing === cat.key ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted text-sm">€</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onBlur={saveEdit}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                    autoFocus
                    className="w-20 bg-border rounded px-2 py-1 text-sm text-white text-right"
                  />
                </div>
              ) : (
                <button
                  onClick={() => startEdit(cat)}
                  className="text-sm text-muted"
                >
                  {cat.budget > 0 ? euro(cat.budget) : '—'} ›
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Data */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Data</h2>
        <div className="bg-surface rounded-xl divide-y divide-border overflow-hidden">
          <button
            onClick={handleExport}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <span className="text-xl">📥</span>
            <span className="text-sm">Exporteer transacties als CSV</span>
          </button>
          <button
            onClick={handleClearData}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-red"
          >
            <span className="text-xl">🗑️</span>
            <span className="text-sm">Wis alle transacties</span>
          </button>
        </div>
      </section>

      {/* App info */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Over</h2>
        <div className="bg-surface rounded-xl px-4 py-3 text-sm text-muted space-y-1">
          <div>Versie 1.0.0</div>
          <div>Gegevens opgeslagen op dit apparaat</div>
        </div>
      </section>
    </PageWrapper>
  )
}
