import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageWrapper } from '../components/layout/PageWrapper'
import { StatusToast } from '../components/settings/StatusToast'
import { useChartsSummary } from '../components/settings/SettingsCharts'
import { SETTINGS_SECTIONS } from '../components/settings/sections'
import { useCategories } from '../hooks/useCategories'
import { useOutstandingClaims } from '../hooks/useClaims'
import { euro } from '../utils/formatters'
import { db } from '../db/db'
import { clearDemoData, DEMO_MODE_KEY } from '../utils/demoData'
import { daysSince, LAST_BACKUP_KEY, BACKUP_REMINDER_DAYS } from '../utils/backup'

/**
 * Instellingen: overzichtsscherm met een lijst groepen (in iOS-Instellingen-stijl)
 * die elk een eigen subscherm openen op /settings/:sectie. Dit ene bestand
 * dekt zowel /settings (overzicht) als /settings/:sectie (subscherm-layout);
 * de inhoud per sectie staat in src/components/settings/*.
 */
export function SettingsPage() {
  const { sectie } = useParams()
  const section = sectie ? SETTINGS_SECTIONS.find(s => s.id === sectie) : null

  if (sectie) return <SettingsSection section={section} />
  return <SettingsOverview />
}

function SettingsSection({ section }) {
  const navigate = useNavigate()

  if (!section) {
    return (
      <PageWrapper>
        <div className="safe-top px-4 pt-4 pb-2 flex items-center gap-1" style={{ background: 'var(--color-bg)' }}>
          <button onClick={() => navigate('/settings')} aria-label="Terug" className="text-muted text-2xl leading-none px-1">‹</button>
          <h1 className="text-xl font-bold tracking-tight m-0" style={{ color: 'var(--color-text)' }}>Instellingen</h1>
        </div>
        <p className="text-center text-muted py-10 text-sm px-6">Deze sectie bestaat niet (meer).</p>
      </PageWrapper>
    )
  }

  const Content = section.Component
  return (
    <PageWrapper>
      <div className="safe-top px-4 pt-4 pb-2 flex items-center gap-1" style={{ background: 'var(--color-bg)' }}>
        <button onClick={() => navigate('/settings')} aria-label="Terug" className="text-muted text-2xl leading-none px-1">‹</button>
        <h1 className="text-xl font-bold tracking-tight m-0" style={{ color: 'var(--color-text)' }}>{section.title}</h1>
      </div>
      <Content />
    </PageWrapper>
  )
}

function SettingsOverview() {
  const totalTxCount = useLiveQuery(() => db.transactions.count(), [])
  const rulesCount = useLiveQuery(() => db.rules.count(), [])
  const demoMode = useLiveQuery(() => db.settings.get(DEMO_MODE_KEY).then(r => r?.value === true), [])
  const lastBackupAt = useLiveQuery(() => db.settings.get(LAST_BACKUP_KEY).then(r => r?.value ?? null), [])
  const { categories } = useCategories()
  const claims = useOutstandingClaims()
  const chartsSummary = useChartsSummary()
  const [status, setStatus] = useState(null)

  const backupStale = lastBackupAt === undefined ? false : !lastBackupAt || daysSince(lastBackupAt) > BACKUP_REMINDER_DAYS

  // Dynamische ondertitels voor de rijen waarvoor dat al lichtgewicht data is
  // (geen extra queries nodig t.o.v. wat de rest van het overzicht al laadt).
  const subtitles = {
    charts: chartsSummary ?? undefined,
    categories: `${categories.length} categorieën · ${rulesCount ?? '…'} regels`,
    claims: claims.count > 0 ? `${euro(claims.total)} open (${claims.count})` : 'Niets open',
  }

  async function handleClearDemo() {
    if (!window.confirm('Alle voorbeelddata wissen en opnieuw beginnen? Je categorieën en instellingen blijven staan.')) return
    await clearDemoData()
    setStatus({ success: 'Voorbeelddata gewist. Je kunt nu je eigen bankbestand importeren.' })
  }

  return (
    <PageWrapper title="Instellingen">
      <StatusToast status={status} onDismiss={() => setStatus(null)} />

      {backupStale && (
        <Link
          to="/settings/data"
          className="mx-4 mt-4 flex items-center gap-3 rounded-xl px-4 py-3 bg-orange/15"
        >
          <span className="text-xl">💾</span>
          <div className="flex-1">
            <div className="text-sm font-medium text-orange">
              {lastBackupAt ? `Backup is ${daysSince(lastBackupAt)} dagen oud` : 'Nog geen backup gemaakt'}
            </div>
            <div className="text-xs text-muted">Tik om een backup te maken</div>
          </div>
          <span className="text-orange">›</span>
        </Link>
      )}

      <section className="px-4 pt-4 pb-2">
        <div className="card divide-y divide-border overflow-hidden">
          {SETTINGS_SECTIONS.map(s => (
            <Link
              key={s.id}
              to={`/settings/${s.id}`}
              className="w-full flex items-center gap-3 px-4 py-3"
              style={{ color: 'var(--color-text)' }}
            >
              <span className="text-xl w-7 text-center shrink-0">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{s.title}</div>
                <div className="text-xs text-muted truncate">{subtitles[s.id] ?? s.subtitle}</div>
              </div>
              <span className="text-sm text-muted">›</span>
            </Link>
          ))}
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
    </PageWrapper>
  )
}
