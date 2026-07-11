import type { OrderStatus } from '../lib/api'

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: 'bg-gray-200 text-gray-700',
  fulfilled: 'bg-green-100 text-green-800',
  payment_failed: 'bg-red-100 text-red-800',
  cancelled_out_of_stock: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  fulfilled: 'Fulfilled',
  payment_failed: 'Payment Failed',
  cancelled_out_of_stock: 'Cancelled (Out of Stock)',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
