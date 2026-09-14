import { useState } from 'react'
import { useRecurring } from '../../hooks/useRecurring'
import { useCategories } from '../../hooks/useCategories'
import { euro, fmtDate } from '../../utils/formatters'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { StatCard } from '../ui/StatCard'

const BADGE_TONES = {
  oranje: { color: 'var(--color-orange)', background: 'rgba(245, 158, 11, 0.15)' },
  rood: { color: 'var(--color-red)', background: 'var(--color-red-dim)' },
}

function Badge({ tone = 'oranje', children }) {
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 shrink-0"
      style={BADGE_TONES[tone]}
    >
      {children}
    </span>
  )
}

/**
 * Vaste lasten: alles wat elke maand terugkomt, met maand- en jaarbedrag,
 * een signaal als de prijs omhoog ging en als een afschrijving uitblijft.
 */
export function SubscriptionsChart() {
  const { colors } = useCategories()
  const { loading, posten, maandTotaal, open } = useRecurring()
  const [gekozen, setGekozen] = useState(null)

  if (loading) return <div className="flex items-center justify-center h-40 text-muted text-sm">Laden…</div>

  const gemist = posten.filter(p => p.gemist)
  const gestegen = posten.filter(p => p.verhoogd)
  const maxBedrag = posten[0]?.amount ?? 1

  const delta = posten.length === 0
    ? 'nog niets gevonden'
    : `${posten.length} posten · ${euro(maandTotaal * 12)} per jaar`

  return (
    <div>
      <div className="card p-5 mb-4">
        <StatCard label="Vaste lasten per maand" value={maandTotaal} delta={delta} />
        {posten.length > 0 && (
          <div className="flex justify-center gap-4 mt-3 text-[11px]" style={{ color: 'var(--color-muted)' }}>
            <span>{open.length} nog niet betaald deze maand</span>
            {gemist.length > 0 && <span className="text-red font-semibold">{gemist.length} gemist</span>}
            {gestegen.length > 0 && <span className="font-semibold">{gestegen.length} duurder</span>}
          </div>
        )}
      </div>

      <div data-chart-area className="card overflow-hidden">
        {posten.map((p, i) => {
          const color = colors[p.category] ?? '#8E8E93'
          const breedte = Math.max((p.amount / maxBedrag) * 100, 3)
          return (
            <button
              key={p.id}
              onClick={() => setGekozen(p)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left relative overflow-hidden"
              style={i < posten.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              <div className="absolute inset-y-0 left-0" style={{ width: `${breedte}%`, backgroundColor: color, opacity: 0.08 }} />
              <div className="relative flex items-center gap-3 w-full">
                <span className="text-base shrink-0">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{p.label}</span>
                    {p.verhoogd && <Badge>prijs gestegen</Badge>}
                    {p.gemist && <Badge tone="rood">gemist</Badge>}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--color-muted)' }}>
                    {euro(p.perJaar)} per jaar · laatst {fmtDate(p.lastDate)}
                    {p.verhoogd && ` · +${euro(p.verschil)}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-text)' }}>{euro(p.amount)}</div>
                  <div className="text-[10px]" style={{ color: p.paid ? 'var(--color-green)' : 'var(--color-muted)' }}>
                    {p.paid ? 'betaald' : `rond de ${p.verwachteDag}e`}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {posten.length === 0 && (
        <div className="text-center text-muted py-12 text-sm">
          Nog geen terugkerende posten gevonden. Die verschijnen zodra een bedrag in twee
          verschillende maanden in dezelfde (sub)categorie terugkomt.
        </div>
      )}

      {gekozen && (
        <TransactionListSheet
          onClose={() => setGekozen(null)}
          accent={colors[gekozen.category] ?? '#8E8E93'}
          leading={<span className="text-2xl">{gekozen.icon}</span>}
          title={gekozen.label}
          subtitle={`${euro(gekozen.amount)} per maand · ${gekozen.monthCount} maanden`}
          transactions={[...gekozen.transactions].reverse()}
          emptyText="Geen betalingen"
          showIcon={false}
          renderLabel={tx => tx.note || gekozen.label}
          renderMeta={tx => fmtDate(tx.date)}
        />
      )}
    </div>
  )
}
