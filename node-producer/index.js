const express = require('express');
const amqp = require('amqplib');
const mysql = require('mysql2/promise');

const DB_CONFIG = { host: 'localhost', user: 'root', password: '', database: 'orders_db' };
const AMQP_URL = 'amqp://guest:guest@localhost:5672';

const Q_ORDER_CREATED = 'q.order_created';
const Q_PAYMENT_FAILED = 'q.payment_failed';
const Q_PAYMENT_REFUNDED = 'q.payment_refunded';
const Q_SHIPMENT_CREATED = 'q.shipment_created';

let channel;
let pool;

async function publishEvent(queue, event, payload) {
  const message = { ...payload, event, created_at: new Date().toISOString() };
  await channel.assertQueue(queue, { durable: false });
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
  console.log(`[node] published ${event}:`, message);
}

async function updateOrderStatus(orderId, status) {
  await pool.execute('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
  console.log(`[node] order ${orderId} -> ${status}`);
}

async function consumeTerminalEvents() {
  const queues = [
    [Q_PAYMENT_FAILED, 'payment_failed'],
    [Q_PAYMENT_REFUNDED, 'cancelled_out_of_stock'],
    [Q_SHIPMENT_CREATED, 'fulfilled'],
  ];

  for (const [queue, status] of queues) {
    await channel.assertQueue(queue, { durable: false });
    channel.consume(queue, async (msg) => {
      const message = JSON.parse(msg.content.toString());
      try {
        await updateOrderStatus(message.order_id, status);
        channel.ack(msg);
      } catch (err) {
        console.error(`[node] error handling ${queue}:`, err);
        channel.nack(msg, false, false);
      }
    });
  }
}

async function createOrder(req, res) {
  const { product_id, quantity, amount } = req.body;
  if (!product_id || !quantity || !amount) {
    return res.status(400).json({ error: 'product_id, quantity, and amount are required' });
  }

  const [result] = await pool.execute(
    'INSERT INTO orders (product_id, quantity, amount, status) VALUES (?, ?, ?, ?)',
    [product_id, quantity, amount, 'pending']
  );
  const orderId = result.insertId;

  await publishEvent(Q_ORDER_CREATED, 'order_created', { order_id: orderId, product_id, quantity, amount });

  res.status(201).json({ order_id: orderId, status: 'pending' });
}

async function getOrder(req, res) {
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (rows.length === 0) {
    return res.status(404).json({ error: 'order not found' });
  }
  res.json(rows[0]);
}

async function main() {
  pool = mysql.createPool(DB_CONFIG);

  const conn = await amqp.connect(AMQP_URL);
  channel = await conn.createChannel();
  await consumeTerminalEvents();

  const app = express();
  app.use(express.json());
  app.post('/orders', createOrder);
  app.get('/orders/:id', getOrder);

  app.listen(3000, () => console.log('[node] order API listening on :3000'));
}

main().catch((err) => {
  console.error('[node] error:', err);
  process.exit(1);
});
