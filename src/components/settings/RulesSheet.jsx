/* eslint-disable react-refresh/only-export-components -- parseKeywords hoort bij dit scherm */
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from '../ui/Sheet'
import { CategoryPicker } from '../categories/CategoryPicker'
import { useCategories } from '../../hooks/useCategories'
import { db } from '../../db/db'

// "albert heijn, jumbo" -> ['albert heijn', 'jumbo'] (kleine letters, uniek)
export function parseKeywords(text) {
  return [...new Set(
    String(text ?? '')
      .split(',')
      .map(kw => kw.trim().toLowerCase())
      .filter(Boolean)
  )]
}

/**
 * Instellingen -> Herkenningsregels. Eigen regels worden bij het importeren
 * vóór de ingebouwde regels gecontroleerd.
 */
export function RulesSheet({ open, onClose }) {
  const { catMap } = useCategories()
  const rules = useLiveQuery(() => db.rules.orderBy('id').reverse().toArray(), [], [])
  const [keywords, setKeywords] = useState('')
  const [target, setTarget] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState(null)

  const targetCat = target ? catMap[target.category] : null
  const targetSub = targetCat?.subs?.find(s => s.key === target?.subcategory)

  async function addRule() {
    const kws = parseKeywords(keywords)
    if (!kws.length) return setError('Geef minstens één trefwoord op.')
    if (!target?.category) return setError('Kies een categorie.')
    await db.rules.add({
      keywords: kws,
      category: target.category,
      subcategory: target.subcategory || '',
      createdAt: Date.now(),
    })
    setKeywords('')
    setTarget(null)
    setError(null)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Herkenningsregels"
      subtitle="Eigen regels gaan vóór de ingebouwde regels"
      leading={<span className="text-2xl">🔎</span>}
      footer={
        <button onClick={addRule} className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base">
          Regel toevoegen
        </button>
      }
    >
      <div className="px-4 py-4 space-y-3">
        {/* Nieuwe regel */}
        <div className="card p-3 space-y-2">
          <input
            value={keywords}
            onChange={e => { setKeywords(e.target.value); setError(null) }}
            placeholder="Trefwoorden, komma-gescheiden"
            className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ color: 'var(--color-text)' }}
          />
          <button
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center gap-2 bg-surface-2 rounded-xl px-3 py-2.5 text-sm text-left"
          >
            <span className="flex-1">
              {targetCat
                ? `${targetCat.icon} ${targetCat.label}${targetSub ? ` · ${targetSub.label}` : ''}`
                : 'Kies categorie'}
            </span>
            <span className="text-muted">›</span>
          </button>
          {error && <div className="text-xs text-red">{error}</div>}
          <p className="text-[11px] text-muted">
            Een regel matcht als een trefwoord in de naam van de tegenpartij voorkomt (bij bijschrijvingen ook in de omschrijving).
          </p>
        </div>

        {/* Bestaande regels */}
        {rules.length === 0 ? (
          <p className="text-xs text-muted px-1">Je hebt nog geen eigen regels.</p>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {rules.map(rule => {
              const cat = catMap[rule.category]
              const sub = cat?.subs?.find(s => s.key === rule.subcategory)
              return (
                <div key={rule.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{rule.keywords.join(', ')}</div>
                    <div className="text-xs text-muted truncate">
                      → {cat ? `${cat.icon} ${cat.label}` : rule.category}
                      {sub ? ` · ${sub.label}` : ''}
                      {cat?.archived ? ' (gearchiveerd)' : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => db.rules.delete(rule.id)}
                    aria-label="Regel verwijderen"
                    className="shrink-0 w-8 h-8 flex items-center justify-center text-muted"
                  >
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CategoryPicker
        open={pickerOpen}
        value={target ?? undefined}
        onSelect={(category, subcategory) => {
          setTarget({ category, subcategory })
          setError(null)
          setPickerOpen(false)
        }}
        onClose={() => setPickerOpen(false)}
      />
    </Sheet>
  )
}
