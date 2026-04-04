import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { db } from './db/db'
import { BottomNav } from './components/layout/BottomNav'
import { MigrationPage } from './pages/MigrationPage'
import { DashboardPage } from './pages/DashboardPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { ChartsPage } from './pages/ChartsPage'
import { ImportPage } from './pages/ImportPage'
import { SettingsPage } from './pages/SettingsPage'
import { MonthProvider } from './hooks/useMonth'
import { applyAccentColor } from './utils/theme'

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
    return <MigrationPage onDone={() => setMigrationDone(true)} />
  }

  return (
    <BrowserRouter basename="/FinanceTracker">
      <MonthProvider>
        <div className="flex flex-col min-h-screen bg-bg" style={{ color: 'var(--color-text)' }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/charts" element={<ChartsPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          <BottomNav />
        </div>
      </MonthProvider>
    </BrowserRouter>
  )
}
