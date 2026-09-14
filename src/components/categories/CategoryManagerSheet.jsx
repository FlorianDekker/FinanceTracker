import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { useCategories } from '../../hooks/useCategories'
import { Sheet } from '../ui/Sheet'
import { CategoryIcon } from './CategoryPicker'
import { CategoryEditSheet } from './CategoryEditSheet'

/** Overzicht van alle categorieën: volgorde, bewerken, archief. */
export function CategoryManagerSheet({ open, onClose }) {
  const { categories, allCategories, reorderCategories, restoreCategory, deleteCategory } = useCategories()
  const [editing, setEditing] = useState(null)   // categorie-rij of 'nieuw'
  const [showArchived, setShowArchived] = useState(false)

  const archived = allCategories.filter(c => c.archived)
  const archivedKeys = archived.map(c => c.key).join(',')

  const archivedCounts = useLiveQuery(async () => {
    const out = {}
    for (const key of archivedKeys ? archivedKeys.split(',') : []) {
      out[key] = await db.transactions.where('category').equals(key).count()
    }
    return out
  }, [archivedKeys]) ?? {}

  async function move(key, dir) {
    const active = categories.map(c => c.key)
    const i = active.indexOf(key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= active.length) return
    const next = [...active]
    ;[next[i], next[j]] = [next[j], next[i]]
    // Gearchiveerde categorieën schuiven achteraan; alles in één bulkPut.
    await reorderCategories([...next, ...archived.map(c => c.key)])
  }

  async function handleDelete(cat) {
    if (!window.confirm(`"${cat.label}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return
    try {
      await deleteCategory(cat.key)
    } catch (err) {
      window.alert(err.message)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Categorieën beheren"
      footer={
        <button onClick={() => setEditing('nieuw')} className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base">
          + Nieuwe categorie
        </button>
      }
    >
      <div className="divide-y divide-border">
        {categories.map((cat, i) => (
          <div key={cat.key} className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                onClick={() => move(cat.key, -1)}
                aria-label="Omhoog"
                className="text-[10px] leading-none px-1"
                style={{ color: i === 0 ? 'var(--color-text-dim)' : 'var(--color-muted)' }}
              >▲</button>
              <button
                onClick={() => move(cat.key, 1)}
                aria-label="Omlaag"
                className="text-[10px] leading-none px-1"
                style={{ color: i === categories.length - 1 ? 'var(--color-text-dim)' : 'var(--color-muted)' }}
              >▼</button>
            </div>

            <button onClick={() => setEditing(cat)} className="flex-1 flex items-center gap-3 text-left min-w-0">
              <CategoryIcon cat={cat} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm truncate">{cat.label}</span>
                <span className="block text-xs text-muted">
                  {cat.subs?.length ? `${cat.subs.length} sub${cat.subs.length === 1 ? '' : 's'}` : 'geen subs'}
                  {cat.role && ` · ${ROLE_LABELS[cat.role]}`}
                </span>
              </span>
              {cat.isFixed && (
                <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}>
                  vaste last
                </span>
              )}
              <span className="text-muted text-sm shrink-0">›</span>
            </button>
          </div>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="mt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
          <button onClick={() => setShowArchived(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
            <span className="text-xs text-muted uppercase tracking-wider flex-1">Gearchiveerd ({archived.length})</span>
            <span className="text-muted text-xs">{showArchived ? '▲' : '▼'}</span>
          </button>

          {showArchived && (
            <div className="divide-y divide-border">
              {archived.map(cat => {
                const count = archivedCounts[cat.key]
                return (
                  <div key={cat.key} className="flex items-center gap-3 px-4 py-2.5">
                    <CategoryIcon cat={cat} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate text-muted">{cat.label}</span>
                      <span className="block text-xs text-muted">
                        {count === undefined ? '…' : `${count} transactie${count === 1 ? '' : 's'}`}
                      </span>
                    </span>
                    <button onClick={() => restoreCategory(cat.key)} className="text-xs px-3 py-1.5 rounded-full shrink-0" style={{ background: 'var(--color-surface-2)', color: 'var(--color-accent)' }}>
                      Herstel
                    </button>
                    {count === 0 && (
                      <button onClick={() => handleDelete(cat)} className="text-xs px-3 py-1.5 rounded-full shrink-0 bg-red-dim text-red">
                        Verwijder
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <CategoryEditSheet
        open={editing !== null}
        cat={editing === 'nieuw' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </Sheet>
  )
}

const ROLE_LABELS = {
  uncategorized: 'restbak',
  transfer: 'overboeking',
  income: 'inkomen',
}
