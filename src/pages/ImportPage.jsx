import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { parseABNExport, parseABNExcel } from '../utils/parsers'
import { categorizeWithLearning } from '../utils/categorizer'
import { getExistingKeys, dedupKey } from '../utils/importHelpers'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { recordEvent, bulkRecordEvents } from '../utils/merchantLearning'
import { euro, fmtDate } from '../utils/formatters'
import { useCategories } from '../hooks/useCategories'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CategoryPicker } from '../components/categories/CategoryPicker'
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
  const { catMap } = useCategories()
  const [step, setStep] = useState('upload') // upload | review | done
  const [pending, setPending] = useState([])
  const [saved, setSaved] = useState(0)
  const [editIdx, setEditIdx] = useState(null)
  const [error, setError] = useState(null)
  const showConfidence = useLiveQuery(() => db.settings.get('showConfidence').then(r => r?.value ?? false), [])

  async function handleFile(e) {
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
        const { cat, sub, confidence, confidencePct, possiblySterre, needsManual, source, eventCount, isRecurring } = await categorizeWithLearning(tx.merchant, tx.amount, tx.type, tx.remi)
        return { ...tx, category: cat, subcategory: sub, confidence, confidencePct, possiblySterre, needsManual, source, eventCount, isRecurring, _originalCategory: cat, note: tx.merchant }
      }))
      setPending(withCats)
      setStep('review')
    } catch (err) {
      setError(`Fout bij lezen bestand: ${err.message}`)
    }
  }

  async function handleSave() {
    const txs = pending.map(stripReviewFields)
    await bulkAddTransactions(txs)
    // Learn from all reviewed transactions
    await bulkRecordEvents(pending)
    setSaved(txs.length)
    setStep('done')
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
            <div className="text-xs text-muted">Tik een rij om categorie te wijzigen</div>
          </div>
          <button onClick={handleSave} className="btn-accent text-sm rounded-lg px-4 py-2">
            Opslaan
          </button>
        </div>

        <div className="divide-y divide-border">
          {pending.map((tx, idx) => {
            const cat = catMap[tx.category]
            const isLowConf = tx.confidence === 'low' || tx.possiblySterre
            return (
              <button
                key={idx}
                onClick={() => setEditIdx(idx)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
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
            )
          })}
        </div>

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
