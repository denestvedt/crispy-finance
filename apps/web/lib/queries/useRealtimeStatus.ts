'use client'

import { useEffect, useState } from 'react'

export function useRealtimeStatus() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const setOnline = () => setIsOnline(true)
    const setOffline = () => setIsOnline(false)

    setIsOnline(window.navigator.onLine)
    window.addEventListener('online', setOnline)
    window.addEventListener('offline', setOffline)

    return () => {
      window.removeEventListener('online', setOnline)
      window.removeEventListener('offline', setOffline)
    }
  }, [])

  return {
    isOnline,
    modeLabel: isOnline ? 'Live updates connected' : 'Realtime disconnected — polling fallback active',
  }
}
