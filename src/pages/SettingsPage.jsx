import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { useCategories, setCategoryBudget, seedCategories } from '../hooks/useCategories'
import { exportToCsv } from '../utils/importHelpers'
import { euro } from '../utils/formatters'
import { db } from '../db/db'
import { parseTransactionsCsv } from '../utils/parsers'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { applyAccentColor } from '../utils/theme'

export function SettingsPage() {
  const categories = useCategories()
  const [editingCat, setEditingCat] = useState(null)
  const [inputVal, setInputVal] = useState('')
  const [importStatus, setImportStatus] = useState(null)
  const totalTxCount = useLiveQuery(() => db.transactions.count(), [])
  const showConfidence = useLiveQuery(() => db.settings.get('showConfidence').then(r => r?.value ?? false), [])
  const theme = useLiveQuery(() => db.settings.get('theme').then(r => r?.value ?? 'light'), [])
  const accentColor = useLiveQuery(() => db.settings.get('accentColor').then(r => r?.value ?? '#1E3A5F'), [])

  const ACCENT_OPTIONS = [
    { color: '#1E3A5F', label: 'Navy' },
    { color: '#0F172A', label: 'Charcoal' },
    { color: '#1E40AF', label: 'Blauw' },
    { color: '#4F46E5', label: 'Indigo' },
    { color: '#7C3AED', label: 'Paars' },
    { color: '#0D9488', label: 'Teal' },
    { color: '#059669', label: 'Smaragd' },
    { color: '#15803D', label: 'Groen' },
    { color: '#B45309', label: 'Amber' },
    { color: '#DC2626', label: 'Rood' },
    { color: '#BE185D', label: 'Roze' },
    { color: '#64748B', label: 'Slate' },
  ]

  async function toggleConfidence() {
    const current = showConfidence ?? false
    await db.settings.put({ key: 'showConfidence', value: !current })
  }

  async function setTheme(value) {
    await db.settings.put({ key: 'theme', value })
    document.documentElement.classList.remove('dark', 'light')
    if (value === 'dark') document.documentElement.classList.add('dark')
  }

  async function setAccent(color) {
    await db.settings.put({ key: 'accentColor', value: color })
    applyAccentColor(color)
  }

  function startEdit(cat) {
    setEditingCat(cat)
    setInputVal(String(Math.round(cat.budget)))
  }

  async function saveEdit() {
    if (!editingCat) return
    const val = parseFloat(String(inputVal).replace(',', '.'))
    if (!isNaN(val) && val >= 0) await setCategoryBudget(editingCat.key, val)
    setEditingCat(null)
  }

  function adjust(delta) {
    const current = parseFloat(String(inputVal).replace(',', '.')) || 0
    const next = Math.max(0, Math.round(current + delta))
    setInputVal(String(next))
  }

  async function handleExport() {
    const csv = await exportToCsv()
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportCsv(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus({ loading: true })
    try {
      const text = await file.text()
      const cleanLines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
      const lineCount = cleanLines.length
      const firstLine = cleanLines[0] ?? ''
      const txs = parseTransactionsCsv(text)
      if (txs.length === 0) {
        setImportStatus({ error: `Geen transacties gevonden. ${lineCount} regels. Eerste regel: "${firstLine.slice(0, 80)}"` })
        return
      }
      const existing = await db.transactions.toArray()
      const existingKeys = new Set(existing.map(t => `${t.date}|${t.amount}|${t.type}`))
      const newTxs = txs.filter(t => !existingKeys.has(`${t.date}|${t.amount}|${t.type}`))
      if (newTxs.length > 0) {
        await bulkAddTransactions(newTxs)
        // Verify write succeeded
        const countAfter = await db.transactions.count()
        if (countAfter === 0) {
          setImportStatus({ error: 'Schrijven naar database mislukt. Probeer de app te herladen.' })
          return
        }
      }
      const skipped = txs.length - newTxs.length
      setImportStatus({
        success: newTxs.length > 0
          ? `✓ ${newTxs.length} transacties geladen (${lineCount} regels in bestand${skipped > 0 ? `, ${skipped} overgeslagen` : ''}).`
          : `Alle ${txs.length} transacties staan al in de app.`,
      })
    } catch (err) {
      setImportStatus({ error: `Fout: ${err.message}` })
    }
    e.target.value = ''
  }

  async function handleImportDict(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus({ loading: true })
    try {
      const text = await file.text()
      await seedCategories(text)
      setImportStatus({ success: 'Budgetten geladen uit Dictionary.json.' })
    } catch (err) {
      setImportStatus({ error: `Fout: ${err.message}` })
    }
    e.target.value = ''
  }

  async function handleClearData() {
    if (!window.confirm('Weet je zeker dat je ALLE transacties wil verwijderen? Dit kan niet ongedaan worden gemaakt.')) return
    await db.transactions.clear()
    setImportStatus({ success: 'Alle transacties verwijderd.' })
  }

  const expenseCats = categories.filter(c => c.type === 'expense')
return (
    <PageWrapper title="Instellingen">
      {/* Status toast */}
      {importStatus && !importStatus.loading && (
        <div
          className={`mx-4 mt-4 rounded-xl px-4 py-3 text-sm ${
            importStatus.error ? 'bg-red/20 text-red border border-red' : 'bg-green/20 text-green border border-green'
          }`}
          onClick={() => setImportStatus(null)}
        >
          {importStatus.error ?? importStatus.success}
          <span className="float-right text-xs opacity-60">tik om te sluiten</span>
        </div>
      )}

      {/* Accent color picker — first setting */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Accentkleur</h2>
        <div className="card p-4">
          <div className="grid grid-cols-6 gap-2.5">
            {ACCENT_OPTIONS.map(opt => (
              <button
                key={opt.color}
                onClick={() => setAccent(opt.color)}
                className="flex flex-col items-center gap-1"
              >
                <div
                  className="w-9 h-9 rounded-full transition-all duration-150"
                  style={{
                    backgroundColor: opt.color,
                    boxShadow: accentColor === opt.color ? `0 0 0 3px var(--color-bg), 0 0 0 5px ${opt.color}` : 'none',
                    transform: accentColor === opt.color ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
                <span className="text-[9px]" style={{ color: accentColor === opt.color ? 'var(--color-text)' : 'var(--color-muted)' }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Budget per category */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Maandbudget</h2>
        <div className="card divide-y divide-border overflow-hidden">
          {expenseCats.map(cat => (
            <button key={cat.key} onClick={() => startEdit(cat)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="text-xl w-7 text-center">{cat.icon}</span>
              <span className="flex-1 text-sm">{cat.label}</span>
              <span className="text-sm text-muted">{cat.budget > 0 ? euro(cat.budget) : '—'} ›</span>
            </button>
          ))}
        </div>
      </section>

      {/* Data import / export */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Data</h2>
        <div className="card divide-y divide-border overflow-hidden">
          {/* Import transactions CSV */}
          <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
            <span className="text-xl">📄</span>
            <div className="flex-1">
              <div className="text-sm">Importeer Transactions.csv</div>
              <div className="text-xs text-muted">Duplicaten worden overgeslagen</div>
            </div>
            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleImportCsv} />
          </label>

          {/* Import Dictionary.json */}
          <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
            <span className="text-xl">📁</span>
            <div className="flex-1">
              <div className="text-sm">Importeer Dictionary.json</div>
              <div className="text-xs text-muted">Laadt budgetten per categorie</div>
            </div>
            <input type="file" accept=".json" className="hidden" onChange={handleImportDict} />
          </label>

          {/* Export */}
          <button onClick={handleExport} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <span className="text-xl">📥</span>
            <span className="text-sm">Exporteer transacties als CSV</span>
          </button>

          {/* Clear */}
          <button onClick={handleClearData} className="w-full flex items-center gap-3 px-4 py-3 text-left text-red">
            <span className="text-xl">🗑️</span>
            <span className="text-sm">Wis alle transacties</span>
          </button>
        </div>
      </section>

      {/* Admin */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Admin</h2>
        <div className="card divide-y divide-border overflow-hidden">
          {/* Theme toggle */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">🎨</span>
              <div className="flex-1">
                <div className="text-sm">Thema</div>
              </div>
            </div>
            <div className="flex bg-surface-2 rounded-full p-0.5">
              <button
                onClick={() => setTheme('dark')}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${theme === 'dark' ? 'btn-accent' : 'text-muted'}`}
              >
                Donker
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${theme === 'light' ? 'btn-accent' : 'text-muted'}`}
              >
                Licht
              </button>
            </div>
          </div>

          {/* Confidence toggle */}
          <button onClick={toggleConfidence} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <span className="text-xl">🧠</span>
            <div className="flex-1">
              <div className="text-sm">Toon betrouwbaarheid bij het importeren</div>
              <div className="text-xs text-muted">Geef per categorie-suggestie de bron en het percentage weer</div>
            </div>
            <div className={`w-11 h-6 rounded-full relative transition-colors ${showConfidence ? 'bg-green' : 'bg-border'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showConfidence ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
        </div>
      </section>

      {/* App info */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Over</h2>
        <div className="card divide-y divide-border overflow-hidden">
          <div className="px-4 py-3 text-sm text-muted space-y-1">
            <div>Versie 1.0.1</div>
            <div>Gegevens opgeslagen op dit apparaat</div>
            <div className="text-white font-medium pt-1">{totalTxCount ?? '…'} transacties in de app</div>
          </div>
        </div>
      </section>
      {editingCat && <BudgetEditSheet cat={editingCat} inputVal={inputVal} setInputVal={setInputVal} onSave={saveEdit} onAdjust={adjust} onClose={() => setEditingCat(null)} />}
    </PageWrapper>
  )
}

function BudgetEditSheet({ cat, inputVal, setInputVal, onSave, onAdjust, onClose }) {
  useEffect(() => {
    // Lock body scroll position to prevent background from jumping
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-in" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl pb-10 animate-slide-up sheet-handle" style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sheet)' }}>
        <div className="px-4 py-4 border-b border-border flex items-center gap-3">
          <span className="text-2xl">{cat.icon}</span>
          <span className="font-semibold">{cat.label}</span>
          <button onClick={onClose} className="ml-auto text-muted text-lg">✕</button>
        </div>

        <div className="px-6 pt-6 pb-4">
          <div className="text-xs text-muted mb-2 text-center">Maandbudget</div>
          <div className="flex items-center bg-surface-2 rounded-2xl px-4 gap-2" style={{ height: '60px' }}>
            <span className="text-2xl font-light text-muted leading-none">€</span>
            <input
              type="number"
              inputMode="numeric"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSave()}
              autoFocus
              className="flex-1 bg-transparent font-bold text-white text-right outline-none tabular-nums h-full"
              style={{ fontSize: '28px', lineHeight: '60px' }}
            />
          </div>
        </div>

        <div className="flex gap-2 px-6 pb-5">
          {[-100, -50, -10, +10, +50, +100].map(d => (
            <button
              key={d}
              onClick={() => onAdjust(d)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${d < 0 ? 'bg-red/15 text-red' : 'bg-green/15 text-green'}`}
            >
              {d > 0 ? `+${d}` : d}
            </button>
          ))}
        </div>

        <div className="px-6">
          <button onClick={onSave} className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base">
            Opslaan
          </button>
        </div>
      </div>
    </>
  )
}
