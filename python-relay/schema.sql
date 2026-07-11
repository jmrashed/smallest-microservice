CREATE DATABASE IF NOT EXISTS payments_db;
USE payments_db;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('completed','declined','refunded') NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
