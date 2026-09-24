import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { db } from './db/db'
import { BottomNav } from './components/layout/BottomNav'
import { OnboardingPage } from './pages/OnboardingPage'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { ChartsPage } from './pages/ChartsPage'
import { ImportPage } from './pages/ImportPage'
import { ClaimsPage } from './pages/ClaimsPage'
import { ReceiptsPage } from './pages/ReceiptsPage'
import { SettingsPage } from './pages/SettingsPage'
import { TripsPage } from './pages/TripsPage'
import { WealthPage } from './pages/WealthPage'
import { MonthProvider } from './hooks/useMonth'
import { CategoriesProvider } from './hooks/useCategories'
import { applyAccentColor, applySheetMargin, DEFAULT_SHEET_MARGIN, SHEET_MARGIN_SETTING } from './utils/theme'

const BASENAME = '/FinanceTracker'

export default function App() {
  const [migrationDone, setMigrationDone] = useState(null)

  useEffect(() => {
    db.settings.get('migrationDone').then(row => {
      setMigrationDone(row?.value === true)
    })
    // Load theme preference (light is default)
    db.settings.get('theme').then(row => {
      const theme = row?.value ?? 'light'
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })
    // Load accent color
    db.settings.get('accentColor').then(row => {
      if (row?.value) applyAccentColor(row.value)
    })
    db.settings.get(SHEET_MARGIN_SETTING).then(row => {
      applySheetMargin(row?.value ?? DEFAULT_SHEET_MARGIN)
    })
  }, [])

  // Block iOS back-swipe gesture: prevent touchstart on the left-edge zone
  // so iOS never recognises the gesture in the first place
  useEffect(() => {
    const block = e => {
      if (e.touches[0].clientX < 20) e.preventDefault()
    }
    document.addEventListener('touchstart', block, { passive: false })
    return () => document.removeEventListener('touchstart', block)
  }, [])

  if (migrationDone === null) {
    return <div className="min-h-screen bg-bg" />
  }

  if (!migrationDone) {
    // Koos de gebruiker "Bankbestand importeren", dan start de app meteen op
    // /import. De router leest de locatie bij het mounten, dus zetten we die
    // vóór de eerste render van BrowserRouter.
    const done = next => {
      if (next === 'import') window.history.replaceState({}, '', `${BASENAME}/import`)
      setMigrationDone(true)
    }
    return (
      <CategoriesProvider>
        <OnboardingPage onDone={done} />
      </CategoriesProvider>
    )
  }

  return (
    <BrowserRouter basename={BASENAME}>
      <CategoriesProvider>
        <MonthProvider>
          <div className="flex flex-col min-h-screen bg-bg" style={{ color: 'var(--color-text)' }}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/charts" element={<ChartsPage />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/declaraties" element={<ClaimsPage />} />
              <Route path="/bon" element={<ReceiptsPage />} />
              <Route path="/vakanties" element={<TripsPage />} />
              <Route path="/vermogen" element={<WealthPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
            <BottomNav />
          </div>
        </MonthProvider>
      </CategoriesProvider>
    </BrowserRouter>
  )
}
