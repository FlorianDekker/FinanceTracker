import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from '../ui/Sheet'
import { db } from '../../db/db'
import { takeFile } from '../../utils/fileInput'
import {
  downloadBackup,
  estimateBackupBytes,
  restoreBackup,
  summarizeBackup,
  daysSince,
  LAST_BACKUP_KEY,
  BACKUP_REMINDER_DAYS,
} from '../../utils/backup'

const TABLE_LABELS = {
  transactions: 'Transacties',
  categories: 'Categorieën',
  settings: 'Instellingen',
  merchantHistory: 'Geleerde herkenningen',
  rules: 'Herkenningsregels',
  claimBatches: 'Declaratie-batches',
  receipts: 'Bonnetjes',
  receiptItems: 'Bonregels',
}

function fmtBytes(bytes) {
  if (bytes == null) return '…'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

function lastBackupText(at) {
  if (!at) return 'Laatste backup: nog nooit'
  const days = daysSince(at)
  if (days <= 0) return 'Laatste backup: vandaag'
  if (days === 1) return 'Laatste backup: 1 dag geleden'
  return `Laatste backup: ${days} dagen geleden`
}

function fmtMoment(iso) {
  if (!iso) return 'onbekend'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'onbekend'
  return d.toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Instellingen -> Data: volledige backup maken en terugzetten.
 * Meldingen lopen via onStatus({ success | error }) naar de toast in SettingsPage.
 */
export function BackupCard({ onStatus }) {
  const lastBackupAt = useLiveQuery(() => db.settings.get(LAST_BACKUP_KEY).then(r => r?.value ?? null), [])
  const receiptCount = useLiveQuery(() => db.receipts.count(), [], 0)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(null)
  const [includeImages, setIncludeImages] = useState(false)
  const [sizes, setSizes] = useState(null)

  // Alleen relevant zodra er bonnen zijn; de schatting kost een volledige
  // (in-memory) export, dus niet bij elke render.
  useEffect(() => {
    if (!receiptCount) return
    let levend = true
    Promise.all([estimateBackupBytes({ includeImages: false }), estimateBackupBytes({ includeImages: true })])
      .then(([zonder, met]) => { if (levend) setSizes({ zonder, met }) })
      .catch(() => {})
    return () => { levend = false }
  }, [receiptCount, lastBackupAt])

  const stale = lastBackupAt === undefined ? false : !lastBackupAt || daysSince(lastBackupAt) > BACKUP_REMINDER_DAYS

  async function handleBackup() {
    setBusy(true)
    try {
      const res = await downloadBackup({ includeImages })
      if (!res.cancelled) {
        const total = Object.values(res.counts).reduce((a, b) => a + b, 0)
        onStatus?.({ success: `✓ Backup gemaakt: ${res.fileName} (${total} rijen).` })
      }
    } catch (err) {
      onStatus?.({ error: `Backup maken mislukt: ${err.message}` })
    }
    setBusy(false)
  }

  async function handleFile(e) {
    try {
      const file = await takeFile(e)
      if (!file) return
      setPending({ ...summarizeBackup(await file.text()), fileName: file.name })
    } catch (err) {
      onStatus?.({ error: err.message })
    }
  }

  async function apply(mode) {
    if (mode === 'replace' && !window.confirm(
      'Alles vervangen wist je huidige transacties, categorieën, instellingen en geleerde herkenningen en zet de backup ervoor in de plaats. Doorgaan?'
    )) return
    setBusy(true)
    try {
      const res = await restoreBackup(pending.backup, { mode })
      const added = Object.values(res.stats).reduce((sum, s) => sum + s.added, 0)
      onStatus?.({
        success: mode === 'replace'
          ? `✓ Backup teruggezet: ${added} rijen geladen.`
          : `✓ Samengevoegd: ${added} nieuwe rijen toegevoegd.`,
      })
      setPending(null)
    } catch (err) {
      onStatus?.({ error: `Terugzetten mislukt: ${err.message}` })
    }
    setBusy(false)
  }

  return (
    <>
      <div className="card divide-y divide-border overflow-hidden">
        <button onClick={handleBackup} disabled={busy} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-xl">💾</span>
          <div className="flex-1">
            <div className="text-sm">Backup maken</div>
            <div className="text-xs text-muted">Alles in één JSON-bestand: transacties, categorieën, instellingen en leerdata</div>
          </div>
          {stale && (
            <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-orange/15 text-orange">
              {lastBackupAt ? '30+ dagen' : 'nog geen'}
            </span>
          )}
        </button>

        {receiptCount > 0 && (
          <button
            onClick={() => setIncludeImages(v => !v)}
            className="w-full flex items-center gap-3 px-4 py-3 text-left"
          >
            <span className="text-xl">🧾</span>
            <div className="flex-1">
              <div className="text-sm">Met bon-afbeeldingen (groter bestand)</div>
              <div className="text-xs text-muted">
                {sizes
                  ? `${fmtBytes(includeImages ? sizes.met : sizes.zonder)} · zonder ${fmtBytes(sizes.zonder)}, met ${fmtBytes(sizes.met)}`
                  : 'grootte berekenen…'}
              </div>
            </div>
            <span
              className="rounded-full transition-colors duration-200 shrink-0"
              style={{ width: 44, height: 26, padding: 3, background: includeImages ? 'var(--color-accent)' : 'var(--color-border)' }}
            >
              <span
                className="block rounded-full bg-white transition-transform duration-200"
                style={{ width: 20, height: 20, transform: includeImages ? 'translateX(18px)' : 'none' }}
              />
            </span>
          </button>
        )}

        <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
          <span className="text-xl">♻️</span>
          <div className="flex-1">
            <div className="text-sm">Backup terugzetten…</div>
            <div className="text-xs text-muted">Samenvoegen of alles vervangen — je ziet eerst een samenvatting</div>
          </div>
          <input type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
        </label>

        <div className="px-4 py-2.5 text-xs text-muted">
          {lastBackupAt === undefined ? '…' : lastBackupText(lastBackupAt)}
        </div>
      </div>

      {pending && (
        <Sheet
          open
          onClose={() => !busy && setPending(null)}
          title="Backup terugzetten"
          subtitle={pending.fileName}
          leading={<span className="text-2xl">♻️</span>}
          footer={
            <div className="flex flex-col gap-2">
              <button
                onClick={() => apply('merge')}
                disabled={busy}
                className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base"
              >
                Samenvoegen
              </button>
              <button
                onClick={() => apply('replace')}
                disabled={busy}
                className="w-full py-3 rounded-2xl font-semibold text-sm bg-red/15 text-red"
              >
                Alles vervangen
              </button>
            </div>
          }
        >
          <div className="px-4 py-4 space-y-3">
            <div className="text-xs text-muted">
              Gemaakt op {fmtMoment(pending.exportedAt)} · schemaversie {pending.schemaVersion ?? '?'}
            </div>

            <div className="card divide-y divide-border overflow-hidden">
              {Object.entries(pending.counts).map(([name, count]) => (
                <div key={name} className="flex items-center px-3 py-2 text-sm">
                  <span className="flex-1">{TABLE_LABELS[name] ?? name}</span>
                  <span className="tabular-nums text-muted">{count}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted">
              <strong style={{ color: 'var(--color-text)' }}>Samenvoegen</strong> houdt je huidige gegevens en voegt
              alleen toe wat nog ontbreekt (dubbele transacties worden overgeslagen).{' '}
              <strong style={{ color: 'var(--color-text)' }}>Alles vervangen</strong> wist eerst je huidige gegevens.
            </p>
          </div>
        </Sheet>
      )}
    </>
  )
}
