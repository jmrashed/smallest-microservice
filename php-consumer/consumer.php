<?php

require __DIR__ . '/vendor/autoload.php';

use PhpAmqpLib\Connection\AMQPStreamConnection;

const QUEUE = 'q.go_to_php';

$connection = new AMQPStreamConnection('localhost', 5672, 'guest', 'guest', '/', false, 'AMQPLAIN', null, 'en_US', 3, 3600);
$channel = $connection->channel();
$channel->queue_declare(QUEUE, false, false, false, false);

echo "[php] waiting for messages...\n";

$callback = function ($msg) {
    $message = json_decode($msg->body, true);
    $message['path'][] = 'php';

    echo '[php] final message: ' . json_encode($message) . PHP_EOL;

    $msg->delivery_info['channel']->basic_ack($msg->delivery_info['delivery_tag']);
};

$channel->basic_consume(QUEUE, '', false, false, false, false, $callback);

while (count($channel->callbacks)) {
    $channel->wait();
}

$channel->close();
$connection->close();
