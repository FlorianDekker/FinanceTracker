import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { TransactionForm } from './TransactionForm'
import { useCategories } from '../../hooks/useCategories'
import { euro, fmtDate } from '../../utils/formatters'

/**
 * Eén sheet voor "hier zijn de transacties achter dit ding": een dag, een
 * categorie, een maand. Toont kop + lijst en opent per rij het formulier.
 *
 * @param transactions  array, of null/undefined zolang de query loopt
 * @param leading       element links in de kop (meestal het categorie-icoon)
 * @param accent        kopkleur (zie Sheet); zonder dit een gewone witte kop
 * @param showIcon      categorie-icoon per rij
 * @param renderLabel   (tx, cat) => bovenste regel; standaard note of categorie
 * @param renderMeta    (tx, cat) => onderste regel; standaard datum · categorie
 * @param signOf        (tx) => '+' | '-'; standaard op basis van het type
 * @param toneOf        (tx) => 'text-green' | 'text-red'; idem
 */
export function TransactionListSheet({
  open = true,
  onClose,
  title,
  subtitle,
  leading = null,
  accent = null,
  maxHeight = '70vh',
  transactions,
  emptyText = 'Geen transacties',
  showIcon = true,
  renderLabel,
  renderMeta,
  signOf,
  toneOf,
}) {
  const { catMap } = useCategories()
  const [editing, setEditing] = useState(null)

  const label = renderLabel ?? ((tx, cat) => tx.note || cat?.label || tx.category)
  const meta = renderMeta ?? ((tx, cat) => `${fmtDate(tx.date)} · ${cat?.label ?? ''}`)
  const sign = signOf ?? (tx => (tx.type === 'credit' ? '+' : '-'))
  const tone = toneOf ?? (tx => (tx.type === 'credit' ? 'text-green' : 'text-red'))

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={title}
        subtitle={subtitle}
        leading={leading}
        accent={accent}
        maxHeight={maxHeight}
      >
        {transactions == null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {transactions?.length === 0 && <div className="text-center text-muted py-8 text-sm">{emptyText}</div>}
        {transactions?.map(tx => {
          const cat = catMap[tx.category]
          return (
            <button
              key={tx.id}
              onClick={() => setEditing(tx)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              {showIcon && <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💸'}</span>}
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{label(tx, cat)}</div>
                <div className="text-xs text-muted">{meta(tx, cat)}</div>
              </div>
              <span className={`text-sm font-semibold shrink-0 tabular-nums ${tone(tx)}`}>
                {sign(tx)}{euro(tx.amount)}
              </span>
            </button>
          )
        })}
      </Sheet>

      {editing && <TransactionForm existing={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
