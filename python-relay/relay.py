import json
import sys

import pika

IN_QUEUE = "q.node_to_python"
OUT_QUEUE = "q.python_to_go"


def on_message(channel, method, properties, body):
    message = json.loads(body)
    message["path"].append("python")
    print(f"[python] received, forwarding: {message}")

    channel.basic_publish(exchange="", routing_key=OUT_QUEUE, body=json.dumps(message))
    channel.basic_ack(delivery_tag=method.delivery_tag)


def main():
    connection = pika.BlockingConnection(pika.ConnectionParameters("localhost"))
    channel = connection.channel()
    channel.queue_declare(queue=IN_QUEUE, durable=False)
    channel.queue_declare(queue=OUT_QUEUE, durable=False)

    channel.basic_consume(queue=IN_QUEUE, on_message_callback=on_message)
    print("[python] waiting for messages...")
    channel.start_consuming()


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"[python] error: {err}", file=sys.stderr)
        sys.exit(1)
