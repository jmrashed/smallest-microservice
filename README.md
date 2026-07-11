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
- **Consume** = a service opens a connection ahead of time and tells
  RabbitMQ "send me anything that lands on queue X." RabbitMQ pushes each
  message to that service's callback the moment one arrives.
- The **queue name is the entire contract** between two services — e.g.
  `q.order_created` is just a string both Node and Python's code happen to
  agree on. There's no shared API, schema registry, or direct network call.
- RabbitMQ guarantees **at-least-once delivery**: if a consumer crashes
  before acking a message, RabbitMQ redelivers it later. That's why every
  downstream table (`payments`, `reservations`, `shipments`) has an
  `order_id UNIQUE` guard, and why each service checks affected-rows before
  republishing its own next event — so a redelivered message can't
  double-charge, double-reserve, double-ship, or cascade a duplicate event
  through the rest of the chain.
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
- Node.js, Python 3, Go, and PHP + Composer installed. PHP needs the
  `pdo_mysql` and `bcmath` extensions.

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

## License

Released under the [MIT License](LICENSE).
