import datetime
import time

import calendar

import datetime

# 全局常量（避免重复创建）
_EPOCH = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)

def fast_dt_to_date_and_time(dt):
    """极速版：无任何校验，仅计算秒数"""
    return int((dt - _EPOCH).total_seconds())

def fast_utc_dt_to_timestamp(dt):
    return calendar.timegm(dt.timetuple())

def datetime_to_date_and_time(dt: datetime.datetime) -> int:
    if not isinstance(dt, datetime.datetime):
        raise TypeError("Input must be a datetime.datetime object")
    if dt.tzinfo is None:
        raise ValueError("Input datetime must be timezone-aware")
    if dt.utcoffset() != datetime.timedelta(0):
        raise ValueError("Input datetime must be in UTC")

    epoch = datetime.datetime(1970, 1, 1, tzinfo=datetime.timezone.utc)
    seconds = int((dt - epoch).total_seconds())

    if seconds < 0 or seconds > 0xFFFFFFFF:
        raise ValueError("Out of DATE_AND_TIME range")
    return seconds

# 准备输入（复用同一个对象，避免创建开销）
dt = datetime.datetime(2026, 3, 12, 14, 24, 36, tzinfo=datetime.timezone.utc)

# 预热（避免首次调用 JIT/缓存影响）
for _ in range(100):
    fast_dt_to_date_and_time(dt)

# 正式计时
start = time.perf_counter()
for _ in range(100_000):
    fast_dt_to_date_and_time(dt)
end = time.perf_counter()

print(f"100,000 次耗时: {(end - start) * 1000:.2f} 毫秒")

print(_EPOCH)