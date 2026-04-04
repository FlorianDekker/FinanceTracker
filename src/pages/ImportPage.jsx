import { useState } from 'react'
import { parseABNExport, parseABNExcel } from '../utils/parsers'
import { categorize } from '../utils/categorizer'
import { getExistingKeys, dedupKey } from '../utils/importHelpers'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { euro, fmtDate } from '../utils/formatters'
import { CATEGORY_MAP, CATEGORIES } from '../constants/categories'
import { PageWrapper } from '../components/layout/PageWrapper'

export function ImportPage() {
  const [step, setStep] = useState('upload') // upload | review | done
  const [pending, setPending] = useState([])
  const [saved, setSaved] = useState(0)
  const [editIdx, setEditIdx] = useState(null)
  const [error, setError] = useState(null)

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
      const withCats = newOnes.map(tx => {
        const { cat, sub, confidence, possiblySterre, needsManual } = categorize(tx.merchant, tx.amount, tx.type, tx.remi)
        return { ...tx, category: cat, subcategory: sub, confidence, possiblySterre, needsManual, note: tx.merchant }
      })
      setPending(withCats)
      setStep('review')
    } catch (err) {
      setError(`Fout bij lezen bestand: ${err.message}`)
    }
  }

  async function handleSave() {
    const txs = pending.map(({ merchant, confidence, possiblySterre, needsManual, remi, ...tx }) => tx)
    await bulkAddTransactions(txs)
    setSaved(txs.length)
    setStep('done')
  }

  function handleCategoryChange(idx, category, subcategory) {
    setPending(p => p.map((tx, i) => i === idx
      ? { ...tx, category, subcategory, confidence: 'high', possiblySterre: false }
      : tx
    ))
    setEditIdx(null)
  }

  if (step === 'done') {
    return (
      <PageWrapper title="Importeer">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <span className="text-5xl">✅</span>
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
        <div className="sticky top-0 z-10 bg-bg border-b border-border px-4 py-3 safe-top flex justify-between items-center">
          <div>
            <div className="font-semibold">{pending.length} nieuwe transacties</div>
            <div className="text-xs text-muted">Tik een rij om categorie te wijzigen</div>
          </div>
          <button onClick={handleSave} className="bg-green text-white text-sm font-medium rounded-lg px-4 py-2">
            Opslaan
          </button>
        </div>

        <div className="divide-y divide-border">
          {pending.map((tx, idx) => {
            const cat = CATEGORY_MAP[tx.category]
            const isLowConf = tx.confidence === 'low' || tx.possiblySterre
            return (
              <button
                key={idx}
                onClick={() => setEditIdx(idx)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <div className="text-left w-20 shrink-0">
                  <div className="text-xs text-muted">{fmtDate(tx.date)}</div>
                  <div className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-green' : 'text-white'}`}>
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
                </div>
              </button>
            )
          })}
        </div>

        {editIdx !== null && (
          <CategoryPicker
            current={{ category: pending[editIdx].category, subcategory: pending[editIdx].subcategory }}
            merchant={pending[editIdx].merchant}
            remi={pending[editIdx].remi}
            onSelect={(cat, sub) => handleCategoryChange(editIdx, cat, sub)}
            onClose={() => setEditIdx(null)}
          />
        )}
      </PageWrapper>
    )
  }

  return (
    <PageWrapper title="Importeer">
      <div className="p-4">
        <p className="text-sm text-muted mb-4">
          Exporteer het <strong className="text-white">Excel-bestand (.xls)</strong> vanuit ABN AMRO internetbankieren en selecteer het hier.
        </p>

        {error && (
          <div className="bg-red/20 border border-red rounded-lg p-3 mb-4 text-sm text-red">
            {error}
          </div>
        )}

        <label className="block bg-surface rounded-xl border-2 border-dashed border-border p-8 text-center cursor-pointer">
          <div className="text-4xl mb-3">📤</div>
          <div className="font-medium">Selecteer ABN AMRO exportbestand</div>
          <div className="text-xs text-muted mt-1">.xls, .xlsx of .txt</div>
          <input type="file" accept=".xls,.xlsx,.txt,.csv,.tab,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={handleFile} />
        </label>

      </div>
    </PageWrapper>
  )
}

function CategoryPicker({ current, merchant, remi, onSelect, onClose }) {
  const [mainCat, setMainCat] = useState(null)

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-surface rounded-t-2xl max-h-[70vh] overflow-y-auto pb-24 animate-slide-up">
        <div className="sticky top-0 bg-surface border-b border-border">
          {merchant && (
            <div className="px-4 pt-3 pb-2 border-b border-border/50">
              <div className="text-sm font-medium">{merchant}</div>
              {remi && <div className="text-xs text-muted mt-0.5">{remi}</div>}
            </div>
          )}
          <div className="flex justify-between items-center px-4 py-3">
            {mainCat ? (
              <button onClick={() => setMainCat(null)} className="text-green text-sm">← Terug</button>
            ) : (
              <span className="font-semibold text-sm">Kies categorie</span>
            )}
            <button onClick={onClose} className="text-muted">✕</button>
          </div>
        </div>

        {!mainCat ? (
          <div className="divide-y divide-border">
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => {
                  if (cat.subs.length === 0) onSelect(cat.key, '')
                  else setMainCat(cat)
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <span className="text-xl w-7 text-center">{cat.icon}</span>
                <span className="text-sm">{cat.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            <button
              onClick={() => onSelect(mainCat.key, '')}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <span className="text-xl w-7 text-center">{mainCat.icon}</span>
              <span className="text-sm text-muted">Geen subcategorie</span>
            </button>
            {mainCat.subs.map(sub => (
              <button
                key={sub.key}
                onClick={() => onSelect(mainCat.key, sub.key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left pl-14"
              >
                <span className="text-sm">{sub.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
