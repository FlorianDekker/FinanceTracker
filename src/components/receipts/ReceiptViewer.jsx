import { useEffect, useMemo, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { euro, fmtDate } from '../../utils/formatters'
import { RECEIPT_GROUPS, groupColor, groupIcon, groupLabel } from '../../utils/receipts/groups'
import {
  MODEL_OPTIONS,
  RECEIPT_STATUS_LABELS,
  extractReceiptById,
  receiptErrorMessage,
  removeReceipt,
  unlinkReceipt,
  updateReceiptItems,
  useReceipt,
} from '../../hooks/useReceipts'
import { db } from '../../db/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { LinkTransactionSheet } from './LinkTransactionSheet'

/* ---------------- kleine bouwstenen ---------------- */

export function ValidationBadge({ receipt }) {
  const v = receipt?.validation
  if (!v || receipt?.total == null) return null
  if (v.ok) {
    return <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: 'var(--color-green-dim, rgba(52,199,89,0.15))', color: 'var(--color-green)' }}>klopt</span>
  }
  const diff = v.diff == null ? null : Math.abs(v.diff)
  return (
    <span className="text-[10px] font-bold rounded-full px-2 py-0.5" style={{ background: 'rgba(255,149,0,0.18)', color: '#FF9500' }}>
      {diff == null ? v.reden ?? 'controleren' : `verschil ${euro(diff)}`}
    </span>
  )
}

export function GroupChip({ group, onClick }) {
  const kleur = groupColor(group)
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0"
      style={{ background: `${kleur}22`, color: kleur }}
    >
      {groupIcon(group)} {groupLabel(group)}
    </button>
  )
}

function GroepKiezer({ open, value, onSelect, onClose, naam }) {
  if (!open) return null
  return (
    <Sheet open onClose={onClose} title="Groep kiezen" subtitle={naam} leading={<span className="text-2xl">🏷️</span>} bodyClassName="p-4">
      <div className="grid grid-cols-2 gap-2">
        {RECEIPT_GROUPS.map(g => (
          <button
            key={g.key}
            onClick={() => onSelect(g.key)}
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm"
            style={{
              background: g.key === value ? `${g.color}22` : 'var(--color-surface-2)',
              boxShadow: g.key === value ? `inset 0 0 0 2px ${g.color}` : 'none',
            }}
          >
            <span className="text-lg">{g.icon}</span>
            <span className="flex-1 truncate">{g.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted mt-3">
        De app onthoudt je keuze voor dit product en gebruikt hem voortaan bij elke bon.
      </p>
    </Sheet>
  )
}

/* ---------------- pagina's bekijken ---------------- */

function Paginas({ pages }) {
  const urls = useMemo(() => (pages ?? []).map(p => URL.createObjectURL(p)), [pages])
  const [zoom, setZoom] = useState(false)
  useEffect(() => () => urls.forEach(URL.revokeObjectURL), [urls])

  if (!urls.length) {
    return (
      <div className="h-40 flex items-center justify-center text-sm text-muted rounded-2xl mx-4" style={{ background: 'var(--color-surface-2)' }}>
        Geen afbeelding bewaard
      </div>
    )
  }
  return (
    <div
      className="flex gap-2 overflow-x-auto px-4 pb-1 snap-x snap-mandatory"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {urls.map((url, i) => (
        <div
          key={url}
          onDoubleClick={() => setZoom(z => !z)}
          className="snap-center shrink-0 overflow-auto rounded-2xl"
          // pinch-zoom laten we aan de browser over; een library is hier niet nodig
          style={{ touchAction: 'pinch-zoom', width: '78%', maxHeight: zoom ? '75vh' : '42vh', background: 'var(--color-surface-2)' }}
        >
          <img
            src={url}
            alt={`Pagina ${i + 1}`}
            className="w-full"
            style={{ width: zoom ? '220%' : '100%', maxWidth: 'none' }}
          />
        </div>
      ))}
    </div>
  )
}

/* ---------------- regel bewerken ---------------- */

function RegelForm({ item, onSave, onCancel }) {
  const [name, setName] = useState(item.name ?? '')
  const [qty, setQty] = useState(String(item.qty ?? 1))
  const [price, setPrice] = useState(item.price == null ? '' : String(item.price).replace('.', ','))

  return (
    <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--color-surface-2)' }}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Productnaam"
        className="w-full rounded-lg px-3 py-2"
        style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
      />
      <div className="flex gap-2">
        <input
          value={qty}
          inputMode="decimal"
          onChange={e => setQty(e.target.value)}
          placeholder="Aantal"
          className="w-20 rounded-lg px-3 py-2"
          style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
        <input
          value={price}
          inputMode="decimal"
          onChange={e => setPrice(e.target.value)}
          placeholder="Bedrag"
          className="flex-1 rounded-lg px-3 py-2"
          style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)' }}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave({
            ...item,
            name,
            qty: Number(String(qty).replace(',', '.')) || 1,
            price: price === '' ? null : Number(String(price).replace(',', '.')),
            unitPrice: null,
          })}
          className="flex-1 btn-accent rounded-xl py-2 text-sm"
        >
          Klaar
        </button>
        <button onClick={onCancel} className="px-4 rounded-xl py-2 text-sm text-muted" style={{ background: 'var(--color-surface)' }}>
          Annuleer
        </button>
      </div>
    </div>
  )
}

