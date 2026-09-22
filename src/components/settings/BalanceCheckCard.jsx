import { useState } from 'react'
import { TransactionListSheet } from '../transactions/TransactionListSheet'
import { euro, fmtDate, fmtTimestamp } from '../../utils/formatters'
import { compareBalance, parseBalanceInput, signed } from '../../utils/balance'
import { saveBalanceCheck, useBalanceCheck, useBalanceChecks } from '../../hooks/useBalanceCheck'

function maskAccount(iban) {
  const s = String(iban ?? '')
  return s.length > 8 ? `…${s.slice(-4)}` : s || 'onbekende rekening'
}

/**
 * Saldocontrole in Instellingen: laatste bankstand uit de import, wat er
 * sindsdien handmatig bij kwam, het verwachte saldo, en een veld voor wat je
 * bank nú toont. Het verschil vertelt of er iets ontbreekt of dubbel staat.
 */
export function BalanceCheckCard() {
  const [account, setAccount] = useState(null)
  const data = useBalanceCheck(account)
  const checks = useBalanceChecks()
  const [input, setInput] = useState('')
  const [result, setResult] = useState(null)
  const [saved, setSaved] = useState(false)
  const [listOpen, setListOpen] = useState(false)

  if (data === null) return <div className="card p-4 text-sm text-muted">Laden…</div>

  const { anchor, accounts, manual, expected } = data
  const netto = manual.reduce((s, tx) => s + signed(tx), 0)

  function vergelijk() {
    const actual = parseBalanceInput(input)
    setSaved(false)
    setResult(actual == null ? null : compareBalance(expected, actual))
  }

  async function bewaar() {
    if (!result) return
    await saveBalanceCheck({
      account: anchor.account,
      anchorDate: anchor.date,
      expected: result.expected,
      actual: result.actual,
      diff: result.diff,
      manualCount: manual.length,
    })
    setSaved(true)
  }

  if (!anchor) {
    return (
      <div className="card p-4">
        <p className="text-sm">Nog geen bankstand bekend.</p>
        <p className="text-xs text-muted mt-1">
          Importeer een export van je bank (ABN AMRO of ING); die bevat per regel het saldo, en daar rekent deze controle mee.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="card overflow-hidden">
        {accounts.length > 1 && (
          <div className="flex gap-2 px-4 pt-3 flex-wrap">
            {accounts.map(a => (
              <button
                key={a.account}
                onClick={() => { setAccount(a.account); setResult(null); setSaved(false) }}
                className="text-xs rounded-full px-3 py-1"
                style={a.account === anchor.account
                  ? { background: 'var(--color-accent)', color: 'white' }
                  : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
              >
                {maskAccount(a.account)}
              </button>
            ))}
          </div>
        )}

        <div className="px-4 py-3 space-y-1.5">
          <Regel label={`Bankstand uit import (${fmtDate(anchor.date)})`} value={euro(anchor.balance)} />
          <button onClick={() => setListOpen(true)} className="w-full flex justify-between items-center text-left" disabled={!manual.length}>
            <span className="text-xs text-muted">
              Handmatig sinds die dag · {manual.length} {manual.length === 1 ? 'transactie' : 'transacties'}{manual.length ? ' ›' : ''}
            </span>
            <span className={`text-sm tabular-nums ${netto > 0 ? 'text-green' : netto < 0 ? 'text-red' : ''}`}>
              {netto >= 0 ? '+' : '−'}{euro(Math.abs(netto))}
            </span>
          </button>
          <Regel label="Verwacht saldo nu" value={euro(expected)} strong />
        </div>

        <div className="px-4 pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
          <label className="block mt-3">
            <span className="text-xs text-muted">Saldo volgens je bank nu</span>
            <div className="flex gap-2 mt-1">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') vergelijk() }}
                className="flex-1 rounded-lg px-3"
                style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)', height: 40 }}
              />
              <button onClick={vergelijk} className="btn-accent text-sm rounded-lg px-4" style={{ height: 40 }}>
                Vergelijk
              </button>
            </div>
          </label>

          {result && (
            <div className="mt-3 rounded-xl px-4 py-3" style={{ background: 'var(--color-surface-2)' }}>
              {result.ok ? (
                <div className="text-sm text-green font-semibold">✓ Klopt precies</div>
              ) : (
                <>
                  <div className={`text-sm font-semibold ${result.diff > 0 ? 'text-green' : 'text-red'}`}>
                    Verschil {result.diff > 0 ? '+' : '−'}{euro(Math.abs(result.diff))}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {result.diff > 0
                      ? 'Je bank heeft méér dan de app verwacht: er ontbreekt een bijschrijving, of een uitgave staat dubbel in de app.'
                      : 'Je bank heeft minder dan de app verwacht: er ontbreekt een uitgave, of een bijschrijving staat dubbel in de app.'}
                    {' '}Kijk eerst bij de handmatige transacties hierboven.
                  </p>
                </>
              )}
              <button
                onClick={bewaar}
                disabled={saved}
                className="mt-2 text-xs font-medium disabled:opacity-40"
                style={{ color: 'var(--color-accent)' }}
              >
                {saved ? 'Controle bewaard' : 'Bewaar deze controle'}
              </button>
            </div>
          )}

          {checks.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted mb-1">Eerdere controles</div>
              <div className="divide-y divide-border">
                {checks.slice(0, 5).map(c => (
                  <div key={c.at} className="flex justify-between py-1.5 text-xs">
                    <span className="text-muted">{fmtTimestamp(c.at)}</span>
                    <span className={`tabular-nums font-medium ${Math.abs(c.diff) < 0.005 ? 'text-green' : c.diff > 0 ? 'text-green' : 'text-red'}`}>
                      {Math.abs(c.diff) < 0.005 ? '✓ klopt' : `${c.diff > 0 ? '+' : '−'}${euro(Math.abs(c.diff))}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted mt-3">
            Rekent met alle transacties, ook lopende declaraties: die zijn echt van je rekening af.
            {accounts.length > 1 && ' Handmatige transacties hebben geen rekening en tellen bij de gekozen rekening mee.'}
          </p>
        </div>
      </div>

      {listOpen && (
        <TransactionListSheet
          onClose={() => setListOpen(false)}
          title="Handmatig sinds de bankstand"
          subtitle={`vanaf ${fmtDate(anchor.date)} · netto ${netto >= 0 ? '+' : '−'}${euro(Math.abs(netto))}`}
          transactions={manual}
          emptyText="Niets handmatig toegevoegd"
        />
      )}
    </>
  )
}

function Regel({ label, value, strong = false }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-base font-bold' : 'text-sm'}`}>{value}</span>
    </div>
  )
}
