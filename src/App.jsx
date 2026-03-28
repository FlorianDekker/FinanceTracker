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

export default function App() {
  const [migrationDone, setMigrationDone] = useState(null)

  useEffect(() => {
    db.settings.get('migrationDone').then(row => {
      setMigrationDone(row?.value === true)
    })
  }, [])

  if (migrationDone === null) {
    return <div className="min-h-screen bg-bg" />
  }

  if (!migrationDone) {
    return <MigrationPage onDone={() => setMigrationDone(true)} />
  }

  return (
    <BrowserRouter basename="/FinanceTracker">
      <div className="flex flex-col min-h-screen bg-bg text-white">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/charts" element={<ChartsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
