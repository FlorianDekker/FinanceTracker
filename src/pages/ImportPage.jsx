import { useCallback, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseBankFile, parseGenericCsv, BANK_LABELS } from '../utils/parsers'
import { categorizeWithLearning, SALARY_THRESHOLD } from '../utils/categorizer'
import { getExistingKeys, dedupKey } from '../utils/importHelpers'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { recordEvent, bulkRecordEvents } from '../utils/merchantLearning'
import { euro, fmtDate, fmtTimestamp } from '../utils/formatters'
import { useCategories } from '../hooks/useCategories'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CategoryPicker } from '../components/categories/CategoryPicker'
import { Sheet } from '../components/ui/Sheet'
import { SwipeToSkipRow } from '../components/ui/SwipeToSkipRow'
import { ColumnMapperSheet } from '../components/import/ColumnMapperSheet'
import { headerSignature, getMapping, saveMapping } from '../utils/csvMappings'
import { amountsMatch, claimStatusOf } from '../utils/claims'
import { closeBatchWithPayout, useSubmittedBatches } from '../hooks/useClaims'
import { db } from '../db/db'
import { takeFile } from '../utils/fileInput'

// Velden die alleen in het reviewscherm leven en niet in de database horen.
// `balance` en `account` horen er juist wel in: daar bouwen we later de
// saldo-grafiek en het filter per rekening op.
const REVIEW_ONLY_FIELDS = [
  'merchant', 'confidence', 'confidencePct', 'needsManual',
  'remi', 'source', 'eventCount', 'isRecurring', '_originalCategory',
  'raw', 'counterparty', '_rid',
]

// Eén of twee regels per bank; bewust kort, de rest doet de kolommapper.
const EXPORT_HINTS = [
  { bank: 'ABN AMRO', hoe: 'Internetbankieren → Zelf regelen → Transacties downloaden. Kies Excel (.xls) of TXT/TAB.' },
  { bank: 'ING', hoe: 'Mijn ING → Overzichten → Downloaden. Kies CSV (puntkomma).' },
  { bank: 'Rabobank', hoe: 'Rabo Internetbankieren → Betalen & sparen → Transacties downloaden → CSV (kommagescheiden, nieuw formaat).' },
  { bank: 'bunq', hoe: 'App → rekening → Statements/Afschriften → CSV over de gewenste periode.' },
  { bank: 'Revolut', hoe: 'App → Meer → Afschriften → Excel/CSV, taal Engels.' },
  { bank: 'N26', hoe: 'Web-app → Transacties → Download → CSV.' },
]

const bankLabel = bank => (bank === 'custom' ? 'Eigen indeling' : (BANK_LABELS[bank] ?? 'Onbekend formaat'))

function stripReviewFields(tx) {
  const out = { ...tx }
  for (const field of REVIEW_ONLY_FIELDS) delete out[field]
  return out
}

