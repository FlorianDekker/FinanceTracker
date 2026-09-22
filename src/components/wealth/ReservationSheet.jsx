import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { BedragVeld, Foutmelding, MaandVeld, SheetVoet, TekstVeld } from './Fields'
import { parseBalanceInput } from '../../utils/balance'
import { addReservation, deleteReservation, updateReservation } from '../../hooks/useWealth'

/**
 * Reservering toevoegen of bewerken. Zonder maand is het een "ooit": hij telt
 * wel van je vrije vermogen af, maar staat niet in de projectielijn.
 */
export function ReservationSheet({ reservation = null, onClose }) {
  const nieuw = !reservation
  const [naam, setNaam] = useState(reservation?.name ?? '')
  const [bedrag, setBedrag] = useState(reservation?.amount != null ? String(reservation.amount).replace('.', ',') : '')
  const [maand, setMaand] = useState(reservation?.dueMonth ?? '')
  const [notitie, setNotitie] = useState(reservation?.note ?? '')
  const [fout, setFout] = useState('')

  async function bewaar() {
    try {
      setFout('')
      const velden = { name: naam, amount: parseBalanceInput(bedrag) ?? 0, dueMonth: maand || null, note: notitie }
      if (nieuw) await addReservation(velden)
      else await updateReservation(reservation.id, velden)
      onClose()
    } catch (e) {
      setFout(e.message)
    }
  }

  async function verwijder() {
    await deleteReservation(reservation.id)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={nieuw ? 'Reservering toevoegen' : 'Reservering'}
      footer={<SheetVoet onSave={bewaar} saveLabel={nieuw ? 'Toevoegen' : 'Bewaren'} disabled={!naam.trim()} />}
    >
      <div className="px-4 py-4 space-y-4">
        <TekstVeld label="Waarvoor" value={naam} onChange={setNaam} placeholder="Tandarts" autoFocus={nieuw} />
        <BedragVeld label="Bedrag" value={bedrag} onChange={setBedrag} />
        <MaandVeld
          label="Wanneer"
          value={maand}
          onChange={setMaand}
          hint={maand ? 'Deze maand gaat het bedrag van de projectie af.' : 'Leeg = "ooit": telt wel van je vrije vermogen af, maar niet in de lijn.'}
        />
        {maand && (
          <button onClick={() => setMaand('')} className="text-xs font-medium" style={{ color: 'var(--color-accent)' }}>
            Maand wissen ("ooit")
          </button>
        )}
        <TekstVeld label="Notitie" value={notitie} onChange={setNotitie} placeholder="optioneel" />
        <Foutmelding>{fout}</Foutmelding>

        {!nieuw && (
          <button onClick={verwijder} className="w-full rounded-xl py-2.5 text-sm font-medium text-red"
            style={{ background: 'var(--color-red-dim)' }}>
            Verwijderen
          </button>
        )}
      </div>
    </Sheet>
  )
}
