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
import { MONTHS_LONG } from '../constants/categories'
import { useMonth } from '../hooks/useMonth'

const now = new Date()
const tabs = ['Budgettempo', 'Spaarpercentage', 'Verdeling', 'Dagelijks', 'Kalender', 'Jaar', 'Trends', 'Stapel']

// Tabs that use month navigation
const MONTH_TABS = new Set([0, 2, 3, 4])

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
    let startX = null, startY = null, horizontal = null

    const onStart = e => {
      const x = e.touches[0].clientX
      const y = e.touches[0].clientY
      if (x < 24) { startX = null; return }
      // Don't intercept touches on the sticky header (tabs + month nav)
      const header = el.querySelector('.sticky')
      if (header && y < header.getBoundingClientRect().bottom) { startX = null; return }
      startX = x
      startY = y
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
      startX = null
      if (!horizontal || Math.abs(dx) < 50 || dy > Math.abs(dx)) return
      const cur = activeRef.current
      if (dx < 0 && cur < tabs.length - 1) goTo(cur + 1)
      else if (dx > 0 && cur > 0) goTo(cur - 1)
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
        <div className="sticky top-0 z-10 glass safe-top" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div ref={tabsRef} className="flex gap-2 py-3 overflow-x-auto scrollbar-none">
            <div className="w-3 shrink-0" />
            {tabs.map((t, i) => (
              <button
                key={t}
                ref={el => tabRefs.current[i] = el}
                onClick={() => goTo(i)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                  active === i
                    ? 'btn-gradient-green'
                    : 'bg-surface-2 text-muted'
                }`}
              >
                {t}
              </button>
            ))}
            <div className="w-3 shrink-0" />
          </div>

          {showMonthNav && (
            <div className="flex items-center justify-between px-4 pb-2">
              <button onClick={() => goMonth('prev')} className="text-muted px-2 py-1 text-xl">‹</button>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{MONTHS_LONG[month - 1]} {year}</span>
                {!isCurrentMonth && (
                  <button onClick={goToNow} className="text-xs text-green border border-green/40 rounded-full px-2 py-0.5">Nu</button>
                )}
              </div>
              <button onClick={() => goMonth('next')} className="text-muted px-2 py-1 text-xl">›</button>
            </div>
          )}
        </div>

        {/* Floating month pill */}
        {showPill && showMonthNav && (
          <div className="fixed inset-x-0 top-1/3 -translate-y-1/2 flex justify-center z-30 pointer-events-none">
            <div className="glass rounded-2xl px-8 py-4 text-lg font-semibold animate-scale-in" style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              {MONTHS_LONG[month - 1]} {year}
            </div>
          </div>
        )}

        <div className={`p-4 overflow-hidden touch-pan-y ${slideClass}`}>
          {active === 0 && <PaceChart year={year} month={month} />}
          {active === 1 && <CashflowChart />}
          {active === 2 && <SpendingDonut year={year} month={month} />}
          {active === 3 && <DailyChart year={year} month={month} />}
          {active === 4 && <CalendarChart year={year} month={month} />}
          {active === 5 && <YearGrid year={year} />}
          {active === 6 && <TrendsChart year={year} />}
          {active === 7 && <StackedChart year={year} />}
        </div>
      </PageWrapper>
    </div>
  )
}
