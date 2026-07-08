"""Pulse OPC UA trigger and observe buffer (works without Query Web API)."""
from __future__ import annotations

import asyncio
import json
import sys
import urllib.request
from pathlib import Path

import pymysql

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import opcua_client
from app.table_list_writeback import TableListWritebackConfig, resolve_table_names_for_batch_no

PORTS = [8092, 8091, 8090, 8099]


def api_up() -> int | None:
    for port in PORTS:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/config/opcua", timeout=2):
                return port
        except Exception:
            pass
    return None


async def main() -> int:
    cfg = json.loads((ROOT / "config" / "default.json").read_text(encoding="utf-8"))
    db_cfg = cfg["app_settings"]["database"]
    endpoint = cfg["opcua"]["endpoint_url"]
    page = cfg["plugins"]["modules"]["general"]["pages"]["1"]
    wb_raw = page["table_list_writeback"]
    adv = wb_raw["advanced"]
    bind_group = page["bind_group"]

    port = api_up()
    print("API:", f"port {port} OK" if port else "NOT RUNNING")

    def list_tables() -> list[str]:
        conn = pymysql.connect(
            host=db_cfg["host"],
            port=int(db_cfg["port"]),
            user=db_cfg["username"],
            password=db_cfg["password"],
            database=db_cfg["name"],
            charset="utf8mb4",
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
        )
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT dtBtachStartTime FROM `{master_table}` "
                    f"WHERE `{batch_column}`=%s ORDER BY dtBtachStartTime DESC LIMIT 1",
                    (batch_value,),
                )
                row = cur.fetchone()
                return None if not row else row[0]
        finally:
            conn.close()

    async def snapshot() -> dict:
        opcua_client.reset_pool_for_tests()
        buf = await opcua_client.read_scalar(endpoint, wb_raw["buffer_node"])
        return {
            "batch": await opcua_client.read_scalar(endpoint, adv["batch_no_node"]),
            "trigger": await opcua_client.read_scalar(endpoint, adv["trigger_node"]),
            "prev": await opcua_client.read_scalar(endpoint, adv["prev_page_node"]),
            "buffer": buf,
        }

    before = await snapshot()
    batch = str(before["batch"] or "").strip()
    names_before = [str(x).strip() for x in before["buffer"] if str(x or "").strip()]
    print("batch:", batch)
    print("trigger:", before["trigger"])
    print("buffer before:", names_before)

    config = TableListWritebackConfig.from_binding(wb_raw, bind_group=bind_group)
    assert config
    expected = [t for t in resolve_table_names_for_batch_no(batch, config, list_tables=list_tables, lookup_start_time=lookup_start_time) if str(t or "").strip()]
    print("expected:", expected)

    opcua_client.reset_pool_for_tests()
    await opcua_client.write_scalar(endpoint, adv["trigger_node"], True)
    print("pulsed trigger=TRUE, waiting for monitor...")

    names: list[str] = []
    trigger_reset = False
    for i in range(12):
        await asyncio.sleep(0.5)
        st = await snapshot()
        names = [str(x).strip() for x in st["buffer"] if str(x or "").strip()]
        trigger_reset = st["trigger"] is False or st["trigger"] == 0
        print(f"  +{(i+1)*0.5}s trigger={st['trigger']!r} buffer={names}")
        if names and trigger_reset:
            break

    if port:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/plugins/runtime-state/general_1", timeout=3) as r:
                rt = json.loads(r.read().decode())
            print("runtime:", f"page={rt.get('page')} revision={rt.get('revision')} last_batch={rt.get('last_trigger_batch')!r} ok={rt.get('last_writeback_ok')}")
        except Exception as exc:
            print("runtime read failed:", exc)

    if names:
        print("RESULT: PASS buffer written by monitor" if port else "RESULT: PASS buffer has data")
        return 0

    if not port:
        print("RESULT: FAIL - Query Web not running, monitor cannot process trigger")
        return 2

    print("RESULT: FAIL - monitor did not write buffer")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
