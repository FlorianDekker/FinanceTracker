import { useState } from 'react'
import { PageWrapper } from '../components/layout/PageWrapper'
import { CategoryRow } from '../components/dashboard/CategoryRow'
import { useBudgetStats } from '../hooks/useBudgetStats'
import { euro } from '../utils/formatters'
import { EXPENSE_CATEGORIES } from '../constants/categories'
import { TransactionForm } from '../components/transactions/TransactionForm'
import { MONTHS_LONG } from '../constants/categories'

export function DashboardPage() {
  const now = new Date()
  const [year] = useState(now.getFullYear())
  const [month] = useState(now.getMonth() + 1)
  const [showForm, setShowForm] = useState(false)

  const stats = useBudgetStats(year, month)

  const expenseStats = stats.filter(c => c.type === 'expense')
  const totalBudget = expenseStats.reduce((s, c) => s + c.budget, 0)
  const totalSpent = expenseStats.reduce((s, c) => s + c.spent, 0)
  const totalRemaining = totalBudget - totalSpent
  const isOver = totalRemaining < 0

  return (
    <PageWrapper>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 safe-top">
        <div className="text-sm text-muted mb-1">{MONTHS_LONG[month - 1]} {year}</div>
        <div className={`text-3xl font-bold ${isOver ? 'text-red' : 'text-green'}`}>
          {isOver ? `-${euro(Math.abs(totalRemaining))}` : euro(totalRemaining)}
        </div>
        <div className="text-xs text-muted">
          {isOver ? 'over budget' : 'over'} · {euro(totalSpent)} uitgegeven van {euro(totalBudget)}
        </div>
      </div>

      <div className="divide-y divide-border">
        {expenseStats.map(cat => (
          <CategoryRow key={cat.key} category={cat} />
        ))}
      </div>

      {/* FAB */}
      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full bg-green text-white text-2xl flex items-center justify-center shadow-lg z-40"
        style={{ boxShadow: '0 4px 20px rgba(76,175,80,0.4)' }}
      >
        +
      </button>

      {showForm && (
        <TransactionForm onClose={() => setShowForm(false)} />
      )}
    </PageWrapper>
  )
}
