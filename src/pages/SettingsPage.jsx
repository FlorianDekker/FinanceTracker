import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { PageWrapper } from '../components/layout/PageWrapper'
import { Sheet } from '../components/ui/Sheet'
import { CategoryManagerSheet } from '../components/categories/CategoryManagerSheet'
import { BackupCard } from '../components/settings/BackupCard'
import { BalanceCheckCard } from '../components/settings/BalanceCheckCard'
import { RulesSheet } from '../components/settings/RulesSheet'
import { AiReceiptsCard } from '../components/settings/AiReceiptsCard'
import { useCategories, setCategoryBudget, seedCategories } from '../hooks/useCategories'
import { useClaimExpiryMonths, setClaimExpiryMonths, useOutstandingClaims, useVoorschotSummary, convertVoorschotToClaims } from '../hooks/useClaims'
import { exportToCsv } from '../utils/importHelpers'
import { euro } from '../utils/formatters'
import { db } from '../db/db'
import { parseTransactionsCsv } from '../utils/parsers'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { applyAccentColor } from '../utils/theme'
import { SALARY_THRESHOLD } from '../utils/categorizer'
import { loadDemoData, clearDemoData, DEMO_MODE_KEY } from '../utils/demoData'
import { ALL_CHARTS, mergeChartConfig } from '../components/charts/registry'
import { beschrijfStat } from '../utils/chartStats'

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
  const salaryThreshold = useLiveQuery(
    () => db.settings.get('salaryThreshold').then(r => Number(r?.value) || SALARY_THRESHOLD), [])
  const theme = useLiveQuery(() => db.settings.get('theme').then(r => r?.value ?? 'light'), [])
  const accentColor = useLiveQuery(() => db.settings.get('accentColor').then(r => r?.value ?? '#1E3A5F'), [])
  const chartConfig = useLiveQuery(() => db.settings.get('chartConfig').then(r => r?.value ?? null), [])
  const chartStats = useLiveQuery(() => db.settings.get('chartStats').then(r => r?.value ?? {}), [])
  // Bepaalt of de bon-grafieken standaard aanstaan (zelfde regel als ChartsPage).
  const receiptCount = useLiveQuery(() => db.receipts.count(), [], 0)
  const demoMode = useLiveQuery(() => db.settings.get(DEMO_MODE_KEY).then(r => r?.value === true), [])
  const claimExpiryMonths = useClaimExpiryMonths()
  const claims = useOutstandingClaims()
  const voorschot = useVoorschotSummary()

  // Zelfde samenvoeging als de Grafieken-pagina: onbekende ids eruit, nieuwe
  // grafieken achteraan erbij. Zonder dit blijven nieuwe grafieken onzichtbaar
  // zodra er ooit een chartConfig is opgeslagen.
  const merged = mergeChartConfig(chartConfig, { hasReceipts: (receiptCount ?? 0) > 0 })
  const chartOrder = merged.order
  const chartEnabled = new Set(merged.enabled)

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

  // Bijschrijvingen vanaf dit bedrag gelden bij het importeren als inkomen.
  async function saveSalaryThreshold(value) {
    const val = Math.round(parseFloat(String(value).replace(',', '.')))
    if (!Number.isFinite(val) || val <= 0) return
    await db.settings.put({ key: 'salaryThreshold', value: val })
  }

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

  // Voorbeelddata: alleen te laden als de app nog leeg is, zodat niemand per
  // ongeluk verzonnen transacties door zijn eigen cijfers mengt.
  async function handleLoadDemo() {
    setImportStatus({ loading: true })
    try {
      const n = await loadDemoData()
      setImportStatus({ success: `${n} voorbeeldtransacties geladen.` })
    } catch (err) {
      setImportStatus({ error: `Fout: ${err.message}` })
    }
  }

  async function handleClearDemo() {
    if (!window.confirm('Alle voorbeelddata wissen en opnieuw beginnen? Je categorieën en instellingen blijven staan.')) return
    await clearDemoData()
    setImportStatus({ success: 'Voorbeelddata gewist. Je kunt nu je eigen bankbestand importeren.' })
  }

  async function handleClearData() {
    if (!window.confirm('Weet je zeker dat je ALLE transacties wil verwijderen? Dit kan niet ongedaan worden gemaakt.')) return
    await db.transactions.clear()
    setImportStatus({ success: 'Alle transacties verwijderd.' })
  }

  // Eenmalige opruimactie: de oude werkwijze (alles op categorie Voorschot)
  // omzetten naar echte declaraties. De categorie blijft staan; bij "Niet
  // declareren" doet de app daarna een voorstel voor de echte categorie.
  async function handleConvertVoorschot() {
    if (!window.confirm(
      `${voorschot.count} ${voorschot.count === 1 ? 'uitgave' : 'uitgaven'} in Voorschot ` +
      `(${euro(voorschot.total)}) omzetten naar open declaraties? ` +
      'Ze tellen daarna niet meer mee in je budget totdat ze zijn afgehandeld.'
    )) return
    const n = await convertVoorschotToClaims()
    setImportStatus({ success: `${n} uitgaven staan nu als open declaratie klaar.` })
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

                {/* Label + kijkteller */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: enabled ? 'var(--color-text)' : 'var(--color-muted)' }}>{chart.label}</div>
                  <div className="text-[10px] truncate" style={{ color: 'var(--color-muted)', opacity: 0.75 }}>
                    {beschrijfStat(chartStats?.[id])}
                  </div>
                </div>

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

      {/* Saldocontrole */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Saldocontrole</h2>
        <BalanceCheckCard />
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

      {/* Declaraties */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Declaraties</h2>
        <div className="card overflow-hidden">
          <Link to="/declaraties" className="flex items-center gap-3 px-4 py-3" style={{ color: 'var(--color-text)' }}>
            <span className="text-xl">💼</span>
            <div className="flex-1">
              <div className="text-sm">Declaraties beheren</div>
              <div className="text-xs text-muted">Indienen, uitbetaling koppelen en afgekeurde kosten terugzetten</div>
            </div>
            <span className="text-sm text-muted">{euro(claims.total)} ({claims.count}) ›</span>
          </Link>
          {voorschot.count > 0 && (
            <div style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={handleConvertVoorschot}
                className="w-full flex items-center gap-3 px-4 pt-3 text-left"
              >
                <span className="text-xl">🔁</span>
                <div className="flex-1">
                  <div className="text-sm">Zet Voorschot-uitgaven om naar declaraties</div>
                  <div className="text-xs text-muted">
                    {voorschot.count} {voorschot.count === 1 ? 'uitgave staat' : 'uitgaven staan'} nog in Voorschot ({euro(voorschot.total)})
                  </div>
                </div>
                <span className="text-sm text-muted">›</span>
              </button>
              <p className="text-[11px] text-muted px-4 pt-2 pb-3">
                Tip: gebruik voor nieuwe werkkosten de gewone categorie + 💼; de categorie Voorschot
                kun je hernoemen voor privé voorschieten.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
            <span className="text-xl">⏳</span>
            <div className="flex-1">
              <div className="text-sm">Declareren kan tot</div>
              <div className="text-xs text-muted">Waarschuwing zodra een open declaratie bijna te oud is</div>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min="1"
                max="60"
                inputMode="numeric"
                key={claimExpiryMonths}
                defaultValue={claimExpiryMonths}
                onBlur={e => setClaimExpiryMonths(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-14 rounded-lg px-2 py-1 text-sm text-right"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              />
              <span className="text-sm text-muted">mnd</span>
            </div>
          </div>
        </div>
      </section>

      {/* AI & bonnetjes */}
      <AiReceiptsCard onStatus={setImportStatus} />

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

        {/* Ingeklapt: backup/restore is de normale weg, dit is het vangnet */}
        <div className="card overflow-hidden mt-3">
          <button
            onClick={() => setAdvancedOpen(o => !o)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
            aria-expanded={advancedOpen}
          >
            <span className="text-xl">🧰</span>
            <div className="flex-1">
              <div className="text-sm">Geavanceerd</div>
              <div className="text-xs text-muted">CSV-import/-export, Dictionary.json en alles wissen</div>
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

              {/* Voorbeelddata — alleen als de app nog leeg is */}
              {totalTxCount === 0 && (
                <button onClick={handleLoadDemo} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <span className="text-xl">🧪</span>
                  <div className="flex-1">
                    <div className="text-sm">Voorbeelddata laden</div>
                    <div className="text-xs text-muted">Een half jaar verzonnen transacties om rond te kijken</div>
                  </div>
                </button>
              )}

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

          {/* Salarisdrempel */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="text-xl">💰</span>
            <div className="flex-1">
              <div className="text-sm">Bijschrijving vanaf € telt als salaris</div>
              <div className="text-xs text-muted">Grote bedragen die binnenkomen worden bij het importeren inkomen</div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted">€</span>
              <input
                type="number"
                min="1"
                step="50"
                inputMode="numeric"
                key={salaryThreshold}
                defaultValue={salaryThreshold ?? SALARY_THRESHOLD}
                onBlur={e => saveSalaryThreshold(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                className="w-20 rounded-lg px-2 py-1 text-sm text-right"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* App info */}
      <section className="px-4 pt-4 pb-2">
        <h2 className="text-xs text-muted uppercase tracking-wider mb-3">Over</h2>
        <div className="card divide-y divide-border overflow-hidden">
          {demoMode && (
            <button
              onClick={handleClearDemo}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
              style={{ background: 'rgba(255, 204, 0, 0.18)' }}
            >
              <span className="text-xl">🧪</span>
              <div className="flex-1">
                <div className="text-sm font-medium text-orange">Voorbeelddata actief</div>
                <div className="text-xs text-muted">Deze transacties zijn verzonnen</div>
              </div>
              <span className="text-sm text-orange">Wis en begin opnieuw ›</span>
            </button>
          )}
          <div className="px-4 py-3 text-sm text-muted space-y-1">
            <div>Versie {__APP_VERSION__} · build {__BUILD_STAMP__}</div>
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
