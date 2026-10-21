/* eslint-disable react-refresh/only-export-components -- hook + losse mutators horen bij dit scherm */
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from '../ui/Sheet'
import { db } from '../../db/db'

export const OWN_NAMES_SETTING = 'ownNames'

export function useOwnNames() {
  return useLiveQuery(
    () => db.settings.get(OWN_NAMES_SETTING).then(r => (Array.isArray(r?.value) ? r.value : [])),
    [], [],
  )
}

export async function addOwnName(name) {
  const naam = String(name ?? '').trim()
  if (!naam) return
  const rij = await db.settings.get(OWN_NAMES_SETTING)
  const bestaand = Array.isArray(rij?.value) ? rij.value : []
  if (bestaand.some(n => n.toLowerCase() === naam.toLowerCase())) return
  await db.settings.put({ key: OWN_NAMES_SETTING, value: [...bestaand, naam] })
}

async function removeOwnName(naam) {
  const rij = await db.settings.get(OWN_NAMES_SETTING)
  const bestaand = Array.isArray(rij?.value) ? rij.value : []
  await db.settings.put({ key: OWN_NAMES_SETTING, value: bestaand.filter(n => n !== naam) })
}

/**
 * Instellingen -> Mijn namen: eigen naamvarianten ("F. Dekker") waarmee de
 * import een overboeking tussen je eigen rekeningen herkent — ook als de
 * tegenrekening (nog) niet bekend is bij de app. Zie `src/utils/ownTransfers.js`.
 */
export function OwnNamesSheet({ open, onClose }) {
  const names = useOwnNames()
  const [input, setInput] = useState('')

  async function add() {
    await addOwnName(input)
    setInput('')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mijn namen"
      subtitle="Voor het herkennen van overboekingen naar jezelf"
      leading={<span className="text-2xl">🙋</span>}
      footer={
        <button onClick={add} disabled={!input.trim()} className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base disabled:opacity-40">
          Naam toevoegen
        </button>
      }
    >
      <div className="px-4 py-4 space-y-3">
        <div className="card p-3 space-y-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Bijv. F. Dekker"
            className="w-full bg-surface-2 rounded-xl px-3 py-2.5 text-sm outline-none"
            style={{ color: 'var(--color-text)' }}
          />
          <p className="text-[11px] text-muted">
            Komt deze naam (of het achternaam-deel ervan) voor in een omschrijving — ook als
            "To …" of "Transfer from …" — dan is het een overboeking naar jezelf, geen
            inkomen of uitgave.
          </p>
        </div>

        {names.length === 0 ? (
          <p className="text-xs text-muted px-1">Nog geen namen toegevoegd.</p>
        ) : (
          <div className="card divide-y divide-border overflow-hidden">
            {names.map(naam => (
              <div key={naam} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex-1 text-sm truncate">{naam}</div>
                <button
                  onClick={() => removeOwnName(naam)}
                  aria-label="Naam verwijderen"
                  className="shrink-0 w-8 h-8 flex items-center justify-center text-muted"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
