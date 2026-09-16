import { useState } from 'react'
import { useCategories } from '../../hooks/useCategories'
import { Sheet } from '../ui/Sheet'
import { CategoryEditSheet } from './CategoryEditSheet'

/**
 * Gedeelde categoriekiezer in twee niveaus (categorie -> subcategorie).
 *
 * Props:
 *  - open, onClose
 *  - value: { category, subcategory } (optioneel, alleen voor de markering)
 *  - onSelect(categoryKey, subcategoryKey) — sluiten doet de aanroeper
 *  - title, subtitle, filterType ('expense' | 'income' | 'transfer'), excludeKey
 *  - allowCreate: toon "+ nieuwe (sub)categorie" (standaard true; uitzetten
 *    voor de "verplaats naar"-kiezer binnen CategoryEditSheet zelf)
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
  allowCreate = true,
}) {
  const { categories, catMap, addSub } = useCategories()
  // Alleen de key bewaren, niet het hele object: na addSub is een bewaard
  // object verouderd (de nieuwe sub staat er nog niet in). `parent` leiden
  // we hieronder bij elke render af uit de actuele catMap.
  const [parentKey, setParentKey] = useState(null)
  const [wasOpen, setWasOpen] = useState(open)
  const [creating, setCreating] = useState(false)
  const [addingSub, setAddingSub] = useState(false)
  const [subName, setSubName] = useState('')
  const [subError, setSubError] = useState(null)

  // Elke keer opnieuw op het bovenste niveau beginnen (reset tijdens render,
  // het aanbevolen patroon voor 'state afleiden van een prop-wissel').
  if (open !== wasOpen) {
    setWasOpen(open)
    setParentKey(null)
    setCreating(false)
    setAddingSub(false)
    setSubName('')
    setSubError(null)
  }

  const parent = parentKey ? catMap[parentKey] : null
  const selectedKey = value?.category ?? ''
  const selectedSub = value?.subcategory ?? ''

  let list = filterType ? categories.filter(c => c.type === filterType) : categories
  if (excludeKey) list = list.filter(c => c.key !== excludeKey)
  // Een gearchiveerde categorie die nu gekozen is, blijft bovenaan staan —
  // anders zou opslaan de bestaande waarde stilzwijgend wissen.
  const current = catMap[selectedKey]
  if (current?.archived) list = [current, ...list]

  function goBack() {
    setParentKey(null)
    cancelSub()
  }

  function cancelSub() {
    setAddingSub(false)
    setSubName('')
    setSubError(null)
  }

  async function saveSub() {
    const name = subName.trim()
    if (!name) { cancelSub(); return }
    try {
      const subKey = await addSub(parent.key, name)
      cancelSub()
      onSelect(parent.key, subKey)
    } catch (err) {
      setSubError(err.message)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={parent ? parent.label : title}
      subtitle={parent ? 'Kies een subcategorie' : subtitle}
      leading={
        parent ? (
          <button
            onClick={goBack}
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
            <div key={cat.key} className="flex items-center">
              <button
                onClick={() => {
                  if (cat.subs?.length) setParentKey(cat.key)
                  else onSelect(cat.key, '')
                }}
                className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left"
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
              {/* Zonder subs selecteert een tik direct; via dit pijltje kom je
                  toch op het subniveau om er een eerste sub aan te maken. */}
              {allowCreate && !cat.subs?.length && (
                <button
                  onClick={() => setParentKey(cat.key)}
                  aria-label={`Subcategorie toevoegen aan ${cat.label}`}
                  className="px-4 py-3 text-muted text-sm shrink-0"
                >
                  ›
                </button>
              )}
            </div>
          ))}
          {allowCreate && (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ color: 'var(--color-accent)' }}
            >
              <span className="flex-1 text-sm">+ Nieuwe categorie</span>
            </button>
          )}
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
          {allowCreate && (
            addingSub ? (
              <div className="w-full flex flex-wrap items-center gap-2 px-4 py-2 pl-14">
                <input
                  autoFocus
                  type="text"
                  value={subName}
                  onChange={e => setSubName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveSub()
                    if (e.key === 'Escape') cancelSub()
                  }}
                  placeholder="Naam subcategorie"
                  className="flex-1 rounded-lg px-3 py-1.5"
                  style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                />
                <button onClick={saveSub} className="text-sm shrink-0" style={{ color: 'var(--color-accent)' }}>
                  Opslaan
                </button>
                {subError && <div className="text-xs text-red basis-full pl-2">{subError}</div>}
              </div>
            ) : (
              <button
                onClick={() => setAddingSub(true)}
                className="w-full flex items-center gap-3 px-4 py-3 pl-14 text-left"
                style={{ color: 'var(--color-accent)' }}
              >
                <span className="flex-1 text-sm">+ Nieuwe subcategorie</span>
              </button>
            )
          )}
        </div>
      )}

      <CategoryEditSheet
        open={creating}
        cat={null}
        defaultType={filterType}
        onClose={() => setCreating(false)}
        onCreated={key => {
          setCreating(false)
          onSelect(key, '')
        }}
      />
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
