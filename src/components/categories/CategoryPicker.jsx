import { useState } from 'react'
import { useCategories } from '../../hooks/useCategories'
import { Sheet } from '../ui/Sheet'

/**
 * Gedeelde categoriekiezer in twee niveaus (categorie -> subcategorie).
 *
 * Props:
 *  - open, onClose
 *  - value: { category, subcategory } (optioneel, alleen voor de markering)
 *  - onSelect(categoryKey, subcategoryKey) — sluiten doet de aanroeper
 *  - title, subtitle, filterType ('expense' | 'income' | 'transfer'), excludeKey
 */
export function CategoryPicker({
  open,
  value,
  onSelect,
  onClose,
  title = 'Kies categorie',
  subtitle,
  filterType,
  excludeKey,
}) {
  const { categories, catMap } = useCategories()
  const [parent, setParent] = useState(null)
  const [wasOpen, setWasOpen] = useState(open)

  // Elke keer opnieuw op het bovenste niveau beginnen (reset tijdens render,
  // het aanbevolen patroon voor 'state afleiden van een prop-wissel').
  if (open !== wasOpen) {
    setWasOpen(open)
    setParent(null)
  }

  const selectedKey = value?.category ?? ''
  const selectedSub = value?.subcategory ?? ''

  let list = filterType ? categories.filter(c => c.type === filterType) : categories
  if (excludeKey) list = list.filter(c => c.key !== excludeKey)
  // Een gearchiveerde categorie die nu gekozen is, blijft bovenaan staan —
  // anders zou opslaan de bestaande waarde stilzwijgend wissen.
  const current = catMap[selectedKey]
  if (current?.archived) list = [current, ...list]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={parent ? parent.label : title}
      subtitle={parent ? 'Kies een subcategorie' : subtitle}
      leading={
        parent ? (
          <button
            onClick={() => setParent(null)}
            className="text-sm shrink-0"
            style={{ color: 'var(--color-accent)' }}
          >
            ‹ Terug
          </button>
        ) : null
      }
      maxHeight="75vh"
    >
      {!parent ? (
        <div className="divide-y divide-border">
          {list.map(cat => (
            <button
              key={cat.key}
              onClick={() => {
                if (cat.subs?.length) setParent(cat)
                else onSelect(cat.key, '')
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <CategoryIcon cat={cat} />
              <span className="flex-1 text-sm">
                {cat.label}
                {cat.archived && <span className="text-xs text-muted"> · gearchiveerd</span>}
              </span>
              {cat.key === selectedKey && (
                <span className="text-sm" style={{ color: 'var(--color-accent)' }}>✓</span>
              )}
              {cat.subs?.length > 0 && <span className="text-muted text-sm">›</span>}
            </button>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          <button
            onClick={() => onSelect(parent.key, '')}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <CategoryIcon cat={parent} />
            <span className="flex-1 text-sm text-muted">Geen subcategorie</span>
            {parent.key === selectedKey && !selectedSub && (
              <span className="text-sm" style={{ color: 'var(--color-accent)' }}>✓</span>
            )}
          </button>
          {parent.subs.map(sub => (
            <button
              key={sub.key}
              onClick={() => onSelect(parent.key, sub.key)}
              className="w-full flex items-center gap-3 px-4 py-3 pl-14 text-left"
            >
              <span className="flex-1 text-sm">{sub.label}</span>
              {parent.key === selectedKey && sub.key === selectedSub && (
                <span className="text-sm" style={{ color: 'var(--color-accent)' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}

export function CategoryIcon({ cat, size = 32 }) {
  return (
    <span
      className="shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: `${cat?.color ?? '#8E8E93'}22`,
        boxShadow: `inset 0 0 0 1.5px ${cat?.color ?? '#8E8E93'}`,
        fontSize: size * 0.5,
      }}
    >
      {cat?.icon ?? '📦'}
    </span>
  )
}
