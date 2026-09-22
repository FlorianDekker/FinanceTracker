import { useCallback, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Sheet } from '../ui/Sheet'
import { db } from '../../db/db'
import { useCategories } from '../../hooks/useCategories'
import { importSplitserRows, setSplitserName, useSplitserName } from '../../hooks/useTrips'
import { takeFile } from '../../utils/fileInput'
import { extractPdfText } from '../../utils/receipts/pdfText'
import { categorizeWithLearning } from '../../utils/categorizer'
import { checkMyShare, parseSplitserPdf, totalShareOf } from '../../utils/trips/splitser'
import { euro, fmtDate } from '../../utils/formatters'

/**
 * Splitser-settlement (PDF) inlezen bij een vakantie.
 *
 * Drie stappen: bestand kiezen → controleren (naam, aantal regels, de twee
 * controlegetallen uit de PDF) → importeren. Een tweede import van dezelfde
 * reis is veilig: bestaande regels houden hun categorie en hun koppeling met
 * de bank, nieuwe komen erbij en verdwenen regels gaan weg.
 */
export function SplitserImportSheet({ trip, onClose }) {
  const { catMap, allCategories, getByRole } = useCategories()
  const opgeslagenNaam = useSplitserName()
  const userRules = useLiveQuery(() => db.rules.toArray(), [], [])

  const [bezig, setBezig] = useState(false)
  const [error, setError] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [bestand, setBestand] = useState('')
  const [naam, setNaam] = useState(null)
  const [resultaat, setResultaat] = useState(null)

  const mijnNaam = naam ?? trip.splitser?.myName ?? opgeslagenNaam

  const vakantieKey = useMemo(() => {
    const hit = allCategories.find(c => c.key === 'vakantie' || c.label?.toLowerCase() === 'vakantie')
    return hit?.key ?? null
  }, [allCategories])

  const byRole = useMemo(() => ({
    uncategorized: getByRole('uncategorized'),
    transfer: getByRole('transfer'),
    income: getByRole('income'),
  }), [getByRole])

  const isActiveKey = useCallback(key => !!catMap[key] && !catMap[key].archived, [catMap])

  async function kiesBestand(e) {
    setError(null)
    let file
    try {
      file = await takeFile(e)
    } catch (err) {
      setError(err.message)
      return
    }
    if (!file) return
    setBezig(true)
    try {
      const buffer = await file.arrayBuffer()
      // Een .txt met dezelfde tekst mag ook: handig om een export te controleren.
      const tekst = /\.pdf$/i.test(file.name)
        ? (await extractPdfText(buffer)).text
        : new TextDecoder().decode(buffer)
      const uit = parseSplitserPdf(tekst)
      if (!uit.rows.length) {
        setError('Geen uitgaven gevonden. Is dit het "Settlement"-bestand uit Splitser?')
      } else {
        setParsed(uit)
        setBestand(file.name)
        if (!uit.members.includes(mijnNaam)) setNaam(uit.members[0] ?? mijnNaam)
      }
    } catch (err) {
      setError(err?.message ?? 'Het bestand kon niet worden gelezen.')
    } finally {
      setBezig(false)
    }
  }

  async function importeer() {
    setBezig(true)
    setError(null)
    try {
      await setSplitserName(mijnNaam)
      const uit = await importSplitserRows(trip.id, {
        rows: parsed.rows,
        myName: mijnNaam,
        fileName: bestand,
        categorize: async row => {
          const r = await categorizeWithLearning(row.description, row.amount, 'debit', '', byRole, {
            isActiveKey: Object.keys(catMap).length ? isActiveKey : undefined,
            rules: userRules ?? [],
          })
          // Niets herkend? Dan is Vakantie een betere gok dan de restbak.
          const onbekend = r.source === 'unknown' || !r.cat || r.cat === byRole.uncategorized?.key
          if (onbekend && vakantieKey) return { category: vakantieKey, subcategory: '' }
          return { category: r.cat, subcategory: r.sub ?? '' }
        },
      })
      setResultaat(uit)
    } catch (err) {
      setError(err?.message ?? 'Importeren is niet gelukt.')
    } finally {
      setBezig(false)
    }
  }

  const controle = parsed ? checkMyShare(parsed, mijnNaam) : null
  const buitenPeriode = parsed && trip.from && trip.to && (parsed.from < trip.from || parsed.to > trip.to)

  return (
    <Sheet
      open
      onClose={onClose}
      title="Splitser importeren"
      subtitle={trip.name}
      maxHeight="85vh"
      bodyClassName="p-4"
      footer={resultaat ? (
        <button onClick={onClose} className="w-full btn-accent rounded-2xl py-3 text-base">Klaar</button>
      ) : parsed ? (
        <button
          onClick={importeer}
          disabled={bezig}
          className="w-full btn-accent rounded-2xl py-3 text-base disabled:opacity-40"
        >
          {bezig ? 'Importeren…' : `${parsed.rows.length} regels importeren`}
        </button>
      ) : null}
    >
      {error && <p className="text-xs text-red mb-3">{error}</p>}

      {resultaat ? (
        <div className="text-center py-6">
          <div className="text-4xl mb-2">✅</div>
          <p className="text-sm font-semibold mb-1">
            {resultaat.added} nieuw · {resultaat.kept} bijgewerkt
            {resultaat.removed > 0 && ` · ${resultaat.removed} verdwenen`}
          </p>
          <p className="text-xs text-muted px-6">
            Jouw aandeel: {euro(totalShareOf(parsed.rows, mijnNaam))}. Regels die jij voorschoot zijn
            automatisch aan je banktransacties gekoppeld; controleer ze bij Regels.
          </p>
        </div>
      ) : !parsed ? (
        <>
          {/* Label om de input heen (zelfde patroon als de bankimport): op iOS
              opent dat betrouwbaarder dan een input via een ref aanklikken. */}
          <label
            className={`w-full btn-accent rounded-2xl py-3.5 text-base flex items-center justify-center cursor-pointer ${bezig ? 'opacity-40' : ''}`}
          >
            {bezig ? 'Lezen…' : '📄 Kies het Splitser-bestand'}
            <input
              type="file"
              accept=".pdf,application/pdf,.txt,text/plain"
              onChange={kiesBestand}
              className="hidden"
            />
          </label>
          <p className="text-xs text-muted mt-3">
            In Splitser: open de groep → Settlement → deel als PDF. De app leest de uitgaven,
            de verdeling en de controlegetallen ("Total spent" en de balans per lid).
          </p>
          {Array.isArray(trip.splitser?.imported) && trip.splitser.imported.length > 0 && (
            <p className="text-xs text-muted mt-3">
              Eerder geïmporteerd: {trip.splitser.imported.map(i => i.fileName || 'bestand').join(', ')}.
              Opnieuw importeren werkt bij: je categorieën blijven staan.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="card p-3 mb-3">
            <div className="text-sm font-semibold">{parsed.name ?? 'Splitser'}</div>
            <div className="text-xs text-muted">
              {parsed.rows.length} regels · {euro(parsed.sumAmounts)} totaal
              {parsed.from && ` · ${fmtDate(parsed.from)} – ${fmtDate(parsed.to)}`}
            </div>
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: 'var(--color-muted)' }}>
            Wie ben jij?
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {parsed.members.map(lid => (
              <button
                key={lid}
                onClick={() => setNaam(lid)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${lid === mijnNaam ? 'btn-accent' : 'text-muted'}`}
                style={lid === mijnNaam ? undefined : { background: 'var(--color-surface-2)' }}
              >
                {lid}
              </button>
            ))}
          </div>

          <div className="card p-3 space-y-1 text-xs">
            <Regel
              ok={parsed.totalSpent == null || Math.abs(parsed.totalSpent - parsed.sumAmounts) <= 0.01}
              tekst={parsed.totalSpent == null
                ? 'Geen "Total spent" gevonden om tegen te controleren'
                : `Total spent ${euro(parsed.totalSpent)} klopt met de regels`}
            />
            <Regel
              ok={controle.ok}
              tekst={controle.expected == null
                ? `Jouw aandeel: ${euro(controle.actual)} (geen balans om tegen te controleren)`
                : `Jouw aandeel ${euro(controle.actual)} klopt met de balans (${euro(controle.expected)})`}
            />
            {buitenPeriode && (
              <Regel ok={false} tekst="Sommige regels vallen buiten de periode van deze vakantie" />
            )}
          </div>

          {parsed.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {parsed.warnings.map((w, i) => (
                <li key={i} className="text-xs text-orange">⚠ {w}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  )
}

function Regel({ ok, tekst }) {
  return (
    <div className={`flex items-start gap-2 ${ok ? '' : 'text-orange'}`}>
      <span>{ok ? '✓' : '⚠'}</span>
      <span className="flex-1">{tekst}</span>
    </div>
  )
}