/* ---------------- de viewer zelf ---------------- */

/**
 * Volledige weergave van één bon: pagina's, kopregel met validatie, de regels
 * met corrigeerbare groepen, en onderin koppelen / opnieuw uitlezen / verwijderen.
 *
 * Props: receiptId, onClose, onOpenTransaction(tx)?
 */
export function ReceiptViewer({ receiptId, onClose, onOpenTransaction }) {
  const bon = useReceipt(receiptId)
  const tx = useLiveQuery(
    () => (bon?.transactionId == null ? null : db.transactions.get(bon.transactionId).then(t => t ?? null)),
    [bon?.transactionId],
    undefined,
  )
  const [groepVoor, setGroepVoor] = useState(null)     // index van de regel
  const [bewerken, setBewerken] = useState(null)       // index van de regel
  const [linkOpen, setLinkOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [bezig, setBezig] = useState(null)
  const [fout, setFout] = useState(null)

  if (bon === undefined) return null
  if (bon === null) {
    return (
      <Sheet open onClose={onClose} title="Bon" maxHeight="90vh" bodyClassName="p-4">
        <div className="py-10 text-center text-sm text-muted">Deze bon bestaat niet meer.</div>
      </Sheet>
    )
  }

  const items = Array.isArray(bon.items) ? bon.items : []
  const kortingen = Array.isArray(bon.discounts) ? bon.discounts : []

  async function schrijfItems(nieuw) {
    setFout(null)
    try {
      await updateReceiptItems(receiptId, nieuw)
    } catch (err) {
      setFout(receiptErrorMessage(err))
    }
  }

  async function opnieuwUitlezen(model) {
    setModelOpen(false)
    setBezig('uitlezen')
    setFout(null)
    try {
      await extractReceiptById(receiptId, { model })
    } catch (err) {
      setFout(receiptErrorMessage(err))
    }
    setBezig(null)
  }

  async function verwijder() {
    if (!window.confirm('Deze bon verwijderen? De transactie zelf blijft staan.')) return
    await removeReceipt(receiptId)
    onClose?.()
  }

  const kop = [bon.merchant ?? 'Onbekende winkel', bon.date ? fmtDate(bon.date) : null, bon.time]
    .filter(Boolean).join(' · ')

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={bon.merchant ?? 'Bon'}
        subtitle={RECEIPT_STATUS_LABELS[bon.status] ?? bon.status}
        leading={<span className="text-2xl">🧾</span>}
        maxHeight="94vh"
        bodyClassName="pb-4"
      >
        <div className="pt-3 space-y-3">
          <Paginas pages={bon.pages} />

          {/* Kopregel */}
          <div className="mx-4 rounded-2xl px-4 py-3" style={{ background: 'var(--color-surface-2)' }}>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{kop}</div>
                <div className="text-[11px] text-muted">
                  {items.length} {items.length === 1 ? 'regel' : 'regels'}
                  {kortingen.length > 0 && ` · ${kortingen.length} korting${kortingen.length === 1 ? '' : 'en'}`}
                  {bon.model && ` · ${bon.model}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-bold tabular-nums">{bon.total == null ? '—' : euro(bon.total)}</div>
                <ValidationBadge receipt={bon} />
              </div>
            </div>
          </div>

          {bon.error && (
            <div className="mx-4 rounded-xl px-3 py-2.5 text-xs bg-red-dim text-red">{bon.error}</div>
          )}
          {fout && <div className="mx-4 rounded-xl px-3 py-2.5 text-xs bg-red-dim text-red">{fout.message}</div>}

          {/* Regels */}
          <div className="mx-4 card divide-y divide-border overflow-hidden">
            {items.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted">Nog geen regels uitgelezen</div>
            )}
            {items.map((item, i) => (
              <div key={i} className="px-3 py-2.5">
                {bewerken === i ? (
                  <RegelForm
                    item={item}
                    onCancel={() => setBewerken(null)}
                    onSave={nieuw => {
                      const lijst = items.map((x, j) => (j === i ? nieuw : x))
                      setBewerken(null)
                      schrijfItems(lijst)
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <button onClick={() => setBewerken(i)} className="flex-1 min-w-0 text-left">
                      <div className="text-sm truncate">{item.name || '(zonder naam)'}</div>
                      <div className="text-[11px] text-muted">
                        {item.qty > 1 ? `${item.qty} × ${euro(item.unitPrice ?? 0)}` : euro(item.unitPrice ?? item.price ?? 0)}
                      </div>
                    </button>
                    <GroupChip group={item.group} onClick={() => setGroepVoor(i)} />
                    <span className={`text-sm font-semibold tabular-nums shrink-0 ${item.isDiscount ? 'text-green' : ''}`}>
                      {item.price == null ? '—' : euro(item.price)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Kortingen */}
          {kortingen.length > 0 && (
            <div className="mx-4">
              <div className="text-[11px] uppercase tracking-wider text-muted mb-1.5 px-1">Kortingen</div>
              <div className="card divide-y divide-border overflow-hidden">
                {kortingen.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-green font-semibold tabular-nums">−{euro(d.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Acties */}
          <div className="mx-4 space-y-2 pt-1">
            {bon.transactionId != null ? (
              <div className="card overflow-hidden">
                <button
                  onClick={() => tx && onOpenTransaction?.(tx)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <span className="text-xl">🔗</span>
                  <span className="flex-1 text-sm">
                    Gekoppeld aan een transactie
                    <span className="block text-[11px] text-muted">
                      {tx ? `${fmtDate(tx.date)} · ${tx.note || tx.category} · ${euro(tx.amount)}` : 'laden…'}
                    </span>
                  </span>
                  <span className="text-muted">›</span>
                </button>
                <button
                  onClick={() => unlinkReceipt(receiptId)}
                  className="w-full px-4 py-2.5 text-sm text-muted text-left"
                  style={{ borderTop: '1px solid var(--color-border)' }}
                >
                  Ontkoppelen
                </button>
              </div>
            ) : (
              <button onClick={() => setLinkOpen(true)} className="w-full btn-accent rounded-2xl py-3.5 text-base">
                Koppel aan transactie
              </button>
            )}

            <button
              onClick={() => setModelOpen(true)}
              disabled={bezig === 'uitlezen'}
              className="w-full rounded-2xl py-3 text-sm disabled:opacity-50"
              style={{ background: 'var(--color-surface-2)' }}
            >
              {bezig === 'uitlezen' ? 'Bezig met uitlezen…' : 'Opnieuw uitlezen'}
            </button>

            <button onClick={verwijder} className="w-full text-red text-sm bg-red-dim rounded-xl py-2.5">
              Verwijder bon
            </button>
          </div>
        </div>
      </Sheet>

      <GroepKiezer
        open={groepVoor != null}
        naam={groepVoor != null ? items[groepVoor]?.name : ''}
        value={groepVoor != null ? items[groepVoor]?.group : null}
        onClose={() => setGroepVoor(null)}
        onSelect={groep => {
          const i = groepVoor
          setGroepVoor(null)
          schrijfItems(items.map((x, j) => (j === i ? { ...x, group: groep } : x)))
        }}
      />

      {modelOpen && (
        <Sheet open onClose={() => setModelOpen(false)} title="Opnieuw uitlezen" subtitle="Kies een model" bodyClassName="p-4">
          <div className="space-y-2">
            {MODEL_OPTIONS.map(m => (
              <button
                key={m.id}
                onClick={() => opnieuwUitlezen(m.id)}
                className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left"
                style={{ background: 'var(--color-surface-2)' }}
              >
                <span className="text-xl">🤖</span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="block text-[11px] text-muted">{m.hint}</span>
                </span>
                {bon.model === m.id && <span className="text-xs text-muted">huidig</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {linkOpen && (
        <LinkTransactionSheet
          receipt={bon}
          onClose={() => setLinkOpen(false)}
          onLinked={() => setLinkOpen(false)}
        />
      )}
    </>
  )
}
