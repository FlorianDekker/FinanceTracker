import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ReceiptCapture } from '../components/receipts/ReceiptCapture'
import { GroupChip, ReceiptViewer } from '../components/receipts/ReceiptViewer'
import { euro, euroParts, fmtDate } from '../utils/formatters'
import { MONTHS_LONG } from '../constants/categories'
import { useCategories } from '../hooks/useCategories'
import {
  RECEIPT_STATUS_LABELS,
  addReceiptFromClipboard,
  addReceiptFromFiles,
  addReceiptFromPasteEvent,
  extractReceiptById,
  receiptErrorMessage,
  useAiConfig,
} from '../hooks/useReceipts'
import {
  berekenDekking,
  bonnenPerMaand,
  dekkingCategorieKeys,
  topWinkels,
  zoekItems,
  zoekSamenvatting,
} from '../utils/receipts/insights'
import { takeShareInbox } from '../utils/receipts/shareInbox'

const KAN_PLAKKEN = typeof navigator !== 'undefined' && !!navigator.clipboard?.read

const pad = n => String(n).padStart(2, '0')

function maandTitel(ym) {
  if (ym === 'onbekend') return 'Zonder datum'
  const [jaar, maand] = ym.split('-').map(Number)
  return `${MONTHS_LONG[maand - 1]} ${jaar}`
}

/* ---------------- kop: drie kleine cijfers ---------------- */

function KopTegel({ label, value, sub, tone = 'neutral' }) {
  return (
    <div className="flex-1 card px-2 py-3 text-center min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-widest truncate" style={{ color: 'var(--color-muted)' }}>
        {label}
      </div>
      <div
        className={`text-xl font-extrabold tabular-nums leading-tight mt-0.5 ${tone === 'green' ? 'text-green' : tone === 'red' ? 'text-red' : ''}`}
        style={tone === 'neutral' ? { color: 'var(--color-text)' } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] truncate" style={{ color: 'var(--color-muted)' }}>{sub}</div>}
    </div>
  )
}

/* ---------------- één bon als tegel ---------------- */

function Tegel({ bon, onClick }) {
  const url = useMemo(() => (bon.thumb ? URL.createObjectURL(bon.thumb) : null), [bon.thumb])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <button onClick={onClick} className="text-left relative rounded-xl overflow-hidden">
      <div
        className="w-full aspect-square flex items-center justify-center"
        style={{ background: 'var(--color-surface-2)' }}
      >
        {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">🧾</span>}
      </div>
      {/* Winkel en totaal over de foto: zo blijft het raster rustig en toch leesbaar */}
      <div
        className="absolute inset-x-0 bottom-0 px-1.5 py-1"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
      >
        <div className="text-[10px] font-semibold text-white truncate">
          {bon.merchant ?? RECEIPT_STATUS_LABELS[bon.status] ?? 'Bon'}
        </div>
        <div className="text-[10px] text-white truncate" style={{ opacity: 0.75 }}>
          {bon.date ? fmtDate(bon.date) : '—'}{bon.total != null && ` · ${euro(bon.total)}`}
        </div>
      </div>
    </button>
  )
}

function TegelRaster({ bonnen, onOpen }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {bonnen.map(bon => <Tegel key={bon.id} bon={bon} onClick={() => onOpen(bon.id)} />)}
    </div>
  )
}

function Sectie({ titel, aantal, children }) {
  return (
    <div>
      <div className="text-xs text-muted uppercase tracking-wider mb-2">
        {titel}{aantal != null && ` (${aantal})`}
      </div>
      {children}
    </div>
  )
}

/**
 * Route `/bon`: alle bonnetjes bij elkaar.
 *
 * - Kop met drie cijfers: hoeveel bonnen, hoeveel bon-geld deze maand en welk
 *   deel van je boodschappen een bon heeft.
 * - Zoeken gaat over de productregels (`receiptItems`), niet over de bonnen:
 *   "olijfolie" moet je álle keren tonen dat je het kocht, met prijs en winkel.
 * - Zonder zoekterm eerst wat aandacht vraagt (te controleren, ongekoppeld) en
 *   daarna alle bonnen per maand.
 *
 * Met `?paste=1` (de iOS-Shortcut "Naar Budget") staat de klembord-knop
 * bovenaan: `navigator.clipboard.read()` mág alleen tijdens een user-gesture,
 * dus nooit automatisch bij het laden. Als vangnet luistert de pagina ook op
 * het gewone `paste`-event — zie docs/ios-shortcut-bon.md.
 *
 * Met `?share=1` komt de bon uit het Android-deelmenu: de service worker heeft
 * het bestand al in een eigen IndexedDB gezet — zie docs/android-share.md.
 */
