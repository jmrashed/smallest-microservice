export type OrderStatus =
  | 'pending'
  | 'fulfilled'
  | 'payment_failed'
  | 'cancelled_out_of_stock'

export interface Order {
  id: number
  product_id: string
  quantity: number
  amount: string
  status: OrderStatus
  created_at: string
  updated_at: string
}

export interface PlaceOrderInput {
  product_id: string
  quantity: number
  amount: number
}

async function parseJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(body?.error ?? `request failed with status ${res.status}`)
  }
  return body
}

export async function placeOrder(input: PlaceOrderInput): Promise<{ order_id: number; status: OrderStatus }> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parseJsonOrThrow(res)
}

export async function listOrders(): Promise<Order[]> {
  const res = await fetch('/api/orders')
  return parseJsonOrThrow(res)
}
