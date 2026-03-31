import { createContext, useContext, useState, useRef, useCallback } from 'react'

const now = new Date()
const MonthContext = createContext()

export function MonthProvider({ children }) {
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [animDir, setAnimDir] = useState(null)
  const [showPill, setShowPill] = useState(false)
  const animating = useRef(false)
  const yearRef = useRef(year)
  const monthRef = useRef(month)

  const syncRefs = (y, m) => { yearRef.current = y; monthRef.current = m }

  const goMonth = useCallback((dir) => {
    if (animating.current) return
    animating.current = true
    setAnimDir(dir === 'next' ? 'left' : 'right')
    setShowPill(true)
    if (dir === 'next') {
      if (monthRef.current === 12) { setYear(y => { syncRefs(y + 1, 1); return y + 1 }); setMonth(1) }
      else { setMonth(m => { syncRefs(yearRef.current, m + 1); return m + 1 }) }
    } else {
      if (monthRef.current === 1) { setYear(y => { syncRefs(y - 1, 12); return y - 1 }); setMonth(12) }
      else { setMonth(m => { syncRefs(yearRef.current, m - 1); return m - 1 }) }
    }
    setTimeout(() => { setAnimDir(null); animating.current = false }, 320)
    setTimeout(() => setShowPill(false), 900)
  }, [])

  const goToNow = useCallback(() => {
    const isCurrentMonth = yearRef.current === now.getFullYear() && monthRef.current === now.getMonth() + 1
    if (isCurrentMonth || animating.current) return
    const goRight = now.getFullYear() > yearRef.current ||
      (now.getFullYear() === yearRef.current && now.getMonth() + 1 > monthRef.current)
    animating.current = true
    setAnimDir(goRight ? 'left' : 'right')
    setShowPill(true)
    setYear(now.getFullYear())
    setMonth(now.getMonth() + 1)
    syncRefs(now.getFullYear(), now.getMonth() + 1)
    setTimeout(() => { setAnimDir(null); animating.current = false }, 320)
    setTimeout(() => setShowPill(false), 900)
  }, [])

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <MonthContext.Provider value={{ year, month, animDir, showPill, isCurrentMonth, goMonth, goToNow, animating, yearRef, monthRef }}>
      {children}
    </MonthContext.Provider>
  )
}

export function useMonth() {
  return useContext(MonthContext)
}
