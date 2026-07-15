-- 目标库：sma_data_stress_test
-- Data_Batch 仅作为查询页批次号字典，不创建索引。
CREATE TABLE IF NOT EXISTS Data_Batch (
    BatchCode VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

TRUNCATE TABLE Data_Batch;

INSERT INTO Data_Batch (BatchCode)
SELECT BatchCode
FROM Data_Product
WHERE BatchCode IS NOT NULL
  AND BatchCode <> ''
GROUP BY BatchCode
ORDER BY BatchCode
LIMIT 1000;
