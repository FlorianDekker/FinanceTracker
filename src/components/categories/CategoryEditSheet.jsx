import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { RULES } from '../../constants/rules'
import { useCategories } from '../../hooks/useCategories'
import { Sheet } from '../ui/Sheet'
import { EmojiPickerLite } from '../ui/EmojiPickerLite'
import { ColorPalette } from '../ui/ColorPalette'
import { CategoryPicker, CategoryIcon } from './CategoryPicker'
import { DEFAULT_CATEGORY_COLOR, DEFAULT_CATEGORY_ICON } from '../../constants/categories'

const TYPES = [
  { value: 'expense', label: 'Uitgave' },
  { value: 'income', label: 'Inkomen' },
  { value: 'transfer', label: 'Overboeking' },
]

const ROLES = [
  { value: null, label: 'Geen' },
  { value: 'uncategorized', label: 'Restbak' },
  { value: 'transfer', label: 'Overboeking' },
  { value: 'income', label: 'Inkomen' },
]

const ROLE_HELP = {
  uncategorized: 'Alles wat de app niet herkent, belandt hier.',
  transfer: 'Telt niet mee als uitgave of inkomen (bijv. sparen).',
  income: 'Bijschrijvingen hier tellen als inkomen, niet als uitgave.',
}

function parseAmount(value) {
  const n = parseFloat(String(value).replace(',', '.'))
  return isNaN(n) || n < 0 ? 0 : n
}

/** Bewerken van één categorie; `cat` leeg betekent "nieuwe categorie". */
export function CategoryEditSheet({ open, cat, onClose }) {
  if (!open) return null
  return <EditBody cat={cat} onClose={onClose} />
}

