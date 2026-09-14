import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ReceiptCapture } from '../components/receipts/ReceiptCapture'
import { ReceiptViewer } from '../components/receipts/ReceiptViewer'
import { euro, fmtDate } from '../utils/formatters'
import {
  RECEIPT_STATUS_LABELS,
  addReceiptFromClipboard,
  addReceiptFromPasteEvent,
  extractReceiptById,
  receiptErrorMessage,
  useAiConfig,
} from '../hooks/useReceipts'

const KAN_PLAKKEN = typeof navigator !== 'undefined' && !!navigator.clipboard?.read

function Tegel({ bon, onClick }) {
  const url = useMemo(() => (bon.thumb ? URL.createObjectURL(bon.thumb) : null), [bon.thumb])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <button onClick={onClick} className="text-left">
      <div
        className="w-full aspect-square rounded-xl overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--color-surface-2)' }}
      >
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">🧾</span>}
      </div>
      <div className="text-[11px] mt-1 truncate">{bon.merchant ?? RECEIPT_STATUS_LABELS[bon.status]}</div>
      <div className="text-[10px] text-muted truncate">
        {bon.date ? fmtDate(bon.date) : '—'}{bon.total != null && ` · ${euro(bon.total)}`}
      </div>
    </button>
  )
}

/**
 * Route `/bon`.
 *
 * Met `?paste=1` (de iOS-Shortcut "Naar Budget") staat de klembord-knop
 * bovenaan: `navigator.clipboard.read()` mág alleen tijdens een user-gesture,
 * dus nooit automatisch bij het laden. Als vangnet luistert de pagina ook op
 * het gewone `paste`-event — zie docs/ios-shortcut-bon.md.
 *
 * Het volledige overzicht met zoeken op productnaam komt in stap 5C; hier
 * staan de laatste 20 bonnen als grid.
 */
export function ReceiptsPage() {
  const [params, setParams] = useSearchParams()
  const plakModus = params.get('paste') === '1'
  const ai = useAiConfig()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [viewerId, setViewerId] = useState(null)
  const [bezig, setBezig] = useState(null)
  const [fout, setFout] = useState(null)

  const bonnen = useLiveQuery(() => db.receipts.orderBy('id').reverse().limit(20).toArray(), [], null)

  async function verwerk(ids) {
    const id = ids?.[ids.length - 1]
    if (id == null) { setBezig(null); return }
    if (ai?.apiKey) {
      setBezig('uitlezen')
      try {
        await extractReceiptById(id)
      } catch (err) {
        setFout(receiptErrorMessage(err))
      }
    }
    setBezig(null)
    setViewerId(id)
    if (plakModus) setParams({}, { replace: true })
  }

  async function plakKnop() {
    setFout(null)
    setBezig('opslaan')
    try {
      await verwerk(await addReceiptFromClipboard())
    } catch (err) {
      setFout(receiptErrorMessage(err))
      setBezig(null)
    }
  }

  // Vangnet: ⌘V of "Plakken" uit het systeemmenu. De plakactie zelf is de
  // toestemming, dus hier is geen extra bevestiging nodig.
  useEffect(() => {
    async function onPaste(e) {
      const heeftAfbeelding = Array.from(e.clipboardData?.items ?? [])
        .some(i => i.kind === 'file' && (i.type ?? '').startsWith('image/'))
      if (!heeftAfbeelding) return
      e.preventDefault()
      setFout(null)
      setBezig('opslaan')
      try {
        await verwerk(await addReceiptFromPasteEvent(e))
      } catch (err) {
        setFout(receiptErrorMessage(err))
        setBezig(null)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai?.apiKey, plakModus])

  return (
    <PageWrapper title="Bonnetjes">
      <div className="px-4 space-y-3">
        {fout && (
          <div className="rounded-xl px-3 py-2.5 text-xs bg-red-dim text-red">
            {fout.message}
            {fout.needsSettings && <> <Link to="/settings" className="font-semibold underline">Naar Instellingen ›</Link></>}
          </div>
        )}

        {bezig && (
          <div className="rounded-xl px-3 py-2.5 text-sm" style={{ background: 'var(--color-surface-2)' }}>
            {bezig === 'uitlezen' ? '🤖 Bon uitlezen…' : '💾 Bon opslaan…'}
          </div>
        )}

        {plakModus && (
          <div className="card p-4 text-center">
            <div className="text-3xl mb-2">📋</div>
            <div className="text-sm font-semibold mb-1">Bon van het klembord</div>
            <p className="text-xs text-muted mb-3">
              De Shortcut heeft de bon op het klembord gezet. Tik hieronder — Safari vraagt daarna nog één keer om te
              bevestigen.
            </p>
            <button
              onClick={plakKnop}
              disabled={!!bezig || !KAN_PLAKKEN}
              className="w-full btn-accent rounded-2xl py-3.5 text-base disabled:opacity-40"
            >
              Plak bonnetje
            </button>
            {!KAN_PLAKKEN && (
              <p className="text-[11px] text-muted mt-2">
                Deze browser kan het klembord niet uitlezen. Gebruik ⌘V of kies hieronder “Bon toevoegen”.
              </p>
            )}
          </div>
        )}

        <button onClick={() => setCaptureOpen(true)} className="w-full btn-accent rounded-2xl py-3.5 text-base">
          🧾 Bon toevoegen
        </button>

        {!ai?.apiKey && (
          <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'var(--color-surface-2)' }}>
            Er is nog geen AI-sleutel ingesteld; bonnen worden dan wel bewaard maar niet uitgelezen.{' '}
            <Link to="/settings" className="font-semibold" style={{ color: 'var(--color-accent)' }}>
              Instellen ›
            </Link>
          </div>
        )}

        <div>
          <div className="text-xs text-muted uppercase tracking-wider mb-2">Laatste bonnen</div>
          {bonnen === null && <div className="text-sm text-muted py-6 text-center">Laden…</div>}
          {bonnen?.length === 0 && (
            <div className="text-sm text-muted py-8 text-center">Nog geen bonnen bewaard.</div>
          )}
          {bonnen?.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {bonnen.map(bon => <Tegel key={bon.id} bon={bon} onClick={() => setViewerId(bon.id)} />)}
            </div>
          )}
        </div>
      </div>

      <ReceiptCapture
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onDone={id => { setCaptureOpen(false); setViewerId(id) }}
      />

      {viewerId != null && <ReceiptViewer receiptId={viewerId} onClose={() => setViewerId(null)} />}
    </PageWrapper>
  )
}
