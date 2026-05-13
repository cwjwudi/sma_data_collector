"""智能图表：列推断、粒度建议、LTTB 降采样与简单统计。"""
from __future__ import annotations

import math
import re
from datetime import date, datetime
from typing import Any

TIME_TYPE_RE = re.compile(
    r"date|time|year|timestamp",
    re.I,
)
NUMERIC_TYPE_RE = re.compile(
    r"int|decimal|numeric|float|double|real|money|bigint|small|medium|number|serial|bool|bit",
    re.I,
)
STRING_TYPE_RE = re.compile(r"char|text|enum|blob|json|string|citext", re.I)
TIME_NAME_HINT = re.compile(
    r"(time|date|_at\b|_on\b|created|updated|timestamp)",
    re.I,
)


def is_time_type(data_type: str) -> bool:
    return bool(TIME_TYPE_RE.search(data_type or ""))


def is_numeric_type(data_type: str) -> bool:
    return bool(NUMERIC_TYPE_RE.search(data_type or ""))


def is_string_like_type(data_type: str) -> bool:
    return bool(STRING_TYPE_RE.search(data_type or ""))


def score_time_column(col: dict[str, Any]) -> int:
    name = str(col.get("name") or "")
    dt = str(col.get("data_type") or "")
    s = 0
    if is_time_type(dt):
        s += 100
    if TIME_NAME_HINT.search(name):
        s += 30
    if col.get("is_primary_key"):
        s -= 5
    return s


def pick_time_column(cols: list[dict[str, Any]]) -> str | None:
    best: tuple[int, str] | None = None
    for c in cols:
        name = str(c.get("name") or "")
        if not re.match(r"^[a-zA-Z0-9_]+$", name):
            continue
        sc = score_time_column(c)
        if sc < 50:
            continue
        if best is None or sc > best[0]:
            best = (sc, name)
    return best[1] if best else None


def pick_numeric_columns(cols: list[dict[str, Any]], max_n: int = 12) -> list[str]:
    out: list[str] = []
    for c in cols:
        name = str(c.get("name") or "")
        if not re.match(r"^[a-zA-Z0-9_]+$", name):
            continue
        if is_numeric_type(str(c.get("data_type") or "")):
            out.append(name)
        if len(out) >= max_n:
            break
    return out


def pick_categorical_columns(cols: list[dict[str, Any]], max_n: int = 8) -> list[str]:
    out: list[str] = []
    for c in cols:
        name = str(c.get("name") or "")
        if not re.match(r"^[a-zA-Z0-9_]+$", name):
            continue
        dt = str(c.get("data_type") or "")
        if is_string_like_type(dt) and not is_time_type(dt):
            out.append(name)
        if len(out) >= max_n:
            break
    return out


def pick_sort_key_column(cols: list[dict[str, Any]]) -> str | None:
    for c in cols:
        if c.get("is_primary_key"):
            n = str(c.get("name") or "")
            if re.match(r"^[a-zA-Z0-9_]+$", n):
                return n
    if cols:
        n = str(cols[0].get("name") or "")
        if re.match(r"^[a-zA-Z0-9_]+$", n):
            return n
    return None


def infer_profile(cols: list[dict[str, Any]]) -> dict[str, Any]:
    tc = pick_time_column(cols)
    nums = pick_numeric_columns(cols)
    cats = pick_categorical_columns(cols)
    sort_k = pick_sort_key_column(cols)
    mode = "timeseries" if tc else "distribution"
    default_metrics = nums[:6]
    suggested_grain = "auto"
    return {
        "mode": mode,
        "suggested_time_column": tc,
        "numeric_columns": nums,
        "categorical_columns": cats,
        "sort_key_column": sort_k,
        "default_metric_columns": default_metrics,
        "suggested_grain": suggested_grain,
    }


def parse_iso_datetime(s: str | None) -> datetime | None:
    if not s or not str(s).strip():
        return None
    t = str(s).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(t)
    except ValueError:
        return None


def suggest_grain_from_span(days: float) -> str:
    if days > 366:
        return "month"
    if days > 60:
        return "day"
    if days > 7:
        return "day"
    if days > 1:
        return "hour"
    return "minute"


