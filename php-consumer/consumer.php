<?php

require __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;
use PhpAmqpLib\Message\AMQPMessage;

const IN_QUEUE = 'q.stock_reserved';
const OUT_QUEUE = 'q.shipment_created';

$pdo = new PDO('mysql:host=localhost;dbname=shipping_db', 'root', '');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$connection = new AMQPStreamConnection('localhost', 5672, 'guest', 'guest', '/', false, 'AMQPLAIN', null, 'en_US', 3, 3600);
$channel = $connection->channel();
$channel->queue_declare(IN_QUEUE, false, false, false, false);
$channel->queue_declare(OUT_QUEUE, false, false, false, false);

echo "[php] waiting for messages...\n";

$callback = function ($msg) use ($pdo, $channel) {
    $message = json_decode($msg->body, true);

    $stmt = $pdo->prepare(
        "INSERT INTO shipments (order_id, status) VALUES (:order_id, 'created') " .
        'ON DUPLICATE KEY UPDATE status = status'
    );
    $stmt->execute(['order_id' => $message['order_id']]);

    $message['event'] = 'shipment_created';
    $message['created_at'] = gmdate('c');

    $channel->basic_publish(new AMQPMessage(json_encode($message)), '', OUT_QUEUE);

    echo '[php] published shipment_created: ' . json_encode($message) . PHP_EOL;

    $msg->delivery_info['channel']->basic_ack($msg->delivery_info['delivery_tag']);
};

$channel->basic_consume(IN_QUEUE, '', false, false, false, false, $callback);

while (count($channel->callbacks)) {
    $channel->wait();
}

$channel->close();
$connection->close();
