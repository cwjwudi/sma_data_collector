"""按引擎生成图表/下钻用的只读 SELECT（标识符已通过白名单校验）。"""
from __future__ import annotations

import re
from typing import Any


def _sql_eq_literal(val: str) -> str:
    s = (val or "").strip()
    if not s:
        raise ValueError("过滤值为空")
    if len(s) > 512:
        raise ValueError("过滤值过长")
    if re.match(r"^-?\d+$", s):
        return s
    if re.match(r"^-?\d+\.\d+([eE][+-]?\d+)?$", s):
        return s
    return "'" + s.replace("'", "''") + "'"


def _validate_iso_bounds(start: str | None, end: str | None) -> tuple[str | None, str | None]:
    """仅允许数字、分隔符与 T/空格，避免注入。"""
    pat = re.compile(r"^[\d\-T:\s.]+$")

    def one(x: str | None) -> str | None:
        if not x or not str(x).strip():
            return None
        t = str(x).strip()
        if len(t) > 64 or not pat.match(t):
            raise ValueError("时间范围格式无效")
        return "'" + t.replace("'", "") + "'"

    return one(start), one(end)


def build_where_fragment(
    engine: str,
    table: str,
    time_column: str | None,
    time_start: str | None,
    time_end: str | None,
    filters: list[dict[str, str]],
    extra_time_predicates: list[str] | None = None,
) -> str:
    parts: list[str] = []
    ts_lit, te_lit = _validate_iso_bounds(time_start, time_end)
    tc = time_column
    eng = (engine or "").lower()

    def quote_col(c: str) -> str:
        if eng in ("mysql", "mariadb"):
            return f"`{c}`"
        if eng == "postgres":
            return f'"{c}"'
        return c

    if tc and (ts_lit or te_lit):
        qc = quote_col(tc)
        if ts_lit:
            parts.append(f"{qc} >= {ts_lit}")
        if te_lit:
            parts.append(f"{qc} <= {te_lit}")
    if extra_time_predicates:
        parts.extend(extra_time_predicates)

    for f in filters:
        col = f.get("column") or ""
        val = f.get("value")
        if not col or val is None:
            continue
        if not re.match(r"^[a-zA-Z0-9_]+$", col):
            raise ValueError(f"非法列名: {col}")
        lit = _sql_eq_literal(str(val))
        parts.append(f"{quote_col(col)} = {lit}")

    if not parts:
        return ""
    return " WHERE " + " AND ".join(parts)


def sql_min_max_time(
    engine: str,
    table: str,
    time_column: str,
    where_suffix: str,
) -> str:
    eng = (engine or "").lower()
    if eng in ("mysql", "mariadb"):
        return f"SELECT MIN(`{time_column}`) AS __mn, MAX(`{time_column}`) AS __mx FROM `{table}`{where_suffix}"
    if eng == "postgres":
        return f'SELECT MIN("{time_column}") AS __mn, MAX("{time_column}") AS __mx FROM "{table}"{where_suffix}'
    return f"SELECT MIN({time_column}) AS __mn, MAX({time_column}) AS __mx FROM {table}{where_suffix}"


def sql_series_timeseries_raw(
    engine: str,
    table: str,
    time_column: str,
    metric_columns: list[str],
    where_suffix: str,
    limit: int,
) -> str:
    eng = (engine or "").lower()
    if eng in ("mysql", "mariadb"):
        sel = ", ".join([f"`{time_column}`"] + [f"`{m}`" for m in metric_columns])
        return f"SELECT {sel} FROM `{table}`{where_suffix} ORDER BY `{time_column}` ASC LIMIT {int(limit)}"
    if eng == "postgres":
        sel = ", ".join([f'"{time_column}"'] + [f'"{m}"' for m in metric_columns])
        return f'SELECT {sel} FROM "{table}"{where_suffix} ORDER BY "{time_column}" ASC LIMIT {int(limit)}'
    sel = ", ".join([time_column] + metric_columns)
    return f"SELECT {sel} FROM {table}{where_suffix} ORDER BY {time_column} ASC LIMIT {int(limit)}"