export function ImportPage() {
  const { catMap, getByRole } = useCategories()
  const [step, setStep] = useState('upload') // upload | review | done
  const [pending, setPending] = useState([])
  // Stack van rijen die met een veeg-naar-links zijn overgeslagen (niet
  // opgeslagen); "Herstel" pakt de laatste terug op zijn oude plek.
  const [skipped, setSkipped] = useState([])
  const [saved, setSaved] = useState(0)
  const [editIdx, setEditIdx] = useState(null)
  const [error, setError] = useState(null)
  const [payoutIdx, setPayoutIdx] = useState(null)   // rij waarvoor je een batch kiest
  const [payoutHint, setPayoutHint] = useState(null)
  const [bron, setBron] = useState(null)     // { bank, warnings, count, skipped, note }
  const [mapper, setMapper] = useState(null) // openstaande kolommapper
  const [helpOpen, setHelpOpen] = useState(false)
  const submittedBatches = useSubmittedBatches()
  const showConfidence = useLiveQuery(() => db.settings.get('showConfidence').then(r => r?.value ?? false), [])
  const userRules = useLiveQuery(() => db.rules.toArray(), [], [])
  const csvMappings = useLiveQuery(() => db.settings.get('csvMappings').then(r => r?.value ?? {}), [], {})
  const salaryThreshold = useLiveQuery(
    () => db.settings.get('salaryThreshold').then(r => Number(r?.value) || SALARY_THRESHOLD), [], SALARY_THRESHOLD)

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
    () => ({ isActiveKey: Object.keys(catMap).length ? isActiveKey : undefined, rules: userRules, salaryThreshold }),
    [catMap, isActiveKey, userRules, salaryThreshold]
  )

  // Dedup, categoriseer en toon het reviewscherm. `info` beschrijft waar de
  // rijen vandaan komen (bank, waarschuwingen) en komt boven de lijst te staan.
  const toReview = useCallback(async (parsed, info) => {
    const existingKeys = await getExistingKeys()
    const newOnes = parsed.filter(tx => !existingKeys.has(dedupKey(tx.date, tx.amount, tx.type)))
    if (newOnes.length === 0) {
      setError(`Alle ${parsed.length} transacties uit dit bestand staan al in je app.`)
      return
    }
    const withCats = await Promise.all(newOnes.map(async raw => {
      // De eigen export van de app heeft geen merchant maar wel een note.
      const tx = raw.merchant ? raw : { ...raw, merchant: raw.note ?? '' }
      if (tx.category && catMap[tx.category]) {
        // Rijen die hun categorie al meebrengen (eigen export) blijven zoals ze zijn.
        return {
          ...tx, subcategory: tx.subcategory ?? '', note: tx.note ?? tx.merchant,
          confidence: 'high', confidencePct: 100, needsManual: false,
          source: 'file', eventCount: 0, isRecurring: false, _originalCategory: tx.category,
        }
      }
      const { cat, sub, confidence, confidencePct, needsManual, source, eventCount, isRecurring } =
        await categorizeWithLearning(tx.merchant, tx.amount, tx.type, tx.remi, byRole, classifyOptions)
      return { ...tx, category: cat, subcategory: sub, confidence, confidencePct, needsManual, source, eventCount, isRecurring, _originalCategory: cat, note: tx.merchant }
    }))
    // Stabiel per rij, ook als je er later een aantal wegveegt (idx schuift dan op).
    setPending(withCats.map((tx, i) => ({ ...tx, _rid: i })))
    setSkipped([])
    setBron({ ...info, count: newOnes.length, skipped: parsed.length - newOnes.length })
    setStep('review')
  }, [byRole, catMap, classifyOptions])

  const handleFile = useCallback(async e => {
    setError(null)
    setBron(null)
    let file
    try {
      file = await takeFile(e)     // kopieert eerst, leegt dan het veld (iOS)
    } catch (err) {
      setError(err.message)
      return
    }
    if (!file) return
    try {
      const isExcel = /\.(xls|xlsx)$/i.test(file.name)
      const text = isExcel ? null : await file.text()
      const { bank, transactions, warnings } = await parseBankFile(file)

      if (transactions.length > 0) {
        await toReview(transactions, { bank, warnings })
        return
      }
      if (isExcel) {
        setError('Geen transacties gevonden in dit Excel-bestand. Is dit de export van je bank?')
        return
      }

      // Geen parser die dit bestand aankan: kennen we deze kopregel al?
      const signature = headerSignature(text)
      const known = getMapping(csvMappings, signature)
      if (known) {
        const eigen = parseGenericCsv(text, known)
        if (eigen.transactions.length > 0) {
          await toReview(eigen.transactions, { bank: 'custom', warnings: eigen.warnings, note: 'Eigen indeling herkend' })
          return
        }
      }
      setMapper({ text, fileName: file.name, signature, initial: known, key: `${file.name}:${file.size}:${Date.now()}` })
    } catch (err) {
      setError(`Fout bij lezen bestand: ${err.message}`)
    }
  }, [csvMappings, toReview])

  // De gebruiker heeft in de kolommapper een indeling gekozen: toepassen,
  // bewaren onder de handtekening van de kopregel en door naar de review.
  async function applyMapping(mapping) {
    const { text, signature } = mapper
    setMapper(null)
    const { transactions, warnings } = parseGenericCsv(text, mapping)
    if (transactions.length === 0) {
      setError('Met deze indeling komen er geen transacties uit het bestand.')
      return
    }
    await db.settings.put({ key: 'csvMappings', value: saveMapping(csvMappings, signature, mapping) })
    await toReview(transactions, { bank: 'custom', warnings, note: 'Eigen indeling opgeslagen' })
  }

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

  // Veeg-naar-links in de review: rij niet opslaan, gewoon uit de lijst halen.
  // editIdx/payoutIdx zijn index-gebaseerd en verwijzen na het verwijderen
  // naar de verkeerde rij, dus die sluiten we voor de zekerheid.
  function skipRow(idx) {
    const tx = pending[idx]
    if (!tx) return
    setSkipped(s => [...s, { tx, idx }])
    setPending(p => p.filter((_, i) => i !== idx))
    setEditIdx(null)
    setPayoutIdx(null)
  }

  // Herstel: de laatst overgeslagen rij terug op (ongeveer) zijn oude plek.
  function undoSkip() {
    if (skipped.length === 0) return
    const last = skipped[skipped.length - 1]
    setSkipped(s => s.slice(0, -1))
    setPending(p => {
      const at = Math.min(last.idx, p.length)
      return [...p.slice(0, at), last.tx, ...p.slice(at)]
    })
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
      ? { ...t, category, subcategory, confidence: 'high', _originalCategory: tx._originalCategory, source: 'learned', eventCount: (tx.eventCount ?? 0) + 1 }
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
          <button onClick={() => { setStep('upload'); setPending([]); setSkipped([]); setBron(null) }}
            className="text-green text-sm">Nog een bestand importeren</button>
        </div>
      </PageWrapper>
    )
  }

  if (step === 'review') {
    return (
      <PageWrapper>
        <div className="safe-top px-4 py-3 flex justify-between items-center" style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="min-w-0 pr-2">
            <div className="font-bold" style={{ color: 'var(--color-text)' }}>{pending.length} nieuwe transacties</div>
            <div className="text-xs text-muted truncate">
              {bankLabel(bron?.bank)}
              {bron?.skipped > 0 && ` · ${bron.skipped} al in de app`}
              {' · tik een rij voor de categorie · veeg naar links om over te slaan'}
            </div>
            {skipped.length > 0 && (
              <div className="text-xs text-muted">
                {skipped.length} overgeslagen · <button onClick={undoSkip} className="text-green font-medium">Herstel</button>
              </div>
            )}
          </div>
          <button onClick={handleSave} disabled={pending.length === 0} className="btn-accent text-sm rounded-lg px-4 py-2 disabled:opacity-40">
            Opslaan
          </button>
        </div>

        {(bron?.note || bron?.warnings?.length > 0) && (
          <div className="px-4 py-2 text-[11px] text-muted" style={{ background: 'var(--color-surface-2)' }}>
            {bron.note && <div className="text-green">✓ {bron.note}</div>}
            {(bron.warnings ?? []).map((w, i) => <div key={i}>ℹ️ {w}</div>)}
          </div>
        )}

        <div className="divide-y divide-border">
          {pending.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted">
              Alles overgeslagen — herstel een rij of kies een ander bestand.
            </div>
          )}
          {pending.map((tx, idx) => {
            const cat = catMap[tx.category]
            const isLowConf = tx.confidence === 'low'
            const isClaim = claimStatusOf(tx) === 'open'
            // Bij banken die een aparte tegenpartij meegeven is die vaak
            // informatiever dan de omschrijving; alleen tonen als hij afwijkt.
            const tegenpartij = tx.counterparty && tx.counterparty !== tx.merchant ? tx.counterparty : null
            return (
              <SwipeToSkipRow key={tx._rid ?? idx} onSkip={() => skipRow(idx)}>
                <div className="w-full flex items-center gap-2 px-4 py-3">
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
                      {tegenpartij && (
                        <div className={`text-[11px] text-muted ${editIdx === idx ? '' : 'truncate'}`}>{tegenpartij}</div>
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
              </SwipeToSkipRow>
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
          Exporteer je transacties bij je bank als CSV of Excel en kies het bestand hier.
        </p>

        {error && (
          <div className="bg-red/20 border border-red rounded-lg p-3 mb-4 text-sm text-red">
            {error}
          </div>
        )}

        <label className="block card border-2 border-dashed p-8 text-center cursor-pointer">
          <div className="text-4xl mb-3">📤</div>
          <div className="font-medium">Kies je bankbestand</div>
          <div className="text-xs text-muted mt-1">.csv, .txt, .tab, .xls of .xlsx</div>
          <input
            type="file"
            accept=".csv,.txt,.tab,.xls,.xlsx"
            className="hidden"
            onChange={handleFile}
          />
        </label>

        <div className="card overflow-hidden mt-4">
          <button
            onClick={() => setHelpOpen(o => !o)}
            aria-expanded={helpOpen}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <span className="text-xl">❓</span>
            <div className="flex-1">
              <div className="text-sm">Hoe exporteer ik?</div>
              <div className="text-xs text-muted">Per bank in het kort</div>
            </div>
            <span className="text-sm text-muted">{helpOpen ? '⌃' : '⌄'}</span>
          </button>
          {helpOpen && (
            <div className="divide-y divide-border" style={{ borderTop: '1px solid var(--color-border)' }}>
              {EXPORT_HINTS.map(hint => (
                <div key={hint.bank} className="px-4 py-3">
                  <div className="text-sm">{hint.bank}</div>
                  <div className="text-xs text-muted mt-0.5">{hint.hoe}</div>
                </div>
              ))}
              <div className="px-4 py-3 text-xs text-muted">
                Andere bank? Kies het CSV-bestand gewoon: we vragen dan eenmalig welke kolom wat is.
              </div>
            </div>
          )}
        </div>
      </div>

      {mapper && (
        <ColumnMapperSheet
          key={mapper.key}
          open
          text={mapper.text}
          fileName={mapper.fileName}
          initial={mapper.initial}
          onApply={applyMapping}
          onClose={() => setMapper(null)}
        />
      )}
    </PageWrapper>
  )
}
