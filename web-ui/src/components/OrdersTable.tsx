import type { Order } from '../lib/api'
import { OrderRow } from './OrderRow'

interface OrdersTableProps {
  orders: Order[]
  expandedOrderId: number | null
  onToggleExpand: (orderId: number) => void
}

export function OrdersTable({ orders, expandedOrderId, onToggleExpand }: OrdersTableProps) {
  if (orders.length === 0) {
    return <p className="text-sm text-gray-500">No orders yet — place one above.</p>
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-gray-500">
          <th className="py-2 pr-4 font-medium">Order</th>
          <th className="py-2 pr-4 font-medium">Product</th>
          <th className="py-2 pr-4 font-medium">Qty</th>
          <th className="py-2 pr-4 font-medium">Amount</th>
          <th className="py-2 pr-4 font-medium">Status</th>
          <th className="py-2 font-medium">Placed</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            expanded={expandedOrderId === order.id}
            onToggle={() => onToggleExpand(order.id)}
          />
        ))}
      </tbody>
    </table>
  )
}
