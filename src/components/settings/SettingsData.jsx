import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { BackupCard } from './BackupCard'
import { StatusToast } from './StatusToast'
import { exportToCsv } from '../../utils/importHelpers'
import { parseTransactionsCsv } from '../../utils/parsers'
import { bulkAddTransactions } from '../../hooks/useTransactions'
import { seedCategories } from '../../hooks/useCategories'
import { loadDemoData } from '../../utils/demoData'

/**
 * Instellingen -> Data: backup maken/terugzetten (het normale pad) en
 * daaronder, ingeklapt, het vangnet: CSV-import/-export, Dictionary.json,
 * voorbeelddata en alles wissen.
 */
export function SettingsData() {
  const totalTxCount = useLiveQuery(() => db.transactions.count(), [])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [status, setStatus] = useState(null)

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
    setStatus({ loading: true })
    try {
      const text = await file.text()
      const cleanLines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean)
      const lineCount = cleanLines.length
      const firstLine = cleanLines[0] ?? ''
      const txs = parseTransactionsCsv(text)
      if (txs.length === 0) {
        setStatus({ error: `Geen transacties gevonden. ${lineCount} regels. Eerste regel: "${firstLine.slice(0, 80)}"` })
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
          setStatus({ error: 'Schrijven naar database mislukt. Probeer de app te herladen.' })
          return
        }
      }
      const skipped = txs.length - newTxs.length
      setStatus({
        success: newTxs.length > 0
          ? `✓ ${newTxs.length} transacties geladen (${lineCount} regels in bestand${skipped > 0 ? `, ${skipped} overgeslagen` : ''}).`
          : `Alle ${txs.length} transacties staan al in de app.`,
      })
    } catch (err) {
      setStatus({ error: `Fout: ${err.message}` })
    }
    e.target.value = ''
  }

  async function handleImportDict(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setStatus({ loading: true })
    try {
      const text = await file.text()
      await seedCategories(text)
      setStatus({ success: 'Budgetten geladen uit Dictionary.json.' })
    } catch (err) {
      setStatus({ error: `Fout: ${err.message}` })
    }
    e.target.value = ''
  }

  // Voorbeelddata: alleen te laden als de app nog leeg is, zodat niemand per
  // ongeluk verzonnen transacties door zijn eigen cijfers mengt.
  async function handleLoadDemo() {
    setStatus({ loading: true })
    try {
      const n = await loadDemoData()
      setStatus({ success: `${n} voorbeeldtransacties geladen.` })
    } catch (err) {
      setStatus({ error: `Fout: ${err.message}` })
    }
  }

  async function handleClearData() {
    if (!window.confirm('Weet je zeker dat je ALLE transacties wil verwijderen? Dit kan niet ongedaan worden gemaakt.')) return
    await db.transactions.clear()
    setStatus({ success: 'Alle transacties verwijderd.' })
  }

  return (
    <section className="px-4 pt-4 pb-2">
      <StatusToast status={status} onDismiss={() => setStatus(null)} />

      <div className="mt-3">
        <BackupCard onStatus={setStatus} />
      </div>

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
  )
}
