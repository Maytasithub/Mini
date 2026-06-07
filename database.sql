CREATE DATABASE IF NOT EXISTS van_booking_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE van_booking_db;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20),
  role ENUM('passenger', 'admin') NOT NULL DEFAULT 'passenger',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL,
  route_name VARCHAR(255) NOT NULL,
  departure_time TIME NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 180.00,
  departure_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schedule_lookup (driver_id, departure_date, departure_time)
);

CREATE TABLE IF NOT EXISTS bookings (
  booking_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  schedule_id INT NOT NULL,
  seat_number VARCHAR(10) NOT NULL,
  booking_date DATE NOT NULL,
  status ENUM('confirmed', 'cancelled') NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_confirmed_seat (schedule_id, seat_number, booking_date, status),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(user_id),
  CONSTRAINT fk_bookings_schedule FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id)
);

INSERT INTO users (username, password, full_name, phone, role)
VALUES ('admin', 'admin123', 'ผู้ดูแลระบบ', '0000000000', 'admin')
ON DUPLICATE KEY UPDATE username = username;
