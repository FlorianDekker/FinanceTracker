import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { BedragVeld, DatumVeld, Foutmelding, Pillen, SheetVoet, TekstVeld } from './Fields'
import { ACCOUNT_KINDS, maskAccount } from '../../utils/wealth/accounts'
import { parseBalanceInput } from '../../utils/balance'
import { euro, fmtDate, today } from '../../utils/formatters'
import { addAccount, archiveAccount, deleteAccount, setAccountBalance, updateAccount } from '../../hooks/useWealth'

const KIND_OPTIES = ACCOUNT_KINDS.map(k => ({ key: k.key, label: k.label, icon: k.icon }))

/**
 * Rekening toevoegen of bijwerken. Een rekening die uit de bankimport komt
 * heeft geen saldoveld: dat saldo volgt vanzelf uit je transacties.
 */
export function AccountSheet({ account = null, onClose }) {
  const nieuw = !account
  const uitImport = account?.source === 'abn-import'
  const [naam, setNaam] = useState(account?.name ?? '')
  const [soort, setSoort] = useState(account?.kind ?? 'spaar')
  const [saldo, setSaldo] = useState(account?.balance != null && !uitImport ? String(account.balance).replace('.', ',') : '')
  const [datum, setDatum] = useState(today())
  const [fout, setFout] = useState('')

  async function bewaar() {
    try {
      setFout('')
      if (nieuw) {
        await addAccount({ name: naam, kind: soort, balance: parseBalanceInput(saldo) ?? 0, balanceAt: datum })
      } else {
        await updateAccount(account.key, { name: naam.trim() || account.name, kind: soort })
        const bedrag = parseBalanceInput(saldo)
        if (!uitImport && bedrag != null && bedrag !== account.balance) {
          await setAccountBalance(account.key, bedrag, datum)
        }
      }
      onClose()
    } catch (e) {
      setFout(e.message)
    }
  }

  async function archiveer() {
    await archiveAccount(account.key, !account.archived)
    onClose()
  }

  async function verwijder() {
    if (!window.confirm(`"${account.name}" en het hele verloop van deze rekening verwijderen?`)) return
    await deleteAccount(account.key)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={nieuw ? 'Rekening toevoegen' : account.name}
      subtitle={uitImport ? `uit import · ${maskAccount(account.account)}` : account?.balanceAt ? `bijgewerkt ${fmtDate(account.balanceAt)}` : null}
      footer={<SheetVoet onSave={bewaar} saveLabel={nieuw ? 'Toevoegen' : 'Bewaren'} disabled={!naam.trim()} />}
    >
      <div className="px-4 py-4 space-y-4">
        <TekstVeld label="Naam" value={naam} onChange={setNaam} placeholder="Spaarrekening" autoFocus={nieuw} />
        <Pillen label="Soort" options={KIND_OPTIES} value={soort} onChange={setSoort} />

        {uitImport ? (
          <div className="rounded-xl px-4 py-3" style={{ background: 'var(--color-surface-2)' }}>
            <div className="text-xs text-muted">Saldo uit de bankimport</div>
            <div className="text-lg font-bold tabular-nums">{euro(account.balance ?? 0)}</div>
            <p className="text-[11px] text-muted mt-1">
              Het laatste banksaldo uit je import plus wat je daarna handmatig invoerde — dezelfde som als de
              saldocontrole in Instellingen. Dit saldo werkt zichzelf bij, je hoeft er niets aan te doen.
            </p>
          </div>
        ) : (
          <>
            <BedragVeld label={nieuw ? 'Saldo' : 'Nieuw saldo'} value={saldo} onChange={setSaldo} />
            <DatumVeld label="Per datum" value={datum} onChange={setDatum} hint="Hiermee groeit het verloop van je vermogen." />
          </>
        )}

        <Foutmelding>{fout}</Foutmelding>

        {!nieuw && (
          <div className="flex gap-2 pt-2">
            <button onClick={archiveer} className="flex-1 rounded-xl py-2.5 text-sm font-medium"
              style={{ background: 'var(--color-surface-2)', color: 'var(--color-text)' }}>
              {account.archived ? 'Terugzetten' : 'Archiveren'}
            </button>
            <button onClick={verwijder} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-red"
              style={{ background: 'var(--color-red-dim)' }}>
              Verwijderen
            </button>
          </div>
        )}
        {!nieuw && (
          <p className="text-[11px] text-muted">
            Archiveren haalt de rekening uit je totaal, maar bewaart het verloop.
          </p>
        )}
      </div>
    </Sheet>
  )
}
