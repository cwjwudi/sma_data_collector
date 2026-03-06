import datetime
import time

# 构造 10 万行模拟数据
n = 1_000_000
base_time = datetime.datetime(2026, 3, 5)
data = [(base_time + datetime.timedelta(seconds=i), i * 1.1, i * 2.2) for i in range(n)]

# 测试提取 datetime 列
start = time.time()
dates = [t[0] for t in data]
end = time.time()

print(f"提取 {n} 行耗时: {(end - start)*1000:.2f} 毫秒")