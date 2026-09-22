import { useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { EmojiPickerLite } from '../ui/EmojiPickerLite'
import { BedragVeld, Foutmelding, MaandVeld, Pillen, SheetVoet, TekstVeld, Veld } from './Fields'
import { parseBalanceInput } from '../../utils/balance'
import { monthOf } from '../../utils/wealth/months'
import { addGoal, deleteGoal, updateGoal } from '../../hooks/useWealth'

const REGELS = [
  { key: 'surplus', label: 'Alles wat overblijft' },
  { key: 'fixed', label: 'Vast bedrag' },
  { key: 'surplus_above', label: 'Overschot boven…' },
]

const UITLEG = {
  surplus: 'Alles wat je die maand overhield gaat hierheen — wat dit doel niet meer nodig heeft, stroomt door naar het volgende doel.',
  fixed: 'Elke maand hetzelfde bedrag, vóór de andere doelen. Hield je minder over, dan gaat er ook minder in: meer dan er is kan niet.',
  surplus_above: 'Alles boven dit bedrag gaat hierheen; de rest blijft staan voor de doelen daaronder en je lopende uitgaven.',
}

/** Spaardoel toevoegen of bewerken, inclusief de regel waarmee het zich vult. */
export function GoalSheet({ goal = null, onClose }) {
  const nieuw = !goal
  const [icoon, setIcoon] = useState(goal?.icon ?? '🎯')
  const [naam, setNaam] = useState(goal?.name ?? '')
  const [doelbedrag, setDoelbedrag] = useState(goal?.target != null ? String(goal.target).replace('.', ',') : '')
  const [start, setStart] = useState(goal?.startMonth ?? monthOf())
  const [regel, setRegel] = useState(goal?.rule?.type ?? 'surplus')
  const [regelBedrag, setRegelBedrag] = useState(
    goal?.rule?.amount != null ? String(goal.rule.amount).replace('.', ',')
      : goal?.rule?.floor != null ? String(goal.rule.floor).replace('.', ',') : '',
  )
  const [kiezerOpen, setKiezerOpen] = useState(false)
  const [fout, setFout] = useState('')

  function bouwRegel() {
    const bedrag = parseBalanceInput(regelBedrag) ?? 0
    if (regel === 'fixed') return { type: 'fixed', amount: bedrag }
    if (regel === 'surplus_above') return { type: 'surplus_above', floor: bedrag }
    return { type: 'surplus' }
  }

  async function bewaar() {
    try {
      setFout('')
      const velden = {
        name: naam,
        icon: icoon,
        target: parseBalanceInput(doelbedrag) ?? 0,
        rule: bouwRegel(),
        startMonth: start || monthOf(),
      }
      if (nieuw) await addGoal(velden)
      else await updateGoal(goal.id, velden)
      onClose()
    } catch (e) {
      setFout(e.message)
    }
  }

  async function verwijder() {
    if (!window.confirm(`"${goal.name}" verwijderen? De maandbijdragen worden dan opnieuw over je andere doelen verdeeld.`)) return
    await deleteGoal(goal.id)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={nieuw ? 'Spaardoel toevoegen' : goal.name}
      footer={<SheetVoet onSave={bewaar} saveLabel={nieuw ? 'Toevoegen' : 'Bewaren'} disabled={!naam.trim()} />}
    >
      <div className="px-4 py-4 space-y-4">
        <div className="flex gap-3 items-end">
          <button
            type="button"
            onClick={() => setKiezerOpen(o => !o)}
            className="shrink-0 w-14 h-[44px] rounded-xl text-2xl flex items-center justify-center"
            style={{ background: 'var(--color-surface-2)' }}
            aria-label="Icoon kiezen"
          >
            {icoon}
          </button>
          <div className="flex-1">
            <TekstVeld label="Naam" value={naam} onChange={setNaam} placeholder="Nieuwe keuken" autoFocus={nieuw} />
          </div>
        </div>
        {kiezerOpen && (
          <EmojiPickerLite value={icoon} onChange={waarde => { setIcoon(waarde); }} />
        )}

        <BedragVeld label="Doelbedrag" value={doelbedrag} onChange={setDoelbedrag} />
        <Pillen label="Vulregel" options={REGELS} value={regel} onChange={setRegel} />
        {regel !== 'surplus' && (
          <BedragVeld
            label={regel === 'fixed' ? 'Bedrag per maand' : 'Vanaf dit bedrag per maand'}
            value={regelBedrag}
            onChange={setRegelBedrag}
          />
        )}
        <Veld label="Wat betekent dat">
          <p className="text-[11px] text-muted">{UITLEG[regel]}</p>
        </Veld>

        <MaandVeld label="Vanaf" value={start} onChange={setStart} hint="Maanden vóór deze maand tellen niet mee voor dit doel." />
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
