import type { Order } from '../lib/api'
import { useOrderEvents } from '../hooks/useOrderEvents'
import { OrderStatusBadge } from './OrderStatusBadge'
import { OrderTimeline } from './OrderTimeline'

interface OrderRowProps {
  order: Order
  expanded: boolean
  onToggle: () => void
}

export function OrderRow({ order, expanded, onToggle }: OrderRowProps) {
  const isPending = order.status === 'pending'
  const events = useOrderEvents(order.id, expanded, isPending)

  return (
    <>
      <tr className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={onToggle}>
        <td className="py-2 pr-4 font-mono text-gray-700">
          <span className="mr-1 inline-block w-3 text-gray-400">{expanded ? '▾' : '▸'}</span>
          #{order.id}
        </td>
        <td className="py-2 pr-4">{order.product_id}</td>
        <td className="py-2 pr-4">{order.quantity}</td>
        <td className="py-2 pr-4">${order.amount}</td>
        <td className="py-2 pr-4">
          <OrderStatusBadge status={order.status} />
        </td>
        <td className="py-2 text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6}>
            <OrderTimeline events={events} isPending={isPending} />
          </td>
        </tr>
      )}
    </>
  )
}
