/* eslint-disable react-refresh/only-export-components -- useChartsSummary hoort bij dit scherm */
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { ALL_CHARTS, mergeChartConfig } from '../charts/registry'
import { beschrijfStat } from '../../utils/chartStats'

/**
 * Instellingen -> Grafieken: volgorde en aan/uit per grafiek op de
 * Grafieken-pagina. Zelfde samenvoeging als daar: onbekende id's eruit,
 * nieuwe grafieken achteraan erbij.
 */
export function SettingsCharts() {
  const chartConfig = useLiveQuery(() => db.settings.get('chartConfig').then(r => r?.value ?? null), [])
  const chartStats = useLiveQuery(() => db.settings.get('chartStats').then(r => r?.value ?? {}), [])
  // Bepaalt of de bon-grafieken standaard aanstaan (zelfde regel als ChartsPage).
  const receiptCount = useLiveQuery(() => db.receipts.count(), [], 0)

  const merged = mergeChartConfig(chartConfig, { hasReceipts: (receiptCount ?? 0) > 0 })
  const chartOrder = merged.order
  const chartEnabled = new Set(merged.enabled)

  async function toggleChart(id) {
    const next = new Set(chartEnabled)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    await db.settings.put({ key: 'chartConfig', value: { order: chartOrder, enabled: [...next] } })
  }

  async function moveChart(id, dir) {
    const order = [...chartOrder]
    const idx = order.indexOf(id)
    if (idx < 0) return
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= order.length) return
    ;[order[idx], order[newIdx]] = [order[newIdx], order[idx]]
    await db.settings.put({ key: 'chartConfig', value: { order, enabled: [...chartEnabled] } })
  }

  return (
    <section className="px-4 pt-4 pb-2">
      <div className="card overflow-hidden">
        {chartOrder.map((id, i) => {
          const chart = ALL_CHARTS.find(c => c.id === id)
          if (!chart) return null
          const enabled = chartEnabled.has(id)
          return (
            <div
              key={id}
              className="flex items-center gap-2 px-4 py-2.5"
              style={i < chartOrder.length - 1 ? { borderBottom: '1px solid var(--color-border)' } : {}}
            >
              {/* Reorder buttons */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => moveChart(id, -1)}
                  className="text-[10px] leading-none px-1"
                  style={{ color: i === 0 ? 'var(--color-text-dim)' : 'var(--color-muted)' }}
                >▲</button>
                <button
                  onClick={() => moveChart(id, 1)}
                  className="text-[10px] leading-none px-1"
                  style={{ color: i === chartOrder.length - 1 ? 'var(--color-text-dim)' : 'var(--color-muted)' }}
                >▼</button>
              </div>

              {/* Label + kijkteller */}
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: enabled ? 'var(--color-text)' : 'var(--color-muted)' }}>{chart.label}</div>
                <div className="text-[10px] truncate" style={{ color: 'var(--color-muted)', opacity: 0.75 }}>
                  {beschrijfStat(chartStats?.[id])}
                </div>
              </div>

              {/* Toggle */}
              <button
                onClick={() => toggleChart(id)}
                className={`w-11 h-6 rounded-full transition-colors relative ${enabled ? 'bg-green' : ''}`}
                style={!enabled ? { background: 'var(--color-surface-2)' } : {}}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Hulp voor de overzichtspagina: "x van y grafieken aan". */
export function useChartsSummary() {
  const chartConfig = useLiveQuery(() => db.settings.get('chartConfig').then(r => r?.value ?? null), [])
  const receiptCount = useLiveQuery(() => db.receipts.count(), [], 0)
  if (chartConfig === undefined) return null
  const merged = mergeChartConfig(chartConfig, { hasReceipts: (receiptCount ?? 0) > 0 })
  return `${merged.enabled.length} van ${merged.order.length} grafieken aan`
}
