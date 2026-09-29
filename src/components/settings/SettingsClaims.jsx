import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useClaimExpiryMonths, setClaimExpiryMonths, useOutstandingClaims, useVoorschotSummary, convertVoorschotToClaims } from '../../hooks/useClaims'
import { euro } from '../../utils/formatters'
import { StatusToast } from './StatusToast'

/**
 * Instellingen -> Declaraties: doorlink naar het declaratiescherm, de
 * eenmalige omzetting van Voorschot-uitgaven en de verval-instelling.
 */
export function SettingsClaims() {
  const claimExpiryMonths = useClaimExpiryMonths()
  const claims = useOutstandingClaims()
  const voorschot = useVoorschotSummary()
  const [status, setStatus] = useState(null)

  // Eenmalige opruimactie: de oude werkwijze (alles op categorie Voorschot)
  // omzetten naar echte declaraties. De categorie blijft staan; bij "Niet
  // declareren" doet de app daarna een voorstel voor de echte categorie.
  async function handleConvertVoorschot() {
    if (!window.confirm(
      `${voorschot.count} ${voorschot.count === 1 ? 'uitgave' : 'uitgaven'} in Voorschot ` +
      `(${euro(voorschot.total)}) omzetten naar open declaraties? ` +
      'Ze tellen daarna niet meer mee in je budget totdat ze zijn afgehandeld.'
    )) return
    const n = await convertVoorschotToClaims()
    setStatus({ success: `${n} uitgaven staan nu als open declaratie klaar.` })
  }

  return (
    <section className="px-4 pt-4 pb-2">
      <StatusToast status={status} onDismiss={() => setStatus(null)} />
      <div className="card overflow-hidden mt-3">
        <Link to="/declaraties" className="flex items-center gap-3 px-4 py-3" style={{ color: 'var(--color-text)' }}>
          <span className="text-xl">💼</span>
          <div className="flex-1">
            <div className="text-sm">Declaraties beheren</div>
            <div className="text-xs text-muted">Indienen, uitbetaling koppelen en afgekeurde kosten terugzetten</div>
          </div>
          <span className="text-sm text-muted">{euro(claims.total)} ({claims.count}) ›</span>
        </Link>
        {voorschot.count > 0 && (
          <div style={{ borderTop: '1px solid var(--color-border)' }}>
            <button
              onClick={handleConvertVoorschot}
              className="w-full flex items-center gap-3 px-4 pt-3 text-left"
            >
              <span className="text-xl">🔁</span>
              <div className="flex-1">
                <div className="text-sm">Zet Voorschot-uitgaven om naar declaraties</div>
                <div className="text-xs text-muted">
                  {voorschot.count} {voorschot.count === 1 ? 'uitgave staat' : 'uitgaven staan'} nog in Voorschot ({euro(voorschot.total)})
                </div>
              </div>
              <span className="text-sm text-muted">›</span>
            </button>
            <p className="text-[11px] text-muted px-4 pt-2 pb-3">
              Tip: gebruik voor nieuwe werkkosten de gewone categorie + 💼; de categorie Voorschot
              kun je hernoemen voor privé voorschieten.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <span className="text-xl">⏳</span>
          <div className="flex-1">
            <div className="text-sm">Declareren kan tot</div>
            <div className="text-xs text-muted">Waarschuwing zodra een open declaratie bijna te oud is</div>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="1"
              max="60"
              inputMode="numeric"
              key={claimExpiryMonths}
              defaultValue={claimExpiryMonths}
              onBlur={e => setClaimExpiryMonths(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-14 rounded-lg px-2 py-1 text-sm text-right"
              style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            />
            <span className="text-sm text-muted">mnd</span>
          </div>
        </div>
      </div>
    </section>
  )
}
