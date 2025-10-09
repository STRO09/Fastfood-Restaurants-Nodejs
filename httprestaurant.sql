-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 09, 2025 at 01:01 PM
-- Server version: 5.7.44-log
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `httprestaurant`
--

-- --------------------------------------------------------

--
-- Table structure for table `menu`
--

CREATE TABLE `menu` (
  `id` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `category` enum('BURGER','FRIES','DRINK') NOT NULL,
  `price` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Dumping data for table `menu`
--

INSERT INTO `menu` (`id`, `name`, `category`, `price`) VALUES
(1, 'Cheese Burger', 'BURGER', 120.00),
(2, 'Veg Burger', 'BURGER', 100.00),
(3, 'French Fries (M)', 'FRIES', 80.00),
(4, 'Coke', 'DRINK', 60.00),
(5, 'French Fries (S)', 'FRIES', 50.00),
(7, 'Coffee Latte', 'DRINK', 40.00);

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `items` text NOT NULL,
  `total` decimal(10,2) NOT NULL,
  `discount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` enum('PENDING','FULFILLED') NOT NULL DEFAULT 'PENDING',
  `order_time` datetime DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

--
-- Dumping data for table `orders`
--

INSERT INTO `orders` (`id`, `items`, `total`, `discount`, `status`, `order_time`) VALUES
(1, '[{\"id\":1,\"name\":\"Cheese Burger\",\"category\":\"BURGER\",\"price\":120,\"qty\":4},{\"id\":4,\"name\":\"Coke\",\"category\":\"DRINK\",\"price\":60,\"qty\":2}]', 600.00, 0.00, 'FULFILLED', '2025-10-06 14:55:44'),
(2, '[{\"id\":1,\"name\":\"Cheese Burger\",\"category\":\"BURGER\",\"price\":120,\"qty\":1},{\"id\":3,\"name\":\"French Fries (M)\",\"category\":\"FRIES\",\"price\":80,\"qty\":1},{\"id\":4,\"name\":\"Coke\",\"category\":\"DRINK\",\"price\":60,\"qty\":1}]', 221.00, 39.00, 'FULFILLED', '2025-10-06 14:59:39'),
(3, '[{\"id\":1,\"name\":\"Cheese Burger\",\"category\":\"BURGER\",\"price\":120,\"qty\":1},{\"id\":2,\"name\":\"Veg Burger\",\"category\":\"BURGER\",\"price\":100,\"qty\":1},{\"id\":3,\"name\":\"French Fries (M)\",\"category\":\"FRIES\",\"price\":80,\"qty\":1},{\"id\":4,\"name\":\"Coke\",\"category\":\"DRINK\",\"price\":60,\"qty\":1}]', 306.00, 54.00, 'FULFILLED', '2025-10-06 15:00:02'),
(4, '[{\"id\":1,\"name\":\"Cheese Burger\",\"category\":\"BURGER\",\"price\":120,\"qty\":1}]', 120.00, 0.00, 'FULFILLED', '2025-10-07 15:45:13'),
(5, '[{\"id\":2,\"name\":\"Veg Burger\",\"category\":\"BURGER\",\"price\":100,\"qty\":1},{\"id\":3,\"name\":\"French Fries (M)\",\"category\":\"FRIES\",\"price\":80,\"qty\":2}]', 260.00, 0.00, 'FULFILLED', '2025-10-07 15:47:47');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `menu`
--
ALTER TABLE `menu`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `menu`
--
ALTER TABLE `menu`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
