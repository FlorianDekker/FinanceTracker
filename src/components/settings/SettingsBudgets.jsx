import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { useCategories, setCategoryBudget } from '../../hooks/useCategories'
import { euro } from '../../utils/formatters'

/**
 * Instellingen -> Budgetten: maandbudget per uitgavencategorie.
 */
export function SettingsBudgets() {
  const { categories } = useCategories()
  const [editingCat, setEditingCat] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const expenseCats = categories.filter(c => c.type === 'expense')

  function startEdit(cat) {
    setEditingCat(cat)
    setInputVal(String(Math.round(cat.budget)))
  }

  async function saveEdit() {
    if (!editingCat) return
    const val = parseFloat(String(inputVal).replace(',', '.'))
    if (!isNaN(val) && val >= 0) await setCategoryBudget(editingCat.key, val)
    setEditingCat(null)
  }

  function adjust(delta) {
    const current = parseFloat(String(inputVal).replace(',', '.')) || 0
    const next = Math.max(0, Math.round(current + delta))
    setInputVal(String(next))
  }

  return (
    <>
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Maandbudget</h2>
        <div className="card divide-y divide-border overflow-hidden">
          {expenseCats.map(cat => (
            <button key={cat.key} onClick={() => startEdit(cat)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="text-xl w-7 text-center">{cat.icon}</span>
              <span className="flex-1 text-sm">{cat.label}</span>
              <span className="text-sm text-muted">{cat.budget > 0 ? euro(cat.budget) : '—'} ›</span>
            </button>
          ))}
        </div>
      </section>
      {editingCat && (
        <BudgetEditSheet
          cat={editingCat}
          inputVal={inputVal}
          setInputVal={setInputVal}
          onSave={saveEdit}
          onAdjust={adjust}
          onClose={() => setEditingCat(null)}
        />
      )}
    </>
  )
}

function BudgetEditSheet({ cat, inputVal, setInputVal, onSave, onAdjust, onClose }) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={cat.label}
      leading={<span className="text-2xl">{cat.icon}</span>}
      footer={
        <button onClick={onSave} className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base">
          Opslaan
        </button>
      }
    >
      <div className="px-6 pt-6 pb-4">
        <div className="text-xs text-muted mb-2 text-center">Maandbudget</div>
        <div className="flex items-center bg-surface-2 rounded-2xl px-4 gap-2" style={{ height: '60px' }}>
          <span className="text-2xl font-light text-muted leading-none">€</span>
          <input
            type="number"
            inputMode="numeric"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && onSave()}
            autoFocus
            className="flex-1 bg-transparent font-bold text-right outline-none tabular-nums h-full"
            style={{ fontSize: '28px', lineHeight: '60px', color: 'var(--color-text)' }}
          />
        </div>
      </div>

      <div className="flex gap-2 px-6 pb-5">
        {[-100, -50, -10, +10, +50, +100].map(d => (
          <button
            key={d}
            onClick={() => onAdjust(d)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${d < 0 ? 'bg-red/15 text-red' : 'bg-green/15 text-green'}`}
          >
            {d > 0 ? `+${d}` : d}
          </button>
        ))}
      </div>
    </Sheet>
  )
}
