import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { BedragVeld, Foutmelding, SheetVoet, Veld } from './Fields'
import { parseBalanceInput } from '../../utils/balance'
import { setProjectionMonths, setWealthBuffer } from '../../hooks/useWealth'

const HORIZONS = [12, 24, 36, 60]

/** Je buffer (wat je nooit wilt aanraken) en hoe ver de projectie vooruitkijkt. */
export function BufferSheet({ buffer, months, onClose }) {
  const [bedrag, setBedrag] = useState(String(buffer ?? 0).replace('.', ','))
  const [horizon, setHorizon] = useState(months)
  const [fout, setFout] = useState('')

  async function bewaar() {
    try {
      setFout('')
      await setWealthBuffer(parseBalanceInput(bedrag) ?? 0)
      await setProjectionMonths(horizon)
      onClose()
    } catch (e) {
      setFout(e.message)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Buffer en horizon" footer={<SheetVoet onSave={bewaar} />}>
      <div className="px-4 py-4 space-y-4">
        <BedragVeld
          label="Buffer"
          value={bedrag}
          onChange={setBedrag}
          hint="Het bedrag dat je nooit wilt aanraken. Je vrije vermogen is wat daar bovenop komt, ná je reserveringen."
        />
        <Veld label="Projectie vooruit">
          <div className="flex gap-2">
            {HORIZONS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setHorizon(m)}
                className="flex-1 rounded-xl py-2.5 text-sm"
                style={m === horizon
                  ? { background: 'var(--color-accent)', color: 'white' }
                  : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
              >
                {m} mnd
              </button>
            ))}
          </div>
        </Veld>
        <Foutmelding>{fout}</Foutmelding>
      </div>
    </Sheet>
  )
}
