-- 2026-07-15 从 sma_data_test1.Data_Product 只读提取。
-- 不包含连接凭据。
CREATE TABLE `Data_Product` (
  `DataProductTime` datetime DEFAULT NULL,
  `DataProductState` varchar(255) DEFAULT NULL,
  `DataProductCH01` varchar(255) DEFAULT NULL,
  `DataProductCH02` varchar(255) DEFAULT NULL,
  `DataProductCH03` varchar(255) DEFAULT NULL,
  `DataProductCH04` varchar(255) DEFAULT NULL,
  `DataProductCH05` varchar(255) DEFAULT NULL,
  `DataProductCH06` varchar(255) DEFAULT NULL,
  `BatchCode` varchar(255) DEFAULT NULL,
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `collection_time` datetime NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_Data_Product_BatchCode` (`BatchCode`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
