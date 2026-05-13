"""图表接口业务编排：调用列元数据、拼 SQL、执行、LTTB、统计。"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

from fastapi import HTTPException

from modules import db_readonly_service, table_chart_intel, table_chart_sql


def _coerce_datetime_value(v: Any) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    if isinstance(v, date):
        return datetime(v.year, v.month, v.day)
    return table_chart_intel.parse_iso_datetime(str(v))
def _is_mysql_family(engine: str) -> bool:
    return (engine or "").lower() in ("mysql", "mariadb")


def fetch_columns_extended(
    engine: str,
    conn: dict[str, Any],
    user: str,
    pwd: str,
    dbname: str,
    table: str,
) -> list[dict[str, Any]]:
    if _is_mysql_family(engine):
        return db_readonly_service.list_mysql_columns_extended(
            conn.get("host") or "127.0.0.1",
            int(conn.get("port") or 3306),
            user,
            pwd,
            dbname,
            table,
        )
    if engine == "postgres":
        return db_readonly_service.list_pg_columns_extended(
            conn.get("host") or "127.0.0.1",
            int(conn.get("port") or 5432),
            user,
            pwd,
            dbname or "postgres",
            table,
        )
    if engine == "sqlite":
        path = conn.get("sqlite_path") or ""
        return db_readonly_service.list_sqlite_columns_extended(path, table)
    raise HTTPException(400, "未知引擎")


def run_sql(
    engine: str,
    conn: dict[str, Any],
    user: str,
    pwd: str,
    dbname: str,
    sql: str,
    fetch_cap: int,
) -> dict[str, Any]:
    if _is_mysql_family(engine):
        return db_readonly_service.run_mysql_readonly(
            conn.get("host") or "127.0.0.1",
            int(conn.get("port") or 3306),
            user,
            pwd,
            dbname,
            sql,
            fetch_cap,
        )
    if engine == "postgres":
        return db_readonly_service.run_postgres_readonly(
            conn.get("host") or "127.0.0.1",
            int(conn.get("port") or 5432),
            user,
            pwd,
            dbname or "postgres",
            sql,
            fetch_cap,
        )
    if engine == "sqlite":
        path = conn.get("sqlite_path") or ""
        return db_readonly_service.run_sqlite_readonly(path, sql, fetch_cap)
    raise HTTPException(400, "未知引擎")


def chart_profile_from_columns(cols: list[dict[str, Any]]) -> dict[str, Any]:
    inf = table_chart_intel.infer_profile(cols)
    slim = [{"name": c.get("name"), "data_type": c.get("data_type"), "is_primary_key": c.get("is_primary_key")} for c in cols]
    return {"columns": slim, **inf}


def build_series_response(
    rows: list[dict[str, Any]],
    *,
    chart_kind: str,
    x_field: str,
    metrics: list[str],
    mode: str,
    lttb_cap: int,
    anchor_metric: str | None,
) -> dict[str, Any]:
    sampled = False
    work_rows = rows
    if chart_kind == "line" and len(rows) > lttb_cap and anchor_metric:
        work_rows, sampled = table_chart_intel.downsample_rows_by_lttb(rows, x_field, anchor_metric, lttb_cap)

    xs, series_map, _warns = table_chart_sql.normalize_chart_rows(work_rows, x_field, metrics, mode)

    series_out = []
    stats_map: dict[str, Any] = {}
    outliers_map: dict[str, list[int]] = {}

    for m in metrics:
        ys = table_chart_intel.numeric_series_from_rows(work_rows, m)
        stats_map[m] = table_chart_intel.column_stats(ys)
        series_out.append({"name": m, "data": series_map.get(m, [])})
        outliers_map[m] = table_chart_intel.detect_outlier_indices(ys)[:80]

    insight = _simple_insight(metrics[0], series_map.get(metrics[0], []) if metrics else [])

    return {
        "chart_kind": chart_kind,
        "x_axis": xs,
        "x_field": x_field,
        "series": series_out,
        "stats": stats_map,
        "outliers_by_metric": outliers_map,
        "sampled": sampled,
        "row_count": len(work_rows),
        "insights": insight,
    }


def _simple_insight(metric_name: str, values: list[Any]) -> list[str]:
    ys = []
    for v in values:
        try:
            if v is None:
                continue
            ys.append(float(v))
        except (TypeError, ValueError):
            continue
    if len(ys) < 6:
        return []
    n = len(ys)
    a = ys[: max(1, n // 4)]
    b = ys[-max(1, n // 4) :]
    ma = sum(a) / len(a)
    mb = sum(b) / len(b)
    if ma == 0:
        return []
    delta = (mb - ma) / abs(ma) * 100
    if delta > 5:
        return [f"「{metric_name}」后半段均值较前段高约 {delta:.1f}%"]
    if delta < -5:
        return [f"「{metric_name}」后半段均值较前段低约 {-delta:.1f}%"]
    return [f"「{metric_name}」前后段均值变化不大（约 {delta:+.1f}%）"]


def run_chart_series(
    *,
    engine: str,
    conn: dict[str, Any],
    user: str,
    pwd: str,
    dbname: str,
    table: str,
    time_column: str | None,
    metric_columns: list[str],
    sample_limit: int,
    time_start: str | None,
    time_end: str | None,
    filters: list[dict[str, str]],
    category_column: str | None,
    lttb_threshold: int = 2500,
) -> dict[str, Any]:
    cols = fetch_columns_extended(engine, conn, user, pwd, dbname, table)
    allowed = {str(c.get("name")) for c in cols if c.get("name")}
    for m in metric_columns:
        if m not in allowed:
            raise HTTPException(400, f"非法指标列: {m}")
    if time_column and time_column not in allowed:
        raise HTTPException(400, f"非法时间列: {time_column}")
    if category_column and category_column not in allowed:
        raise HTTPException(400, f"非法分类列: {category_column}")

    prof = table_chart_intel.infer_profile(cols)
    mode = prof["mode"]
    tc = time_column or prof.get("suggested_time_column")
    sort_k = prof.get("sort_key_column") or next(iter(allowed), None)

    flist = [{"column": f["column"], "value": f["value"]} for f in filters]

    warnings: list[str] = []

    if not category_column and not metric_columns:
        raise HTTPException(400, "请至少选择一个指标列，或指定分类列")

    # ---------- 分类柱状 ----------
    if category_column and mode == "distribution":
        where_cat = table_chart_sql.build_where_fragment(engine, table, None, None, None, flist)
        sql_cat = table_chart_sql.sql_category_counts(engine, table, category_column, where_cat, 40)
        res_cat = run_sql(engine, conn, user, pwd, dbname, sql_cat, 500)
        rows_cat = res_cat.get("rows") or []
        xs = [r.get("__cat") for r in rows_cat]
        ys = [r.get("__cnt") for r in rows_cat]
        yc = [float(y or 0) for y in ys]
        return {
            "chart_kind": "bar",
            "x_axis": xs,
            "x_field": "__cat",
            "series": [{"name": "count", "data": ys}],
            "stats": table_chart_intel.column_stats(yc),
            "outliers_by_metric": {},
            "sampled": False,
            "row_count": len(rows_cat),
            "insights": [],
            "warnings": warnings,
            "mode": mode,
        }

    # ---------- 时序 ----------
    if tc:
        if not metric_columns:
            raise HTTPException(400, "时序图需要至少选择一个数值指标")
        where_no_time = table_chart_sql.build_where_fragment(engine, table, None, None, None, flist)
        use_agg = False
        grain = "day"
        mm_sql = table_chart_sql.sql_min_max_time(engine, table, tc, where_no_time)
        mm = run_sql(engine, conn, user, pwd, dbname, mm_sql, 10)
        mrows = mm.get("rows") or []
        if mrows:
            mn_raw = mrows[0].get("__mn")
            mx_raw = mrows[0].get("__mx")
            d0 = _coerce_datetime_value(mn_raw)
            d1 = _coerce_datetime_value(mx_raw)
            if d0 and d1:
                days = abs((d1 - d0).total_seconds()) / 86400
                grain = table_chart_intel.suggest_grain_from_span(days)
                if days > 366:
                    use_agg = True
                    warnings.append("时间跨度超过约一年，已按桶聚合（均值）展示")

        where_full = table_chart_sql.build_where_fragment(engine, table, tc, time_start, time_end, flist)

        if use_agg:
            sql = table_chart_sql.sql_series_timeseries_agg(
                engine, table, tc, metric_columns, grain, where_full, min(sample_limit, 2000)
            )
        else:
            sql = table_chart_sql.sql_series_timeseries_raw(
                engine, table, tc, metric_columns, where_full, sample_limit
            )

        res = run_sql(engine, conn, user, pwd, dbname, sql, sample_limit + 100)
        rows = res.get("rows") or []
        x_field = "__bx" if use_agg else tc
        anchor = metric_columns[0] if metric_columns else None
        body = build_series_response(
            rows,
            chart_kind="line",
            x_field=x_field,
            metrics=metric_columns,
            mode="timeseries",
            lttb_cap=lttb_threshold,
            anchor_metric=anchor,
        )
        body["warnings"] = warnings
        body["mode"] = "timeseries"
        return body

    # ---------- 分布（行序折线）----------
    if not sort_k:
        raise HTTPException(400, "无法确定排序列")
    if not metric_columns:
        raise HTTPException(400, "分布折线图需要至少选择一个数值指标")
    where_d = table_chart_sql.build_where_fragment(engine, table, None, None, None, flist)
    sql_d = table_chart_sql.sql_series_distribution(engine, table, sort_k, metric_columns, where_d, sample_limit)
    res_d = run_sql(engine, conn, user, pwd, dbname, sql_d, sample_limit + 100)
    rows_d = res_d.get("rows") or []
    indexed = []
    for i, r in enumerate(rows_d):
        row = dict(r)
        row["__idx__"] = i
        indexed.append(row)
    anchor = metric_columns[0] if metric_columns else None
    body = build_series_response(
        indexed,
        chart_kind="line",
        x_field="__idx__",
        metrics=metric_columns,
        mode="distribution",
        lttb_cap=lttb_threshold,
        anchor_metric=anchor,
    )
    body["warnings"] = warnings
    body["mode"] = "distribution"
    body["sort_key_column"] = sort_k
    return body


def run_preview_drill(
    *,
    engine: str,
    conn: dict[str, Any],
    user: str,
    pwd: str,
    dbname: str,
    table: str,
    limit: int,
    offset: int,
    time_column: str | None,
    time_start: str | None,
    time_end: str | None,
    filters: list[dict[str, str]],
    order_column: str | None,
) -> dict[str, Any]:
    flist = [{"column": f["column"], "value": f["value"]} for f in filters]
    where_full = table_chart_sql.build_where_fragment(engine, table, time_column, time_start, time_end, flist)
    sql = table_chart_sql.sql_drill_star(engine, table, where_full, order_column, limit, offset)
    return run_sql(engine, conn, user, pwd, dbname, sql, max(limit, 5000))
