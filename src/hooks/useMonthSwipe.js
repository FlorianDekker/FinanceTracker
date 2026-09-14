import { useEffect, useRef } from 'react'
import { useMonth } from './useMonth'

/**
 * Horizontale swipe om van maand te wisselen.
 *
 * De richting wordt na een paar pixels vastgezet: zodra de beweging horizontaal
 * is wordt `preventDefault()` aangeroepen zodat de pagina niet meescrollt, en
 * zodra hij verticaal is bemoeit de hook zich er niet meer mee.
 *
 * @param ref                element waarop geluisterd wordt
 * @param options.threshold  minimale horizontale afstand voor een swipe (px)
 * @param options.lockSlop   afstand waarna de richting wordt vastgezet (px)
 * @param options.edgeGuard  negeer touches die binnen X px van de linkerrand
 *                           beginnen (iOS terug-swipe); 0 zet dit uit
 * @param options.edgeZone   touches binnen X px van een van beide randen
 *                           krijgen `startedFromEdge: true` mee
 * @param options.enabled    listeners aan/uit
 * @param options.onSwipe    (dir, { target, startedFromEdge }) => void.
 *                           Standaard `goMonth(dir)`; ChartsPage gebruikt dit
 *                           om per geval tussen tab-wissel en maand te kiezen.
 */
export function useMonthSwipe(ref, options = {}) {
  const { goMonth } = useMonth()
  const {
    threshold = 60,
    lockSlop = 6,
    edgeGuard = 24,
    edgeZone = 0,
    enabled = true,
    onSwipe,
  } = options

  // De listeners worden één keer gebonden; de handler leeft in een ref zodat
  // hij altijd de verse closure ziet (ChartsPage heeft de actuele tab-lijst
  // nodig) zonder dat we bij elke render opnieuw moeten binden.
  const handlerRef = useRef(null)
  useEffect(() => {
    handlerRef.current = (dir, info) => (onSwipe ? onSwipe(dir, info) : goMonth(dir))
  })

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    let startX = null
    let startY = null
    let horizontal = null
    let startTarget = null
    let startedFromEdge = false

    const reset = () => { startX = null; startTarget = null }

    const onStart = e => {
      const x = e.touches[0].clientX
      if (edgeGuard > 0 && x < edgeGuard) { reset(); return }
      startX = x
      startY = e.touches[0].clientY
      startTarget = e.target
      startedFromEdge = edgeZone > 0 && (x < edgeZone || x > window.innerWidth - edgeZone)
      horizontal = null
    }

    const onMove = e => {
      if (startX === null) return
      const dx = Math.abs(e.touches[0].clientX - startX)
      const dy = Math.abs(e.touches[0].clientY - startY)
      if (horizontal === null) {
        if (dx < lockSlop && dy < lockSlop) return  // nog onduidelijk — laat de browser scrollen
        horizontal = dx > dy
      }
      if (horizontal) e.preventDefault()
    }

    const onEnd = e => {
      if (startX === null) { reset(); return }
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)
      const target = startTarget
      const fromEdge = startedFromEdge
      reset()
      if (!horizontal || Math.abs(dx) < threshold || dy > Math.abs(dx)) return
      handlerRef.current?.(dx < 0 ? 'next' : 'prev', { target, startedFromEdge: fromEdge })
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [ref, enabled, threshold, lockSlop, edgeGuard, edgeZone])
}
