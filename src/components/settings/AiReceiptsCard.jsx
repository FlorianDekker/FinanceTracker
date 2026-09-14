import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  MODEL_OPTIONS,
  PROVIDER_PRESETS,
  receiptErrorMessage,
  setAiConfig,
  setStoreImages,
  storageEstimate,
  testAiConnection,
  useAiConfig,
  useReceiptStats,
  useStoreImages,
} from '../../hooks/useReceipts'

function mb(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

function Toggle({ on }) {
  return (
    <span
      className="rounded-full transition-colors duration-200 shrink-0"
      style={{ width: 44, height: 26, padding: 3, background: on ? 'var(--color-accent)' : 'var(--color-border)' }}
    >
      <span
        className="block rounded-full bg-white transition-transform duration-200"
        style={{ width: 20, height: 20, transform: on ? 'translateX(18px)' : 'none' }}
      />
    </span>
  )
}

// Korte versie van docs/ios-shortcut-bon.md; de volledige uitleg staat daar.
const SHORTCUT_STAPPEN = [
  'Maak in Opdrachten een nieuwe opdracht “Naar Budget” en zet bij Details “Toon in deelblad” aan.',
  'Ontvang [PDF’s, Afbeeldingen] uit [Deelblad]; bij geen invoer: vraag om foto’s.',
  'Als de invoer een PDF is: Maak afbeelding van PDF (Pagina’s: alle, RGB). Anders gaat de afbeelding ongewijzigd door.',
  'Kopieer naar klembord — zet “Verval op” uit, anders is het klembord al leeg voordat je plakt.',
  'Open URL: https://floriandekker.github.io/FinanceTracker/bon?paste=1',
  'Gebruik: in de AH- of Lidl-app op Deel tikken → Naar Budget → in Budget één tik op “Plak bonnetje”.',
]

/**
 * Instellingen → AI & bonnetjes: provider, sleutel, model, opslag en de
 * iOS-Shortcut. De sleutel staat onder de settings-key `aiApiKey`, die
 * `isSecretSettingKey` uit elke backup weert.
 */
export function AiReceiptsCard({ onStatus }) {
  const ai = useAiConfig()
  const stats = useReceiptStats()
  const bewaarBeelden = useStoreImages()
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [toonKey, setToonKey] = useState(false)
  const [test, setTest] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [opslag, setOpslag] = useState(null)
  const [shortcutOpen, setShortcutOpen] = useState(false)
  const [geladen, setGeladen] = useState(false)

  // Eén keer vullen zodra de config binnen is; daarna zijn de velden van de
  // gebruiker. Tijdens de render, want een effect zou een extra render kosten
  // (zelfde patroon als CategoryPicker).
  if (ai && !geladen) {
    setGeladen(true)
    setBaseUrl(ai.baseUrl)
    setApiKey(ai.apiKey)
  }

  useEffect(() => { storageEstimate().then(setOpslag).catch(() => {}) }, [stats?.count, bewaarBeelden])

  if (!ai) return null

  const preset = PROVIDER_PRESETS.find(p => p.baseUrl === ai.baseUrl)?.id ?? 'custom'

  async function kiesPreset(id) {
    const p = PROVIDER_PRESETS.find(x => x.id === id)
    if (!p || !p.baseUrl) return
    setBaseUrl(p.baseUrl)
    await setAiConfig({ baseUrl: p.baseUrl, model: p.model || ai.model })
  }

  async function testVerbinding() {
    setBezig(true)
    setTest(null)
    try {
      await setAiConfig({ baseUrl: baseUrl.trim() || undefined, apiKey })
      const res = await testAiConnection({ baseUrl: baseUrl.trim(), apiKey })
      setTest({ ok: true, text: `Verbinding gelukt · ${res.latencyMs} ms · ${res.model}` })
    } catch (err) {
      setTest({ ok: false, text: receiptErrorMessage(err).message })
    }
    setBezig(false)
  }

  async function toggleBeelden() {
    const nieuw = !bewaarBeelden
    await setStoreImages(nieuw)
    onStatus?.({ success: nieuw ? 'Bon-afbeeldingen worden bewaard.' : 'Nieuwe bonnen bewaren alleen de uitgelezen regels.' })
  }

  const vrij = opslag?.freeRatio == null ? null : Math.round(opslag.freeRatio * 100)

  return (
    <section className="px-4 pt-4 pb-2">
      <h2 className="text-xs text-muted uppercase tracking-wider mb-3">AI &amp; bonnetjes</h2>
      <div className="card divide-y divide-border overflow-hidden">
        {/* Provider */}
        <div className="px-4 py-3">
          <div className="text-sm mb-2">Dienst</div>
          <div className="flex gap-2">
            {PROVIDER_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => (p.id === 'custom' ? null : kiesPreset(p.id))}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${preset === p.id ? 'btn-accent' : 'text-muted'}`}
                style={preset === p.id ? undefined : { background: 'var(--color-surface-2)' }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="url"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            onBlur={() => setAiConfig({ baseUrl: baseUrl.trim() })}
            placeholder="https://api.together.xyz/v1"
            className="w-full rounded-lg px-3 py-2 mt-2"
            style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
          />
        </div>

        {/* API-sleutel */}
        <div className="px-4 py-3">
          <div className="text-sm mb-2">API-sleutel</div>
          <div className="flex gap-2">
            <input
              type={toonKey ? 'text' : 'password'}
              value={apiKey}
              autoComplete="off"
              onChange={e => setApiKey(e.target.value)}
              onBlur={() => setAiConfig({ apiKey })}
              placeholder="Plak hier je sleutel"
              className="flex-1 rounded-lg px-3 py-2"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
            <button
              onClick={() => setToonKey(v => !v)}
              aria-label={toonKey ? 'Sleutel verbergen' : 'Sleutel tonen'}
              className="w-11 rounded-lg text-lg"
              style={{ background: 'var(--color-surface-2)' }}
            >
              {toonKey ? '🙈' : '👁'}
            </button>
          </div>
          <div className="text-[11px] text-muted mt-1.5">
            Blijft op dit toestel staan. Wordt nooit in backups opgenomen.
          </div>
        </div>

        {/* Model */}
        <div className="px-4 py-3">
          <div className="text-sm mb-2">Model</div>
          <div className="space-y-1.5">
            {MODEL_OPTIONS.map(m => (
              <button
                key={m.id}
                onClick={() => setAiConfig({ model: m.id })}
                className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left"
                style={{
                  background: 'var(--color-surface-2)',
                  boxShadow: ai.model === m.id ? 'inset 0 0 0 2px var(--color-accent)' : 'none',
                }}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{m.label}</span>
                  <span className="block text-[11px] text-muted truncate">{m.hint}</span>
                </span>
                {ai.model === m.id && <span className="text-xs" style={{ color: 'var(--color-accent)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Test */}
        <div className="px-4 py-3">
          <button
            onClick={testVerbinding}
            disabled={bezig}
            className="w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--color-surface-2)' }}
          >
            {bezig ? 'Testen…' : 'Test verbinding'}
          </button>
          {test && (
            <div className={`text-xs mt-2 ${test.ok ? 'text-green' : 'text-red'}`}>{test.ok ? '✓ ' : '✕ '}{test.text}</div>
          )}
        </div>

        {/* Afbeeldingen bewaren */}
        <button onClick={toggleBeelden} className="w-full flex items-center gap-3 px-4 py-3 text-left">
          <span className="text-xl">🖼</span>
          <span className="flex-1 text-sm">
            Bon-afbeeldingen bewaren
            <span className="block text-[11px] text-muted">
              Uit = alleen de uitgelezen regels bewaren (scheelt veel ruimte)
            </span>
          </span>
          <Toggle on={bewaarBeelden !== false} />
        </button>

        {/* Opslag */}
        <div className="px-4 py-3 text-sm">
          Opslag
          <span className="block text-[11px] text-muted">
            Bonnen: {opslag?.count ?? '…'} · ~{mb(opslag?.bytes)}
            {vrij != null && ` · apparaat ${vrij}% vrij`}
            {opslag?.persisted ? ' · beschermd tegen opruimen' : ''}
          </span>
        </div>

        {/* Statistiek */}
        <div className="px-4 py-3 text-sm">
          Uitgelezen
          <span className="block text-[11px] text-muted">
            {stats?.count ?? 0} {(stats?.count ?? 0) === 1 ? 'bon' : 'bonnen'} · ≈ ${(stats?.estCost ?? 0).toFixed(4)} ·{' '}
            {(stats?.tokensIn ?? 0).toLocaleString('nl-NL')} in / {(stats?.tokensOut ?? 0).toLocaleString('nl-NL')} uit
          </span>
        </div>

        <Link to="/bon" className="flex items-center gap-3 px-4 py-3" style={{ color: 'var(--color-text)' }}>
          <span className="text-xl">🧾</span>
          <span className="flex-1 text-sm">
            Bonnetjes bekijken
            <span className="block text-[11px] text-muted">Toevoegen, koppelen en terugzoeken</span>
          </span>
          <span className="text-sm text-muted">›</span>
        </Link>

        {/* Shortcut-uitleg */}
        <button
          onClick={() => setShortcutOpen(o => !o)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
          aria-expanded={shortcutOpen}
        >
          <span className="text-xl">📲</span>
          <span className="flex-1 text-sm">
            Bon delen vanaf je iPhone (Shortcut)
            <span className="block text-[11px] text-muted">iOS kent geen deelmenu voor web-apps — dit is de omweg</span>
          </span>
          <span className="text-muted">{shortcutOpen ? '▾' : '›'}</span>
        </button>
        {shortcutOpen && (
          <div className="px-4 py-3 text-xs text-muted space-y-2">
            <ol className="list-decimal pl-4 space-y-1.5">
              {SHORTCUT_STAPPEN.map((stap, i) => <li key={i}>{stap}</li>)}
            </ol>
            <p>
              “Open URL” opent Safari en niet de geïnstalleerde web-app; dat is geen probleem, want beide gebruiken
              dezelfde opslag. De volledige uitleg met de bekende beperkingen staat in
              <span style={{ color: 'var(--color-text)' }}> docs/ios-shortcut-bon.md</span>.
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
