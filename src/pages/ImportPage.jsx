import { useCallback, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseABNExport, parseABNExcel } from '../utils/parsers'
import { categorizeWithLearning } from '../utils/categorizer'
import { getExistingKeys, dedupKey } from '../utils/importHelpers'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { recordEvent, bulkRecordEvents } from '../utils/merchantLearning'
import { euro, fmtDate, fmtTimestamp } from '../utils/formatters'
import { useCategories } from '../hooks/useCategories'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CategoryPicker } from '../components/categories/CategoryPicker'
import { Sheet } from '../components/ui/Sheet'
import { amountsMatch, claimStatusOf } from '../utils/claims'
import { closeBatchWithPayout, useSubmittedBatches } from '../hooks/useClaims'
import { db } from '../db/db'

// Velden die alleen in het reviewscherm leven en niet in de database horen.
const REVIEW_ONLY_FIELDS = [
  'merchant', 'confidence', 'confidencePct', 'possiblySterre', 'needsManual',
  'remi', 'source', 'eventCount', 'isRecurring', '_originalCategory',
]

function stripReviewFields(tx) {
  const out = { ...tx }
  for (const field of REVIEW_ONLY_FIELDS) delete out[field]
  return out
}

export function ImportPage() {
  const { catMap, getByRole } = useCategories()
  const [step, setStep] = useState('upload') // upload | review | done
  const [pending, setPending] = useState([])
  const [saved, setSaved] = useState(0)
  const [editIdx, setEditIdx] = useState(null)
  const [error, setError] = useState(null)
  const [payoutIdx, setPayoutIdx] = useState(null)   // rij waarvoor je een batch kiest
  const [payoutHint, setPayoutHint] = useState(null)
  const submittedBatches = useSubmittedBatches()
  const showConfidence = useLiveQuery(() => db.settings.get('showConfidence').then(r => r?.value ?? false), [])
  const userRules = useLiveQuery(() => db.rules.toArray(), [], [])

  // De classificatie loopt async over honderden rijen; stabiele referenties
  // voorkomen dat elke render een nieuwe context maakt en handleFile opnieuw
  // wordt opgebouwd (stale closures tijdens het verwerken van een bestand).
  const byRole = useMemo(() => ({
    uncategorized: getByRole('uncategorized'),
    transfer: getByRole('transfer'),
    income: getByRole('income'),
  }), [getByRole])

  const isActiveKey = useCallback(key => {
    const cat = catMap[key]
    return !!cat && !cat.archived
  }, [catMap])

  // catMap is tijdens het laden leeg; dan zou alles naar de restbak vallen.
  const classifyOptions = useMemo(
    () => ({ isActiveKey: Object.keys(catMap).length ? isActiveKey : undefined, rules: userRules }),
    [catMap, isActiveKey, userRules]
  )

  const handleFile = useCallback(async e => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const isExcel = /\.(xls|xlsx)$/i.test(file.name)
      const parsed = isExcel
        ? await parseABNExcel(file)
        : parseABNExport(await file.text())
      if (parsed.length === 0) {
        setError('Geen transacties gevonden. Controleer of je het juiste ABN AMRO exportbestand hebt geselecteerd.')
        return
      }
      const existingKeys = await getExistingKeys()
      const newOnes = parsed.filter(tx => !existingKeys.has(dedupKey(tx.date, tx.amount, tx.type)))
      if (newOnes.length === 0) {
        setError('Alle transacties staan al in je app.')
        return
      }
      const withCats = await Promise.all(newOnes.map(async tx => {
        const { cat, sub, confidence, confidencePct, possiblySterre, needsManual, source, eventCount, isRecurring } =
          await categorizeWithLearning(tx.merchant, tx.amount, tx.type, tx.remi, byRole, classifyOptions)
        return { ...tx, category: cat, subcategory: sub, confidence, confidencePct, possiblySterre, needsManual, source, eventCount, isRecurring, _originalCategory: cat, note: tx.merchant }
      }))
      setPending(withCats)
      setStep('review')
    } catch (err) {
      setError(`Fout bij lezen bestand: ${err.message}`)
    }
  }, [byRole, classifyOptions])

  async function handleSave() {
    const txs = pending.map(stripReviewFields)
    const ids = await bulkAddTransactions(txs)
    // Learn from all reviewed transactions
    await bulkRecordEvents(pending)

    // Gekoppelde bulkbetalingen: klopt het bedrag precies, dan sluiten we de
    // batch hier meteen af. Wijkt het af, dan blijft hij openstaan en maak je
    // hem op het declaratiescherm af (daar kies je welke zijn afgekeurd).
    let openstaand = 0
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i]
      if (claimStatusOf(tx) !== 'payout' || tx.claimBatchId == null) continue
      const batch = (submittedBatches ?? []).find(b => b.id === tx.claimBatchId)
      if (batch && amountsMatch(tx.amount, batch.expectedTotal)) {
        await closeBatchWithPayout({ batchId: batch.id, transactionId: ids[i] })
      } else {
        openstaand += 1
      }
    }

    setPayoutHint(openstaand
      ? `${openstaand} ${openstaand === 1 ? 'uitbetaling wijkt' : 'uitbetalingen wijken'} af van het verwachte bedrag — rond ze af bij Declaraties.`
      : null)
    setSaved(txs.length)
    setStep('done')
  }

  // 💼 in de review: markeer de rij als declaratie voor werk. claimStatus staat
  // niet in REVIEW_ONLY_FIELDS en gaat dus gewoon mee naar de database.
  function toggleClaim(idx) {
    setPending(p => p.map((t, i) => (
      i === idx ? { ...t, claimStatus: claimStatusOf(t) === 'open' ? null : 'open', claimBatchId: null } : t
    )))
  }

  // 💼 op een bijschrijving: dit is de bulkbetaling van werk voor één batch.
  function choosePayout(idx, batch) {
    setPending(p => p.map((t, i) => (
      i === idx ? { ...t, claimStatus: batch ? 'payout' : null, claimBatchId: batch?.id ?? null } : t
    )))
    setPayoutIdx(null)
  }

  function handleCategoryChange(idx, category, subcategory) {
    const tx = pending[idx]
    const wasCorrection = tx._originalCategory !== category
    setPending(p => p.map((t, i) => i === idx
      ? { ...t, category, subcategory, confidence: 'high', possiblySterre: false, _originalCategory: tx._originalCategory, source: 'learned', eventCount: (tx.eventCount ?? 0) + 1 }
      : t
    ))
    // Learn immediately
    recordEvent(tx.merchant, category, subcategory, tx.amount, tx.type, tx.remi,
      wasCorrection ? { was: true, from: tx._originalCategory } : null
    )
    setEditIdx(null)
  }

  if (step === 'done') {
    return (
      <PageWrapper title="Importeer">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div style={{ filter: 'drop-shadow(0 0 20px rgba(48, 209, 88, 0.4))' }}><span className="text-5xl">✅</span></div>
          <p className="text-lg font-semibold">{saved} transacties opgeslagen!</p>
          {payoutHint && <p className="text-xs text-orange text-center px-8">{payoutHint}</p>}
          <button onClick={() => { setStep('upload'); setPending([]) }}
            className="text-green text-sm">Nog een bestand importeren</button>
        </div>
      </PageWrapper>
    )
  }

  if (step === 'review') {
    return (
      <PageWrapper>
        <div className="safe-top px-4 py-3 flex justify-between items-center" style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>{pending.length} nieuwe transacties</div>
            <div className="text-xs text-muted">Tik een rij voor de categorie · 💼 = declaratie</div>
          </div>
          <button onClick={handleSave} className="btn-accent text-sm rounded-lg px-4 py-2">
            Opslaan
          </button>
        </div>

        <div className="divide-y divide-border">
          {pending.map((tx, idx) => {
            const cat = catMap[tx.category]
            const isLowConf = tx.confidence === 'low' || tx.possiblySterre
            const isClaim = claimStatusOf(tx) === 'open'
            return (
              <div key={idx} className="w-full flex items-center gap-2 px-4 py-3">
                <button
                  onClick={() => setEditIdx(idx)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                >
                  <div className="text-left w-20 shrink-0">
                    <div className="text-xs text-muted">{fmtDate(tx.date)}</div>
                    <div className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-green' : ''}`} style={tx.type !== 'credit' ? { color: 'var(--color-text)' } : {}}>
                      {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${editIdx === idx ? '' : 'truncate'}`}>{tx.merchant}</div>
                    {tx.remi && (
                      <div className={`text-xs text-muted ${editIdx === idx ? '' : 'truncate'}`}>{tx.remi}</div>
                    )}
                    {tx.possiblySterre && (
                      <div className="text-xs text-red">❤️ Sterre?</div>
                    )}
                    {tx.needsManual && (
                      <div className="text-xs text-orange">⚠️ Voeg handmatige transactie toe</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`flex items-center justify-end gap-1 text-xs ${isLowConf ? 'text-orange' : 'text-green'}`}>
                      {isLowConf && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange text-white text-[9px] font-bold leading-none">?</span>
                      )}
                      {cat?.icon} {cat?.label}
                    </div>
                    {tx.subcategory && (
                      <div className="text-[10px] text-muted">
                        {cat?.subs?.find(s => s.key === tx.subcategory)?.label}
                      </div>
                    )}
                    {showConfidence && tx.source === 'recurring' && (
                      <div className="text-[9px] text-green mt-0.5">🔄 Terugkerend · {tx.confidencePct}%</div>
                    )}
                    {showConfidence && tx.source === 'learned' && tx.eventCount > 0 && (
                      <div className={`text-[9px] mt-0.5 ${tx.confidencePct >= 70 ? 'text-blue' : 'text-orange'}`}>🧠 Geleerd ({tx.eventCount}x) · {tx.confidencePct}%</div>
                    )}
                    {showConfidence && tx.source === 'similar' && (
                      <div className="text-[9px] text-orange mt-0.5">🧠 Vergelijkbaar · {tx.confidencePct}%</div>
                    )}
                    {showConfidence && tx.source === 'rules' && (
                      <div className="text-[9px] text-muted mt-0.5">📋 Regel · {tx.confidencePct}%</div>
                    )}
                    {showConfidence && tx.source === 'unknown' && (
                      <div className="text-[9px] text-orange mt-0.5">❓ Onbekend</div>
                    )}
                  </div>
                </button>
                {tx.type === 'credit' && submittedBatches?.length > 0 && (
                  <button
                    onClick={() => setPayoutIdx(idx)}
                    aria-pressed={claimStatusOf(tx) === 'payout'}
                    title="Uitbetaling van een declaratie-batch"
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base"
                    style={claimStatusOf(tx) === 'payout'
                      ? { background: 'var(--color-accent)' }
                      : { background: 'var(--color-surface-2)', opacity: 0.45 }}
                  >
                    💼
                  </button>
                )}
                {tx.type === 'debit' && (
                  <button
                    onClick={() => toggleClaim(idx)}
                    aria-pressed={isClaim}
                    title="Declaratie voor werk"
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base"
                    style={isClaim
                      ? { background: 'var(--color-accent)' }
                      : { background: 'var(--color-surface-2)', opacity: 0.45 }}
                  >
                    💼
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <Sheet
          open={payoutIdx !== null}
          onClose={() => setPayoutIdx(null)}
          title="Uitbetaling van welke batch?"
          subtitle={payoutIdx !== null ? `${euro(pending[payoutIdx].amount)} op ${fmtDate(pending[payoutIdx].date)}` : undefined}
        >
          <div className="divide-y divide-border">
            {(submittedBatches ?? []).map(batch => (
              <button
                key={batch.id}
                onClick={() => choosePayout(payoutIdx, batch)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <span className="text-xl shrink-0">💼</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{batch.name}</div>
                  <div className="text-[11px] text-muted">Ingediend {fmtTimestamp(batch.submittedAt)}</div>
                </div>
                <span className="text-sm font-semibold tabular-nums">{euro(batch.expectedTotal ?? 0)}</span>
              </button>
            ))}
            {payoutIdx !== null && claimStatusOf(pending[payoutIdx]) === 'payout' && (
              <button
                onClick={() => choosePayout(payoutIdx, null)}
                className="w-full px-4 py-3 text-left text-sm text-red"
              >
                Koppeling weghalen
              </button>
            )}
          </div>
        </Sheet>

        <CategoryPicker
          open={editIdx !== null}
          title={editIdx !== null ? pending[editIdx].merchant : 'Kies categorie'}
          subtitle={editIdx !== null ? pending[editIdx].remi : undefined}
          value={editIdx !== null ? pending[editIdx] : undefined}
          onSelect={(cat, sub) => handleCategoryChange(editIdx, cat, sub)}
          onClose={() => setEditIdx(null)}
        />
      </PageWrapper>
    )
  }

  return (
    <PageWrapper title="Importeer">
      <div className="p-4">
        <p className="text-sm text-muted mb-4">
          Exporteer het <strong style={{ color: 'var(--color-text)' }}>Excel-bestand (.xls)</strong> vanuit ABN AMRO internetbankieren en selecteer het hier.
        </p>

        {error && (
          <div className="bg-red/20 border border-red rounded-lg p-3 mb-4 text-sm text-red">
            {error}
          </div>
        )}

        <label className="block card border-2 border-dashed p-8 text-center cursor-pointer">
          <div className="text-4xl mb-3">📤</div>
          <div className="font-medium">Selecteer ABN AMRO exportbestand</div>
          <div className="text-xs text-muted mt-1">.xls, .xlsx of .txt</div>
          <input type="file" accept=".xls,.xlsx,.txt,.csv,.tab,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFile} />
        </label>

      </div>
    </PageWrapper>
  )
}
