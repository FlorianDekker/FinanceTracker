import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSheetGestures } from '../../hooks/useSheetGestures'

/* ------------------------------------------------------------------ *
 * Scroll-lock met teller: sheets kunnen gestapeld worden (manager ->   *
 * bewerken -> kiezer) en alleen de eerste/laatste mag de body aanraken. *
 * ------------------------------------------------------------------ */
let lockCount = 0
let lockedScrollY = 0

function useBodyScrollLock() {
  useEffect(() => {
    if (lockCount === 0) {
      lockedScrollY = window.scrollY
      document.body.style.position = 'fixed'
      document.body.style.top = `-${lockedScrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
    }
    lockCount += 1
    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        window.scrollTo(0, lockedScrollY)
      }
    }
  }, [])
}

// Hex-kleuren krijgen hetzelfde verloop als de oude categoriesheets; een
// CSS-variabele (var(--color-accent)) blijft vlak.
function accentBackground(accent) {
  if (!accent) return 'var(--color-surface)'
  return accent.startsWith('#') ? `linear-gradient(135deg, ${accent}, ${accent}CC)` : accent
}

/**
 * Gedeelde bottom sheet: backdrop, afgeronde bovenkant, slide-up,
 * swipe-to-close en veilige onderrand. Rendert in een portal op <body>
 * zodat geneste sheets altijd bovenop de vorige liggen.
 *
 * Props: open, onClose, title?, subtitle?, leading?, footer?, maxHeight?, accent?
 *
 * `accent` maakt de kop gekleurd met witte tekst — een hex-kleur wordt een
 * verloop (zoals de categoriesheets), een CSS-variabele blijft vlak.
 */
export function Sheet({ open, onClose, ...rest }) {
  if (!open) return null
  return <SheetInner onClose={onClose} {...rest} />
}

function SheetInner({
  onClose,
  title,
  subtitle,
  leading,
  footer,
  children,
  maxHeight = '85vh',
  bodyClassName = '',
  accent = null,
}) {
  useBodyScrollLock()
  const sheetRef = useSheetGestures(onClose)

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/30 z-50 animate-fade-in" onClick={onClose} />
      <div
        ref={sheetRef}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl overflow-y-auto overscroll-contain animate-slide-up"
        // Nooit tot onder de notch/statusbalk: een hoge sheet stopt op de
        // veilige bovenrand, hoe groot maxHeight ook is.
        style={{
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-sheet)',
          maxHeight: `min(${maxHeight}, calc(100vh - env(safe-area-inset-top) - 12px))`,
        }}
      >
        {/* Kop blijft staan tijdens scrollen, inclusief het greepje */}
        <div
          className={`sticky top-0 z-10 sheet-handle rounded-t-3xl ${accent ? 'sheet-handle-on-accent' : ''}`}
          style={{ background: accentBackground(accent) }}
        >
          <div
            className="flex items-center gap-2 px-4 pb-3"
            style={accent ? undefined : { borderBottom: '1px solid var(--color-border)' }}
          >
            {leading}
            <div className="flex-1 min-w-0">
              {title && (
                <div className={`text-base font-semibold truncate ${accent ? 'text-white' : ''}`}>{title}</div>
              )}
              {subtitle && (
                <div className={`text-xs truncate ${accent ? 'text-white/70' : 'text-muted'}`}>{subtitle}</div>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Sluiten"
              className={`shrink-0 w-8 h-8 flex items-center justify-center text-lg leading-none rounded-full ${
                accent ? 'text-white/80' : 'text-muted'
              }`}
              style={accent ? { background: 'rgba(255,255,255,0.2)' } : undefined}
            >
              ✕
            </button>
          </div>
        </div>

        <div
          className={bodyClassName}
          style={footer ? undefined : { paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
        >
          {children}
        </div>

        {footer && (
          <div
            className="sticky bottom-0 px-4 pt-3"
            style={{
              background: 'var(--color-surface)',
              borderTop: '1px solid var(--color-border)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </>,
    document.body
  )
}
