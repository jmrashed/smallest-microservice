# Order Saga — Polyglot Microservices over RabbitMQ + MySQL

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A four-service order-processing pipeline. Each service is a different
language, owns its own MySQL database, and does one job in the order
lifecycle:

| Service | Language | Purpose | Database |
|---|---|---|---|
| **Order Service** | Node.js | Exposes the HTTP API; creates orders and tracks final status | `orders_db` |
| **Payment Service** | Python | Charges (or declines) the order; issues refunds on downstream failure | `payments_db` |
| **Inventory Service** | Go | Reserves stock for the order, or reports it unavailable | `inventory_db` |
| **Shipping Service** | PHP | Creates the shipment once payment and stock both succeed | `shipping_db` |

No service reads or writes another service's database. Coordination is a
**choreography saga**: there is no orchestrator — each service reacts to
RabbitMQ events and publishes its own next event, with compensating actions
(refund, cancel) when payment or stock fails.

```
POST /orders (Node)                                                     saga ends:
  → orders_db, publish order_created                                    - payment_failed
      → Python (payments_db): decline if amount > 1000                  - cancelled_out_of_stock
          → publish payment_completed | payment_failed ──────────────→ Node
              → Go (inventory_db): unavailable if out of stock          - fulfilled
                  → publish stock_reserved | stock_unavailable ───┬───→ Node
                      → PHP (shipping_db): create shipment         │
                          → publish shipment_created ─────────────┼───→ Node
                  Python refunds on stock_unavailable ─────────────┘
```

## How RabbitMQ Works Here

Services never call each other directly — no service knows another
service's address. Each one only knows RabbitMQ's address, and talks to it
via **publish/subscribe over named queues**:

```
                                   ┌───────────────────────────────┐
                                   │           RabbitMQ            │
                                   │                                │
   Node  ──publish──▶ q.order_created ──────────────▶ consume ──▶  Python
                                   │                                │
 Python  ──publish──▶ q.payment_completed ───────────▶ consume ──▶  Go
 Python  ──publish──▶ q.payment_failed ───────────────▶ consume ──▶  Node
                                   │                                │
     Go  ──publish──▶ q.stock_reserved ───────────────▶ consume ──▶  PHP
     Go  ──publish──▶ q.stock_unavailable ────────────▶ consume ──▶  Python
                                   │                                │
    PHP  ──publish──▶ q.shipment_created ─────────────▶ consume ──▶  Node
 Python  ──publish──▶ q.payment_refunded ─────────────▶ consume ──▶  Node
                                   └───────────────────────────────┘
```

- **Publish** = "drop a message on this queue and move on" — the publisher
  doesn't wait for a response (this is why `POST /orders` returns
  `"pending"` immediately; the rest of the saga runs in the background).
- In addition to the queues above, every hop also publishes a small audit
  message to `q.saga_events`. Node consumes it into the `saga_events` table,
  which backs `GET /orders/:id/events` and the web UI timeline. It is only
  for display; the saga does not depend on it.
- **Consume** = a service opens a connection ahead of time and tells
  RabbitMQ "send me anything that lands on queue X." RabbitMQ pushes each
  message to that service's callback the moment one arrives.
- The **queue name is the entire contract** between two services — e.g.
  `q.order_created` is just a string both Node and Python's code happen to
  agree on. There's no shared API, schema registry, or direct network call.
