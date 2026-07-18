CREATE DATABASE IF NOT EXISTS orders_db;
USE orders_db;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','payment_failed','cancelled_out_of_stock','fulfilled') NOT NULL DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS saga_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  source_service VARCHAR(20) NOT NULL,
  dest_service VARCHAR(20) NOT NULL,
  event VARCHAR(50) NOT NULL,
  queue_name VARCHAR(50) NOT NULL,
  occurred_at DATETIME(3) NOT NULL,
  recorded_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX (order_id)
);
