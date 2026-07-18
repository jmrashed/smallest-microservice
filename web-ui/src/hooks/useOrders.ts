import { useCallback, useEffect, useRef, useState } from 'react'
import { listOrders, placeOrder as placeOrderRequest, type Order, type PlaceOrderInput } from '../lib/api'

const POLL_INTERVAL_MS = 1000
const CONNECTION_LOST_THRESHOLD = 3

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [connectionLost, setConnectionLost] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null)
  const consecutiveFailures = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasPendingOrders = useCallback((list: Order[]) => list.some((o) => o.status === 'pending'), [])

  const refresh = useCallback(async () => {
    try {
      const fresh = await listOrders()
      setOrders(fresh)
      consecutiveFailures.current = 0
      setConnectionLost(false)
      return fresh
    } catch {
      consecutiveFailures.current += 1
      if (consecutiveFailures.current >= CONNECTION_LOST_THRESHOLD) {
        setConnectionLost(true)
      }
      return null
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startPolling = useCallback(() => {
    if (intervalRef.current !== null) return
    intervalRef.current = setInterval(async () => {
      const fresh = await refresh()
      if (fresh !== null && !hasPendingOrders(fresh)) {
        stopPolling()
      }
    }, POLL_INTERVAL_MS)
  }, [refresh, hasPendingOrders, stopPolling])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const fresh = await refresh()
      if (!cancelled && fresh !== null && hasPendingOrders(fresh)) {
        startPolling()
      }
    })()
    return () => {
      cancelled = true
      stopPolling()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleExpand = useCallback((orderId: number) => {
    setExpandedOrderId((prev) => (prev === orderId ? null : orderId))
  }, [])

  const placeOrder = useCallback(
    async (input: PlaceOrderInput) => {
      setPlaceError(null)
      try {
        const { order_id, status } = await placeOrderRequest(input)
        setOrders((prev) => [
          {
            id: order_id,
            product_id: input.product_id,
            quantity: input.quantity,
            amount: String(input.amount),
            status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ])
        setExpandedOrderId(order_id)
        startPolling()
      } catch (err) {
        setPlaceError(err instanceof Error ? err.message : 'failed to place order')
      }
    },
    [startPolling],
  )

  return { orders, placeOrder, placeError, connectionLost, expandedOrderId, toggleExpand }
}
