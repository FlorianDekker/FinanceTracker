import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { Sheet } from '../components/ui/Sheet'
import { CategoryManagerSheet } from '../components/categories/CategoryManagerSheet'
import { BackupCard } from '../components/settings/BackupCard'
import { RulesSheet } from '../components/settings/RulesSheet'
import { useCategories, setCategoryBudget, seedCategories } from '../hooks/useCategories'
import { exportToCsv } from '../utils/importHelpers'
import { euro } from '../utils/formatters'
import { db } from '../db/db'
import { parseTransactionsCsv } from '../utils/parsers'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { applyAccentColor } from '../utils/theme'
import { ALL_CHARTS } from './ChartsPage'

export function SettingsPage() {
  const { categories } = useCategories()
  const [editingCat, setEditingCat] = useState(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [importStatus, setImportStatus] = useState(null)
  const totalTxCount = useLiveQuery(() => db.transactions.count(), [])
  const rulesCount = useLiveQuery(() => db.rules.count(), [])
  const showConfidence = useLiveQuery(() => db.settings.get('showConfidence').then(r => r?.value ?? false), [])
  const theme = useLiveQuery(() => db.settings.get('theme').then(r => r?.value ?? 'light'), [])
  const accentColor = useLiveQuery(() => db.settings.get('accentColor').then(r => r?.value ?? '#1E3A5F'), [])
  const chartConfig = useLiveQuery(() => db.settings.get('chartConfig').then(r => r?.value ?? null), [])

  const defaultOrder = ALL_CHARTS.map(c => c.id)
  const chartOrder = chartConfig?.order ?? defaultOrder
  const chartEnabled = new Set(chartConfig?.enabled ?? defaultOrder)

  async function toggleChart(id) {
    const next = new Set(chartEnabled)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    await db.settings.put({ key: 'chartConfig', value: { order: chartOrder, enabled: [...next] } })
  }

  async function moveChart(id, dir) {
    const order = [...chartOrder]
    const idx = order.indexOf(id)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= order.length) return
    ;[order[idx], order[newIdx]] = [order[newIdx], order[idx]]
    await db.settings.put({ key: 'chartConfig', value: { order, enabled: [...chartEnabled] } })
  }

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

      {/* Chart configuration */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Grafieken</h2>
        <div className="card overflow-hidden">
          {chartOrder.map((id, i) => {
            const chart = ALL_CHARTS.find(c => c.id === id)
            if (!chart) return null
            const enabled = chartEnabled.has(id)
            return (
              <div
                key={id}
                className="flex items-center gap-2 px-4 py-2.5"
                style={i < chartOrder.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
              >
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveChart(id, -1)}
                    className="text-[10px] leading-none px-1"
                    style={{ color: i === 0 ? 'var(--color-text-dim)' : 'var(--color-muted)' }}
                  >▲</button>
                  <button
                    onClick={() => moveChart(id, 1)}
                    className="text-[10px] leading-none px-1"
                    style={{ color: i === chartOrder.length - 1 ? 'var(--color-text-dim)' : 'var(--color-muted)' }}
                  >▼</button>
                </div>

                {/* Label */}
                <span className="flex-1 text-sm" style={{ color: enabled ? 'var(--color-text)' : 'var(--color-muted)' }}>{chart.label}</span>

                {/* Toggle */}
                <button
                  onClick={() => toggleChart(id)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${enabled ? 'bg-green' : ''}`}
                  style={!enabled ? { background: 'var(--color-surface-2)' } : {}}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* Categorieën */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Categorieën</h2>
        <div className="card overflow-hidden">
          <button onClick={() => setManagerOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
            <span className="text-xl">🗂️</span>
            <div className="flex-1">
              <div className="text-sm">Categorieën beheren</div>
              <div className="text-xs text-muted">Naam, icoon, kleur, subcategorieën en volgorde</div>
            </div>
            <span className="text-sm text-muted">{categories.length} ›</span>
          </button>

          <button onClick={() => setRulesOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="text-xl">🔎</span>
            <div className="flex-1">
              <div className="text-sm">Herkenningsregels</div>
              <div className="text-xs text-muted">Eigen trefwoorden die bij het importeren voorgaan</div>
            </div>
            <span className="text-sm text-muted">{rulesCount ?? '…'} ›</span>
          </button>
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

      {/* Data: backup, restore en oude bestandsformaten */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Data</h2>

        <BackupCard onStatus={setImportStatus} />

        {/* Oude bestandsformaten staan ingeklapt: backup/restore is de normale weg */}
        <div className="card overflow-hidden mt-3">
          <button
            onClick={() => setAdvancedOpen(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            aria-expanded={advancedOpen}
          >
            <span className="text-xl">🧰</span>
            <div className="flex-1">
              <div className="text-sm">Geavanceerd (oude bestanden)</div>
              <div className="text-xs text-muted">CSV-import/-export en Dictionary.json</div>
            </div>
            <span className="text-sm text-muted">{advancedOpen ? '⌃' : '⌄'}</span>
          </button>

          {advancedOpen && (
            <div className="divide-y divide-border" style={{ borderTop: '1px solid var(--color-border)' }}>
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
          )}
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
            <div>Versie {__APP_VERSION__}</div>
            <div>Gegevens opgeslagen op dit apparaat</div>
            <div className="font-medium pt-1">{totalTxCount ?? '…'} transacties in de app</div>
          </div>
        </div>
      </section>
      <CategoryManagerSheet open={managerOpen} onClose={() => setManagerOpen(false)} />
      <RulesSheet open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {editingCat && <BudgetEditSheet cat={editingCat} inputVal={inputVal} setInputVal={setInputVal} onSave={saveEdit} onAdjust={adjust} onClose={() => setEditingCat(null)} />}
    </PageWrapper>
  )
}

function BudgetEditSheet({ cat, inputVal, setInputVal, onSave, onAdjust, onClose }) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={cat.label}
      leading={<span className="text-2xl">{cat.icon}</span>}
      footer={
        <button onClick={onSave} className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base">
          Opslaan
        </button>
      }
    >
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
            className="flex-1 bg-transparent font-bold text-right outline-none tabular-nums h-full"
            style={{ fontSize: '28px', lineHeight: '60px', color: 'var(--color-text)' }}
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
    </Sheet>
  )
}
