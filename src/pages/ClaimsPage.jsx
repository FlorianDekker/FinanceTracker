import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageWrapper } from '../components/layout/PageWrapper'
import { ClaimsChart } from '../components/claims/ClaimsChart'
import { ClaimItemSheet } from '../components/claims/ClaimItemSheet'
import { BatchSheet } from '../components/claims/BatchSheet'
import { useCategories } from '../hooks/useCategories'
import { useAllClaims, useClaimBatches, useClaimExpiryMonths } from '../hooks/useClaims'
import { euro, euroParts, fmtDate, fmtTimestamp } from '../utils/formatters'
import {
  claimAgeLabel,
  claimStatusOf,
  isExpired,
  isExpiringSoon,
  isPayout,
  sumAmount,
} from '../utils/claims'

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'submitted', label: 'Ingediend' },
  { id: 'done', label: 'Afgehandeld' },
]

export function ClaimsPage() {
  const navigate = useNavigate()
  const { catMap } = useCategories()
  const expiryMonths = useClaimExpiryMonths()
  const claims = useAllClaims()
  const batches = useClaimBatches()
  const [tab, setTab] = useState('open')
  const [detail, setDetail] = useState(null)     // losse declaratie
  const [batchDetail, setBatchDetail] = useState(null)

  const groups = useMemo(() => {
    const list = claims ?? []
    const year = String(new Date().getFullYear())
    return {
      open: list.filter(tx => claimStatusOf(tx) === 'open'),
      payouts: list.filter(isPayout),
      payoutsThisYear: list.filter(tx => isPayout(tx) && String(tx.date ?? '').startsWith(year)),
      looseRejected: list.filter(tx => claimStatusOf(tx) === 'rejected' && tx.claimBatchId == null),
      byBatch: list.reduce((map, tx) => {
        if (tx.claimBatchId == null || isPayout(tx)) return map
        ;(map[tx.claimBatchId] ??= []).push(tx)
        return map
      }, {}),
    }
  }, [claims])

  const submittedBatches = (batches ?? [])
    .filter(b => b.status === 'submitted')
    .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))
  const closedBatches = (batches ?? [])
    .filter(b => b.status === 'closed')
    .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0))

  const stats = [
    { label: 'Open', value: sumAmount(groups.open), sub: `${groups.open.length}×` },
    {
      label: 'Ingediend',
      value: sumAmount(submittedBatches.map(b => ({ amount: b.expectedTotal }))),
      sub: `${submittedBatches.length} ${submittedBatches.length === 1 ? 'batch' : 'batches'}`,
    },
    { label: 'Dit jaar terug', value: sumAmount(groups.payoutsThisYear), sub: `${groups.payoutsThisYear.length}×` },
  ]

  const loading = claims == null || batches == null

  return (
    <PageWrapper>
      <div className="safe-top px-4 pt-4 pb-2" style={{ background: 'var(--color-bg)' }}>
        <div className="flex items-center gap-1 mb-3">
          <button onClick={() => navigate(-1)} aria-label="Terug" className="text-muted text-2xl leading-none px-1">‹</button>
          <h1 className="text-xl font-bold tracking-tight m-0" style={{ color: 'var(--color-text)' }}>Declaraties</h1>
        </div>

        <div className="card px-4 py-3">
          <div className="flex justify-around items-start">
            {stats.map(stat => {
              const p = euroParts(stat.value)
              return (
                <div key={stat.label} className="text-center">
                  <div className="text-[9px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
                    {stat.label}
                  </div>
                  <div className="tabular-nums" style={{ color: 'var(--color-text)' }}>
                    <span className="text-sm font-bold">€{p.whole}</span>
                    <span className="text-[10px] font-medium" style={{ opacity: 0.4 }}>{p.dec}</span>
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-muted)' }}>{stat.sub}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="flex gap-1 mt-3 p-1 rounded-xl" style={{ background: 'var(--color-surface-2)' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${tab === t.id ? 'btn-accent' : 'text-muted'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="text-center text-muted py-12 text-sm">Laden…</div>}

      {!loading && tab === 'open' && (
        <OpenList
          items={groups.open}
          catMap={catMap}
          expiryMonths={expiryMonths}
          onSelect={setDetail}
        />
      )}

      {!loading && tab === 'submitted' && (
        <div className="px-4 pt-3 space-y-3">
          {submittedBatches.length === 0 && (
            <p className="text-center text-muted py-10 text-sm">Nog niets ingediend</p>
          )}
          {submittedBatches.map(batch => (
            <BatchCard
              key={batch.id}
              batch={batch}
              items={groups.byBatch[batch.id] ?? []}
              onOpen={() => setBatchDetail(batch)}
            />
          ))}
        </div>
      )}

      {!loading && tab === 'done' && (
        <div className="px-4 pt-3 space-y-3">
          {closedBatches.length === 0 && groups.looseRejected.length === 0 && (
            <p className="text-center text-muted py-10 text-sm">Nog niets afgehandeld</p>
          )}
          {closedBatches.map(batch => (
            <BatchCard
              key={batch.id}
              batch={batch}
              items={groups.byBatch[batch.id] ?? []}
              onOpen={() => setBatchDetail(batch)}
            />
          ))}
          {groups.looseRejected.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
                Niet gedeclareerd
              </div>
              <div className="divide-y divide-border">
                {groups.looseRejected.map(tx => (
                  <ClaimRow key={tx.id} tx={tx} catMap={catMap} onSelect={setDetail} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && (
        <div className="px-4 pt-4 pb-2">
          <ClaimsChart transactions={claims} batches={batches} />
        </div>
      )}

      {detail && <ClaimItemSheet tx={detail} onClose={() => setDetail(null)} />}
      {batchDetail && <BatchSheet batch={batchDetail} onClose={() => setBatchDetail(null)} />}
    </PageWrapper>
  )
}

/* ------------------------------------------------------------------ *
 * Lijsten                                                              *
 * ------------------------------------------------------------------ */

function OpenList({ items, catMap, expiryMonths, onSelect }) {
  if (!items.length) {
    return (
      <p className="text-center text-muted py-10 text-sm px-6">
        Geen open declaraties. Markeer een uitgave met 💼 in het formulier of bij het importeren.
      </p>
    )
  }
  return (
    <div className="px-4 pt-3">
      <div className="card overflow-hidden divide-y divide-border">
        {items.map(tx => (
          <ClaimRow key={tx.id} tx={tx} catMap={catMap} expiryMonths={expiryMonths} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function ClaimRow({ tx, catMap, expiryMonths, onSelect }) {
  const cat = catMap[tx.category]
  const expired = expiryMonths != null && isExpired(tx, expiryMonths)
  const soon = !expired && expiryMonths != null && isExpiringSoon(tx, expiryMonths)
  return (
    <button onClick={() => onSelect(tx)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
      <span className="text-xl w-7 text-center shrink-0">{cat?.icon ?? '💼'}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{tx.note || cat?.label || tx.category}</div>
        <div className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
          <span className="truncate">{fmtDate(tx.date)} · {claimAgeLabel(tx)}</span>
          {expired && <ExpiryBadge tone="red">verlopen</ExpiryBadge>}
          {soon && <ExpiryBadge tone="orange">verloopt binnenkort</ExpiryBadge>}
        </div>
      </div>
      <span className="text-sm font-semibold shrink-0 tabular-nums">{euro(tx.amount)}</span>
    </button>
  )
}

function ExpiryBadge({ tone, children }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap ${
      tone === 'red' ? 'bg-red-dim text-red' : 'bg-orange-dim text-orange'
    }`}>
      {children}
    </span>
  )
}

function BatchCard({ batch, items, onOpen }) {
  const rejected = items.filter(tx => claimStatusOf(tx) === 'rejected')
  const closed = batch.status === 'closed'
  return (
    <div className="card overflow-hidden">
      <button onClick={onOpen} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="text-xl shrink-0">💼</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{batch.name}</div>
          <div className="text-[11px] text-muted">
            {closed
              ? `Uitbetaald ${fmtTimestamp(batch.paidAt)} · ${items.length} ${items.length === 1 ? 'uitgave' : 'uitgaven'}`
              : `Ingediend ${fmtTimestamp(batch.submittedAt)} · ${items.length} ${items.length === 1 ? 'uitgave' : 'uitgaven'}`}
          </div>
          {closed && rejected.length > 0 && (
            <div className="text-[11px] text-red">{euro(sumAmount(rejected))} afgekeurd</div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold tabular-nums">
            {euro(closed ? (batch.paidAmount ?? 0) : (batch.expectedTotal ?? 0))}
          </div>
          <div className="text-[10px] text-muted">{closed ? 'ontvangen' : 'verwacht'}</div>
        </div>
        <span style={{ color: 'var(--color-muted)' }}>›</span>
      </button>
    </div>
  )
}
