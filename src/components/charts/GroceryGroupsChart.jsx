import { useMemo, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { useCategories } from '../../hooks/useCategories'
import { euro, euroCompact, fmtDate } from '../../utils/formatters'
import { MONTHS } from '../../constants/categories'
import { chartColors, gridTheme, tickTheme, tooltipTheme } from '../../utils/theme'
import { groupColor, groupIcon, groupLabel } from '../../utils/receipts/groups'
import { berekenDekking, dekkingCategorieKeys, groepTotalen, groepenPerMaand, laatsteMaanden, maandVan } from '../../utils/receipts/insights'
import { StatCard } from '../ui/StatCard'
import { Sheet } from '../ui/Sheet'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip)

const MAANDEN = 6
const pad = n => String(n).padStart(2, '0')

/** 'JJJJ-MM' → 'sep' voor de x-as. */
function maandLabel(ym) {
  return MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym
}

/* ---------------- de regels achter één groep ---------------- */

function GroepSheet({ groep, items, ym, onClose }) {
  const rijen = [...items]
    .filter(i => i.group === groep)
    .sort((a, b) => Math.abs(b.price ?? 0) - Math.abs(a.price ?? 0))
  const totaal = rijen.reduce((s, i) => s + Math.abs(i.price ?? 0), 0)

  return (
    <Sheet
      open
      onClose={onClose}
      title={groupLabel(groep)}
      subtitle={`${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)} · ${euro(totaal)}`}
      leading={<span className="text-2xl">{groupIcon(groep)}</span>}
      maxHeight="70vh"
    >
      {rijen.length === 0 && <div className="text-center text-muted py-8 text-sm">Geen regels in deze groep</div>}
      {rijen.map(i => (
        <div key={i.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{i.name || '(zonder naam)'}</div>
            <div className="text-[11px] text-muted truncate">
              {[i.merchant, i.date ? fmtDate(i.date) : null, i.qty > 1 ? `${i.qty}×` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums shrink-0">{euro(Math.abs(i.price ?? 0))}</span>
        </div>
      ))}
    </Sheet>
  )
}

/**
 * Boodschappen-verdeling: waar gaat het boodschappengeld heen?
 *
 * Boven: zes maanden gestapeld per productgroep uit de uitgelezen bonregels.
 * Onder: de gekozen maand als donut met de groepen eronder; tik op een groep
 * voor de losse regels. De dekking-regel maakt eerlijk hoeveel van je
 * boodschappen überhaupt een bon heeft — zonder dat getal zou de verdeling
 * suggereren dat je álles ziet.
 */
export function GroceryGroupsChart({ year, month }) {
  const { allCategories } = useCategories()
  const [gekozenGroep, setGekozenGroep] = useState(null)

  const ym = `${year}-${pad(month)}`
  const maanden = useMemo(() => laatsteMaanden(MAANDEN, ym), [ym])

  const items = useLiveQuery(
    () => db.receiptItems.where('date').between(`${maanden[0]}-00`, `${maanden[maanden.length - 1]}-99`, true, true).toArray(),
    [maanden],
  )
  const txs = useLiveQuery(() => db.transactions.where('date').startsWith(ym).toArray(), [ym])
  const bonnenDezeMaand = useLiveQuery(() => db.receipts.where('date').startsWith(ym).count(), [ym], null)

  // Dekking meten we bij voorkeur over Boodschappen; bestaat die categorie niet
  // (vrienden met een eigen indeling), dan over alle uitgavecategorieën.
  const dekkingKeys = useMemo(() => dekkingCategorieKeys(allCategories), [allCategories])

  const perMaand = useMemo(() => groepenPerMaand(items ?? [], { maanden }), [items, maanden])
  const maandItems = useMemo(() => (items ?? []).filter(i => maandVan(i.date) === ym), [items, ym])
  const maandGroepen = useMemo(() => groepTotalen(maandItems), [maandItems])
  const dekking = useMemo(() => berekenDekking(txs ?? [], { ym, categorieKeys: dekkingKeys }), [txs, ym, dekkingKeys])

  if (items === undefined) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const c = chartColors()
  const barData = {
    labels: perMaand.maanden.map(maandLabel),
    datasets: perMaand.groepen.map(g => ({
      label: groupLabel(g),
      data: perMaand.perMaand.map(m => m.perGroep[g] ?? 0),
      backgroundColor: groupColor(g),
      borderRadius: 3,
      borderSkipped: false,
    })),
  }

  const barOptions = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.5,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipTheme(),
        callbacks: {
          title: ctx => {
            const m = perMaand.perMaand[ctx[0].dataIndex]
            return `${maandLabel(m.ym)} — ${euro(m.totaal)}${m.korting > 0 ? ` · korting ${euro(m.korting)}` : ''}`
          },
          label: ctx => (ctx.parsed.y > 0 ? `${ctx.dataset.label}: ${euro(ctx.parsed.y)}` : null),
        },
        filter: ctx => ctx.parsed.y > 0,
      },
    },
    scales: {
      x: { stacked: true, ticks: tickTheme(), grid: { display: false }, border: { display: false } },
      y: {
        stacked: true,
        ticks: { ...tickTheme(), callback: v => euroCompact(v), maxTicksLimit: 5 },
        grid: gridTheme(),
        border: { display: false },
      },
    },
  }

  const donutData = {
    labels: maandGroepen.rijen.map(r => r.label),
    datasets: [{
      data: maandGroepen.rijen.map(r => r.totaal),
      backgroundColor: maandGroepen.rijen.map(r => r.color),
      borderWidth: 0,
      spacing: 2,
    }],
  }

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '68%',
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...tooltipTheme(), callbacks: { label: ctx => `${ctx.label}: ${euro(ctx.parsed)}` } },
    },
  }

  const kortingMaanden = perMaand.perMaand.filter(m => m.korting > 0)
  const heeftBonnen = perMaand.totaal > 0 || maandGroepen.totaal > 0 || (bonnenDezeMaand ?? 0) > 0
  const dekkingPct = Math.round(dekking.ratio * 100)

  return (
    <div>
      <div className="card p-5 mb-4">
        <StatCard
          label={`Boodschappen op de bon · ${MONTHS[month - 1]}`}
          value={maandGroepen.totaal}
          delta={maandGroepen.rijen.length === 0
            ? 'nog geen bonregels deze maand'
            : `${maandGroepen.rijen.length} groepen · ${maandItems.length} regels`}
        />
        {maandGroepen.korting > 0 && (
          <div className="text-center text-[11px] mt-1 text-green font-semibold">
            Korting deze maand: {euro(maandGroepen.korting)}
          </div>
        )}
      </div>

      {!heeftBonnen ? (
        <div className="text-center text-muted py-12 text-sm">
          Nog geen uitgelezen bonregels in deze periode. Voeg een bon toe via 🧾 Bonnetjes.
        </div>
      ) : (
        <>
          <div data-chart-area className="card p-4 mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted)' }}>
              Laatste {MAANDEN} maanden
            </div>
            <Bar data={barData} options={barOptions} />
            {kortingMaanden.length > 0 && (
              <div className="text-[11px] mt-2 truncate" style={{ color: 'var(--color-muted)' }}>
                Korting: {kortingMaanden.map(m => `${maandLabel(m.ym)} ${euro(m.korting)}`).join(' · ')}
              </div>
            )}
          </div>

          {maandGroepen.rijen.length > 0 && (
            <div className="card p-4 mb-3">
              <div className="relative mx-auto" style={{ maxWidth: 220 }}>
                <Doughnut data={donutData} options={donutOptions} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-lg font-extrabold tabular-nums" style={{ color: c.text }}>{euro(maandGroepen.totaal)}</div>
                  <div className="text-[10px]" style={{ color: 'var(--color-muted)' }}>{MONTHS[month - 1]}</div>
                </div>
              </div>

              <div className="mt-3 divide-y divide-border">
                {maandGroepen.rijen.map(r => (
                  <button
                    key={r.group}
                    onClick={() => setGekozenGroep(r.group)}
                    className="w-full flex items-center gap-3 py-2 text-left"
                  >
                    <span className="text-base shrink-0">{r.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{r.label}</div>
                      <div className="h-1.5 rounded-full mt-1" style={{ background: 'var(--color-surface-2)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(r.aandeel * 100, 2)}%`, background: r.color }} />
                      </div>
                    </div>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-semibold tabular-nums">{euro(r.totaal)}</span>
                      <span className="block text-[10px] text-muted tabular-nums">{Math.round(r.aandeel * 100)}%</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="card px-4 py-3 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            {bonnenDezeMaand === null
              ? 'dekking berekenen…'
              : `Gebaseerd op ${bonnenDezeMaand} ${bonnenDezeMaand === 1 ? 'bon' : 'bonnen'} · `}
            {bonnenDezeMaand !== null && (dekking.totaal > 0
              ? `${dekkingPct}% van je boodschappen deze maand heeft een bon (${euro(dekking.metBon)} van ${euro(dekking.totaal)})`
              : 'geen uitgaven om mee te vergelijken deze maand')}
          </div>
        </>
      )}

      {gekozenGroep && (
        <GroepSheet groep={gekozenGroep} items={maandItems} ym={ym} onClose={() => setGekozenGroep(null)} />
      )}
    </div>
  )
}
