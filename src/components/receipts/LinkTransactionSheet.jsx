import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { euro, fmtDate } from '../../utils/formatters'
import { useCategories } from '../../hooks/useCategories'
import { findCandidates, linkToTransaction, transactionsAround } from '../../hooks/useReceipts'
// Lui geladen: TransactionForm toont zelf weer een bon-rij die de ReceiptViewer
// opent, en die opent dit blad. Een dynamische import knipt die kringloop door.
const TransactionForm = lazy(() => import('../transactions/TransactionForm').then(m => ({ default: m.TransactionForm })))

function Rij({ tx, extra, cat, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left disabled:opacity-50"
    >
      <span className="text-lg w-6 text-center shrink-0">{cat?.icon ?? '💸'}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate">{tx.note || cat?.label || tx.category}</span>
        <span className="block text-[11px] text-muted truncate">{fmtDate(tx.date)}{extra ? ` · ${extra}` : ''}</span>
      </span>
      <span className="text-sm font-semibold tabular-nums shrink-0">{euro(tx.amount)}</span>
    </button>
  )
}

function afstandTekst(k) {
  const dagen = k.dayDiff === 0 ? 'zelfde dag' : k.dayDiff === 1 ? '1 dag ernaast' : `${k.dayDiff} dagen ernaast`
  const bedrag = k.amountDiff < 0.005 ? 'bedrag klopt' : `Δ ${euro(k.amountDiff)}`
  return `${dagen} · ${bedrag}`
}

/**
 * Kiest de banktransactie die bij deze bon hoort.
 *
 * Eerst de kandidaten binnen ±3 dagen (gesorteerd op bedragverschil), daarna
 * zoeken over ±30 dagen, en als de uitgave er niet tussen staat: een nieuwe
 * transactie aanmaken die alvast is ingevuld met het bontotaal.
 *
 * Props: receipt, onClose, onLinked(transactionId)?
 */
export function LinkTransactionSheet({ receipt, onClose, onLinked }) {
  const { catMap } = useCategories()
  const [kandidaten, setKandidaten] = useState(null)
  const [ruim, setRuim] = useState([])
  const [zoekOpen, setZoekOpen] = useState(false)
  const [zoek, setZoek] = useState('')
  const [nieuwOpen, setNieuwOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  useEffect(() => {
    let levend = true
    findCandidates(receipt, { days: 3 }).then(k => { if (levend) setKandidaten(k) })
    transactionsAround(receipt?.date, 30).then(t => {
      if (levend) setRuim(t.filter(x => x.type === 'debit' && (x.receiptId == null || x.receiptId === receipt?.id)).sort((a, b) => String(b.date).localeCompare(String(a.date))))
    })
    return () => { levend = false }
  }, [receipt])

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const lijst = q
      ? ruim.filter(t => (t.note ?? '').toLowerCase().includes(q) || (catMap[t.category]?.label ?? '').toLowerCase().includes(q) || String(t.amount).includes(q))
      : ruim
    return lijst.slice(0, 60)
  }, [ruim, zoek, catMap])

  async function koppel(transactionId) {
    setBezig(true)
    setFout(null)
    try {
      await linkToTransaction(receipt.id, transactionId)
      onLinked?.(transactionId)
      onClose?.()
    } catch (err) {
      setFout(err.message)
      setBezig(false)
    }
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title="Koppel aan transactie"
        subtitle={receipt?.total != null ? `${receipt.merchant ?? 'Bon'} · ${euro(receipt.total)} · ${receipt.date ? fmtDate(receipt.date) : 'geen datum'}` : undefined}
        leading={<span className="text-2xl">🔗</span>}
        maxHeight="90vh"
        bodyClassName="p-4"
      >
        {fout && <div className="rounded-xl px-3 py-2.5 text-xs bg-red-dim text-red mb-3">{fout}</div>}

        <div className="text-[11px] uppercase tracking-wider text-muted mb-1.5 px-1">
          Kandidaten binnen 3 dagen
        </div>
        <div className="card divide-y divide-border overflow-hidden">
          {kandidaten === null && <div className="px-3 py-4 text-sm text-muted">Zoeken…</div>}
          {kandidaten?.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted">
              Geen uitgave gevonden rond {receipt?.date ? fmtDate(receipt.date) : 'deze datum'}.
            </div>
          )}
          {(kandidaten ?? []).map(k => (
            <Rij key={k.id} tx={k} extra={afstandTekst(k)} cat={catMap[k.category]} disabled={bezig} onClick={() => koppel(k.id)} />
          ))}
        </div>

        <div className="mt-3 space-y-2">
          <button
            onClick={() => setZoekOpen(o => !o)}
            className="w-full rounded-2xl py-3 text-sm text-left px-4"
            style={{ background: 'var(--color-surface-2)' }}
          >
            🔎 Andere transactie kiezen…
            <span className="block text-[11px] text-muted">Alle uitgaven van 30 dagen rond de bon</span>
          </button>

          {zoekOpen && (
            <>
              <input
                type="search"
                value={zoek}
                onChange={e => setZoek(e.target.value)}
                placeholder="Zoek op omschrijving of bedrag…"
                className="w-full rounded-xl px-3 py-2"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              />
              <div className="card divide-y divide-border overflow-hidden">
                {gefilterd.length === 0 && <div className="px-3 py-4 text-sm text-muted">Niets gevonden.</div>}
                {gefilterd.map(tx => (
                  <Rij key={tx.id} tx={tx} cat={catMap[tx.category]} disabled={bezig} onClick={() => koppel(tx.id)} />
                ))}
              </div>
            </>
          )}

          <button
            onClick={() => setNieuwOpen(true)}
            className="w-full rounded-2xl py-3 text-sm text-left px-4"
            style={{ background: 'var(--color-surface-2)' }}
          >
            ➕ Nieuwe transactie aanmaken
            <span className="block text-[11px] text-muted">Bijvoorbeeld contant betaald of bij een andere rekening</span>
          </button>
        </div>
      </Sheet>

      {nieuwOpen && (
        <Suspense fallback={null}>
          <TransactionForm
            prefill={{
              date: receipt?.date ?? undefined,
              amount: receipt?.total ?? undefined,
              type: 'debit',
              note: receipt?.merchant ?? '',
            }}
            onSaved={id => koppel(id)}
            onClose={() => setNieuwOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
