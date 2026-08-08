"""
044 本机冒烟：在 MariaDB 中灌入 80000 行，写入 AI 版连接配置，并生成可导出模版。

前置：
  1. Docker Desktop 已启动
  2. 在 _Prj/SD_SMA_ReportEditor 已有 .env（MARIADB_ROOT_PASSWORD）
  3. docker compose up -d mariadb 健康

用法（在 SD_SMA_ReportEditor 根或任意处）：
  python scripts/dev/setup_044_smoke_80k.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

try:
    import pymysql
except ImportError:
    print("需要 pymysql：pip install pymysql", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from modules.secrets import encrypt_secret  # noqa: E402

BATCH_NO = "SMOKE_80K"
ROW_COUNT = 80_000
DEMO_DB = "report_user_lib"
CONN_ID = "local-docker-mariadb-044"
CONN_NAME = "本机 Docker MariaDB（044）"
TPL_ID = "a044-smoke-80k-split"
TPL_NAME = "测试·044·8万条分卷导出"

APP_DATA = Path.home() / "AppData" / "Roaming" / "sd-sma-report-editor-ai" / "backend-data"
OUT_DIR = Path.home() / "Desktop" / "ReportEditor044Smoke"


def load_root_password() -> str:
    env_path = ROOT / ".env"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("MARIADB_ROOT_PASSWORD="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    pw = os.environ.get("MARIADB_ROOT_PASSWORD", "").strip()
    if not pw:
        raise SystemExit("未找到 MARIADB_ROOT_PASSWORD（.env 或环境变量）")
    return pw


def wait_mysql(host: str, port: int, password: str, timeout_s: float = 120) -> None:
    deadline = time.time() + timeout_s
    last: Exception | None = None
    while time.time() < deadline:
        try:
            conn = pymysql.connect(
                host=host, port=port, user="root", password=password, connect_timeout=3
            )
            conn.close()
            return
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2)
    raise SystemExit(f"MariaDB 未就绪: {last}")


def seed(host: str, port: int, password: str) -> None:
    conn = pymysql.connect(host=host, port=port, user="root", password=password, autocommit=False)
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{DEMO_DB}` "
                "DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        conn.select_db(DEMO_DB)
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS demo_batches (
                  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  batch_no VARCHAR(64) NOT NULL,
                  batch_name VARCHAR(128) NOT NULL,
                  status VARCHAR(32) NOT NULL DEFAULT 'running',
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE KEY uk_batch_no (batch_no)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS demo_metrics (
                  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
                  batch_no VARCHAR(64) NOT NULL,
                  metric_name VARCHAR(64) NOT NULL,
                  metric_value DOUBLE NOT NULL,
                  unit VARCHAR(16) NOT NULL DEFAULT '',
                  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  KEY idx_batch (batch_no)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                """
            )
            cur.execute("DELETE FROM demo_metrics WHERE batch_no=%s", (BATCH_NO,))
            cur.execute("DELETE FROM demo_batches WHERE batch_no=%s", (BATCH_NO,))
            cur.execute(
                "INSERT INTO demo_batches (batch_no, batch_name, status) VALUES (%s,%s,%s)",
                (BATCH_NO, "044 八万条冒烟批次", "done"),
            )
            # 批量插入 80k
            batch_size = 2000
            sql = (
                "INSERT INTO demo_metrics (batch_no, metric_name, metric_value, unit) "
                "VALUES (%s,%s,%s,%s)"
            )
            for start in range(0, ROW_COUNT, batch_size):
                n = min(batch_size, ROW_COUNT - start)
                rows = [
                    (BATCH_NO, f"m{start + i:05d}", float((start + i) % 1000) / 10.0, "u")
                    for i in range(n)
                ]
                cur.executemany(sql, rows)
                if (start // batch_size) % 5 == 0:
                    print(f"  inserted {start + n}/{ROW_COUNT}")
            cur.execute(
                "SELECT COUNT(*) FROM demo_metrics WHERE batch_no=%s", (BATCH_NO,)
            )
            cnt = int(cur.fetchone()[0])
            if cnt != ROW_COUNT:
                raise SystemExit(f"行数不符: got {cnt}, want {ROW_COUNT}")
        conn.commit()
        print(f"[OK] seeded {ROW_COUNT} rows batch_no={BATCH_NO} in {DEMO_DB}.demo_metrics")
    finally:
        conn.close()


def upsert_connection(password: str) -> None:
    APP_DATA.mkdir(parents=True, exist_ok=True)
    cfg_path = APP_DATA / "config.json"
    if cfg_path.is_file():
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    else:
        cfg = {"schema_version": 1, "db_connections": [], "opcua_servers": []}
    conns = list(cfg.get("db_connections") or [])
    enc = encrypt_secret(APP_DATA, password)
    row = {
        "id": CONN_ID,
        "name": CONN_NAME,
        "engine": "mariadb",
        "host": "127.0.0.1",
        "port": 3306,
        "database": DEMO_DB,
        "username": "root",
        "password_enc": enc,
        "demo_remote": False,
        "demo_local": True,
    }
    conns = [c for c in conns if c.get("id") != CONN_ID]
    conns.append(row)
    cfg["db_connections"] = conns
    prefs = cfg.setdefault("app_preferences", {})
    prefs["last_connection_id"] = CONN_ID
    prefs["default_connection_id"] = CONN_ID
    # 冒烟需要能改连接时可先解锁；用户可在 UI 再锁
    prefs["datasource_locked"] = False
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] connection saved: {CONN_ID} -> {cfg_path}")


