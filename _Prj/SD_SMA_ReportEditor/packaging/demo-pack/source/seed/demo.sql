-- 演示用表与样例数据（MariaDB 首次初始化时自动执行）
USE report;

CREATE TABLE IF NOT EXISTS demo_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tag_name VARCHAR(64) NOT NULL,
  value DOUBLE NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO demo_readings (tag_name, value) VALUES
  ('Temperature', 23.5),
  ('Pressure', 1.02),
  ('FlowRate', 120.0);
