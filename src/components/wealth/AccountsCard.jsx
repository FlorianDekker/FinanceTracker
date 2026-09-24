import { useState } from 'react'
import { AccountSheet } from './AccountSheet'
import { euro, fmtDate } from '../../utils/formatters'
import { kindOf } from '../../utils/wealth/accounts'

/**
 * Je rekeningen met hun saldo, en daaronder — ingeklapt — het verloop van je
 * totale vermogen. Gearchiveerde rekeningen staan onderaan en tellen niet mee.
 */
export function AccountsCard({ accounts }) {
  const [sheet, setSheet] = useState(null)        // { account } of { nieuw: true }
  const [archiefOpen, setArchiefOpen] = useState(false)

  const actief = (accounts ?? []).filter(a => !a.archived)
  const archief = (accounts ?? []).filter(a => a.archived)

  return (
    <>
      <div className="px-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-[10px] font-semibold uppercase tracking-widest m-0" style={{ color: 'var(--color-muted)' }}>
            Rekeningen
          </h2>
          <button onClick={() => setSheet({ nieuw: true })} className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            + Rekening
          </button>
        </div>

        <div className="card overflow-hidden">
          {actief.length === 0 && (
            <p className="text-xs text-muted px-4 py-5 text-center">
              Nog geen rekeningen. Importeer je bank of voeg er zelf een toe.
            </p>
          )}
          {actief.map((a, i) => (
            <AccountRow key={a.key} account={a} onClick={() => setSheet({ account: a })} laatste={i === actief.length - 1} />
          ))}

          {archief.length > 0 && (
            <>
              <button
                onClick={() => setArchiefOpen(o => !o)}
                className="w-full px-4 py-2.5 text-left text-[11px] text-muted"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                {archiefOpen ? '▾' : '▸'} Archief ({archief.length})
              </button>
              {archiefOpen && archief.map((a, i) => (
                <AccountRow key={a.key} account={a} onClick={() => setSheet({ account: a })} laatste={i === archief.length - 1} />
              ))}
            </>
          )}

        </div>
      </div>

      {sheet && <AccountSheet account={sheet.account ?? null} onClose={() => setSheet(null)} />}
    </>
  )
}

function AccountRow({ account, onClick, laatste }) {
  const soort = kindOf(account.kind)
  const uitImport = account.source === 'abn-import'
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-3 flex items-center gap-3 text-left"
      style={laatste ? undefined : { borderBottom: '1px solid var(--color-border)' }}
    >
      <span className="text-xl" style={{ opacity: account.archived ? 0.4 : 1 }}>{soort.icon}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold truncate ${account.archived ? 'text-muted line-through' : ''}`}
          style={account.archived ? undefined : { color: 'var(--color-text)' }}>
          {account.name}
        </div>
        <div className="text-[11px] truncate" style={{ color: 'var(--color-muted)' }}>
          {uitImport ? 'uit import' : account.balanceAt ? `bijgewerkt ${fmtDate(account.balanceAt)}` : 'nog geen saldo'}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums" style={{ color: account.archived ? 'var(--color-muted)' : 'var(--color-text)' }}>
        {account.balance == null ? '—' : euro(account.balance)}
      </span>
      <span style={{ color: 'var(--color-muted)' }}>›</span>
    </button>
  )
}
