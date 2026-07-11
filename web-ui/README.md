# Order Saga — Web UI

A small React + TypeScript + Tailwind CSS UI for the [Order Saga](../README.md):
a form to place an order and a live-updating table of recent orders and
their status.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api/*` to
`node-producer` on `:3000` (see `vite.config.ts`), so the rest of the
saga (Node/Python/Go/PHP, RabbitMQ, MySQL) must already be running — see
the top-level README's **Run** section.

## Structure

- `src/lib/api.ts` — typed fetch wrappers for `POST /orders`,
  `GET /orders`.
- `src/hooks/useOrders.ts` — owns polling and state; the only place that
  talks to the API.
- `src/components/` — `OrderForm`, `OrdersTable`, `OrderStatusBadge`,
  each a plain presentational component.
