"""
044 冒烟（无 Docker / WSL 时的本机兜底）：SQLite 灌入 80000 行 + 连接 + 可导出模版。

用法：
  python scripts/dev/setup_044_smoke_80k_sqlite.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from modules.secrets import encrypt_secret  # noqa: E402

BATCH_NO = "SMOKE_80K"
ROW_COUNT = 80_000
CONN_ID = "local-sqlite-044"
CONN_NAME = "本机 SQLite（044 兜底）"
TPL_ID = "a044-smoke-80k-split-sqlite"
TPL_NAME = "测试·044·8万条分卷导出（SQLite）"
APP_DATA = Path.home() / "AppData" / "Roaming" / "sd-sma-report-editor-ai" / "backend-data"
DB_PATH = APP_DATA / "smoke_044_80k.sqlite"
OUT_DIR = Path.home() / "Desktop" / "ReportEditor044Smoke"


def seed() -> None:
    APP_DATA.mkdir(parents=True, exist_ok=True)
    if DB_PATH.exists():
        DB_PATH.unlink()
    conn = sqlite3.connect(str(DB_PATH))
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE demo_metrics (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              batch_no TEXT NOT NULL,
              metric_name TEXT NOT NULL,
              metric_value REAL NOT NULL,
              unit TEXT NOT NULL DEFAULT '',
              recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute("CREATE INDEX idx_batch ON demo_metrics(batch_no)")
        batch_size = 2000
        sql = (
            "INSERT INTO demo_metrics (batch_no, metric_name, metric_value, unit) "
            "VALUES (?,?,?,?)"
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
        cur.execute("SELECT COUNT(*) FROM demo_metrics WHERE batch_no=?", (BATCH_NO,))
        cnt = int(cur.fetchone()[0])
        if cnt != ROW_COUNT:
            raise SystemExit(f"行数不符: {cnt}")
        conn.commit()
        print(f"[OK] SQLite {DB_PATH} rows={cnt}")
    finally:
        conn.close()


def upsert_connection() -> None:
    cfg_path = APP_DATA / "config.json"
    if cfg_path.is_file():
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    else:
        cfg = {"schema_version": 1, "db_connections": [], "opcua_servers": []}
    conns = [c for c in (cfg.get("db_connections") or []) if c.get("id") != CONN_ID]
    conns.append(
        {
            "id": CONN_ID,
            "name": CONN_NAME,
            "engine": "sqlite",
            "host": "",
            "port": 0,
            "database": "",
            "username": "",
            "sqlite_path": str(DB_PATH),
            "demo_remote": False,
            "demo_local": True,
        }
    )
    cfg["db_connections"] = conns
    prefs = cfg.setdefault("app_preferences", {})
    prefs["last_connection_id"] = CONN_ID
    prefs["default_connection_id"] = CONN_ID
    prefs["datasource_locked"] = False
    # ensure fernet key exists even if unused
    encrypt_secret(APP_DATA, "noop")
    cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[OK] connection {CONN_ID}")


def make_template() -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    query_sql = (
        "SELECT metric_name, metric_value, unit, recorded_at "
        f"FROM demo_metrics WHERE batch_no = '{BATCH_NO}' ORDER BY id"
    )
    fill = {
        "enabled": True,
        "fillMode": "manual_sql",
        "querySql": query_sql,
        "params": [],
        "resultColumnNames": ["metric_name", "metric_value", "unit", "recorded_at"],
        "repeatHeaderOnPageBreak": True,
        "splitReportsOnMaxRows": True,
        "allowWidgetsBelowSqlFillTable": True,
        "maxRows": 1000,
        "visualSource": {
            "connectionId": CONN_ID,
            "database": "",
            "table": "demo_metrics",
            "engine": "sqlite",
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
    snap = {
        "marginTopMm": 12,
        "marginRightMm": 12,
        "marginBottomMm": 12,
        "marginLeftMm": 12,
        "headerBandMm": 14,
        "footerBandMm": 12,
        "bodyBackgroundCss": "rgb(249 249 251)",
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
        "text": f"044 SQLite 冒烟：{ROW_COUNT} 行 · 分卷 maxRows=1000",
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
    sample = ROOT / "getting-started" / "samples" / "test-044-smoke-80k-sqlite-template.json"
    sample.parent.mkdir(parents=True, exist_ok=True)
    sample.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
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
    print(f"[OK] template {t.name}")
    print(f"     sample {sample}")
    print(f"     PDF -> {OUT_DIR}")


def main() -> int:
    print("== seed sqlite 80k ==")
    seed()
    print("== connection ==")
    upsert_connection()
    print("== template ==")
    write_template(make_template())
    print()
    print("重启 Report Editor AI → 打开「测试·044·8万条分卷导出（SQLite）」→ 报表生成导出。")
    print("期望：约 80 份 PDF（每份 1000 行），合计 80000；旧 5 万硬上限只会出约 50 份。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