export function ReceiptsPage() {
  const [params, setParams] = useSearchParams()
  const plakModus = params.get('paste') === '1'
  const deelModus = params.get('share') === '1'
  const deelFout = params.get('shareError') === '1'
  const ai = useAiConfig()
  const { allCategories } = useCategories()
  const [captureOpen, setCaptureOpen] = useState(false)
  const [viewerId, setViewerId] = useState(null)
  const [bezig, setBezig] = useState(null)
  const [fout, setFout] = useState(null)
  const [zoek, setZoek] = useState('')
  const [filter, setFilter] = useState('alle')
  const zoekRef = useRef(null)

  const bonnen = useLiveQuery(() => db.receipts.orderBy('id').reverse().toArray(), [], null)
  const items = useLiveQuery(() => db.receiptItems.toArray(), [], null)

  const nu = new Date()
  const ym = `${nu.getFullYear()}-${pad(nu.getMonth() + 1)}`
  const txs = useLiveQuery(() => db.transactions.where('date').startsWith(ym).toArray(), [ym], null)
  const dekking = useMemo(
    () => berekenDekking(txs ?? [], { ym, categorieKeys: dekkingCategorieKeys(allCategories) }),
    [txs, ym, allCategories],
  )

  // Stabiele referentie voor de useMemo's hieronder (zie PriceHistoryChart).
  const lijst = useMemo(() => bonnen ?? [], [bonnen])
  const teControleren = lijst.filter(b => b.status === 'review' || b.status === 'error')
  const ongekoppeld = lijst.filter(b => b.transactionId == null && b.status !== 'error')
  const winkels = useMemo(() => topWinkels(lijst, 5), [lijst])
  const maandTotaal = lijst
    .filter(b => String(b.date ?? '').startsWith(ym))
    .reduce((s, b) => s + (Number(b.total) || 0), 0)

  const gefilterd = filter === 'ongekoppeld' ? ongekoppeld
    : filter === 'review' ? teControleren
    : filter.startsWith('winkel:') ? lijst.filter(b => b.merchantKey === filter.slice(7))
    : lijst
  const perMaand = useMemo(() => bonnenPerMaand(gefilterd), [gefilterd])

  const treffers = useMemo(() => (zoek.trim() ? zoekItems(items ?? [], zoek) : []), [items, zoek])
  const trefferStat = useMemo(() => zoekSamenvatting(treffers), [treffers])

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
    if (plakModus || deelModus) setParams({}, { replace: true })
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
      // Tijdens het typen in het zoekveld hoort plakken gewoon tekst te zijn.
      if (e.target instanceof HTMLInputElement) return
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
  }, [ai?.apiKey, plakModus, deelModus])

  // Android-deelmenu: de service worker heeft het bestand al opgeslagen en ons
  // hierheen gestuurd. Eén keer ophalen, daarna is de inbox leeg.
  const deelGedaan = useRef(false)
  useEffect(() => {
    if (!deelModus || deelGedaan.current) return
    deelGedaan.current = true
    ;(async () => {
      setBezig('opslaan')
      try {
        const bestanden = await takeShareInbox()
        if (!bestanden.length) {
          setBezig(null)
          setFout({ message: 'De gedeelde bon is niet aangekomen. Probeer het opnieuw, of kies hieronder “Bon toevoegen”.', needsSettings: false })
          setParams({}, { replace: true })
          return
        }
        await verwerk(await addReceiptFromFiles(bestanden, 'share'))
      } catch (err) {
        setFout(receiptErrorMessage(err))
        setBezig(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deelModus])

  const dekkingPct = Math.round(dekking.ratio * 100)
  const maandDelen = euroParts(maandTotaal)

  return (
    <PageWrapper title="Bonnetjes">
      <div className="px-4 space-y-3">
        {/* Drieluik */}
        <div className="flex gap-2">
          <KopTegel label="Bonnen" value={bonnen === null ? '…' : lijst.length} sub={teControleren.length > 0 ? `${teControleren.length} te controleren` : 'alles gecontroleerd'} />
          <KopTegel label="Deze maand" value={`€${maandDelen.whole}`} sub={`${MONTHS_LONG[nu.getMonth()].toLowerCase()} · ${lijst.filter(b => String(b.date ?? '').startsWith(ym)).length} bonnen`} />
          <KopTegel
            label="Dekking"
            value={txs === null ? '…' : `${dekkingPct}%`}
            sub={dekking.totaal > 0 ? `${euro(dekking.metBon)} van ${euro(dekking.totaal)}` : 'geen uitgaven'}
            tone={dekking.totaal === 0 ? 'neutral' : dekkingPct >= 60 ? 'green' : dekkingPct >= 25 ? 'neutral' : 'red'}
          />
        </div>

        {(fout || deelFout) && (
          <div className="rounded-xl px-3 py-2.5 text-xs bg-red-dim text-red">
            {fout?.message ?? 'Het delen ging mis; de bon is niet aangekomen.'}
            {fout?.needsSettings && <> <Link to="/settings" className="font-semibold underline">Naar Instellingen ›</Link></>}
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

        {/* Zoeken op productnaam */}
        <div className="flex items-center gap-2">
          <input
            ref={zoekRef}
            type="search"
            value={zoek}
            placeholder="Zoek product…"
            enterKeyHint="search"
            onChange={e => setZoek(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && zoekRef.current?.blur()}
            className="flex-1 rounded-xl px-3 py-2 placeholder-muted"
            style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-card)' }}
          />
          {zoek && (
            <button onClick={() => setZoek('')} className="text-sm font-semibold shrink-0 text-accent">Wis</button>
          )}
        </div>

        {zoek.trim() ? (
          <div>
            {treffers.length === 0 ? (
              <div className="text-sm text-muted py-8 text-center">
                Geen productregel gevonden voor “{zoek.trim()}”.
              </div>
            ) : (
              <>
                <div className="text-[11px] mb-2" style={{ color: 'var(--color-muted)' }}>
                  {trefferStat.aantal}× gekocht · gem. {euro(trefferStat.gemiddeld)}
                  {trefferStat.laatst && ` · laatst op ${fmtDate(trefferStat.laatst)}`}
                </div>
                <div className="card divide-y divide-border overflow-hidden">
                  {treffers.map(i => (
                    <button
                      key={i.id}
                      onClick={() => setViewerId(i.receiptId)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">{i.name || i.nameKey}</div>
                        <div className="text-[11px] text-muted truncate">
                          {[i.date ? fmtDate(i.date) : null, i.merchant || null, i.qty > 1 ? `${i.qty}×` : null]
                            .filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <GroupChip group={i.group} />
                      <span className={`text-sm font-semibold tabular-nums shrink-0 ${i.isDiscount ? 'text-green' : ''}`}>
                        {i.price == null ? '—' : euro(Math.abs(i.price))}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Filterchips */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {[
                { id: 'alle', label: `Alle (${lijst.length})` },
                { id: 'ongekoppeld', label: `Ongekoppeld (${ongekoppeld.length})` },
                { id: 'review', label: `Te controleren (${teControleren.length})` },
                ...winkels.map(w => ({ id: `winkel:${w.merchantKey}`, label: `${w.merchant} (${w.aantal})` })),
              ].map(chip => (
                <button
                  key={chip.id}
                  onClick={() => setFilter(chip.id)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${filter === chip.id ? 'btn-accent' : 'text-muted'}`}
                  style={filter === chip.id ? undefined : { background: 'var(--color-surface-2)' }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {bonnen === null && <div className="text-sm text-muted py-6 text-center">Laden…</div>}
            {bonnen !== null && lijst.length === 0 && (
              <div className="text-sm text-muted py-8 text-center">Nog geen bonnen bewaard.</div>
            )}

            {filter === 'alle' && teControleren.length > 0 && (
              <Sectie titel="Te controleren" aantal={teControleren.length}>
                <TegelRaster bonnen={teControleren} onOpen={setViewerId} />
              </Sectie>
            )}

            {filter === 'alle' && ongekoppeld.length > 0 && (
              <Sectie titel="Ongekoppeld" aantal={ongekoppeld.length}>
                <TegelRaster bonnen={ongekoppeld} onOpen={setViewerId} />
              </Sectie>
            )}

            {gefilterd.length === 0 && lijst.length > 0 && (
              <div className="text-sm text-muted py-8 text-center">Geen bonnen in dit filter.</div>
            )}

            {perMaand.map(groep => (
              <Sectie key={groep.ym} titel={maandTitel(groep.ym)} aantal={groep.bonnen.length}>
                <TegelRaster bonnen={groep.bonnen} onOpen={setViewerId} />
              </Sectie>
            ))}
          </>
        )}
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
