import { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CHART_MAP, mergeChartConfig } from '../components/charts/registry'
import { MONTHS_LONG } from '../constants/categories'
import { useMonth } from '../hooks/useMonth'
import { useMonthSwipe } from '../hooks/useMonthSwipe'
import { recordChartView, VIEW_DELAY_MS } from '../utils/chartStats'
import { db } from '../db/db'

export function ChartsPage() {
  const { year, month, isCurrentMonth, goMonth, goToNow } = useMonth()
  const [active, setActive] = useState(0)
  const [tabAnimDir, setTabAnimDir] = useState(null)
  const tabAnimating = useRef(false)
  const activeRef = useRef(0)
  const pageRef = useRef(null)
  const tabsRef = useRef(null)
  const tabRefs = useRef([])

  // Load chart config from settings
  const chartConfig = useLiveQuery(() => db.settings.get('chartConfig').then(r => r?.value ?? null), [])
  // De bon-grafieken staan standaard aan zodra er ten minste één bon is.
  const heeftBonnen = useLiveQuery(() => db.receipts.count().then(n => n > 0), [], false)
  const { order: orderIds, enabled: enabledIds } = mergeChartConfig(chartConfig, { hasReceipts: heeftBonnen })

  // Build visible tabs in order
  const visibleCharts = orderIds.filter(id => enabledIds.includes(id) && CHART_MAP[id]).map(id => CHART_MAP[id])

  // Kijkteller: pas tellen als een tab ~2 s blijft staan, zodat langsswipen
  // niet elke tussenliggende grafiek als "bekeken" registreert.
  const activeId = visibleCharts[active]?.id
  useEffect(() => {
    if (!activeId) return
    const t = setTimeout(() => { recordChartView(activeId) }, VIEW_DELAY_MS)
    return () => clearTimeout(t)
  }, [activeId])

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

  // Swipe: vanaf de randen altijd van tab wisselen, midden in een grafiek van
  // maand (als die chart een maand gebruikt), daarbuiten weer van tab.
  useMonthSwipe(pageRef, {
    threshold: 50,
    lockSlop: 5,
    edgeGuard: 0,
    edgeZone: 40,
    onSwipe: (dir, { target, startedFromEdge }) => {
      const cur = activeRef.current
      const stepTab = () => {
        if (dir === 'next' && cur < visibleCharts.length - 1) goTo(cur + 1)
        else if (dir === 'prev' && cur > 0) goTo(cur - 1)
      }
      if (startedFromEdge) { stepTab(); return }
      const inChartArea = target?.closest?.('[data-chart-area]')
      if (inChartArea && visibleCharts[cur]?.usesMonth) goMonth(dir)
      else stepTab()
    },
  })

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
