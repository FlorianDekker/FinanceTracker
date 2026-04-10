import { useState } from 'react'
import { seedCategories } from '../hooks/useCategories'
import { bulkAddTransactions } from '../hooks/useTransactions'
import { parseTransactionsCsv } from '../utils/parsers'
import { db } from '../db/db'
import { CATEGORIES } from '../constants/categories'

export function MigrationPage({ onDone }) {
  const [status, setStatus] = useState({ dict: null, csv: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleDictFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      await seedCategories(text)
      setStatus(s => ({ ...s, dict: `✓ ${file.name} geladen` }))
    } catch (err) {
      setError(`Fout bij Dictionary.json: ${err.message}`)
    }
  }

  async function handleCsvFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const txs = parseTransactionsCsv(text)
      await bulkAddTransactions(txs)
      setStatus(s => ({ ...s, csv: `✓ ${txs.length} transacties geladen` }))
    } catch (err) {
      setError(`Fout bij Transactions.csv: ${err.message}`)
    }
  }

  async function handleSkip() {
    // Seed categories with zero budgets so the app can start
    const puts = CATEGORIES.map(c => ({ key: c.key, budget: 0 }))
    await db.categories.bulkPut(puts)
    await db.settings.put({ key: 'migrationDone', value: true })
    onDone()
  }

  async function handleFinish() {
    // Ensure categories exist even if no dictionary was imported
    const existing = await db.categories.count()
    if (existing === 0) {
      const puts = CATEGORIES.map(c => ({ key: c.key, budget: 0 }))
      await db.categories.bulkPut(puts)
    }
    await db.settings.put({ key: 'migrationDone', value: true })
    onDone()
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6" style={{ color: 'var(--color-text)' }}>
      <div className="w-full max-w-sm">
        <div className="text-5xl mb-6 text-center">💰</div>
        <h1 className="text-2xl font-bold text-center mb-2">Budget Tracker</h1>
        <p className="text-muted text-center mb-8 text-sm">
          Importeer je bestaande gegevens om te beginnen, of start leeg.
        </p>

        {error && (
          <div className="bg-red/20 border border-red rounded-lg p-3 mb-4 text-sm text-red">
            {error}
          </div>
        )}

        <div className="space-y-4 mb-8">
          {/* Dictionary.json */}
          <label className="block bg-surface rounded-xl p-4 cursor-pointer border border-border">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📁</span>
              <div className="flex-1">
                <div className="font-medium">Dictionary.json</div>
                <div className="text-muted text-xs">Laadt je budgetten per categorie</div>
                {status.dict && <div className="text-green text-xs mt-1">{status.dict}</div>}
              </div>
              <span className="text-muted text-xs">Optioneel</span>
            </div>
            <input type="file" accept=".json" className="hidden" onChange={handleDictFile} />
          </label>

          {/* Transactions.csv */}
          <label className="block bg-surface rounded-xl p-4 cursor-pointer border border-border">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📄</span>
              <div className="flex-1">
                <div className="font-medium">Transactions.csv</div>
                <div className="text-muted text-xs">Laadt je transactiegeschiedenis</div>
                {status.csv && <div className="text-green text-xs mt-1">{status.csv}</div>}
              </div>
              <span className="text-muted text-xs">Optioneel</span>
            </div>
            <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCsvFile} />
          </label>
        </div>

        <button
          onClick={handleFinish}
          className="w-full btn-accent py-3 mb-3"
        >
          Begin met Budget Tracker
        </button>

        <button
          onClick={handleSkip}
          className="w-full text-muted text-sm py-2"
        >
          Begin leeg
        </button>
      </div>
    </div>
  )
}