def layout() -> dict:
    return {
        "marginTopMm": 12,
        "marginRightMm": 12,
        "marginBottomMm": 12,
        "marginLeftMm": 12,
        "headerBandMm": 18,
        "footerBandMm": 14,
        "bodyBackgroundCss": "rgb(249 249 251)",
    }


def make_template() -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    query_sql = (
        "SELECT `metric_name`, `metric_value`, `unit`, `recorded_at` "
        f"FROM `demo_metrics` WHERE `batch_no` = '{BATCH_NO}' ORDER BY `id`"
    )
    fill = {
        "enabled": True,
        "fillMode": "manual_sql",
        "querySql": query_sql,
        "params": [],
        "resultColumnNames": ["metric_name", "metric_value", "unit", "recorded_at"],
        "repeatHeaderOnPageBreak": True,
        # 044 关键：分卷导出，取数应拿到全部 8 万（旧实现静默截到 5 万）
        "splitReportsOnMaxRows": True,
        "allowWidgetsBelowSqlFillTable": True,
        "maxRows": 1000,
        "visualSource": {
            "connectionId": CONN_ID,
            "database": DEMO_DB,
            "table": "demo_metrics",
            "engine": "mariadb",
            "columns": ["metric_name", "metric_value", "unit", "recorded_at"],
            "tableSource": "manual",
            "tableOpcNodeId": "",
        },
        "visualFilters": [],
        "mongoQuery": None,
        "layoutMode": "horizontal",
        "columnRoles": ["field", "field", "field", "field"],
        "sequencePageMode": "continuous",
        "verticalMultiRecordMode": "continue",
        "verticalFieldLabels": [],
    }
    table = {
        "id": str(uuid.uuid4()),
        "type": "table",
        "x": 24,
        "y": 48,
        "w": 540,
        "h": 120,
        "text": "",
        "color": "#18181b",
        "bgColor": "#ffffff",
        "fontSize": 10,
        "fontFamily": "FangSong",
        "zIndex": 1,
        "textAutoWrap": False,
        "showBorder": True,
        "imageSrc": "",
        "alignX": "start",
        "alignY": "center",
        "imageRotationDeg": 0,
        "imageCaptionPosition": "none",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
        "chartKind": "line",
        "signerLabel": "",
        "signatureAssetId": "",
        "signatureDisplayMode": "both",
        "tableRows": 2,
        "tableCols": 4,
        "tableCells": [
            [
                {"text": "指标", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
                {"text": "数值", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
                {"text": "单位", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
                {"text": "时间", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
            ],
            [
                {"text": "", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
                {"text": "", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
                {"text": "", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
                {"text": "", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
            ],
        ],
        "tableRowHeightPx": 22,
        "tableColWidthsPx": [],
        "tableColBgColors": [],
        "tableSqlFill": fill,
    }
    title = {
        "id": str(uuid.uuid4()),
        "type": "text",
        "x": 24,
        "y": 12,
        "w": 540,
        "h": 28,
        "text": f"044 冒烟：{ROW_COUNT} 行 · 分卷 maxRows=1000 · batch={BATCH_NO}",
        "color": "#0f172a",
        "bgColor": "transparent",
        "fontSize": 14,
        "fontFamily": "FangSong",
        "zIndex": 1,
        "textAutoWrap": True,
        "showBorder": False,
        "imageSrc": "",
        "alignX": "start",
        "alignY": "center",
        "imageRotationDeg": 0,
        "imageCaptionPosition": "none",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
        "chartKind": "line",
        "signerLabel": "",
        "signatureAssetId": "",
        "signatureDisplayMode": "both",
        "tableRows": 3,
        "tableCols": 4,
        "tableCells": [],
        "tableRowHeightPx": 28,
        "tableColWidthsPx": [],
        "tableColBgColors": [],
        "tableSqlFill": None,
    }
    page0 = [title, table]
    snap = layout()
    return {
        "schemaVersion": 4,
        "id": TPL_ID,
        "name": TPL_NAME,
        "updatedAt": now,
        "reportKind": "nonBatch",
        "nonBatchOutputDir": str(OUT_DIR),
        "elements": page0,
        "bodyPages": [page0],
        "paperKind": "A4",
        "orientation": "portrait",
        "layoutPresetId": None,
        "layoutSnapshot": snap,
        "coverLayoutPresetId": None,
        "coverLayoutSnapshot": snap,
        "coverHeaderText": "",
        "coverFooterText": "",
        "coverHeaderElements": [],
        "coverFooterElements": [],
        "coverBodyZoneElements": [],
        "backLayoutPresetId": None,
        "backLayoutSnapshot": snap,
        "backHeaderText": "",
        "backFooterText": "",
        "backHeaderElements": [],
        "backFooterElements": [],
        "backBodyZoneElements": [],
        "headerText": "",
        "footerText": "",
        "headerElements": [],
        "footerElements": [],
        "coverElements": [],
        "backElements": [],
    }


def write_template(tpl: dict) -> None:
    from schemas.report_template import parse_report_template

    t = parse_report_template(tpl)
    payload = t.model_dump(mode="json")
    sample_dir = ROOT / "getting-started" / "samples"
    sample_dir.mkdir(parents=True, exist_ok=True)
    sample_path = sample_dir / "test-044-smoke-80k-template.json"
    sample_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tpl_dir = APP_DATA / "templates"
    tpl_dir.mkdir(parents=True, exist_ok=True)
    (tpl_dir / f"{t.id}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    meta = {
        "id": t.id,
        "name": t.name,
        "updatedAt": t.updatedAt,
        "paperKind": t.paperKind,
        "orientation": t.orientation,
        "reportKind": t.reportKind,
        "nonBatchOutputDir": t.nonBatchOutputDir,
    }
    (tpl_dir / f"{t.id}.meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[OK] template: {t.name} ({t.id})")
    print(f"     sample: {sample_path}")
    print(f"     output: {OUT_DIR}")


def verify_count(host: str, port: int, password: str) -> None:
    conn = pymysql.connect(
        host=host, port=port, user="root", password=password, database=DEMO_DB
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM demo_metrics WHERE batch_no=%s", (BATCH_NO,))
            print(f"[OK] verify COUNT(*) = {cur.fetchone()[0]}")
    finally:
        conn.close()


def main() -> int:
    password = load_root_password()
    host = "127.0.0.1"
    port = int(os.environ.get("MARIADB_PORT", "3306"))
    print("== wait MariaDB ==")
    wait_mysql(host, port, password)
    print("== seed 80k ==")
    seed(host, port, password)
    verify_count(host, port, password)
    print("== upsert connection ==")
    upsert_connection(password)
    print("== write template ==")
    write_template(make_template())
    print()
    print("下一步：")
    print("  1. 重启 Report Editor AI（或刷新模版/数据源）")
    print(f"  2. 打开模版「{TPL_NAME}」确认表格 SQL 已绑本机 Docker 连接")
    print("  3. 报表生成 → 导出（分卷约 80 份×1000 行；旧版会静默只出 50 份）")
    print(f"  4. 检查 {OUT_DIR} 下 PDF 份数≈80，合计行数=80000")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
