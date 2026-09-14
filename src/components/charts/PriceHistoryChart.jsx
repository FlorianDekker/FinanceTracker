import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { euro, fmtDate } from '../../utils/formatters'
import { gridTheme, tickTheme, tooltipTheme } from '../../utils/theme'
import { meestGekocht, prijsSamenvatting, prijshistorie, topProducten, zoekItems } from '../../utils/receipts/insights'
import { StatCard } from '../ui/StatCard'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip)

// Vaste kleuren per winkel, in de volgorde waarin de winkels in je bonnen
// voorkomen. Bewust niet de categorie-kleuren: een winkel is geen categorie.
const WINKEL_KLEUREN = ['#007AFF', '#FF9500', '#34C759', '#AF52DE', '#FF2D92', '#30B0C7', '#D4A017', '#FF3B30']

const pad = n => String(n).padStart(2, '0')

function vandaagPrefixen() {
  const d = new Date()
  return { maand: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, jaar: String(d.getFullYear()) }
}

/* ---------------- top-producten lijstje ---------------- */

function TopLijst({ titel, rijen, waarde, onKies }) {
  if (rijen.length === 0) return null
  const max = Math.max(...rijen.map(r => waarde(r).getal), 1)
  return (
    <div className="card p-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
        {titel}
      </div>
      <div className="divide-y divide-border">
        {rijen.map(r => {
          const w = waarde(r)
          return (
            <button key={r.nameKey} onClick={() => onKies(r.nameKey)} className="w-full flex items-center gap-3 py-2 text-left">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{r.name}</div>
                <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--color-surface-2)' }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max((w.getal / max) * 100, 2)}%`, background: 'var(--color-accent)' }}
                  />
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">{w.tekst}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Prijzen: wat betaal je door de tijd heen voor één product, en welke
 * producten bepalen je boodschappenrekening?
 *
 * De prijs is genormaliseerd naar prijs per stuk (`unitPrice`, anders
 * `price / qty`) — zonder dat zou "2 voor €2,70" als een prijsverhoging lezen.
 * Punten zijn gekleurd per winkel, want het verschil tussen winkels is vaak
 * groter dan het verschil tussen weken.
 */
export function PriceHistoryChart() {
  const [zoek, setZoek] = useState('')
  const [gekozen, setGekozen] = useState(null)
  const [periode, setPeriode] = useState('maand')

  const items = useLiveQuery(() => db.receiptItems.toArray(), [], null)
  // Eén stabiele referentie: anders zou `items ?? []` elke render een nieuwe
  // lege array zijn en alle useMemo's hieronder opnieuw laten rekenen.
  const lijst = useMemo(() => items ?? [], [items])

  const chips = useMemo(() => meestGekocht(lijst, 20), [lijst])
  const treffers = useMemo(() => (zoek.trim() ? zoekItems(lijst, zoek, { limiet: 400 }) : []), [lijst, zoek])

  // Zoeken kiest zelf het eerste product dat erbij past, zodat je na één
  // letter al een lijn ziet in plaats van een lege grafiek.
  const zoekKeys = useMemo(() => {
    const seen = new Map()
    for (const i of treffers) if (i.nameKey && !seen.has(i.nameKey)) seen.set(i.nameKey, i.name || i.nameKey)
    return [...seen.entries()].map(([nameKey, name]) => ({ nameKey, name }))
  }, [treffers])

  const actief = gekozen ?? zoekKeys[0]?.nameKey ?? chips[0]?.nameKey ?? null
  const punten = useMemo(() => (actief ? prijshistorie(lijst, actief) : []), [lijst, actief])
  const samenvatting = useMemo(() => prijsSamenvatting(punten), [punten])

  const prefixen = vandaagPrefixen()
  const top = useMemo(
    () => topProducten(lijst, { prefix: periode === 'maand' ? prefixen.maand : prefixen.jaar, limiet: 5 }),
    [lijst, periode, prefixen.maand, prefixen.jaar],
  )

  if (items === null) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  if (lijst.length === 0) {
    return (
      <div className="text-center text-muted py-12 text-sm">
        Nog geen uitgelezen bonregels. Zodra je een bon toevoegt, verschijnt hier de prijs per product.
      </div>
    )
  }

  // Chart.js tekent op canvas: CSS-variabelen werken daar niet, dus de
  // accentkleur wordt hier uitgelezen (zelfde truc als WeekdayChart).
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#1E3A5F'
  const winkels = [...new Set(punten.map(p => p.merchant || 'Onbekend'))]
  const kleurVan = merchant => WINKEL_KLEUREN[Math.max(0, winkels.indexOf(merchant || 'Onbekend')) % WINKEL_KLEUREN.length]

  const data = {
    labels: punten.map(p => fmtDate(p.date)),
    datasets: [{
      data: punten.map(p => p.prijs),
      borderColor: accent,
      borderWidth: 2,
      tension: 0.25,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: punten.map(p => kleurVan(p.merchant)),
      pointBorderColor: punten.map(p => kleurVan(p.merchant)),
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.6,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: ctx => fmtDate(punten[ctx[0].dataIndex].date),
          label: ctx => {
            const p = punten[ctx.dataIndex]
            return `${euro(p.prijs)} per stuk${p.merchant ? ` · ${p.merchant}` : ''}${p.qty > 1 ? ` · ${p.qty} stuks` : ''}`
          },
        },
      },
    },
    scales: {
      x: { ticks: { ...tickTheme(), maxTicksLimit: 6 }, grid: { display: false }, border: { display: false } },
      y: { ticks: { ...tickTheme(), callback: v => euro(v), maxTicksLimit: 5 }, grid: gridTheme(), border: { display: false } },
    },
  }

  const naam = punten[punten.length - 1]?.name
    || zoekKeys.find(k => k.nameKey === actief)?.name
    || chips.find(ch => ch.nameKey === actief)?.name
    || actief
    || 'Kies een product'

  const stijging = samenvatting.was == null ? null : samenvatting.verschil

  return (
    <div>
      <div className="card p-5 mb-3">
        <StatCard
          label={naam}
          value={samenvatting.nu ?? 0}
          tone={stijging == null ? 'neutral' : stijging > 0 ? 'red' : stijging < 0 ? 'green' : 'neutral'}
          delta={samenvatting.was == null
            ? (samenvatting.aantal === 1 ? 'één keer gekocht' : 'nog geen prijsverloop')
            : `was ${euro(samenvatting.was)} · ${stijging > 0 ? '+' : '−'}${euro(Math.abs(stijging))} (${stijging > 0 ? '+' : ''}${samenvatting.pct}%)`}
          deltaTone={stijging == null ? 'muted' : stijging > 0 ? 'red' : 'green'}
          deltaOpacity={0.8}
        />
        {samenvatting.aantal > 1 && (
          <div className="text-center text-[11px] mt-1" style={{ color: 'var(--color-muted)' }}>
            {samenvatting.aantal}× gekocht · laagst {euro(samenvatting.laagste)} · hoogst {euro(samenvatting.hoogste)}
          </div>
        )}
      </div>

      <input
        type="search"
        value={zoek}
        placeholder="Zoek product…"
        enterKeyHint="search"
        onChange={e => { setZoek(e.target.value); setGekozen(null) }}
        className="w-full rounded-xl px-3 py-2 mb-2 placeholder-muted"
        style={{ fontSize: '16px', background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      />

      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-2 mb-2">
        {(zoek.trim() ? zoekKeys : chips).slice(0, 20).map(p => (
          <button
            key={p.nameKey}
            onClick={() => setGekozen(p.nameKey)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${p.nameKey === actief ? 'btn-accent' : 'text-muted'}`}
            style={p.nameKey === actief ? undefined : { background: 'var(--color-surface-2)' }}
          >
            {p.nameKey}
          </button>
        ))}
        {zoek.trim() && zoekKeys.length === 0 && (
          <span className="text-xs text-muted py-1">Geen product gevonden</span>
        )}
      </div>

      {punten.length > 0 ? (
        <div data-chart-area className="card p-4 mb-3">
          <Line data={data} options={options} />
          {winkels.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {winkels.map(w => (
                <span key={w} className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--color-muted)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: kleurVan(w) }} />
                  {w}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-muted py-8 text-sm">Kies een product om het prijsverloop te zien.</div>
      )}

      {/* Top producten */}
      <div className="flex justify-center mb-3">
        <div className="flex rounded-full p-0.5" style={{ background: 'var(--color-surface-2)' }}>
          {[['maand', 'Deze maand'], ['jaar', 'Dit jaar']].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setPeriode(v)}
              className={`px-5 py-1 rounded-full text-xs font-semibold transition-all duration-200 ${periode === v ? 'btn-accent' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {top.aantalProducten === 0 ? (
        <div className="text-center text-muted py-6 text-sm">
          Nog geen bonregels {periode === 'maand' ? 'deze maand' : 'dit jaar'}.
        </div>
      ) : (
        <div className="space-y-3">
          <TopLijst
            titel="Meest gekocht"
            rijen={top.vaakst}
            waarde={r => ({ getal: r.keer, tekst: `${r.keer}×` })}
            onKies={key => { setZoek(''); setGekozen(key) }}
          />
          <TopLijst
            titel="Meeste euro's"
            rijen={top.duurst}
            waarde={r => ({ getal: r.totaal, tekst: euro(r.totaal) })}
            onKies={key => { setZoek(''); setGekozen(key) }}
          />
        </div>
      )}
    </div>
  )
}
