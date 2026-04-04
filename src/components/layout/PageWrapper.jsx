export function PageWrapper({ children, title, className = '' }) {
  return (
    <div className={`flex flex-col min-h-full pb-24 animate-fade-in ${className}`}>
      {title && (
        <div className="sticky top-0 z-10 px-4 py-3 safe-top" style={{ background: 'var(--color-accent)' }}>
          <h1 className="text-lg font-bold text-white m-0">{title}</h1>
        </div>
      )}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
