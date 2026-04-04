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
              `relative flex flex-col items-center justify-center flex-1 pt-2 pb-2.5 gap-1 text-[10px] font-semibold transition-all duration-200 ${
                isActive ? '' : 'text-muted'
              }`
            }
            style={({ isActive }) => isActive ? { color: 'var(--color-text)' } : {}}
          >
            {({ isActive }) => (
              <>
                {/* Active indicator line */}
                {isActive && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                )}
                <span className="text-[22px] leading-none mt-0.5">{tab.icon}</span>
                <span>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
