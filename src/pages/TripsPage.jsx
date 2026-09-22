import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageWrapper } from '../components/layout/PageWrapper'
import { TripFormSheet } from '../components/trips/TripFormSheet'
import { TripDetailSheet } from '../components/trips/TripDetailSheet'
import { useTripSuggestions, useTripsOverview } from '../hooks/useTrips'
import { countryName, flagsOf } from '../utils/trips/country'
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
  const [form, setForm] = useState(null)      // { trip } of { prefill }
  const [detailId, setDetailId] = useState(null)

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

function VoorstelKaart({ cluster, onMaak }) {
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
      <button onClick={onMaak} className="btn-accent rounded-full px-3 py-1.5 text-[11px] shrink-0">
        Vakantie maken
      </button>
    </div>
  )
}

function TripKaart({ trip, costs, onOpen }) {
  return (
    <button onClick={onOpen} className="card w-full px-4 py-3 flex items-center gap-3 text-left">
      <span className="text-2xl shrink-0">{flagsOf(trip.countries)}</span>
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
