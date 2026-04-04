import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Budget', icon: '📊', exact: true },
  { to: '/transactions', label: 'Transacties', icon: '📋' },
  { to: '/charts', label: 'Grafieken', icon: '📈' },
  { to: '/import', label: 'Importeer', icon: '📤' },
  { to: '/settings', label: 'Instellingen', icon: '⚙️' },
]

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 safe-bottom"
      style={{
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-nav)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      <div className="flex">
        {tabs.map(tab => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.exact}
            replace
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-2.5 gap-0.5 text-[10px] font-semibold transition-all duration-200 ${
                isActive ? 'text-accent' : 'text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={`w-12 h-7 flex items-center justify-center rounded-full transition-all duration-200 ${
                    isActive ? 'bg-accent-dim' : ''
                  }`}
                >
                  <span className="text-xl leading-none">{tab.icon}</span>
                </div>
                <span>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