- Consumers use manual acks, so if a consumer dies before acking, RabbitMQ
  redelivers the message. To make that safe, `payments`, `reservations` and
  `shipments` have an `order_id UNIQUE` column, and those services check
  affected rows before publishing the next event, so a redelivered message
  does not charge, reserve or ship twice. The refund is an `UPDATE` that
  changes nothing the second time. Node's status updates are repeatable (the
  timeline may record a redelivered audit message twice). This protects
  against duplicates, **not** against lost events: see
  [Known limitations](#known-limitations).
- Queues are durable and messages are published as persistent, so queued
  messages are intended to survive a broker restart. Publisher confirms are
  not used, so this is not a delivery guarantee.
- Multiple consumers can listen on the same queue (RabbitMQ round-robins
  between them) — this project runs exactly one instance of each service,
  but it's why running two instances of `php consumer.php` at once would
  cause messages to unpredictably split between them.

## Prerequisites

- RabbitMQ running locally on `localhost:5672` with default `guest`/`guest`
  credentials and default vhost.
- MySQL running locally on `localhost:3306`, reachable as `root` with no
  password. If your local MySQL uses different credentials, update the
  `DB_CONFIG`/`dsn`/PDO connection string constant at the top of each
  service's main file.
- Node.js, Python 3, Go 1.24+, and PHP 8.1+ with Composer. PHP needs the
  `pdo_mysql`, `sockets` and `mbstring` extensions.

If you ran an earlier version of this project, its queues were non-durable.
If a service fails with `PRECONDITION_FAILED`, delete the old `q.*` queues
(they are also gone after a broker restart). Recent RabbitMQ releases (seen
on 4.4.1) reject the old non-durable declarations by default.

## Install dependencies and create schemas

```bash
cd node-producer && npm install && cd ..
cd python-relay && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt && cd ..
cd go-relay && go mod tidy && cd ..
cd php-consumer && composer install && cd ..

mysql -u root < node-producer/schema.sql
mysql -u root < python-relay/schema.sql
mysql -u root < go-relay/schema.sql
mysql -u root < php-consumer/schema.sql
```

Seeded products in `inventory_db.stock`: `SKU-1` (100 units), `SKU-2` (50
units), `OUT_OF_STOCK` (0 units, always triggers the out-of-stock path).

The `python3 -m venv` line is for Linux/macOS. On Windows use
`python -m venv venv` and `venv\Scripts\pip`, then run the service with
`venv\Scripts\python relay.py`. Re-running `go-relay/schema.sql` resets
the seeded stock levels.

## Run

Start the three background consumers first, each in its own terminal:

```bash
# Terminal 1
cd php-consumer && php consumer.php

# Terminal 2
cd go-relay && go run main.go

# Terminal 3
cd python-relay && ./venv/bin/python relay.py

# Terminal 4
cd node-producer && npm start
```

## Place an order

```bash
# Happy path — ends "fulfilled"
curl -s -X POST localhost:3000/orders -H 'Content-Type: application/json' \
  -d '{"product_id":"SKU-1","quantity":2,"amount":50}'

# Payment declined — ends "payment_failed" (amount > 1000)
curl -s -X POST localhost:3000/orders -H 'Content-Type: application/json' \
  -d '{"product_id":"SKU-1","quantity":1,"amount":2000}'

# Out of stock — ends "cancelled_out_of_stock" (payment succeeds, then refunded)
curl -s -X POST localhost:3000/orders -H 'Content-Type: application/json' \
  -d '{"product_id":"OUT_OF_STOCK","quantity":1,"amount":20}'
```

Poll status with:

```bash
curl -s localhost:3000/orders/<order_id>
```

List recent orders with:

```bash
curl -s localhost:3000/orders
```

See the events recorded for one order:

```bash
curl -s localhost:3000/orders/<order_id>/events
```

`POST /orders` returns `400` unless `product_id` is a string of 1 to 50
characters, `quantity` is a positive integer and `amount` is a number from
0.01 to 99999999.99. An unknown `product_id` is treated as out of stock.

## Web UI

A small React + Tailwind UI in `web-ui/` gives you a form to place orders
and a live-updating table instead of `curl`. Expand an order to see its
saga timeline.

```bash
cd web-ui && npm install && npm run dev
```

Open `http://localhost:5173`. In dev, Vite proxies `/api/*` requests to
`node-producer` on `:3000`, so make sure the Order Service (and the rest
of the saga) is already running per the **Run** section above.

## Known limitations

This is a learning demo of a choreography saga, not production code.

- **No transactional outbox.** Each service commits to its database and then
  publishes. If it crashes or the publish fails in between, the redelivered
  message is treated as a duplicate (or has already been dropped), the next
  event is never sent, and the order stays `pending`. Node has the same gap
  between inserting an order and publishing `order_created`.
- **No publisher confirms.** A publish is not confirmed by the broker.
- **No retries or dead-letter queue.** A handler that fails (for example,
  because MySQL is briefly unavailable) rejects the message without
  requeueing it, so RabbitMQ discards it.
- **No timeouts, and not every failure is compensated.** Only a declined
  payment and unavailable stock are handled. If shipping fails, the payment
  and the stock reservation are not undone.
- **No reconnect logic.** Restart all services after RabbitMQ restarts. The
  Node API can keep running without a broker connection; new orders then
  return `500` but leave a `pending` row behind. The PHP consumer also needs
  a restart if MySQL closes its long-lived connection.
- **Demo-level setup.** Hardcoded local credentials, no authentication on the
  API, no automated tests, and one MySQL user for all four databases, so
  database separation is by convention. The payment "charge" is only a
  database row.

## License

Released under the [MIT License](LICENSE).
