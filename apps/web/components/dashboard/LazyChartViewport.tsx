'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

export function LazyChartViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px' },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={ref}>{isVisible ? children : <p className="text-sm text-slate-500">Chart loads when visible.</p>}</div>
}
