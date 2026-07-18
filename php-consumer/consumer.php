<?php

require __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

const IN_QUEUE = 'q.stock_reserved';
const OUT_QUEUE = 'q.shipment_created';
const SAGA_EVENTS_QUEUE = 'q.saga_events';

$pdo = new PDO('mysql:host=localhost;dbname=shipping_db', 'root', '');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$connection = new AMQPStreamConnection('localhost', 5672, 'guest', 'guest', '/', false, 'AMQPLAIN', null, 'en_US', 3, 3600);
$channel = $connection->channel();
$channel->queue_declare(IN_QUEUE, false, false, false, false);
$channel->queue_declare(OUT_QUEUE, false, false, false, false);
$channel->queue_declare(SAGA_EVENTS_QUEUE, false, false, false, false);

function occurred_at_now() {
    $now = \DateTime::createFromFormat('U.u', sprintf('%.6F', microtime(true)));
    $now->setTimezone(new \DateTimeZone('UTC'));
    return $now->format('Y-m-d\TH:i:s.v\Z');
}

function publish_audit($channel, $sourceService, $event, $orderId, $queue) {
    $audit = [
        'order_id' => $orderId,
        'event' => $event,
        'queue' => $queue,
        'source_service' => $sourceService,
        'occurred_at' => occurred_at_now(),
    ];
    $channel->basic_publish(new AMQPMessage(json_encode($audit)), '', SAGA_EVENTS_QUEUE);
}

echo "[php] waiting for messages...\n";

$callback = function ($msg) use ($pdo, $channel) {
    try {
        $message = json_decode($msg->body, true, flags: JSON_THROW_ON_ERROR);

        $stmt = $pdo->prepare(
            "INSERT INTO shipments (order_id, status) VALUES (:order_id, 'created') " .
            'ON DUPLICATE KEY UPDATE status = status'
        );
        $stmt->execute(['order_id' => $message['order_id']]);

        // Only publish shipment_created if this was a genuine new insert (rowCount == 1)
        // If rowCount == 0, it's a duplicate and the no-op update already deduped the row
        if ($stmt->rowCount() != 0) {
            $message['event'] = 'shipment_created';
            $message['created_at'] = gmdate('c');

            $channel->basic_publish(new AMQPMessage(json_encode($message)), '', OUT_QUEUE);

            echo '[php] published shipment_created: ' . json_encode($message) . PHP_EOL;

            publish_audit($channel, 'php', 'shipment_created', $message['order_id'], OUT_QUEUE);
        } else {
            echo "[php] duplicate stock_reserved for order_id={$message['order_id']}, skipping republish\n";
        }

        $msg->delivery_info['channel']->basic_ack($msg->delivery_info['delivery_tag']);
    } catch (Throwable $e) {
        echo "[php] error handling message: " . $e->getMessage() . PHP_EOL;
        $msg->delivery_info['channel']->basic_nack($msg->delivery_info['delivery_tag'], false, false);
    }
};

$channel->basic_consume(IN_QUEUE, '', false, false, false, false, $callback);

while (count($channel->callbacks)) {
    $channel->wait();
}

$channel->close();
$connection->close();
