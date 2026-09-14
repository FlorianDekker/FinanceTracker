import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet } from '../ui/Sheet'
import {
  addReceiptFromClipboard,
  addReceiptFromFiles,
  extractReceiptById,
  receiptErrorMessage,
  useAiConfig,
} from '../../hooks/useReceipts'

const KAN_PLAKKEN = typeof navigator !== 'undefined' && !!navigator.clipboard?.read

function Knop({ icon, title, subtitle, onClick, disabled, tone = 'normal' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 text-left disabled:opacity-40"
      style={{ background: tone === 'accent' ? 'var(--color-accent)' : 'var(--color-surface-2)', color: tone === 'accent' ? '#fff' : 'var(--color-text)' }}
    >
      <span className="text-2xl w-8 text-center shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        {subtitle && (
          <span className="block text-[11px]" style={{ color: tone === 'accent' ? 'rgba(255,255,255,0.75)' : 'var(--color-muted)' }}>
            {subtitle}
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * "Bon toevoegen": camera, bestand/bibliotheek, PDF of klembord.
 *
 * Foto's worden eerst verzameld (een lange bon mag uit meerdere stukken
 * bestaan) en daarna in één keer opgeslagen en uitgelezen. PDF's gaan
 * rechtstreeks door: die zijn altijd één bon.
 *
 * Props: open, onClose, transactionId?, expectedTotal?, onDone(receiptId)
 */
export function ReceiptCapture({ open, onClose, transactionId = null, expectedTotal = null, onDone }) {
  const ai = useAiConfig()
  const heeftSleutel = !!ai?.apiKey
  const [stukken, setStukken] = useState([])
  const [bron, setBron] = useState('file')
  const [bezig, setBezig] = useState(null)        // 'opslaan' | 'uitlezen' | null
  const [fout, setFout] = useState(null)
  const cameraRef = useRef(null)
  const bestandRef = useRef(null)

  function reset() {
    setStukken(vorige => { vorige.forEach(s => URL.revokeObjectURL(s.url)); return [] })
    setFout(null)
    setBezig(null)
  }

  function sluit() {
    reset()
    onClose?.()
  }

  function kiesBestanden(e, nieuweBron) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!files.length) return
    setFout(null)
    const pdfs = files.filter(f => (f.type ?? '').includes('pdf') || /\.pdf$/i.test(f.name ?? ''))
    const beelden = files.filter(f => !pdfs.includes(f))
    if (beelden.length) setStukken(vorige => [...vorige, ...beelden.map(file => ({ file, url: URL.createObjectURL(file) }))])
    if (pdfs.length) verwerk(pdfs, 'pdf')
    else if (!beelden.length) setFout({ message: 'Dit bestandstype wordt niet ondersteund. Kies een foto of een PDF.' })
    // De camera-route heeft maar één foto tegelijk; `bron` blijft bewaard voor
    // de bon die we straks aanmaken.
    if (beelden.length) setBron(nieuweBron)
  }

  async function verwerk(files, source) {
    setBezig('opslaan')
    setFout(null)
    try {
      const ids = await addReceiptFromFiles(files, source, { transactionId })
      await naVerwerken(ids)
    } catch (err) {
      setFout(receiptErrorMessage(err))
      setBezig(null)
    }
  }

  async function naVerwerken(ids) {
    const id = ids[ids.length - 1]
    if (id == null) { setBezig(null); return }
    if (!heeftSleutel) {
      reset()
      onDone?.(id, { extracted: false })
      return
    }
    setBezig('uitlezen')
    try {
      await extractReceiptById(id)
      reset()
      onDone?.(id, { extracted: true })
    } catch (err) {
      setBezig(null)
      setFout(receiptErrorMessage(err))
      // De bon zelf is bewaard; de viewer toont de foutstatus en "Opnieuw uitlezen".
      onDone?.(id, { extracted: false })
    }
  }

  async function plak() {
    setBezig('opslaan')
    setFout(null)
    try {
      const ids = await addReceiptFromClipboard({ transactionId })
      await naVerwerken(ids)
    } catch (err) {
      setBezig(null)
      setFout(receiptErrorMessage(err))
    }
  }

  async function opslaanStukken() {
    const files = stukken.map(s => s.file)
    stukken.forEach(s => URL.revokeObjectURL(s.url))
    setStukken([])
    await verwerk(files, bron)
  }

  if (!open) return null

  return (
    <Sheet
      open
      onClose={bezig ? () => {} : sluit}
      title="Bon toevoegen"
      subtitle={expectedTotal != null ? `Bij een uitgave van € ${expectedTotal.toFixed(2).replace('.', ',')}` : undefined}
      leading={<span className="text-2xl">🧾</span>}
      maxHeight="88vh"
      bodyClassName="p-4"
    >
      {bezig ? (
        <div className="py-10 text-center">
          <div className="text-4xl mb-3">{bezig === 'uitlezen' ? '🤖' : '💾'}</div>
          <div className="text-sm font-semibold">
            {bezig === 'uitlezen' ? 'Bon uitlezen…' : 'Bon opslaan…'}
          </div>
          <div className="text-xs text-muted mt-1">
            {bezig === 'uitlezen' ? 'Dit duurt meestal 3 tot 4 seconden' : 'Foto verkleinen en bewaren'}
          </div>
          <div className="mt-4 mx-auto h-1.5 w-40 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
            <div className="h-full w-1/3 rounded-full animate-pulse" style={{ background: 'var(--color-accent)' }} />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {!heeftSleutel && (
            <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: 'var(--color-surface-2)' }}>
              Er is nog geen AI-sleutel ingesteld, dus de regels worden niet uitgelezen. De foto zelf bewaren kan wel.{' '}
              <Link to="/settings" onClick={sluit} className="font-semibold" style={{ color: 'var(--color-accent)' }}>
                Instellen bij AI &amp; bonnetjes ›
              </Link>
            </div>
          )}

          {fout && (
            <div className="rounded-xl px-3 py-2.5 text-xs bg-red-dim text-red">
              {fout.message}
              {fout.needsSettings && (
                <>
                  {' '}
                  <Link to="/settings" onClick={sluit} className="font-semibold underline">Naar Instellingen ›</Link>
                </>
              )}
            </div>
          )}

          {stukken.length > 0 && (
            <div className="rounded-2xl p-3" style={{ background: 'var(--color-surface-2)' }}>
              <div className="text-xs font-semibold mb-2">
                {stukken.length === 1 ? '1 stuk klaar' : `${stukken.length} stukken klaar`} · samen één bon
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {stukken.map((s, i) => (
                  <img key={i} src={s.url} alt={`Stuk ${i + 1}`} className="h-24 w-16 object-cover rounded-lg shrink-0" />
                ))}
              </div>
            </div>
          )}

          <Knop
            icon="📷"
            title="Foto maken"
            subtitle="Camera — richt op de hele bon"
            onClick={() => cameraRef.current?.click()}
          />
          <Knop
            icon="🖼"
            title="Uit bibliotheek of bestand"
            subtitle="Foto, screenshot of PDF (bijv. de AH-app)"
            onClick={() => bestandRef.current?.click()}
          />
          {KAN_PLAKKEN && (
            <Knop
              icon="📋"
              title="Plak bonnetje"
              subtitle="Vanaf het klembord — werkt met de Shortcut “Naar Budget”"
              onClick={plak}
            />
          )}

          {stukken.length > 0 && (
            <>
              <Knop
                icon="➕"
                title="Nog een stuk"
                subtitle="Voor een bon die niet op één foto past"
                onClick={() => cameraRef.current?.click()}
              />
              <button
                onClick={opslaanStukken}
                className="w-full btn-accent rounded-2xl py-3.5 text-base mt-1"
              >
                {heeftSleutel ? 'Opslaan en uitlezen' : 'Opslaan'}
                {stukken.length > 1 ? ` · ${stukken.length} stukken` : ''}
              </button>
            </>
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => kiesBestanden(e, 'camera')}
          />
          <input
            ref={bestandRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={e => kiesBestanden(e, 'file')}
          />
        </div>
      )}
    </Sheet>
  )
}
