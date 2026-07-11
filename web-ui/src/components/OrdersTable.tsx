import type { Order } from '../lib/api'
import { OrderStatusBadge } from './OrderStatusBadge'

export function OrdersTable({ orders }: { orders: Order[] }) {
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
          <tr key={order.id} className="border-b border-gray-100">
            <td className="py-2 pr-4 font-mono text-gray-700">#{order.id}</td>
            <td className="py-2 pr-4">{order.product_id}</td>
            <td className="py-2 pr-4">{order.quantity}</td>
            <td className="py-2 pr-4">${order.amount}</td>
            <td className="py-2 pr-4">
              <OrderStatusBadge status={order.status} />
            </td>
            <td className="py-2 text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
