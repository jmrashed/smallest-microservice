# Order Saga — Polyglot Microservices over RabbitMQ + MySQL

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A learning project: four single-file services — one per language (Node.js,
Python, Go, PHP) — implement a **choreography saga** for placing an order.
Each service owns its own MySQL schema; coordination happens only through
RabbitMQ events, with compensating actions when payment or stock fails.

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