def sql_series_timeseries_agg(
    engine: str,
    table: str,
    time_column: str,
    metric_columns: list[str],
    grain: str,
    where_suffix: str,
    limit: int,
) -> str:
    """按桶聚合（均值），bucket 列为 __bx。"""
    eng = (engine or "").lower()
    g = grain.lower()
    if eng in ("mysql", "mariadb"):
        if g == "month":
            bucket_expr = f"DATE_FORMAT(`{time_column}`, '%Y-%m-01')"
        elif g == "day":
            bucket_expr = f"DATE_FORMAT(`{time_column}`, '%Y-%m-%d')"
        elif g == "hour":
            bucket_expr = f"DATE_FORMAT(`{time_column}`, '%Y-%m-%d %H:00:00')"
        else:
            bucket_expr = f"DATE_FORMAT(`{time_column}`, '%Y-%m-%d %H:%i:00')"
        aggs = ", ".join([f"AVG(`{m}`) AS `{m}`" for m in metric_columns])
        return (
            f"SELECT {bucket_expr} AS __bx, {aggs} FROM `{table}`{where_suffix} "
            f"GROUP BY {bucket_expr} ORDER BY __bx ASC LIMIT {int(limit)}"
        )
    if eng == "postgres":
        if g == "month":
            bucket_expr = f"date_trunc('month', \"{time_column}\"::timestamp)"
        elif g == "day":
            bucket_expr = f"date_trunc('day', \"{time_column}\"::timestamp)"
        elif g == "hour":
            bucket_expr = f"date_trunc('hour', \"{time_column}\"::timestamp)"
        else:
            bucket_expr = f"date_trunc('minute', \"{time_column}\"::timestamp)"
        aggs = ", ".join([f'AVG("{m}") AS "{m}"' for m in metric_columns])
        return (
            f'SELECT {bucket_expr} AS __bx, {aggs} FROM "{table}"{where_suffix} '
            f"GROUP BY {bucket_expr} ORDER BY __bx ASC LIMIT {int(limit)}"
        )
    # sqlite
    if g == "month":
        bucket_expr = f"strftime('%Y-%m-01', {time_column})"
    elif g == "day":
        bucket_expr = f"strftime('%Y-%m-%d', {time_column})"
    elif g == "hour":
        bucket_expr = f"strftime('%Y-%m-%d %H:00:00', {time_column})"
    else:
        bucket_expr = f"strftime('%Y-%m-%d %H:%M:00', {time_column})"
    aggs = ", ".join([f"AVG({m}) AS {m}" for m in metric_columns])
    return (
        f"SELECT {bucket_expr} AS __bx, {aggs} FROM {table}{where_suffix} "
        f"GROUP BY {bucket_expr} ORDER BY __bx ASC LIMIT {int(limit)}"
    )


def sql_series_distribution(
    engine: str,
    table: str,
    sort_column: str,
    metric_columns: list[str],
    where_suffix: str,
    limit: int,
) -> str:
    eng = (engine or "").lower()
    if eng in ("mysql", "mariadb"):
        sel = ", ".join([f"`{sort_column}`"] + [f"`{m}`" for m in metric_columns])
        return f"SELECT {sel} FROM `{table}`{where_suffix} ORDER BY `{sort_column}` ASC LIMIT {int(limit)}"
    if eng == "postgres":
        sel = ", ".join([f'"{sort_column}"'] + [f'"{m}"' for m in metric_columns])
        return f'SELECT {sel} FROM "{table}"{where_suffix} ORDER BY "{sort_column}" ASC LIMIT {int(limit)}'
    sel = ", ".join([sort_column] + metric_columns)
    return f"SELECT {sel} FROM {table}{where_suffix} ORDER BY {sort_column} ASC LIMIT {int(limit)}"


def sql_category_counts(
    engine: str,
    table: str,
    category_column: str,
    where_suffix: str,
    limit_bins: int,
) -> str:
    eng = (engine or "").lower()
    lim = int(limit_bins)
    if eng in ("mysql", "mariadb"):
        return (
            f"SELECT `{category_column}` AS __cat, COUNT(*) AS __cnt FROM `{table}`{where_suffix} "
            f"GROUP BY `{category_column}` ORDER BY __cnt DESC LIMIT {lim}"
        )
    if eng == "postgres":
        return (
            f'SELECT "{category_column}" AS __cat, COUNT(*) AS __cnt FROM "{table}"{where_suffix} '
            f'GROUP BY "{category_column}" ORDER BY __cnt DESC LIMIT {lim}'
        )
    return (
        f"SELECT {category_column} AS __cat, COUNT(*) AS __cnt FROM {table}{where_suffix} "
        f"GROUP BY {category_column} ORDER BY __cnt DESC LIMIT {lim}"
    )


def sql_drill_star(
    engine: str,
    table: str,
    where_suffix: str,
    order_column: str | None,
    limit: int,
    offset: int,
) -> str:
    eng = (engine or "").lower()
    lim = max(1, min(int(limit), 5000))
    off = max(0, min(int(offset), 9_999_999))
    ord_clause = ""
    if order_column and re.match(r"^[a-zA-Z0-9_]+$", order_column):
        if eng in ("mysql", "mariadb"):
            ord_clause = f" ORDER BY `{order_column}` ASC"
        elif eng == "postgres":
            ord_clause = f' ORDER BY "{order_column}" ASC'
        else:
            ord_clause = f" ORDER BY {order_column} ASC"
    if eng in ("mysql", "mariadb"):
        return f"SELECT * FROM `{table}`{where_suffix}{ord_clause} LIMIT {lim} OFFSET {off}"
    if eng == "postgres":
        return f'SELECT * FROM "{table}"{where_suffix}{ord_clause} LIMIT {lim} OFFSET {off}'
    return f"SELECT * FROM {table}{where_suffix}{ord_clause} LIMIT {lim} OFFSET {off}"


def normalize_chart_rows(
    rows: list[dict[str, Any]],
    x_field: str,
    metrics: list[str],
    mode: str,
) -> tuple[list[Any], dict[str, list[Any]], list[str]]:
    """返回 x 轴展示值列表、各 metric 序列、原始 x 字段类型 hint。"""
    xs: list[Any] = []
    series_map: dict[str, list[Any]] = {m: [] for m in metrics}
    warnings: list[str] = []
    for i, r in enumerate(rows):
        xv = r.get(x_field)
        if xv is None and mode == "distribution":
            xv = i
        xs.append(xv)
        for m in metrics:
            series_map[m].append(r.get(m))
    return xs, series_map, warnings
