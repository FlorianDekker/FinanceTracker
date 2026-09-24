import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageWrapper } from '../components/layout/PageWrapper'
import { TripFormSheet } from '../components/trips/TripFormSheet'
import { TripDetailSheet } from '../components/trips/TripDetailSheet'
import {
  useTripSuggestions,
  useTripsOverview,
  useTripIgnore,
  ignoreTripCluster,
  clearTripIgnore,
  ensureTripSubcategoriesOnce,
} from '../hooks/useTrips'
import { countryName, flagsOf, tripIcon } from '../utils/trips/country'
import { euro, fmtDate } from '../utils/formatters'

/**
 * Vakanties: per reis wat hij jou kostte. Bovenaan de voorstellen — reeksen
 * buitenlandse betalingen die nog bij geen enkele vakantie horen — daaronder
 * de vakanties zelf, nieuwste eerst.
 */
export function TripsPage() {
  const navigate = useNavigate()
  const overzicht = useTripsOverview()
  const voorstellen = useTripSuggestions()
  const negeer = useTripIgnore()
  const [form, setForm] = useState(null)      // { trip } of { prefill }
  const [detailId, setDetailId] = useState(null)
  const [subs, setSubs] = useState(null)      // uitkomst van ensureTripSubcategories

  // De vaste subcategorieën van Vakantie (Vlucht, Vervoer, …) één keer per
  // app-sessie controleren; bestaande subs blijven zoals ze zijn.
  useEffect(() => { ensureTripSubcategoriesOnce().then(setSubs, () => setSubs(null)) }, [])

  const laden = overzicht == null

  return (
    <PageWrapper>
      <div className="safe-top px-4 pt-4 pb-2" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center gap-1 mb-1">
          <button onClick={() => navigate(-1)} aria-label="Terug" className="text-muted text-2xl leading-none px-1">‹</button>
          <h1 className="text-xl font-bold tracking-tight m-0 flex-1" style={{ color: 'var(--color-text)' }}>Vakanties</h1>
          <button
            onClick={() => setForm({ prefill: null })}
            className="btn-accent rounded-full px-3.5 py-1.5 text-xs"
          >
            + Vakantie
          </button>
        </div>
      </div>

      {laden && <div className="text-center text-muted py-12 text-sm">Laden…</div>}

      {subs && !subs.ok && (
        <p className="px-5 pt-2 text-[11px] text-orange">
          Er is geen categorie Vakantie. Maak hem aan bij Instellingen → Categorieën; dan kan de app
          uitgaven op reis onderverdelen in vlucht, vervoer, overnachting en zo verder.
        </p>
      )}

      {!laden && (negeer.txIds.length > 0 || negeer.notes.length > 0) && (voorstellen?.length ?? 0) === 0 && (
        <div className="px-4 pt-2 text-center">
          <button
            onClick={async () => { if (window.confirm('Genegeerde betalingen weer voorstellen?')) await clearTripIgnore() }}
            className="text-[11px]"
            style={{ color: 'var(--color-muted)' }}
          >
            {negeer.notes.length} {negeer.notes.length === 1 ? 'partij' : 'partijen'} genegeerd · opnieuw voorstellen
          </button>
        </div>
      )}

      {!laden && (voorstellen?.length ?? 0) > 0 && (
        <div className="px-4 pt-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--color-muted)' }}>
            Was je hier op reis?
          </div>
          <div className="space-y-2">
            {voorstellen.map(cluster => (
              <VoorstelKaart
                key={`${cluster.from}-${cluster.to}-${cluster.countries.join('')}`}
                cluster={cluster}
                onNegeer={async () => {
                  const partijen = [...new Set(cluster.transactions.map(tx => tx.note).filter(Boolean))]
                  const lijst = partijen.slice(0, 3).join(', ') + (partijen.length > 3 ? ` en ${partijen.length - 3} andere` : '')
                  if (!window.confirm(
                    `Geen vakantie? Deze ${cluster.count} ${cluster.count === 1 ? 'betaling' : 'betalingen'} worden niet meer voorgesteld, `
                    + `en ook toekomstige betalingen aan ${lijst || 'deze partijen'} niet.`
                  )) return
                  await ignoreTripCluster(cluster)
                }}
                onMaak={() => setForm({
                  prefill: {
                    name: cluster.countries.map(countryName).join(' & '),
                    from: cluster.from,
                    to: cluster.to,
                    countries: cluster.countries,
                    transactionIds: cluster.transactions.map(tx => tx.id),
                  },
                })}
              />
            ))}
          </div>
        </div>
      )}

      {!laden && (
        <div className="px-4 pt-3 space-y-3">
          {overzicht.length === 0 ? (
            <p className="text-center text-muted py-10 text-sm px-6">
              Nog geen vakanties. Maak er een aan; de app vinkt de betalingen uit het buitenland
              alvast voor je aan en je kunt je Splitser-settlement erbij inlezen.
            </p>
          ) : (
            overzicht.map(({ trip, costs }) => (
              <TripKaart key={trip.id} trip={trip} costs={costs} onOpen={() => setDetailId(trip.id)} />
            ))
          )}
        </div>
      )}

      {form && (
        <TripFormSheet
          trip={form.trip ?? null}
          prefill={form.prefill ?? null}
          onClose={() => setForm(null)}
          onSaved={id => setDetailId(id)}
        />
      )}
      {detailId != null && <TripDetailSheet tripId={detailId} onClose={() => setDetailId(null)} />}
    </PageWrapper>
  )
}

function VoorstelKaart({ cluster, onMaak, onNegeer }) {
  return (
    <div className="card px-4 py-3 flex items-center gap-3">
      <span className="text-xl shrink-0">{flagsOf(cluster.countries)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">
          {cluster.countries.map(countryName).join(' & ')}
        </div>
        <div className="text-[11px] text-muted truncate">
          {fmtDate(cluster.from)} – {fmtDate(cluster.to)} · {cluster.count}× · {euro(cluster.total)}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <button onClick={onMaak} className="btn-accent rounded-full px-3 py-1.5 text-[11px]">
          Vakantie maken
        </button>
        {/* Bijv. een incasso van een bedrijf dat in het buitenland zit. */}
        <button onClick={onNegeer} className="text-[11px] px-1" style={{ color: 'var(--color-muted)' }}>
          Geen vakantie
        </button>
      </div>
    </div>
  )
}

function TripKaart({ trip, costs, onOpen }) {
  return (
    <button onClick={onOpen} className="card w-full px-4 py-3 flex items-center gap-3 text-left">
      <span className="text-2xl shrink-0">{tripIcon(trip)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{trip.name}</div>
        <div className="text-[11px] text-muted truncate">
          {fmtDate(trip.from)} – {fmtDate(trip.to)} · {costs.days} {costs.days === 1 ? 'dag' : 'dagen'}
          {costs.hasSplitser && ' · Splitser'}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold tabular-nums">{euro(costs.myCost)}</div>
        <div className="text-[10px] text-muted tabular-nums">{euro(costs.perDayCost)}/dag</div>
      </div>
      <span style={{ color: 'var(--color-muted)' }}>›</span>
    </button>
  )
}
