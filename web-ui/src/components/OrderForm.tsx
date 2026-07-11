import { useState, type FormEvent } from 'react'
import type { PlaceOrderInput } from '../lib/api'

const KNOWN_PRODUCTS = ['SKU-1', 'SKU-2', 'OUT_OF_STOCK']

interface OrderFormProps {
  onSubmit: (input: PlaceOrderInput) => Promise<void>
  error: string | null
}

export function OrderForm({ onSubmit, error }: OrderFormProps) {
  const [productId, setProductId] = useState('SKU-1')
  const [quantity, setQuantity] = useState(1)
  const [amount, setAmount] = useState(50)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit({ product_id: productId, quantity, amount })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="product_id" className="text-xs font-medium text-gray-600">
          Product
        </label>
        <input
          id="product_id"
          list="known-products"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          required
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
        <datalist id="known-products">
          {KNOWN_PRODUCTS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="quantity" className="text-xs font-medium text-gray-600">
          Quantity
        </label>
        <input
          id="quantity"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
          required
          className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="amount" className="text-xs font-medium text-gray-600">
          Amount ($)
        </label>
        <input
          id="amount"
          type="number"
          min={0.01}
          step={0.01}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          required
          className="w-28 rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Placing...' : 'Place Order'}
      </button>

      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  )
}
