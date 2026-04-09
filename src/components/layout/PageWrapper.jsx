export function PageWrapper({ children, title, className = '' }) {
  return (
    <div className={`flex flex-col min-h-full pb-24 animate-fade-in overflow-x-hidden ${className}`}>
      {title && (
        <div className="safe-top px-5 pt-4 pb-3">
          <h1 className="text-xl font-bold m-0" style={{ color: 'var(--color-text)' }}>{title}</h1>
        </div>
      )}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
