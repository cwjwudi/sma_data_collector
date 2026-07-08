"""End-to-end verification for advanced OPC UA table-list writeback (general_1)."""
from __future__ import annotations

import asyncio
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import opcua_client
from app.table_list_writeback import TableListWritebackConfig, resolve_table_names_for_batch_no

CONFIG_PATH = ROOT / "config" / "default.json"
API_PORTS = [8092, 8091, 8090, 8099]


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def api_get(path: str) -> tuple[int, dict]:
    last_err: Exception | None = None
    for port in API_PORTS:
        url = f"http://127.0.0.1:{port}{path}"
        try:
            with urllib.request.urlopen(url, timeout=4) as resp:
                return port, json.loads(resp.read().decode("utf-8"))
        except Exception as exc:
            last_err = exc
    raise last_err or RuntimeError("API unreachable")


async def main() -> int:
    cfg = load_config()
    db_cfg = cfg["app_settings"]["database"]
    endpoint = cfg["opcua"]["endpoint_url"]
    page = cfg["plugins"]["modules"]["general"]["pages"]["1"]
    wb_raw = page["table_list_writeback"]
    adv = wb_raw["advanced"]
    bind_group = page["bind_group"]

    print("=== 1. Query Web API ===")
    try:
        port, opc = api_get("/api/config/opcua")
        print(f"  OK port={port} endpoint={opc.get('endpoint_url')}")
        _, resolve = api_get("/api/plugins/resolve/general_1")
        mode = (resolve.get("table_list_writeback") or {}).get("mode")
        print(f"  plugin general_1 mode={mode!r}")
    except Exception as exc:
        print(f"  FAIL: {exc}")
        return 2

    def list_tables() -> list[str]:
        conn = pymysql.connect(
            host=db_cfg["host"],
            port=int(db_cfg["port"]),
            user=db_cfg["username"],
            password=db_cfg["password"],
            database=db_cfg["name"],
            charset="utf8mb4",
            connect_timeout=8,
        )
        try:
            with conn.cursor() as cur:
                cur.execute("SHOW TABLES")
                return [str(r[0]) for r in cur.fetchall()]
        finally:
            conn.close()

    def lookup_start_time(master_table: str, batch_column: str, batch_value):
        conn = pymysql.connect(
            host=db_cfg["host"],
            port=int(db_cfg["port"]),
            user=db_cfg["username"],
            password=db_cfg["password"],
            database=db_cfg["name"],
            charset="utf8mb4",
            connect_timeout=8,
        )
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT dtBtachStartTime FROM `{master_table}` "
                    f"WHERE `{batch_column}` = %s ORDER BY dtBtachStartTime DESC LIMIT 1",
                    (batch_value,),
                )
                row = cur.fetchone()
                return None if not row else row[0]
        finally:
            conn.close()

    async def read_state() -> dict:
        opcua_client.reset_pool_for_tests()
        return {
            "batch": await opcua_client.read_scalar(endpoint, adv["batch_no_node"]),
            "trigger": await opcua_client.read_scalar(endpoint, adv["trigger_node"]),
            "prev": await opcua_client.read_scalar(endpoint, adv["prev_page_node"]),
            "buffer": await opcua_client.read_scalar(endpoint, wb_raw["buffer_node"]),
        }

    async def pulse(node_id: str) -> None:
        opcua_client.reset_pool_for_tests()
        await opcua_client.write_scalar(endpoint, node_id, True)

    before = await read_state()
    batch = str(before["batch"] or "").strip()
    print(f"\n=== 2. OPC UA 初始状态 batch={batch!r} trigger={before['trigger']!r} ===")
    buffer = before["buffer"]
    filled_before = sum(1 for x in buffer if str(x or "").strip()) if isinstance(buffer, list) else 0
    print(f"  buffer 非空槽位={filled_before}")

    config = TableListWritebackConfig.from_binding(wb_raw, bind_group=bind_group)
    assert config is not None
    expected = resolve_table_names_for_batch_no(
        batch or "ai_bp_0708101057_B2027",
        config,
        list_tables=list_tables,
        lookup_start_time=lookup_start_time,
    )
    print("  期望写入:", [t for t in expected if str(t or "").strip()])

    try:
        _, runtime = api_get("/api/plugins/runtime-state/general_1")
        rev_before = int(runtime.get("revision") or 0)
        print(
            f"  runtime: page={runtime.get('page')} revision={rev_before} "
            f"rows={len(runtime.get('rows') or [])}"
        )
    except Exception as exc:
        print(f"  runtime 不可用: {exc}")
        rev_before = None

    print("\n=== 3. 触发上升沿 bTriger ===")
    await pulse(adv["trigger_node"])
    st = before
    for step in range(10):
        await asyncio.sleep(0.4)
        st = await read_state()
        names = [str(x).strip() for x in st["buffer"] if str(x or "").strip()] if isinstance(st["buffer"], list) else []
        print(
            f"  +{(step + 1) * 0.4:.1f}s trigger={st['trigger']!r} "
            f"buffer={names[:5]}"
        )
        if names and (st["trigger"] is False or st["trigger"] == 0):
            break

    names = [str(x).strip() for x in st["buffer"] if str(x or "").strip()] if isinstance(st["buffer"], list) else []
    trigger_ok = st["trigger"] is False or st["trigger"] == 0
    buffer_ok = len(names) > 0
    print(f"  触发复位: {'OK' if trigger_ok else 'FAIL'}")
    print(f"  Buffer 写入: {'OK' if buffer_ok else 'FAIL'} -> {names}")

    print("\n=== 4. 上一页上升沿 bPrePage ===")
    await pulse(adv["prev_page_node"])
    await asyncio.sleep(1.0)
    st_prev = await read_state()
    print(f"  prev 复位后={st_prev['prev']!r}")
    try:
        _, runtime2 = api_get("/api/plugins/runtime-state/general_1")
        rev_after = int(runtime2.get("revision") or 0)
        print(
            f"  runtime: page={runtime2.get('page')} revision={rev_after} "
            f"rows={len(runtime2.get('rows') or [])}"
        )
        if rev_before is not None and rev_after > rev_before:
            print("  翻页/刷新: OK (revision 增加)")
        elif rev_before is not None:
            print("  WARN: revision 未增加")
    except Exception as exc:
        print(f"  runtime: {exc}")

    if not buffer_ok:
        return 1
    print("\n=== 总体: PASS ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
