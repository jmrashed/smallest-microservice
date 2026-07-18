import { useCallback, useEffect, useRef, useState } from 'react'
import { getOrderEvents, type SagaEvent } from '../lib/api'

const POLL_INTERVAL_MS = 1000

export function useOrderEvents(orderId: number, enabled: boolean, isPending: boolean) {
  const [events, setEvents] = useState<SagaEvent[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const fresh = await getOrderEvents(orderId)
      setEvents(fresh)
    } catch {
      // keep previously loaded events on a transient fetch error
    }
  }, [orderId])

  useEffect(() => {
    if (!enabled) {
      setEvents([])
      return
    }

    refresh()

    if (!isPending) return undefined

    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, isPending, refresh])

  return events
}
