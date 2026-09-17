import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { Sheet } from '../ui/Sheet'
import { CategoryPicker } from '../categories/CategoryPicker'
import { CategoryChoiceRow } from './RejectClaimSheet'
import { useRejectSuggestions } from '../../hooks/useRejectSuggestions'
import { euro, fmtDate, fmtTimestamp } from '../../utils/formatters'
import { amountsMatch, claimStatusOf, isPartialClaim, round2, sumAmount } from '../../utils/claims'
import { closeBatchWithPayout, useBatchItems, useSubmittedBatches } from '../../hooks/useClaims'

const DAGEN = 90

function isoDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Koppelt de bulkbetaling van werk aan een ingediende batch en sluit die af.
 *
 * Je komt hier binnen vanaf de batch (dan kies je de bijschrijving) of vanaf een
 * bijschrijving (dan kies je de batch). Klopt het bedrag niet, dan wijs je aan
 * welke declaraties zijn afgekeurd en waar die uitgaven alsnog thuishoren.
 */
export function LinkPayoutSheet({ batch: startBatch = null, transaction: startTx = null, onClose, onDone }) {
  const [batch, setBatch] = useState(startBatch)
  const [tx, setTx] = useState(startTx)
  const [phase, setPhase] = useState('compare')          // compare | reject | categorize
  const [rejectedIds, setRejectedIds] = useState(() => new Set())   // niet betaald (afgekeurd óf later)
  const [deferredIds, setDeferredIds] = useState(() => new Set())   // daarvan: later opnieuw indienen
  const [choices, setChoices] = useState({})             // id -> { category, subcategory }
  const [picking, setPicking] = useState(null)           // id waarvoor de kiezer openstaat
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const batches = useSubmittedBatches()
  const items = useBatchItems(batch?.id ?? null)
  // Voorstellen voor items die nog op Voorschot of in de restbak staan; welke
  // items straks afgekeurd worden weten we hier nog niet, dus we rekenen ze
  // allemaal door (een batch telt een handvol regels).
  const voorstellen = useRejectSuggestions(items ?? [])
  const cutoff = useMemo(() => isoDaysAgo(DAGEN), [])
  const credits = useLiveQuery(
    () => db.transactions.where('date').aboveOrEqual(cutoff).toArray(),
    [cutoff],
    null,
  )

  const expected = round2(batch?.expectedTotal ?? sumAmount(items ?? []))
  const paid = round2(tx?.amount ?? 0)
  const diff = round2(expected - paid)
  const exact = amountsMatch(paid, expected)

  /* ---------------- stap 1: de ontbrekende helft kiezen ---------------- */

  if (!batch) {
    const keuzes = (batches ?? []).sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
    return (
      <Sheet open onClose={onClose} title="Koppel aan declaratie-batch" subtitle={tx ? `${euro(paid)} ontvangen` : undefined}>
        {batches == null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {batches?.length === 0 && (
          <div className="text-center text-muted py-8 text-sm px-6">Er staat geen ingediende batch open.</div>
        )}
        <div className="divide-y divide-border">
          {keuzes.map(b => (
            <button key={b.id} onClick={() => setBatch(b)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="text-xl shrink-0">💼</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{b.name}</div>
                <div className="text-[11px] text-muted">Ingediend {fmtTimestamp(b.submittedAt)}</div>
              </div>
              <span className="text-sm font-semibold tabular-nums">{euro(b.expectedTotal ?? 0)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    )
  }

  if (!tx) {
    // De beste kandidaat bovenaan: de bijschrijving die het dichtst bij het
    // verwachte bedrag ligt, uit de laatste 90 dagen.
    const keuzes = (credits ?? [])
      .filter(c => c.type === 'credit' && (claimStatusOf(c) === null || c.claimBatchId === batch.id))
      .sort((a, b) => Math.abs(a.amount - expected) - Math.abs(b.amount - expected))
    return (
      <Sheet open onClose={onClose} title="Welke bijschrijving is dit?" subtitle={`${batch.name} · ${euro(expected)} verwacht`}>
        {credits == null && <div className="text-center text-muted py-8 text-sm">Laden…</div>}
        {credits != null && keuzes.length === 0 && (
          <div className="text-center text-muted py-8 text-sm px-6">
            Geen bijschrijvingen in de laatste {DAGEN} dagen. Voeg de betaling eerst toe of importeer je afschrift.
          </div>
        )}
        <div className="divide-y divide-border">
          {keuzes.map((c, i) => (
            <button key={c.id} onClick={() => setTx(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="text-xl shrink-0">{amountsMatch(c.amount, expected) ? '🎯' : '💶'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{c.note || 'Bijschrijving'}</div>
                <div className="text-[11px] text-muted">
                  {fmtDate(c.date)}{i === 0 && ' · beste match'}
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-green">+{euro(c.amount)}</span>
            </button>
          ))}
        </div>
      </Sheet>
    )
  }

  /* ---------------- stap 2: bedragen vergelijken ---------------- */

  // "Niet betaald" splitst in twee: afgekeurd (telt weer mee als uitgave) of
  // later (terug naar Open, voor een volgende declaratie). Samen moeten ze het
  // verschil verklaren.
  const unpaid = (items ?? []).filter(t => rejectedIds.has(t.id))
  const deferred = unpaid.filter(t => deferredIds.has(t.id))
  const rejected = unpaid.filter(t => !deferredIds.has(t.id))
  const unpaidTotal = sumAmount(unpaid)
  const rejectedTotal = sumAmount(rejected)
  const deferredTotal = sumAmount(deferred)
  const rest = round2(diff - unpaidTotal)
  const passend = amountsMatch(unpaidTotal, diff)

  // Eigen keuze gaat voor het voorstel, het voorstel voor de huidige categorie.
  // Een deeldeclaratie slaat de categoriekeuze over: die categorie stond er
  // al en verandert niet, alleen de status wordt 'rejected'.
  const rejections = rejected.map(t => {
    if (isPartialClaim(t)) {
      return { tx: t, category: t.category, subcategory: t.subcategory ?? '', isSuggestion: false }
    }
    const keuze = choices[t.id] ?? voorstellen[t.id]
    return {
      tx: t,
      category: keuze?.category ?? t.category,
      subcategory: keuze?.subcategory ?? t.subcategory ?? '',
      isSuggestion: !choices[t.id] && !!voorstellen[t.id]?.isSuggestion,
    }
  })
  const gewijzigd = rejections.filter(r => r.category !== r.tx.category || r.subcategory !== (r.tx.subcategory ?? '')).length

  function noteFor() {
    const regels = []
    if (paid > expected && !exact) regels.push(`${euro(round2(paid - expected))} meer ontvangen dan verwacht`)
    if (!exact && !passend) regels.push(`${euro(Math.abs(rest))} verschil niet toegewezen`)
    if (phase !== 'compare' && deferred.length) {
      regels.push(`${euro(deferredTotal)} (${deferred.length}×) later opnieuw ingediend`)
    }
    return regels.join(' · ')
  }

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      await closeBatchWithPayout({
        batchId: batch.id,
        transactionId: tx.id,
        rejections: phase === 'compare' ? [] : rejections,
        deferred: phase === 'compare' ? [] : deferred,
        note: noteFor(),
      })
      onDone?.()
      onClose()
    } catch (err) {
      setError(err?.message ?? 'Afsluiten is niet gelukt.')
      setBusy(false)
    }
  }

  function toggleRejected(id) {
    setRejectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setDeferred(id, later) {
    setDeferredIds(prev => {
      const next = new Set(prev)
      if (later) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const kop = { title: batch.name, subtitle: `${euro(paid)} ontvangen op ${fmtDate(tx.date)}` }

  if (phase === 'compare') {
    return (
      <Sheet
        open
        onClose={onClose}
        {...kop}
        bodyClassName="p-4"
        footer={
          <div className="pb-1">
            {error && <p className="text-xs text-red mb-2">{error}</p>}
            <button
              onClick={exact || paid > expected ? finish : () => setPhase('reject')}
              disabled={busy}
              className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
            >
              {busy ? 'Afsluiten…' : exact ? 'Afsluiten' : paid > expected ? 'Toch afsluiten' : 'Verder'}
            </button>
          </div>
        }
      >
        <Vergelijking expected={expected} paid={paid} items={items} />
        <p className="text-xs text-muted mt-3">
          {exact
            ? 'Het bedrag klopt precies: alle declaraties worden als uitbetaald gemarkeerd en de bijschrijving telt niet als inkomen.'
            : paid > expected
            ? `Je ontving ${euro(round2(paid - expected))} méér dan verwacht. Controleer of hier nog een oude declaratie bij zat; het verschil komt als notitie op de batch.`
            : `Je ontving ${euro(diff)} minder. In de volgende stap wijs je aan welke declaraties niet betaald zijn — afgekeurd, of pas bij een volgende betaling.`}
        </p>
      </Sheet>
    )
  }

  if (phase === 'reject') {
    return (
      <Sheet
        open
        onClose={onClose}
        title={`${euro(diff)} minder ontvangen`}
        subtitle="Welke zijn niet betaald?"
        bodyClassName="pb-2"
        footer={
          <div className="pb-1">
            <div className="flex justify-between text-xs mb-2">
              <span className="text-muted">geselecteerd</span>
              <span className={`tabular-nums font-semibold ${passend ? 'text-green' : ''}`}>
                {euro(unpaidTotal)} van {euro(diff)}
              </span>
            </div>
            {!passend && unpaid.length > 0 && (
              <p className="text-[11px] text-muted mb-2">
                Er blijft {euro(Math.abs(rest))} over. Sluit je toch af, dan komt dat verschil als notitie op de batch.
              </p>
            )}
            <button
              onClick={() => setPhase('categorize')}
              disabled={unpaid.length === 0}
              className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
            >
              {passend ? 'Verder' : 'Toch afsluiten'}
            </button>
          </div>
        }
      >
        <div className="divide-y divide-border">
          {(items ?? []).map(item => {
            const checked = rejectedIds.has(item.id)
            return (
              <button
                key={item.id}
                onClick={() => toggleRejected(item.id)}
                role="checkbox"
                aria-checked={checked}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <span
                  className="shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[13px] text-white"
                  style={checked ? { background: 'var(--color-red)' } : { border: '1.5px solid var(--color-border)' }}
                >
                  {checked ? '✓' : ''}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">
                    {isPartialClaim(item) && <span className="text-accent">↩ </span>}
                    {item.note || item.category}
                  </div>
                  <div className="text-[11px] text-muted">{fmtDate(item.date)}</div>
                </div>
                <span className="text-sm font-semibold tabular-nums">{euro(item.amount)}</span>
              </button>
            )
          })}
        </div>
      </Sheet>
    )
  }

  /* ---------------- stap 3: waar horen de afgekeurde thuis? ---------------- */
  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title="Wat gebeurt er met de niet-betaalde?"
        subtitle={[
          rejected.length ? `${rejected.length} afgekeurd · ${euro(rejectedTotal)}` : null,
          deferred.length ? `${deferred.length} later · ${euro(deferredTotal)}` : null,
        ].filter(Boolean).join(' · ')}
        bodyClassName="p-4"
        footer={
          <div className="pb-1">
            {error && <p className="text-xs text-red mb-2">{error}</p>}
            <button
              onClick={finish}
              disabled={busy}
              className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
            >
              {busy
                ? 'Afronden…'
                : rejected.length === 0
                ? `Afronden · ${deferred.length} terug naar Open`
                : gewijzigd === 0
                ? 'Afronden · afgekeurde houden hun categorie'
                : `Afronden · ${gewijzigd} gewijzigd`}
            </button>
          </div>
        }
      >
        <p className="text-xs text-muted mb-3">
          <strong>Afgekeurd</strong>: werk vergoedt dit niet, de uitgave telt weer mee in je budget.{' '}
          <strong>Later</strong>: nog niet betaald; gaat terug naar Open zodat je hem opnieuw indient
          en aan een volgende betaling koppelt.
        </p>
        <div className="space-y-3">
          {unpaid.map(t => {
            const later = deferredIds.has(t.id)
            const r = rejections.find(x => x.tx.id === t.id)
            return (
              <div key={t.id}>
                <LaterOfAfgekeurd
                  label={`${t.note || ''} · ${euro(t.amount)}`}
                  later={later}
                  onChange={v => setDeferred(t.id, v)}
                />
                {!later && (
                  isPartialClaim(t) ? (
                    <div
                      className="rounded-lg px-3 py-2 mt-1"
                      style={{ background: 'var(--color-surface-2)', minHeight: 44 }}
                    >
                      <div className="text-sm">↩ Telt weer als gewone uitgave</div>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <CategoryChoiceRow
                        category={r.category}
                        subcategory={r.subcategory}
                        badge={r.isSuggestion ? 'voorstel' : null}
                        onOpen={() => setPicking(t.id)}
                      />
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      </Sheet>

      <CategoryPicker
        open={picking != null}
        value={picking != null ? (choices[picking] ?? voorstellen[picking] ?? rejected.find(t => t.id === picking)) : undefined}
        onSelect={(cat, sub) => {
          setChoices(prev => ({ ...prev, [picking]: { category: cat, subcategory: sub } }))
          setPicking(null)
        }}
        onClose={() => setPicking(null)}
        title="Categorie wijzigen"
      />
    </>
  )
}

/** Per niet-betaald item: afgekeurd (standaard) of later opnieuw indienen. */
function LaterOfAfgekeurd({ label, later, onChange }) {
  const knop = (actief) => ({
    background: actief ? 'var(--color-accent)' : 'transparent',
    color: actief ? 'white' : 'var(--color-muted)',
  })
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0 text-[11px] text-muted truncate">{label}</div>
      <div className="flex rounded-lg overflow-hidden shrink-0 text-xs" style={{ background: 'var(--color-surface-2)' }}>
        <button onClick={() => onChange(false)} className="px-3 py-1.5" style={knop(!later)}>Afgekeurd</button>
        <button onClick={() => onChange(true)} className="px-3 py-1.5" style={knop(later)}>Later</button>
      </div>
    </div>
  )
}

function Vergelijking({ expected, paid, items }) {
  const verschil = round2(expected - paid)
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: 'var(--color-surface-2)' }}>
      <Regel label={`Verwacht (${items?.length ?? 0} declaraties)`} value={euro(expected)} />
      <Regel label="Ontvangen" value={euro(paid)} tone="text-green" />
      <div className="mt-2 pt-2 flex justify-between text-sm font-semibold" style={{ borderTop: '1px solid var(--color-border)' }}>
        <span>Verschil</span>
        <span className={`tabular-nums ${verschil === 0 ? '' : verschil > 0 ? 'text-red' : 'text-orange'}`}>
          {verschil === 0 ? euro(0) : `${verschil > 0 ? '-' : '+'}${euro(Math.abs(verschil))}`}
        </span>
      </div>
    </div>
  )
}

function Regel({ label, value, tone = '' }) {
  return (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${tone}`}>{value}</span>
    </div>
  )
}
