import { useState, useRef, useEffect } from 'react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { PaceChart } from '../components/charts/PaceChart'
import { CashflowChart } from '../components/charts/CashflowChart'
import { YearGrid } from '../components/charts/YearGrid'
import { SpendingDonut } from '../components/charts/SpendingDonut'
import { DailyChart } from '../components/charts/DailyChart'
import { CalendarChart } from '../components/charts/CalendarChart'
import { TrendsChart } from '../components/charts/TrendsChart'
import { StackedChart } from '../components/charts/StackedChart'
import { TopSpendingChart } from '../components/charts/TopSpendingChart'
import { WeekdayChart } from '../components/charts/WeekdayChart'
import { CompareChart } from '../components/charts/CompareChart'
import { AverageChart } from '../components/charts/AverageChart'
import { StreaksChart } from '../components/charts/StreaksChart'
import { IncomeChart } from '../components/charts/IncomeChart'
import { MONTHS_LONG } from '../constants/categories'
import { useMonth } from '../hooks/useMonth'

const now = new Date()
const tabs = ['Budgettempo', 'Spaarpercentage', 'Verdeling', 'Dagelijks', 'Kalender', 'Top', 'Weekdag', 'Vergelijk', 'Streaks', 'Inkomen', 'Gemiddeld', 'Jaar', 'Trends', 'Stapel']

// Tabs that use month navigation
const MONTH_TABS = new Set([0, 2, 3, 4, 5, 6, 7, 8, 9])

export function ChartsPage() {
  const { year, month, animDir: monthAnimDir, showPill, isCurrentMonth, goMonth, goToNow } = useMonth()
  const [active, setActive] = useState(0)
  const [tabAnimDir, setTabAnimDir] = useState(null)
  const tabAnimating = useRef(false)
  const activeRef = useRef(0)
  const pageRef = useRef(null)
  const tabsRef = useRef(null)
  const tabRefs = useRef([])

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
    const EDGE_ZONE = 40 // pixels from left/right edge

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

      // Edge swipe always switches tabs
      if (startedFromEdge) {
        const cur = activeRef.current
        if (dx < 0 && cur < tabs.length - 1) goTo(cur + 1)
        else if (dx > 0 && cur > 0) goTo(cur - 1)
        return
      }

      // Check if swipe started inside a chart card area
      const inChartArea = target?.closest?.('[data-chart-area]')

      if (inChartArea && MONTH_TABS.has(activeRef.current)) {
        // Swipe on chart card → change month
        goMonth(dx < 0 ? 'next' : 'prev')
      } else {
        // Swipe anywhere else → change tab
        const cur = activeRef.current
        if (dx < 0 && cur < tabs.length - 1) goTo(cur + 1)
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
  }, [])

  const slideClass = tabAnimDir === 'left'
    ? 'animate-slide-in-left'
    : tabAnimDir === 'right'
    ? 'animate-slide-in-right'
    : ''

  const showMonthNav = MONTH_TABS.has(active)

  return (
    <div ref={pageRef} className="flex flex-col flex-1">
      <PageWrapper>
        {/* Tab pills + optional month row */}
        <div className="safe-top" style={{ background: 'var(--color-bg)' }}>
          <div ref={tabsRef} className="flex gap-2 py-3 overflow-x-auto scrollbar-none">
            <div className="w-3 shrink-0" />
            {tabs.map((t, i) => (
              <button
                key={t}
                ref={el => tabRefs.current[i] = el}
                onClick={() => goTo(i)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
                  active === i ? 'btn-accent' : 'text-muted'
                }`}
                style={active !== i ? { background: 'var(--color-surface-2)' } : {}}
              >
                {t}
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
          {active === 0 && <PaceChart year={year} month={month} />}
          {active === 1 && <CashflowChart />}
          {active === 2 && <SpendingDonut year={year} month={month} />}
          {active === 3 && <DailyChart year={year} month={month} />}
          {active === 4 && <CalendarChart year={year} month={month} />}
          {active === 5 && <TopSpendingChart year={year} month={month} />}
          {active === 6 && <WeekdayChart year={year} month={month} />}
          {active === 7 && <CompareChart year={year} month={month} />}
          {active === 8 && <StreaksChart year={year} month={month} />}
          {active === 9 && <IncomeChart year={year} month={month} />}
          {active === 10 && <AverageChart />}
          {active === 11 && <YearGrid year={year} />}
          {active === 12 && <TrendsChart year={year} />}
          {active === 13 && <StackedChart year={year} />}
        </div>
      </PageWrapper>
    </div>
  )
}
