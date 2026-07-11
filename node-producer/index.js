const amqp = require('amqplib');

const OUT_QUEUE = 'q.node_to_python';

async function main() {
  const conn = await amqp.connect('amqp://guest:guest@localhost:5672');
  const channel = await conn.createChannel();
  await channel.assertQueue(OUT_QUEUE, { durable: false });

  const message = {
    path: ['node'],
    created_at: new Date().toISOString(),
  };

  channel.sendToQueue(OUT_QUEUE, Buffer.from(JSON.stringify(message)));
  console.log('[node] sent:', message);

  await channel.close();
  await conn.close();
}

main().catch((err) => {
  console.error('[node] error:', err);
  process.exit(1);
});
