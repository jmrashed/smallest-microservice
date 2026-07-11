CREATE DATABASE IF NOT EXISTS inventory_db;
USE inventory_db;

CREATE TABLE IF NOT EXISTS stock (
  product_id VARCHAR(50) PRIMARY KEY,
  available_quantity INT NOT NULL
);

INSERT INTO stock (product_id, available_quantity) VALUES
  ('SKU-1', 100),
  ('SKU-2', 50),
  ('OUT_OF_STOCK', 0)
ON DUPLICATE KEY UPDATE available_quantity = VALUES(available_quantity);

CREATE TABLE IF NOT EXISTS reservations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  product_id VARCHAR(50) NOT NULL,
  quantity INT NOT NULL,
  status ENUM('reserved','released') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
