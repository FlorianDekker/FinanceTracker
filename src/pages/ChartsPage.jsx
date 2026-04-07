import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { PaceChart } from '../components/charts/PaceChart'
import { CashflowChart } from '../components/charts/CashflowChart'
import { YearGrid } from '../components/charts/YearGrid'
import { SpendingDonut } from '../components/charts/SpendingDonut'
import { DailyChart } from '../components/charts/DailyChart'
import { TrendsChart } from '../components/charts/TrendsChart'
import { TopSpendingChart } from '../components/charts/TopSpendingChart'
import { WeekdayChart } from '../components/charts/WeekdayChart'
import { CompareChart } from '../components/charts/CompareChart'
import { AverageChart } from '../components/charts/AverageChart'
import { ForecastChart } from '../components/charts/ForecastChart'
import { RecordsChart } from '../components/charts/RecordsChart'
import { MONTHS_LONG } from '../constants/categories'
import { useMonth } from '../hooks/useMonth'
import { db } from '../db/db'

// All available charts
export const ALL_CHARTS = [
  { id: 'budgettempo',    label: 'Budgettempo',    usesMonth: true,  Component: PaceChart },
  { id: 'spaarpercentage', label: 'Spaarpercentage', usesMonth: false, Component: CashflowChart },
  { id: 'verdeling',      label: 'Verdeling',      usesMonth: true,  Component: SpendingDonut },
  { id: 'dagelijks',      label: 'Dagelijks',      usesMonth: true,  Component: DailyChart },
  { id: 'top',            label: 'Top',            usesMonth: true,  Component: TopSpendingChart },
  { id: 'weekdag',        label: 'Weekdag',        usesMonth: true,  Component: WeekdayChart },
  { id: 'vergelijk',      label: 'Vergelijk',      usesMonth: true,  Component: CompareChart },
  { id: 'forecast',       label: 'Forecast',       usesMonth: true,  Component: ForecastChart },
  { id: 'gemiddeld',      label: 'Gemiddeld',      usesMonth: false, Component: AverageChart },
  { id: 'records',        label: 'Records',        usesMonth: false, Component: RecordsChart },
  { id: 'jaar',           label: 'Jaar',           usesMonth: false, Component: YearGrid },
  { id: 'trends',         label: 'Trends',         usesMonth: false, Component: TrendsChart },
]

const DEFAULT_ORDER = ALL_CHARTS.map(c => c.id)
const CHART_MAP = Object.fromEntries(ALL_CHARTS.map(c => [c.id, c]))

