import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { euro } from '../../utils/formatters'
import { defaultBatchName, sumAmount } from '../../utils/claims'
import { submitClaimBatch } from '../../hooks/useClaims'

/**
 * Bundelt de aangevinkte open declaraties tot één batch die je bij werk
 * indient. Naam en notitie zijn puur voor jezelf (en voor de CSV-bestandsnaam).
 */
export function SubmitClaimSheet({ items, onClose, onSubmitted }) {
  const [name, setName] = useState(defaultBatchName())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const total = sumAmount(items)

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    try {
      const batchId = await submitClaimBatch({ name, note, transactionIds: items.map(t => t.id) })
      onSubmitted?.(batchId)
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Indienen is niet gelukt.')
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Indienen bij werk"
      subtitle={`${items.length} ${items.length === 1 ? 'uitgave' : 'uitgaven'} · ${euro(total)}`}
      bodyClassName="p-4"
      maxHeight="70vh"
    >
      <label className="block">
        <span className="text-xs text-muted">Naam</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className="w-full rounded-lg px-3 py-2 mt-1"
          style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
        />
      </label>

      <label className="block mt-3">
        <span className="text-xs text-muted">Notitie (optioneel)</span>
        <input
          type="text"
          placeholder="Bijv. via Personeelszaken ingediend"
          value={note}
          onChange={e => setNote(e.target.value)}
          className="w-full rounded-lg px-3 py-2 mt-1"
          style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
        />
      </label>

      <p className="text-xs text-muted mt-3">
        De uitgaven krijgen de status Ingediend. Zodra werk betaalt koppel je die
        ene bijschrijving aan deze batch.
      </p>

      {error && <p className="text-xs text-red mt-3">{error}</p>}

      <div className="mt-5 pb-4">
        <button
          onClick={handleSubmit}
          disabled={busy || items.length === 0 || !name.trim()}
          className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
        >
          {busy ? 'Indienen…' : `Indienen · ${euro(total)}`}
        </button>
      </div>
    </Sheet>
  )
}
