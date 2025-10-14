-- MySQL dump 10.13  Distrib 8.0.36, for Linux (x86_64)
--
-- Host: mainline.proxy.rlwy.net    Database: railway
-- ------------------------------------------------------
-- Server version	9.4.0
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;

/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;

/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;

/*!50503 SET NAMES utf8 */;

/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;

/*!40103 SET TIME_ZONE='+00:00' */;

/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;

/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;

/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;

/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `chains`
--
DROP TABLE IF EXISTS `chains`;

CREATE TABLE
  `chains` (
    `id` int unsigned NOT NULL AUTO_INCREMENT,
    `name` varchar(255) DEFAULT NULL,
    `symbol` varchar(255) DEFAULT NULL,
    `rpc_url` varchar(255) DEFAULT NULL,
    `block_explorer` varchar(255) DEFAULT NULL,
    `native_currency` text,
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `STRK` int DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `STRK` (`STRK`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 6 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chains`
--
LOCK TABLES `chains` WRITE;

/*!40000 ALTER TABLE `chains` DISABLE KEYS */;

INSERT INTO
  `chains`
VALUES
  (
    1,
    'Starknet',
    'STRK',
    'https://starknet-mainnet.g.alchemy.com/public',
    'https://starkscan.co',
    '{\"name\":\"Starknet Token\",\"symbol\":\"STRK\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    2,
    'Lisk',
    'LSK',
    'https://rpc.api.lisk.com',
    'https://blockscout.lisk.com',
    '{\"name\":\"Lisk\",\"symbol\":\"LSK\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    3,
    'Base',
    'BASE',
    'https://mainnet.base.org',
    'https://basescan.org',
    '{\"name\":\"Ether\",\"symbol\":\"ETH\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    4,
    'Flow',
    'FLOW',
    'https://rest-mainnet.onflow.org',
    'https://flowscan.org',
    '{\"name\":\"Flow Token\",\"symbol\":\"FLOW\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  ),
  (
    5,
    'U2U',
    'U2U',
    'https://rpc-mainnet.u2u.xyz',
    'https://u2uscan.xyz',
    '{\"name\":\"U2U Network\",\"symbol\":\"U2U\"}',
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57',
    NULL
  );

/*!40000 ALTER TABLE `chains` ENABLE KEYS */;

UNLOCK TABLES;

--
-- Table structure for table `tokens`
--
DROP TABLE IF EXISTS `tokens`;

/*!40101 SET @saved_cs_client     = @@character_set_client */;

/*!50503 SET character_set_client = utf8mb4 */;

CREATE TABLE
  `tokens` (
    `id` int unsigned NOT NULL AUTO_INCREMENT,
    `address` varchar(255) DEFAULT NULL,
    `symbol` varchar(255) DEFAULT NULL,
    `name` varchar(255) DEFAULT NULL,
    `decimals` int DEFAULT NULL,
    `logo_url` varchar(255) DEFAULT NULL,
    `chain` varchar(255) DEFAULT NULL,
    `price` decimal(18, 8) DEFAULT '0.00000000',
    `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
  ) ENGINE = InnoDB AUTO_INCREMENT = 6 DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tokens`
--
LOCK TABLES `tokens` WRITE;

/*!40000 ALTER TABLE `tokens` DISABLE KEYS */;

INSERT INTO
  `tokens`
VALUES
  (
    1,
    '0xCa14007Eff0dB1f8135f4C25B34De49AB0d42766',
    'STRK',
    'Starknet',
    18,
    'strk.svg',
    'Starknet (Ethereum L2)',
    0.12470000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    2,
    'native',
    'LSK',
    'Lisk',
    8,
    'lsk.svg',
    'Lisk',
    0.24200000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    3,
    '0x4200000000000000000000000000000000000006',
    'BASE',
    'Base',
    18,
    'base.svg',
    'Base (Ethereum L2)',
    0.86025000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    4,
    'native',
    'FLOW',
    'Flow',
    8,
    'flow.svg',
    'Flow',
    0.29100000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:15:16'
  ),
  (
    5,
    '0x558e7139800f8bc119f68d23a6126fffd43a66a6',
    'U2U',
    'U2U Network',
    18,
    'u2u.png',
    'U2U Solaris Mainnet',
    0.02130000,
    '2025-10-14 06:14:57',
    '2025-10-14 06:14:57'
  );

/*!40000 ALTER TABLE `tokens` ENABLE KEYS */;

UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;

/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;

/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;

/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;

/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-10-14  7:25:00