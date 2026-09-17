import { useCallback, useRef, useState } from 'react'

// Hoever een "half openstaande" rij snapt (de rode knop is dan tikbaar).
const OPEN_X = -88
// Vanaf hier (in px) snapt een rij open in plaats van terug te veren.
const OPEN_SNAP_THRESHOLD = -72
// Vanaf hier (in px, afgeleid van de rijbreedte) skip je meteen.
const SKIP_RATIO = 0.45
// Pas na deze afstand weten we of de veeg horizontaal of verticaal is.
const LOCK_SLOP = 6
// Duur van de terug/snap-animatie ná loslaten; tijdens slepen géén transition.
const RELEASE_MS = 180

/**
 * Rij die je naar links kunt vegen om over te slaan (bijv. in de import-
 * review, om een deel van een bankexport niet op te slaan).
 *
 * Pointer Events (niet touch-events) zodat muis en touch hetzelfde gedrag
 * krijgen; `touch-action: pan-y` laat de browser verticaal scrollen zelf
 * afhandelen — bij een verticale veeg krijgen we gewoon een `pointercancel`
 * of stoppen we met bewegen zodra de richting eenmaal verticaal is vastgezet.
 *
 * Onder de inhoud ligt een rode zone met het label; die schuift zichtbaar
 * uit zodra de inhoud naar links verschuift. Voorbij ~45% van de rijbreedte
 * skip je meteen, tussen de 72px en die grens snapt de rij open (de rode
 * zone is dan een echte, tikbare knop), en daaronder veer je terug.
 *
 * Een tik (< 6px beweging) op de inhoud terwijl de rij openstaat sluit hem
 * alleen — hij klikt niet door naar de knop eronder (categorie, declaratie,
 * ...). Staat de rij dicht, dan doen klikken op de inhoud gewoon hun werk.
 */
export function SwipeToSkipRow({ children, onSkip, label = 'Overslaan' }) {
  const wrapperRef = useRef(null)
  const [x, setX] = useState(0)
  const [dragging, setDragging] = useState(false)

  // Rust-positie (0 = dicht, OPEN_X = opengesnapt) — hoeft geen re-render te
  // triggeren op zichzelf, dus een ref in plaats van state.
  const restX = useRef(0)
  // Gegevens van de actieve sleep-gestus; null als er niets loopt.
  const gesture = useRef(null)
  // Eén klik die we moeten "opeten" nadat er net echt gesleept is (zowel na
  // een snap-open/dicht als na een geskipte rij, voor het geval de browser
  // alsnog een click-event stuurt na de pointerup — vooral bij een muis).
  const suppressNextClick = useRef(false)

  const handlePointerDown = useCallback(e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rect = wrapperRef.current?.getBoundingClientRect()
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: restX.current,
      width: rect?.width || 320,
      locked: null, // null = nog onbekend, true = horizontaal, false = verticaal
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }, [])

  const handlePointerMove = useCallback(e => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY
    if (g.locked === null) {
      if (Math.abs(dx) < LOCK_SLOP && Math.abs(dy) < LOCK_SLOP) return
      g.locked = Math.abs(dx) > Math.abs(dy)
      if (!g.locked) return // verticaal: laat de browser scrollen, wij doen verder niets
    }
    if (!g.locked) return
    // Naar rechts kan alleen om een openstaande rij dicht te vegen; nooit voorbij 0.
    let next = Math.min(0, g.baseX + dx)
    // Niet verder dan de rijbreedte naar links (visuele bodem voor de skip-animatie).
    next = Math.max(next, -g.width)
    g.lastX = next
    setX(next)
  }, [])

  const endGesture = useCallback(() => {
    const g = gesture.current
    gesture.current = null
    setDragging(false)
    if (!g || g.locked !== true) {
      // Geen (horizontale) sleep — gewoon een tik of een verticale scroll.
      setX(restX.current)
      return
    }
    suppressNextClick.current = true
    const finalX = g.lastX ?? g.baseX
    const skipThreshold = -SKIP_RATIO * g.width
    if (finalX <= skipThreshold) {
      // Voorbij de grens: meteen overslaan, met een korte uitschuifanimatie.
      setX(-g.width)
      window.setTimeout(() => onSkip(), RELEASE_MS)
      return
    }
    if (finalX <= OPEN_SNAP_THRESHOLD) {
      restX.current = OPEN_X
      setX(OPEN_X)
      return
    }
    restX.current = 0
    setX(0)
  }, [onSkip])

  const handlePointerUp = useCallback(() => { endGesture() }, [endGesture])

  const handlePointerCancel = useCallback(() => {
    // Bijv. het systeem pakt de gestus af (verticaal scrollen) — terug naar rust.
    gesture.current = null
    setDragging(false)
    setX(restX.current)
  }, [])

  // Vangt clicks af vóórdat ze de inhoud (categorie kiezen, declaratie-knop, …)
  // bereiken: één keer na een echte sleep, en steeds zolang de rij openstaat.
  const handleClickCapture = useCallback(e => {
    if (suppressNextClick.current) {
      suppressNextClick.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (restX.current !== 0) {
      e.preventDefault()
      e.stopPropagation()
      restX.current = 0
      setX(0)
    }
  }, [])

  return (
    <div ref={wrapperRef} className="relative overflow-hidden" style={{ touchAction: 'pan-y' }}>
      <button
        type="button"
        aria-label={label}
        onClick={onSkip}
        className="absolute inset-0 w-full h-full flex items-center justify-end px-6 text-sm font-medium bg-red text-white"
      >
        {label}
      </button>
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClickCapture={handleClickCapture}
        style={{
          position: 'relative', // ligt boven de absoluut gepositioneerde rode knop (anders wint die altijd de stacking-order)
          transform: `translateX(${x}px)`,
          transition: dragging ? 'none' : `transform ${RELEASE_MS}ms ease-out`,
          background: 'var(--color-bg)',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  )
}
