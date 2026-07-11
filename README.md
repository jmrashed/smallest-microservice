# World's Smallest Microservice — RabbitMQ Relay Chain

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A learning project: four minimal, single-file services — one per language
(Node.js, Python, Go, PHP) — relay a single JSON message through a chain of
RabbitMQ queues, each service appending its name before passing the message on.

```
[Node: producer] --q.node_to_python--> [Python: relay] --q.python_to_go--> [Go: relay] --q.go_to_php--> [PHP: consumer]
```

## Project Structure

```
.
├── node-producer/    # Publishes the initial message (Node.js)
│   └── index.js
├── python-relay/     # Consumes from Node, relays to Go (Python)
│   └── relay.py
├── go-relay/         # Consumes from Python, relays to PHP (Go)
│   └── main.go
└── php-consumer/     # Consumes the final message and prints it (PHP)
    └── consumer.php
```

## Prerequisites

- RabbitMQ running locally on `localhost:5672` with default `guest`/`guest`
  credentials and default vhost (e.g. `sudo systemctl start rabbitmq-server`,
  or `brew services start rabbitmq`).
- Node.js, Python 3, Go, and PHP + Composer installed. PHP needs the
  `bcmath` extension (`sudo apt-get install php-bcmath` on Debian/Ubuntu,
  or the equivalent for your PHP version, e.g. `php8.5-bcmath`).

## Install dependencies

```bash
cd node-producer && npm install && cd ..

cd python-relay && python3 -m venv venv && ./venv/bin/pip install -r requirements.txt && cd ..

cd go-relay && go mod tidy && cd ..

cd php-consumer && composer install && cd ..
```

On Debian/Ubuntu, `python3 -m venv` is required because system Python is
"externally managed" (PEP 668) and blocks a plain `pip install`.

Composer may resolve `php-amqplib` down to `v2.x` if your PHP install is
missing extensions like `mbstring`/`bcmath` that newer versions require —
that's fine, `consumer.php` targets the `v2.x` API (`$msg->body` and
`$channel->basic_ack(...)` instead of `$msg->getBody()`/`$msg->ack()`).

## Run

Start the three consumers first (downstream-first avoids any confusion about
ordering on the first run — queues persist messages regardless of start
order), each in its own terminal:

```bash
# Terminal 1
cd php-consumer && php consumer.php

# Terminal 2
cd go-relay && go run main.go

# Terminal 3
cd python-relay && ./venv/bin/python relay.py
```

Then trigger the chain:

```bash
# Terminal 4
cd node-producer && npm start
```

Watch the message hop through each terminal's log, ending with PHP printing:

```
[php] final message: {"path":["node","python","go","php"],"created_at":"..."}
```

## License

Released under the [MIT License](LICENSE).
