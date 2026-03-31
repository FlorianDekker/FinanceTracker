import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook for bottom sheet scroll-lock + swipe-down-to-close with live drag.
 * Returns a ref to attach to the sheet container.
 */
export function useSheetGestures(onClose) {
  const sheetRef = useRef(null)
  const closingRef = useRef(false)

  const animateClose = useCallback(() => {
    if (closingRef.current) return
    closingRef.current = true
    const sheet = sheetRef.current
    const backdrop = sheet?.previousElementSibling
    if (sheet) {
      sheet.style.transition = 'transform 0.2s ease-out'
      sheet.style.transform = 'translateY(100%)'
    }
    if (backdrop) {
      backdrop.style.transition = 'opacity 0.2s ease-out'
      backdrop.style.opacity = '0'
    }
    setTimeout(() => {
      closingRef.current = false
      onClose()
    }, 200)
  }, [onClose])

  // After mount: once the slide-up animation ends, clear it so inline transforms work
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return
    const onAnimEnd = () => {
      sheet.style.animation = 'none'
      sheet.style.transform = 'translateY(0)'
    }
    sheet.addEventListener('animationend', onAnimEnd, { once: true })
    return () => sheet.removeEventListener('animationend', onAnimEnd)
  }, [])

  useEffect(() => {
    let startY = 0
    let dragStartY = null
    let isDragging = false

    const onStart = e => {
      startY = e.touches[0].clientY
      const sheet = sheetRef.current
      if (sheet && sheet.scrollTop <= 0) {
        dragStartY = e.touches[0].clientY
      } else {
        dragStartY = null
      }
      isDragging = false
    }

    const prevent = e => {
      const sheet = sheetRef.current
      if (!sheet) { e.preventDefault(); return }
      if (!sheet.contains(e.target)) { e.preventDefault(); return }

      const dy = e.touches[0].clientY - startY

      // Live drag: follow finger when pulling down at scroll top
      if (dragStartY !== null && dy > 0 && sheet.scrollTop <= 0) {
        e.preventDefault()
        const dragDy = e.touches[0].clientY - dragStartY
        if (dragDy > 0) {
          isDragging = true
          sheet.style.transition = 'none'
          sheet.style.transform = `translateY(${dragDy * 0.6}px)`
          const backdrop = sheet.previousElementSibling
          if (backdrop) {
            backdrop.style.transition = 'none'
            backdrop.style.opacity = `${Math.max(0, 1 - dragDy / 300)}`
          }
        }
        return
      }

      const scrollable = sheet.scrollHeight > sheet.clientHeight
      if (!scrollable) { e.preventDefault(); return }
      if (dy > 0 && sheet.scrollTop === 0) { e.preventDefault(); return }
      if (dy < 0 && sheet.scrollTop + sheet.clientHeight >= sheet.scrollHeight - 1) { e.preventDefault(); return }
    }

    const onEnd = e => {
      const sheet = sheetRef.current
      if (!sheet) return

      if (isDragging) {
        const dy = e.changedTouches[0].clientY - (dragStartY ?? 0)
        if (dy > 80) {
          animateClose()
        } else {
          // Snap back
          sheet.style.transition = 'transform 0.2s ease-out'
          sheet.style.transform = 'translateY(0)'
          const backdrop = sheet.previousElementSibling
          if (backdrop) {
            backdrop.style.transition = 'opacity 0.2s ease-out'
            backdrop.style.opacity = '1'
          }
        }
        isDragging = false
        dragStartY = null
        return
      }

      dragStartY = null
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', prevent, { passive: false })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', prevent)
      document.removeEventListener('touchend', onEnd)
    }
  }, [animateClose])

  return sheetRef
}