function EditBody({ cat, onClose }) {
  const { allCategories, addCategory, updateCategory, archiveCategory } = useCategories()
  const isNew = !cat

  const [label, setLabel] = useState(cat?.label ?? '')
  const [icon, setIcon] = useState(cat?.icon ?? DEFAULT_CATEGORY_ICON)
  const [color, setColor] = useState(cat?.color ?? DEFAULT_CATEGORY_COLOR)
  const [type, setType] = useState(cat?.type ?? 'expense')
  const [isFixed, setIsFixed] = useState(cat?.isFixed ?? false)
  const [budget, setBudget] = useState(String(Math.round(cat?.budget ?? 0)))
  const [subs, setSubs] = useState(cat?.subs ?? [])
  const [role, setRole] = useState(cat?.role ?? null)
  const [newSub, setNewSub] = useState('')
  const [error, setError] = useState(null)
  const [archiving, setArchiving] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const txCount = useLiveQuery(
    () => (cat ? db.transactions.where('category').equals(cat.key).count() : Promise.resolve(0)),
    [cat?.key]
  ) ?? 0
  const ruleCount = cat ? RULES.filter(r => r.cat === cat.key).length : 0
  const isRestbak = role === 'uncategorized' && cat?.role === 'uncategorized'

  function pickRole(next) {
    if (next === role) return
    const owner = allCategories.find(c => c.role === next && c.key !== cat?.key)
    if (owner && !window.confirm(`${owner.label} verliest dan de rol "${ROLES.find(r => r.value === next).label}". Doorgaan?`)) return
    if (cat?.role === 'uncategorized') {
      window.alert('Er moet altijd één restbak zijn. Geef die rol eerst aan een andere categorie.')
      return
    }
    setRole(next)
  }

  function adjust(delta) {
    setBudget(String(Math.max(0, Math.round(parseAmount(budget) + delta))))
  }

  function renameSub(index, value) {
    setSubs(list => list.map((s, i) => (i === index ? { ...s, label: value } : s)))
  }

  function removeSub(index) {
    const sub = subs[index]
    if (!window.confirm(`Subcategorie "${sub.label}" verwijderen? Transacties houden hun categorie, maar verliezen deze subcategorie.`)) return
    setSubs(list => list.filter((_, i) => i !== index))
  }

  function appendSub() {
    const name = newSub.trim()
    if (!name) return
    setSubs(list => [...list, { key: '', label: name, uid: `nieuw-${Date.now()}-${list.length}` }])
    setNewSub('')
  }

  async function handleSave() {
    const name = label.trim()
    if (!name) { setError('Geef de categorie een naam'); return }
    const cleanSubs = subs
      .filter(s => s.label.trim())
      .map(s => (s.key ? { key: s.key, label: s.label.trim() } : { label: s.label.trim() }))
    const patch = {
      label: name,
      icon: icon.trim() || DEFAULT_CATEGORY_ICON,
      color,
      type,
      isFixed,
      role,
      subs: cleanSubs,
    }
    // Budget alleen meesturen bij uitgaven; anders blijft een bestaand
    // bedrag gewoon staan voor als het type later terugdraait.
    if (type === 'expense') patch.budget = parseAmount(budget)
    try {
      if (isNew) await addCategory(patch)
      else await updateCategory(cat.key, patch)
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  async function archiveOnly() {
    try {
      await archiveCategory(cat.key)
      setArchiving(false)
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  async function moveAndArchive(targetKey) {
    await db.transactions.where('category').equals(cat.key).modify(t => {
      t.category = targetKey
      t.subcategory = ''
    })
    setMoveOpen(false)
    await archiveOnly()
  }

  function startArchive() {
    if (txCount === 0) {
      if (!window.confirm(`"${label}" archiveren? Hij verdwijnt uit de kiezers en budgetten.`)) return
      archiveOnly()
      return
    }
    setArchiving(true)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Nieuwe categorie' : label || cat.label}
      leading={<CategoryIcon cat={{ icon, color }} />}
      footer={
        <button onClick={handleSave} className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base">
          {isNew ? 'Toevoegen' : 'Opslaan'}
        </button>
      }
    >
      <div className="px-4 py-4 space-y-6">
        {error && (
          <div className="rounded-xl px-3 py-2 text-sm bg-red/20 text-red border border-red">{error}</div>
        )}

        {/* Naam */}
        <label className="block">
          <span className="text-xs text-muted uppercase tracking-wider">Naam</span>
          <input
            type="text"
            value={label}
            onChange={e => { setLabel(e.target.value); setError(null) }}
            placeholder="Bijv. Huisdieren"
            className="w-full rounded-lg px-3 py-2 mt-1.5"
            style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          />
        </label>

        {/* Emoji */}
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Icoon</div>
          <EmojiPickerLite value={icon} onChange={setIcon} />
        </div>

        {/* Kleur */}
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Kleur</div>
          <ColorPalette value={color} onChange={setColor} />
        </div>

        {/* Type */}
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Type</div>
          <div className="flex bg-surface-2 rounded-full p-0.5">
            {TYPES.map(t => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${type === t.value ? 'btn-accent' : 'text-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Vaste last */}
        <button onClick={() => setIsFixed(v => !v)} className="w-full flex items-center gap-3 text-left">
          <div className="flex-1">
            <div className="text-sm">Vaste last</div>
            <div className="text-xs text-muted">Telt niet mee in het dagtempo</div>
          </div>
          <div className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${isFixed ? 'bg-green' : ''}`} style={!isFixed ? { background: 'var(--color-surface-2)' } : {}}>
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isFixed ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </div>
        </button>

        {/* Budget */}
        {type === 'expense' && (
          <div>
            <div className="text-xs text-muted uppercase tracking-wider mb-2">Maandbudget</div>
            <div className="flex items-center bg-surface-2 rounded-2xl px-4 gap-2" style={{ height: '52px' }}>
              <span className="text-xl font-light text-muted leading-none">€</span>
              <input
                type="number"
                inputMode="numeric"
                value={budget}
                onChange={e => setBudget(e.target.value)}
                className="flex-1 bg-transparent font-bold text-right outline-none tabular-nums h-full"
                style={{ fontSize: '24px', color: 'var(--color-text)' }}
              />
            </div>
            <div className="flex gap-2 mt-2">
              {[-100, -50, -10, +10, +50, +100].map(d => (
                <button
                  key={d}
                  onClick={() => adjust(d)}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold ${d < 0 ? 'bg-red/15 text-red' : 'bg-green/15 text-green'}`}
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subcategorieën */}
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Subcategorieën</div>
          <div className="space-y-2">
            {subs.map((sub, i) => (
              <div key={sub.key || sub.uid} className="flex items-center gap-2">
                <input
                  type="text"
                  value={sub.label}
                  onChange={e => renameSub(i, e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2"
                  style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                />
                <button onClick={() => removeSub(i)} className="w-9 h-9 rounded-lg text-red shrink-0" style={{ background: 'var(--color-surface-2)' }}>✕</button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newSub}
                onChange={e => setNewSub(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && appendSub()}
                placeholder="Nieuwe subcategorie"
                className="flex-1 rounded-lg px-3 py-2"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              />
              <button onClick={appendSub} className="w-9 h-9 rounded-lg shrink-0" style={{ background: 'var(--color-surface-2)', color: 'var(--color-accent)' }}>+</button>
            </div>
          </div>
        </div>

        {/* Systeemrol */}
        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Systeemrol</div>
          <div className="flex gap-1.5">
            {ROLES.map(r => (
              <button
                key={r.label}
                onClick={() => pickRole(r.value)}
                className={`flex-1 py-1.5 rounded-full text-[11px] font-medium ${role === r.value ? 'btn-accent' : 'text-muted'}`}
                style={role === r.value ? undefined : { background: 'var(--color-surface-2)' }}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted mt-2">
            {role ? ROLE_HELP[role] : 'Een gewone categorie zonder speciale betekenis voor de app.'}
          </div>
        </div>

        {/* Archiveren */}
        {!isNew && (
          <div className="pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            {isRestbak ? (
              <div className="text-xs text-muted pt-3">
                De restbak kan niet gearchiveerd worden: onbekende transacties moeten ergens terecht kunnen.
                Geef de rol eerst aan een andere categorie.
              </div>
            ) : (
              <button onClick={startArchive} className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5 mt-3">
                Archiveren
              </button>
            )}
            <div className="text-xs text-muted mt-2 text-center">
              {txCount} transactie{txCount === 1 ? '' : 's'} in deze categorie
            </div>
          </div>
        )}
      </div>

      {/* Archiveren met transacties */}
      <Sheet open={archiving} onClose={() => setArchiving(false)} title={`${label} archiveren`}>
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-muted">
            Er {txCount === 1 ? 'is' : 'zijn'} nog {txCount} transactie{txCount === 1 ? '' : 's'} in deze categorie.
          </p>
          {ruleCount > 0 && (
            <p className="text-xs text-orange">
              Let op: {ruleCount} ingebouwde herkenningsregel{ruleCount === 1 ? '' : 's'} wijst nog naar deze categorie.
              Nieuwe imports die daarop matchen komen in de restbak terecht.
            </p>
          )}
          <button onClick={() => setMoveOpen(true)} className="w-full btn-accent rounded-2xl py-3 text-sm">
            Verplaats {txCount} transactie{txCount === 1 ? '' : 's'} naar…
          </button>
          <button onClick={archiveOnly} className="w-full rounded-2xl py-3 text-sm" style={{ background: 'var(--color-surface-2)' }}>
            Archiveer, laat transacties staan
          </button>
          <button onClick={() => setArchiving(false)} className="w-full py-2 text-sm text-muted">Annuleren</button>
        </div>

        <CategoryPicker
          open={moveOpen}
          title="Verplaats naar"
          excludeKey={cat?.key}
          onSelect={target => moveAndArchive(target)}
          onClose={() => setMoveOpen(false)}
        />
      </Sheet>
    </Sheet>
  )
}
