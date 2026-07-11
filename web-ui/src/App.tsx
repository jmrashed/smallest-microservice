import { OrderForm } from './components/OrderForm'
import { OrdersTable } from './components/OrdersTable'
import { useOrders } from './hooks/useOrders'

function App() {
  const { orders, placeOrder, placeError, connectionLost } = useOrders()

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Order Saga</h1>
      <p className="mt-1 text-sm text-gray-500">
        Place an order and watch it move through payment, inventory, and shipping.
      </p>

      <section className="mt-8 rounded-lg border border-gray-200 p-4">
        <OrderForm onSubmit={placeOrder} error={placeError} />
      </section>

      {connectionLost && (
        <p className="mt-4 rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          Connection lost, retrying...
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-gray-600">Recent Orders</h2>
        <OrdersTable orders={orders} />
      </section>
    </div>
  )
}

export default App