def lttb_indices(xs: list[float], ys: list[float], threshold: int) -> list[int]:
    """Largest-Triangle-Three-Buckets：返回保留的点在原序列中的下标。"""
    n = len(xs)
    if threshold >= n or threshold < 3:
        return list(range(n))

    sampled = [0]
    bucket_size = (n - 2) / (threshold - 2)
    a = 0

    for i in range(0, threshold - 2):
        avg_range_start = int(math.floor((i + 1) * bucket_size)) + 1
        avg_range_end = int(math.floor((i + 2) * bucket_size)) + 1
        avg_range_end = min(avg_range_end, n)
        avg_x = 0.0
        avg_y = 0.0
        avg_range_length = avg_range_end - avg_range_start
        if avg_range_length <= 0:
            continue
        for j in range(avg_range_start, avg_range_end):
            avg_x += xs[j]
            avg_y += ys[j]
        avg_x /= avg_range_length
        avg_y /= avg_range_length

        range_offs = int(math.floor(i * bucket_size)) + 1
        range_to = int(math.floor((i + 1) * bucket_size)) + 1
        range_to = min(range_to, n - 1)

        point_ax = xs[a]
        point_ay = ys[a]
        max_area = -1.0
        max_idx = range_offs
        for idx in range(range_offs, range_to + 1):
            area = abs(
                (point_ax - avg_x) * (ys[idx] - point_ay) - (point_ay - avg_y) * (xs[idx] - point_ax)
            ) * 0.5
            if area > max_area:
                max_area = area
                max_idx = idx

        sampled.append(max_idx)
        a = max_idx

    sampled.append(n - 1)
    return sampled


def numeric_series_from_rows(rows: list[dict[str, Any]], key: str) -> list[float]:
    ys: list[float] = []
    for r in rows:
        v = r.get(key)
        try:
            if v is None:
                ys.append(float("nan"))
            elif isinstance(v, bool):
                ys.append(float(int(v)))
            elif isinstance(v, (int, float)):
                ys.append(float(v))
            else:
                ys.append(float(str(v).replace(",", "")))
        except (TypeError, ValueError):
            ys.append(float("nan"))
    return ys


def downsample_rows_by_lttb(
    rows: list[dict[str, Any]],
    x_key: str,
    anchor_metric: str,
    threshold: int,
) -> tuple[list[dict[str, Any]], bool]:
    """以 anchor_metric 为 Y、x_key 为 X（可为时间字符串或数值）做 LTTB，按选中下标截取整行。"""
    if len(rows) <= threshold:
        return rows, False

    xs: list[float] = []
    for i, r in enumerate(rows):
        if x_key == "__idx__":
            xs.append(float(i))
        else:
            xv = r.get(x_key)
            if isinstance(xv, datetime):
                xs.append(xv.timestamp())
            elif isinstance(xv, date):
                xs.append(datetime(xv.year, xv.month, xv.day).timestamp())
            elif isinstance(xv, (int, float)):
                xs.append(float(xv))
            else:
                xs.append(float(i))

    ys = numeric_series_from_rows(rows, anchor_metric)
    # NaN 视为 0 以便稳定采样（波动仍会保留）
    ys_clean = [0.0 if math.isnan(y) else y for y in ys]

    idxs = lttb_indices(xs, ys_clean, threshold)
    picked = [rows[i] for i in idxs]
    return picked, True


def column_stats(values: list[float]) -> dict[str, Any]:
    vals = [v for v in values if not math.isnan(v)]
    if not vals:
        return {"count": 0, "min": None, "max": None, "mean": None, "median": None}
    vals_sorted = sorted(vals)
    n = len(vals_sorted)
    mid = vals_sorted[n // 2] if n % 2 else (vals_sorted[n // 2 - 1] + vals_sorted[n // 2]) / 2
    return {
        "count": n,
        "min": vals_sorted[0],
        "max": vals_sorted[-1],
        "mean": sum(vals_sorted) / n,
        "median": mid,
    }


def detect_outlier_indices(values: list[float], z_threshold: float = 3.0) -> list[int]:
    vals = [v for v in values if not math.isnan(v)]
    if len(vals) < 8:
        return []
    m = sum(vals) / len(vals)
    var = sum((x - m) ** 2 for x in vals) / max(len(vals) - 1, 1)
    sd = math.sqrt(var) if var > 0 else 0.0
    if sd == 0:
        return []
    out: list[int] = []
    for i, v in enumerate(values):
        if math.isnan(v):
            continue
        z = abs(v - m) / sd
        if z >= z_threshold:
            out.append(i)
    return out
