import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { useCategories } from '../../hooks/useCategories'
import { CategoryManagerSheet } from '../categories/CategoryManagerSheet'
import { RulesSheet } from './RulesSheet'
import { OwnNamesSheet, useOwnNames } from './OwnNamesSheet'

/**
 * Instellingen -> Categorieën: beheren (naam, icoon, kleur, volgorde),
 * herkenningsregels en eigen namen die bij het importeren voorgaan.
 */
export function SettingsCategories() {
  const { categories } = useCategories()
  const rulesCount = useLiveQuery(() => db.rules.count(), [])
  const ownNames = useOwnNames()
  const [managerOpen, setManagerOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [namesOpen, setNamesOpen] = useState(false)

  return (
    <>
      <section className="px-4 pt-4 pb-2">
        <div className="card overflow-hidden">
          <button onClick={() => setManagerOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <span className="text-xl">🗂️</span>
            <div className="flex-1">
              <div className="text-sm">Categorieën beheren</div>
              <div className="text-xs text-muted">Naam, icoon, kleur, subcategorieën en volgorde</div>
            </div>
            <span className="text-sm text-muted">{categories.length} ›</span>
          </button>

          <button onClick={() => setRulesOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="text-xl">🔎</span>
            <div className="flex-1">
              <div className="text-sm">Herkenningsregels</div>
              <div className="text-xs text-muted">Eigen trefwoorden die bij het importeren voorgaan</div>
            </div>
            <span className="text-sm text-muted">{rulesCount ?? '…'} ›</span>
          </button>

          <button onClick={() => setNamesOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="text-xl">🙋</span>
            <div className="flex-1">
              <div className="text-sm">Mijn namen</div>
              <div className="text-xs text-muted">Voor het herkennen van overboekingen naar jezelf</div>
            </div>
            <span className="text-sm text-muted">{ownNames.length} ›</span>
          </button>
        </div>
      </section>

      <CategoryManagerSheet open={managerOpen} onClose={() => setManagerOpen(false)} />
      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <OwnNamesSheet open={namesOpen} onClose={() => setNamesOpen(false)} />
    </>
  )
}
