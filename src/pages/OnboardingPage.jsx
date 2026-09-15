import { useState } from 'react'
import { db } from '../db/db'
import { TEMPLATES, DEFAULT_TEMPLATE_ID, templateDefs, buildTemplateRows, validateTemplateRows } from '../constants/templates'
import { restoreBackup } from '../utils/backup'
import { loadDemoData } from '../utils/demoData'
import { euro } from '../utils/formatters'
import { takeFile } from '../utils/fileInput'

/**
 * Onboarding in vier stappen: welkom → categorieën → budgetten → data.
 * Vervangt de oude MigrationPage; de legacy-import van Dictionary.json en
 * Transactions.csv staat nu onder Instellingen → Geavanceerd.
 *
 * `onDone(next)` krijgt 'import' mee als de gebruiker meteen een bankbestand
 * wil kiezen, anders niets.
 */
export function OnboardingPage({ onDone }) {
  const [step, setStep] = useState(0)
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID)
  const [budgets, setBudgets] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const defs = templateDefs(templateId)
  const expenseDefs = defs.filter(d => (d.type ?? 'expense') === 'expense')

  async function seedCategories() {
    const rows = buildTemplateRows(templateId, budgets)
    const problems = validateTemplateRows(rows)
    if (problems.length) throw new Error(`Deze categorieën kloppen niet: ${problems.join('; ')}`)
    await db.transaction('rw', db.categories, async () => {
      await db.categories.clear()
      await db.categories.bulkPut(rows)
    })
  }

  // Afronden: categorieën wegschrijven, eventueel voorbeelddata, klaarzetten.
  async function finish(next) {
    setError(null)
    setBusy(next)
    try {
      await seedCategories()
      if (next === 'demo') await loadDemoData()
      await db.settings.put({ key: 'migrationDone', value: true })
      onDone(next)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  // "Ik heb een backup": alles terugzetten en meteen naar de app.
  async function handleRestore(e) {
    setError(null)
    setBusy('backup')
    try {
      const file = await takeFile(e)
      if (!file) { setBusy(null); return }
      const { stats } = await restoreBackup(await file.text(), { mode: 'replace' })
      await db.settings.put({ key: 'migrationDone', value: true })
      onDone(`backup:${stats.transactions?.added ?? 0}`)
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col" style={{ color: 'var(--color-text)' }}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          {error && (
            <div className="bg-red/20 border border-red rounded-lg p-3 mb-4 text-sm text-red">{error}</div>
          )}

          {step === 0 && (
            <Welkom
              busy={busy}
              onStart={() => setStep(1)}
              onRestore={handleRestore}
            />
          )}

          {step === 1 && (
            <Categorieen
              templateId={templateId}
              onPick={setTemplateId}
              onNext={() => setStep(2)}
              onBack={() => setStep(0)}
            />
          )}

          {step === 2 && (
            <Budgetten
              defs={expenseDefs}
              budgets={budgets}
              onChange={(key, value) => setBudgets(b => ({ ...b, [key]: value }))}
              onNext={() => setStep(3)}
              onSkip={() => { setBudgets({}); setStep(3) }}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <Data busy={busy} onFinish={finish} onBack={() => setStep(2)} />
          )}
        </div>
      </div>

      <Stippen step={step} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Stappen                                                              *
 * ------------------------------------------------------------------ */

function Welkom({ busy, onStart, onRestore }) {
  return (
    <>
      <div className="text-5xl mb-6 text-center">💰</div>
      <h1 className="text-2xl font-bold text-center mb-2">Welkom bij Budget</h1>
      <p className="text-muted text-center text-sm mb-6">
        Importeer je bankafschriften en zie meteen waar je geld heen gaat.
      </p>
      <div className="card px-4 py-3 mb-6 text-sm text-center">
        🔒 Alles blijft op dit apparaat — geen account, geen cloud.
      </div>

      <button onClick={onStart} disabled={!!busy} className="w-full btn-accent py-3 rounded-2xl font-semibold">
        Aan de slag
      </button>

      <label className="block text-center text-xs text-muted mt-6 cursor-pointer">
        Ik heb een backup → <span className="text-accent underline">Backup terugzetten</span>
        <input type="file" accept=".json,application/json" className="hidden" onChange={onRestore} />
      </label>
      {busy === 'backup' && <div className="text-xs text-muted text-center mt-2">Bezig met terugzetten…</div>}
    </>
  )
}

function Categorieen({ templateId, onPick, onNext, onBack }) {
  return (
    <>
      <h1 className="text-xl font-bold mb-1">Waar geef je geld aan uit?</h1>
      <p className="text-muted text-sm mb-5">Kies een startpunt. Je kunt later alles aanpassen.</p>

      <div className="space-y-3 mb-6">
        {TEMPLATES.map(t => {
          const defs = templateDefs(t.id)
          const gekozen = t.id === templateId
          return (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              aria-pressed={gekozen}
              className="w-full card px-4 py-3 text-left"
              style={gekozen ? { boxShadow: '0 0 0 2px var(--color-accent)' } : undefined}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold flex-1">{t.label}</span>
                {gekozen && <span className="text-sm" style={{ color: 'var(--color-accent)' }}>✓</span>}
              </div>
              <div className="text-xs text-muted mb-2">{t.description}</div>
              <div className="text-lg leading-relaxed">{defs.map(d => d.icon).join(' ')}</div>
            </button>
          )
        })}
      </div>

      <button onClick={onNext} className="w-full btn-accent py-3 rounded-2xl font-semibold">Volgende</button>
      <button onClick={onBack} className="w-full text-muted text-sm py-3">Terug</button>
    </>
  )
}

function Budgetten({ defs, budgets, onChange, onNext, onSkip, onBack }) {
  const totaal = Object.values(budgets).reduce((sum, v) => sum + (Number(v) || 0), 0)
  return (
    <>
      <h1 className="text-xl font-bold mb-1">Maandbudget</h1>
      <p className="text-muted text-sm mb-5">Optioneel — leeg laten mag, je kunt het later invullen.</p>

      <div className="card divide-y divide-border overflow-hidden mb-4 max-h-[45vh] overflow-y-auto">
        {defs.map(def => (
          <div key={def.key} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-xl w-7 text-center">{def.icon}</span>
            <span className="flex-1 text-sm">{def.label}</span>
            <span className="text-sm text-muted">€</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={budgets[def.key] ?? ''}
              onChange={e => onChange(def.key, e.target.value)}
              placeholder="0"
              className="w-20 rounded-lg px-2 py-1 text-sm text-right"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
          </div>
        ))}
      </div>
      <div className="text-xs text-muted text-right mb-4">Totaal {euro(totaal)} per maand</div>

      <button onClick={onNext} className="w-full btn-accent py-3 rounded-2xl font-semibold">Volgende</button>
      <button onClick={onSkip} className="w-full text-muted text-sm py-3">Sla over</button>
      <button onClick={onBack} className="w-full text-muted text-xs pb-1">Terug</button>
    </>
  )
}

function Data({ busy, onFinish, onBack }) {
  return (
    <>
      <h1 className="text-xl font-bold mb-1">Hoe wil je beginnen?</h1>
      <p className="text-muted text-sm mb-5">Je kunt altijd later nog een bankbestand importeren.</p>

      <div className="space-y-3">
        <Keuze
          icon="📤"
          titel="Bankbestand importeren"
          uitleg="Kies de CSV of Excel die je bij je bank downloadt"
          disabled={!!busy}
          onClick={() => onFinish('import')}
        />
        <Keuze
          icon="🧪"
          titel="Probeer met voorbeelddata"
          uitleg="Een half jaar verzonnen transacties om rond te kijken"
          disabled={!!busy}
          bezig={busy === 'demo'}
          onClick={() => onFinish('demo')}
        />
        <Keuze
          icon="✨"
          titel="Begin leeg"
          uitleg="Voeg zelf transacties toe"
          disabled={!!busy}
          onClick={() => onFinish('leeg')}
        />
      </div>

      <button onClick={onBack} disabled={!!busy} className="w-full text-muted text-sm py-4">Terug</button>
    </>
  )
}

function Keuze({ icon, titel, uitleg, onClick, disabled, bezig }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full card px-4 py-3 flex items-center gap-3 text-left"
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <div className="text-sm font-semibold">{titel}</div>
        <div className="text-xs text-muted">{bezig ? 'Bezig…' : uitleg}</div>
      </div>
      <span className="text-muted">›</span>
    </button>
  )
}

function Stippen({ step }) {
  return (
    <div className="flex justify-center gap-2 pb-8">
      {[0, 1, 2, 3].map(i => (
        <span
          key={i}
          className="rounded-full transition-all"
          style={{
            width: i === step ? 20 : 7,
            height: 7,
            background: i === step ? 'var(--color-accent)' : 'var(--color-border)',
          }}
        />
      ))}
    </div>
  )
}
