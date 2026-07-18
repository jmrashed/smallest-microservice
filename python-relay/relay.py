import json
import sys
from datetime import datetime, timezone

import pika
import pymysql

DB_CONFIG = dict(host="localhost", user="root", password="", database="payments_db")

Q_ORDER_CREATED = "q.order_created"
Q_STOCK_UNAVAILABLE = "q.stock_unavailable"
Q_PAYMENT_COMPLETED = "q.payment_completed"
Q_PAYMENT_FAILED = "q.payment_failed"
Q_PAYMENT_REFUNDED = "q.payment_refunded"
Q_SAGA_EVENTS = "q.saga_events"

DECLINE_THRESHOLD = 1000


def now():
    return datetime.now(timezone.utc).isoformat()


def publish(channel, queue, event, payload):
    message = {**payload, "event": event, "created_at": now()}
    channel.queue_declare(queue=queue, durable=False)
    channel.basic_publish(exchange="", routing_key=queue, body=json.dumps(message))
    print(f"[python] published {event}: {message}")


def publish_audit(channel, source_service, event, order_id, queue):
    message = {
        "order_id": order_id,
        "event": event,
        "queue": queue,
        "source_service": source_service,
        "occurred_at": now(),
    }
    channel.queue_declare(queue=Q_SAGA_EVENTS, durable=False)
    channel.basic_publish(exchange="", routing_key=Q_SAGA_EVENTS, body=json.dumps(message))
    print(f"[python] audit published {event}: {message}")


def handle_order_created(channel, method, body):
    try:
        message = json.loads(body)
        order_id = message["order_id"]
        amount = message["amount"]
        status = "declined" if amount > DECLINE_THRESHOLD else "completed"

        db = pymysql.connect(**DB_CONFIG)
        try:
            with db.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO payments (order_id, amount, status) VALUES (%s, %s, %s) "
                    "ON DUPLICATE KEY UPDATE status = status",
                    (order_id, amount, status),
                )
                rows_affected = cursor.rowcount
            db.commit()
        finally:
            db.close()

        if rows_affected == 0:
            print(f"[python] duplicate order_created for order_id={order_id}, skipping republish")
        else:
            if status == "completed":
                publish(channel, Q_PAYMENT_COMPLETED, "payment_completed", message)
                publish_audit(channel, "python", "payment_completed", order_id, Q_PAYMENT_COMPLETED)
            else:
                publish(channel, Q_PAYMENT_FAILED, "payment_failed", message)
                publish_audit(channel, "python", "payment_failed", order_id, Q_PAYMENT_FAILED)
    except Exception as err:
        print(f"[python] error handling message: {err}", file=sys.stderr)
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    else:
        channel.basic_ack(delivery_tag=method.delivery_tag)


def handle_stock_unavailable(channel, method, body):
    try:
        message = json.loads(body)
        order_id = message["order_id"]

        db = pymysql.connect(**DB_CONFIG)
        try:
            with db.cursor() as cursor:
                cursor.execute("UPDATE payments SET status = 'refunded' WHERE order_id = %s", (order_id,))
                rows_affected = cursor.rowcount
            db.commit()
        finally:
            db.close()

        if rows_affected == 0:
            print(f"[python] duplicate stock_unavailable for order_id={order_id}, skipping republish")
        else:
            publish(channel, Q_PAYMENT_REFUNDED, "payment_refunded", message)
            publish_audit(channel, "python", "payment_refunded", order_id, Q_PAYMENT_REFUNDED)
    except Exception as err:
        print(f"[python] error handling message: {err}", file=sys.stderr)
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    else:
        channel.basic_ack(delivery_tag=method.delivery_tag)


def main():
    connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
    channel = connection.channel()

    channel.queue_declare(queue=Q_ORDER_CREATED, durable=False)
    channel.queue_declare(queue=Q_STOCK_UNAVAILABLE, durable=False)

    channel.basic_consume(
        queue=Q_ORDER_CREATED,
        on_message_callback=lambda ch, method, properties, body: handle_order_created(ch, method, body),
    )
    channel.basic_consume(
        queue=Q_STOCK_UNAVAILABLE,
        on_message_callback=lambda ch, method, properties, body: handle_stock_unavailable(ch, method, body),
    )

    print("[python] waiting for messages...")
    channel.start_consuming()


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"[python] error: {err}", file=sys.stderr)
        sys.exit(1)
