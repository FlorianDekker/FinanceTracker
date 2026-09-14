import { useMemo, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { parseCsv, sniffDelimiter } from '../../utils/parsers/csv'
import { parseGenericCsv, suggestMapping, DATE_FORMATS } from '../../utils/parsers'
import { isCompleteMapping, normalizeMapping } from '../../utils/csvMappings'
import { euro, fmtDate } from '../../utils/formatters'

const DELIMITER_LABELS = { ';': 'puntkomma', ',': 'komma', '\t': 'tab', '|': 'pipe' }

/**
 * Kolommapper voor CSV-bestanden die geen bankparser herkent.
 *
 * Toont de eerste regels van het bestand, een voorstel op basis van de kopregel
 * en een live voorbeeld van drie geparste transacties. De gekozen indeling gaat
 * via `onApply(mapping)` terug naar de importpagina, die hem ook bewaart.
 *
 * Props: open, onClose, text (ruwe CSV), fileName, initial (bewaarde mapping), onApply
 */
export function ColumnMapperSheet({ open, onClose, text = '', fileName = '', initial = null, onApply }) {
  const delimiter = useMemo(() => sniffDelimiter(text), [text])
  const rows = useMemo(() => parseCsv(text, delimiter).slice(0, 6), [text, delimiter])
  const header = rows[0] ?? []
  const sample = rows[1] ?? []

  const [mapping, setMapping] = useState(() => normalizeMapping(initial ?? suggestMapping(header, sample)))
  const set = patch => setMapping(m => ({ ...m, ...patch }))

  const preview = useMemo(() => {
    if (!isCompleteMapping(mapping)) return { transactions: [], warnings: [] }
    try {
      const result = parseGenericCsv(text, { ...mapping, delimiter })
      return { transactions: result.transactions.slice(0, 3), warnings: result.warnings }
    } catch (err) {
      return { transactions: [], warnings: [err.message] }
    }
  }, [text, mapping, delimiter])

  const colOptions = header.map((name, i) => ({ value: i, label: `${i + 1}. ${String(name).trim() || '(naamloos)'}` }))
  const descCols = new Set(mapping.descriptionCols ?? [])

  function toggleDesc(i) {
    const next = new Set(descCols)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    set({ descriptionCols: [...next].sort((a, b) => a - b) })
  }

  const ready = isCompleteMapping(mapping) && preview.transactions.length > 0

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Welke kolom is wat?"
      subtitle={fileName || 'Onbekend bestandsformaat'}
      maxHeight="92vh"
      footer={
        <button
          onClick={() => onApply(normalizeMapping({ ...mapping, delimiter }))}
          disabled={!ready}
          className="w-full py-3.5 btn-accent rounded-2xl font-semibold text-base"
          style={ready ? undefined : { opacity: 0.4 }}
        >
          Gebruik deze indeling
        </button>
      }
    >
      <div className="px-4 pt-4 pb-2">
        <p className="text-xs text-muted mb-3">
          Dit bestand komt van een bank die we nog niet kennen. Wijs aan waar de datum, het bedrag
          en de omschrijving staan — de volgende keer herkennen we het bestand zelf.
        </p>

        {/* Eerste regels uit het bestand */}
        <div className="card overflow-x-auto mb-4">
          <table className="text-[10px] w-full" style={{ borderCollapse: 'collapse' }}>
            <tbody>
              {rows.slice(0, 4).map((row, r) => (
                <tr key={r} style={r === 0 ? { background: 'var(--color-surface-2)' } : undefined}>
                  {header.map((_, c) => (
                    <td
                      key={c}
                      className={`px-2 py-1 whitespace-nowrap ${r === 0 ? 'font-semibold' : 'text-muted'}`}
                      style={{ borderRight: '1px solid var(--color-border)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {String(row[c] ?? '').slice(0, 24)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[10px] text-muted mb-4">
          Scheidingsteken: {DELIMITER_LABELS[delimiter] ?? delimiter} · {header.length} kolommen
        </div>

        {/* Keuzes */}
        <div className="card divide-y divide-border overflow-hidden mb-4">
          <Row label="Datumkolom">
            <Select value={mapping.dateCol} onChange={v => set({ dateCol: v })} options={colOptions} />
          </Row>
          <Row label="Datumnotatie">
            <Select
              value={mapping.dateFormat || DATE_FORMATS[0]}
              onChange={v => set({ dateFormat: v })}
              options={DATE_FORMATS.map(f => ({ value: f, label: f }))}
              numeric={false}
            />
          </Row>
          <Row label="Bedragkolom">
            <Select value={mapping.amountCol} onChange={v => set({ amountCol: v })} options={colOptions} />
          </Row>
          <Row label="Af of bij">
            <Select
              value={mapping.signMode}
              onChange={v => set({ signMode: v })}
              options={[
                { value: 'signed', label: 'Min-teken in het bedrag' },
                { value: 'debitCreditCol', label: 'Aparte Af/Bij-kolom' },
              ]}
              numeric={false}
            />
          </Row>
          {mapping.signMode === 'debitCreditCol' && (
            <>
              <Row label="Af/Bij-kolom">
                <Select
                  value={mapping.debitCreditCol ?? ''}
                  onChange={v => set({ debitCreditCol: v })}
                  options={colOptions}
                  placeholder="Kies een kolom"
                />
              </Row>
              <Row label="Waarde voor 'af'">
                <input
                  type="text"
                  value={mapping.debitValue ?? 'Af'}
                  onChange={e => set({ debitValue: e.target.value })}
                  className="w-28 rounded-lg px-2 py-1 text-sm text-right"
                  style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
                />
              </Row>
            </>
          )}
          <Row label="Tegenpartij">
            <Select
              value={mapping.counterpartyCol ?? ''}
              onChange={v => set({ counterpartyCol: v === '' ? undefined : v })}
              options={[{ value: '', label: 'Geen' }, ...colOptions]}
              placeholder="Geen"
            />
          </Row>
        </div>

        <div className="text-xs text-muted mb-2">Omschrijving (meerdere mag)</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {colOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => toggleDesc(opt.value)}
              aria-pressed={descCols.has(opt.value)}
              className="px-3 py-1.5 rounded-full text-xs"
              style={descCols.has(opt.value)
                ? { background: 'var(--color-accent)', color: '#fff' }
                : { background: 'var(--color-surface-2)', color: 'var(--color-muted)' }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Live voorbeeld */}
        <div className="text-xs text-muted mb-2">Zo wordt het gelezen</div>
        <div className="card divide-y divide-border overflow-hidden">
          {preview.transactions.length === 0 && (
            <div className="px-4 py-3 text-xs text-orange">
              Nog geen bruikbare regels — controleer de datum- en bedragkolom.
            </div>
          )}
          {preview.transactions.map((tx, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <div className="w-20 shrink-0">
                <div className="text-[10px] text-muted">{fmtDate(tx.date)}</div>
                <div className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-green' : ''}`}>
                  {tx.type === 'credit' ? '+' : '-'}{euro(tx.amount)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{tx.merchant}</div>
                {tx.remi && <div className="text-[10px] text-muted truncate">{tx.remi}</div>}
              </div>
            </div>
          ))}
        </div>
        {preview.warnings.length > 0 && (
          <div className="text-[11px] text-muted mt-2">{preview.warnings.join(' ')}</div>
        )}
      </div>
    </Sheet>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="flex-1 text-sm">{label}</span>
      {children}
    </div>
  )
}

function Select({ value, onChange, options, numeric = true, placeholder }) {
  return (
    <select
      value={value === undefined || value === null ? '' : String(value)}
      onChange={e => {
        const raw = e.target.value
        onChange(numeric && raw !== '' ? Number(raw) : raw)
      }}
      className="rounded-lg px-2 py-1.5 text-sm max-w-[58%]"
      style={{ fontSize: '16px', background: 'var(--color-surface-2)', color: 'var(--color-text)' }}
    >
      {placeholder && value === '' && <option value="">{placeholder}</option>}
      {options.map(opt => (
        <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
      ))}
    </select>
  )
}
