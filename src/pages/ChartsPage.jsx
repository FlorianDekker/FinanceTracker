import { useState } from 'react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { PaceChart } from '../components/charts/PaceChart'
import { CashflowChart } from '../components/charts/CashflowChart'
import { YearGrid } from '../components/charts/YearGrid'

const now = new Date()
const tabs = ['Pace', 'Cashflow', 'Jaar']

export function ChartsPage() {
  const [active, setActive] = useState(0)

  return (
    <PageWrapper>
      {/* Tab bar */}
      <div className="sticky top-0 z-10 bg-bg border-b border-border px-4 safe-top">
        <div className="flex gap-1 pt-3 pb-2">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => setActive(i)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active === i ? 'bg-green text-white' : 'text-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {active === 0 && (
          <PaceChart year={now.getFullYear()} month={now.getMonth() + 1} />
        )}
        {active === 1 && <CashflowChart />}
        {active === 2 && <YearGrid year={now.getFullYear()} />}
      </div>
    </PageWrapper>
  )
}