export function ChartsPage() {
  const { year, month, animDir: monthAnimDir, isCurrentMonth, goMonth, goToNow } = useMonth()
  const [active, setActive] = useState(0)
  const [tabAnimDir, setTabAnimDir] = useState(null)
  const tabAnimating = useRef(false)
  const activeRef = useRef(0)
  const pageRef = useRef(null)
  const tabsRef = useRef(null)
  const tabRefs = useRef([])

  // Load chart config from settings
  const chartConfig = useLiveQuery(() => db.settings.get('chartConfig').then(r => r?.value ?? null), [])
  const enabledIds = chartConfig?.enabled ?? DEFAULT_ORDER
  const orderIds = chartConfig?.order ?? DEFAULT_ORDER

  // Build visible tabs in order
  const visibleCharts = orderIds.filter(id => enabledIds.includes(id) && CHART_MAP[id]).map(id => CHART_MAP[id])

  function goTo(next) {
    if (next === activeRef.current || tabAnimating.current) return
    tabAnimating.current = true
    setTabAnimDir(next > activeRef.current ? 'left' : 'right')
    activeRef.current = next
    setActive(next)
    setTimeout(() => { setTabAnimDir(null); tabAnimating.current = false }, 320)

    const tabEl = tabRefs.current[next]
    const container = tabsRef.current
    if (tabEl && container) {
      const PAD = 16
      const tabLeft = tabEl.offsetLeft
      const tabRight = tabLeft + tabEl.offsetWidth
      const visLeft = container.scrollLeft
      const visRight = visLeft + container.offsetWidth
      if (tabLeft - PAD < visLeft) {
        container.scrollTo({ left: tabLeft - PAD, behavior: 'smooth' })
      } else if (tabRight + PAD > visRight) {
        container.scrollTo({ left: tabRight + PAD - container.offsetWidth, behavior: 'smooth' })
      }
    }
  }

  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    let startX = null, startY = null, horizontal = null, startTarget = null, startedFromEdge = false
    const screenW = window.innerWidth
    const EDGE_ZONE = 40

    const onStart = e => {
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      startX = x
      startY = y
      startTarget = e.target
      startedFromEdge = x < EDGE_ZONE || x > screenW - EDGE_ZONE
      horizontal = null
    }
    const onMove = e => {
      if (startX === null) return
      const dx = Math.abs(e.touches[0].clientX - startX)
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (horizontal === null && (dx > 5 || dy > 5)) horizontal = dx > dy
      if (horizontal) e.preventDefault()
    }
    const onEnd = e => {
      if (startX === null) return
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      const target = startTarget
      startX = null
      startTarget = null
      if (!horizontal || Math.abs(dx) < 50 || dy > Math.abs(dx)) return

      if (startedFromEdge) {
        const cur = activeRef.current
        if (dx < 0 && cur < visibleCharts.length - 1) goTo(cur + 1)
        else if (dx > 0 && cur > 0) goTo(cur - 1)
        return
      }

      const inChartArea = target?.closest?.('[data-chart-area]')
      const currentChart = visibleCharts[activeRef.current]

      if (inChartArea && currentChart?.usesMonth) {
        goMonth(dx < 0 ? 'next' : 'prev')
      } else {
        const cur = activeRef.current
        if (dx < 0 && cur < visibleCharts.length - 1) goTo(cur + 1)
        else if (dx > 0 && cur > 0) goTo(cur - 1)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [visibleCharts.length])

  const slideClass = tabAnimDir === 'left'
    ? 'animate-slide-in-left'
    : tabAnimDir === 'right'
    ? 'animate-slide-in-right'
    : ''

  const currentChart = visibleCharts[active]
  const showMonthNav = currentChart?.usesMonth ?? false

  if (visibleCharts.length === 0) {
    return (
      <div ref={pageRef} className="flex flex-col flex-1">
        <PageWrapper>
          <div className="text-center text-muted py-20 text-sm">
            Geen grafieken ingeschakeld. Ga naar Instellingen om grafieken aan te zetten.
          </div>
        </PageWrapper>
      </div>
    )
  }

  return (
    <div ref={pageRef} className="flex flex-col flex-1">
      <PageWrapper>
        <div className="safe-top" style={{ background: 'var(--color-bg)' }}>
          <div ref={tabsRef} className="flex gap-2 py-3 overflow-x-auto scrollbar-none">
            <div className="w-3 shrink-0" />
            {visibleCharts.map((chart, i) => (
              <button
                key={chart.id}
                ref={el => tabRefs.current[i] = el}
                onClick={() => goTo(i)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  active === i ? 'btn-accent' : 'text-muted'
                }`}
                style={active !== i ? { background: 'var(--color-surface-2)' } : {}}
              >
                {chart.label}
              </button>
            ))}
            <div className="w-3 shrink-0" />
          </div>

          {showMonthNav && (
            <div className="flex items-center justify-between px-4 pb-2">
              <button onClick={() => goMonth('prev')} className="text-muted text-xl px-1">‹</button>
              <button onClick={!isCurrentMonth ? goToNow : undefined} className="flex items-center gap-2">
                <span className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{MONTHS_LONG[month - 1]} {year}</span>
                {!isCurrentMonth && (
                  <span className="text-[10px] font-bold rounded-full px-2 py-0.5 btn-accent">Nu</span>
                )}
              </button>
              <button onClick={() => goMonth('next')} className="text-muted text-xl px-1">›</button>
            </div>
          )}
        </div>

        <div className={`p-4 overflow-hidden touch-pan-y ${slideClass}`}>
          {visibleCharts.map((chart, i) => {
            if (i !== active) return null
            const { Component } = chart
            if (chart.usesMonth) return <Component key={chart.id} year={year} month={month} />
            if (chart.id === 'jaar' || chart.id === 'trends') return <Component key={chart.id} year={year} />
            return <Component key={chart.id} />
          })}
        </div>
      </PageWrapper>
    </div>
  )
}
