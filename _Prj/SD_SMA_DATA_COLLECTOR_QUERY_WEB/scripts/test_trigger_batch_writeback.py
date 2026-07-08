"""Test advanced trigger writeback: clear strListName, pulse bTriger, verify buffer.

Usage:
  python scripts/test_trigger_batch_writeback.py --from-db 30
  python scripts/test_trigger_batch_writeback.py --batch ai_bp_0708101057_B2027
"""
from __future__ import annotations

import argparse
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
API_PORTS = [8092, 8091, 8090]


def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def api_reachable() -> bool:
    for port in API_PORTS:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/config/opcua", timeout=2):
                return True
        except Exception:
            pass
    return False


def list_tables(db_cfg: dict) -> list[str]:
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


def lookup_start_time(db_cfg: dict, master_table: str, batch_column: str, batch_value: str):
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


def expected_tables(cfg: dict, batch_no: str) -> list[str]:
    page = cfg["plugins"]["modules"]["general"]["pages"]["1"]
    wb_raw = page["table_list_writeback"]
    bind_group = page["bind_group"]
    db_cfg = cfg["app_settings"]["database"]
    config = TableListWritebackConfig.from_binding(wb_raw, bind_group=bind_group)
    assert config is not None
    tables = resolve_table_names_for_batch_no(
        batch_no,
        config,
        list_tables=lambda: list_tables(db_cfg),
        lookup_start_time=lambda mt, bc, bv: lookup_start_time(db_cfg, mt, bc, bv),
    )
    return [str(t).strip() for t in tables if str(t or "").strip()]


async def read_buffer(endpoint: str, buffer_node: str) -> list[str]:
    raw = await opcua_client.read_scalar(endpoint, buffer_node)
    if not isinstance(raw, list):
        return [str(raw).strip()] if str(raw or "").strip() else []
    return [str(x).strip() for x in raw if str(x or "").strip()]


async def clear_buffer(endpoint: str, buffer_node: str, string_max_len: int = 80) -> None:
    """Write all-empty string array to strListName."""
    existing = await opcua_client.read_scalar(endpoint, buffer_node)
    if isinstance(existing, list):
        length = len(existing)
    else:
        length = 50
    empty = [""] * length
    ok = await opcua_client.write_array(
        endpoint,
        buffer_node,
        empty,
        string_max_len=string_max_len,
    )
    if not ok:
        raise RuntimeError(f"failed to clear buffer node {buffer_node}")


def fetch_batch_codes_from_db(cfg: dict, limit: int) -> list[str]:
    page = cfg["plugins"]["modules"]["general"]["pages"]["1"]
    master_table = page["bind_group"]
    batch_column = page["table_list_writeback"]["batch_column"]
    db_cfg = cfg["app_settings"]["database"]
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
                f"SELECT DISTINCT `{batch_column}` FROM `{master_table}` "
                f"WHERE `{batch_column}` IS NOT NULL AND `{batch_column}` <> %s "
                f"ORDER BY `{batch_column}` DESC LIMIT %s",
                ("", limit),
            )
            return [str(r[0]).strip() for r in cur.fetchall() if str(r[0] or "").strip()]
    finally:
        conn.close()


async def run_one_test(cfg: dict, batch_no: str, *, quiet: bool = False) -> bool:
    endpoint = cfg["opcua"]["endpoint_url"]
    page = cfg["plugins"]["modules"]["general"]["pages"]["1"]
    wb = page["table_list_writeback"]
    adv = wb["advanced"]
    buffer_node = wb["buffer_node"]
    batch_node = adv["batch_no_node"]
    trigger_node = adv["trigger_node"]
    max_len = int(wb.get("string_max_len", 80) or 80)

    expect = expected_tables(cfg, batch_no)
    start = lookup_start_time(
        cfg["app_settings"]["database"],
        page["bind_group"],
        wb["batch_column"],
        batch_no,
    )
    if not quiet:
        print(f"\n--- batch={batch_no!r} ---")
        print(f"  DB start_time: {start}")
        print(f"  expected strListName: {expect}")

    if start is None:
        if not quiet:
            print("  SKIP: batch not found in master table")
        return False
    if not expect:
        if not quiet:
            print("  SKIP: no tables resolved")
        return False

    if not quiet:
        print("  [1] clear strListName ...")
    await clear_buffer(endpoint, buffer_node, string_max_len=max_len)
    cleared = await read_buffer(endpoint, buffer_node)
    if not quiet:
        print(f"  buffer after clear: {cleared!r}")
    if cleared:
        if not quiet:
            print("  FAIL: buffer not empty after clear")
        else:
            print(f"FAIL {batch_no}: buffer not empty after clear")
        return False

    await opcua_client.write_scalar(endpoint, batch_node, batch_no)
    await opcua_client.write_scalar(endpoint, trigger_node, False)
    await asyncio.sleep(0.3)

    if not quiet:
        written_batch = await opcua_client.read_scalar(endpoint, batch_node)
        print(f"  [2] batch_no_node = {written_batch!r}")
        print("  [3] pulse bTriger TRUE (rising edge) ...")
    await opcua_client.write_scalar(endpoint, trigger_node, True)

    actual: list[str] = []
    trigger_reset = False
    for step in range(15):
        await asyncio.sleep(0.4)
        actual = await read_buffer(endpoint, buffer_node)
        trigger_val = await opcua_client.read_scalar(endpoint, trigger_node)
        trigger_reset = trigger_val is False or trigger_val == 0
        if not quiet:
            print(f"  +{(step + 1) * 0.4:.1f}s trigger={trigger_val!r} buffer={actual[:5]}")
        if actual and trigger_reset:
            break

    if not quiet:
        print(f"  [4] result buffer: {actual}")
        print(f"  trigger reset: {'OK' if trigger_reset else 'FAIL (still TRUE)'}")

    if actual == expect:
        if quiet:
            print(f"PASS {batch_no} -> {actual}")
        elif not quiet:
            print("  PASS: strListName matches expected")
        return True

    if quiet:
        print(f"FAIL {batch_no}: expected {expect}, got {actual}")
    else:
        print(f"  FAIL: expected {expect}")
    return False


async def main() -> int:
    parser = argparse.ArgumentParser(description="Test bTriger + BatchCode -> strListName")
    parser.add_argument(
        "--batch",
        action="append",
        dest="batches",
        help="Batch code to test (repeatable). Default: ai_bp_0708101057_B2027",
    )
    parser.add_argument(
        "--from-db",
        type=int,
        metavar="N",
        help="Load N distinct batch codes from master table (e.g. --from-db 30)",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Compact one-line output per batch",
    )
    args = parser.parse_args()

    cfg = load_config()
    if args.from_db:
        batches = fetch_batch_codes_from_db(cfg, args.from_db)
        if len(batches) < args.from_db:
            print(f"WARNING: only {len(batches)} batch codes found (requested {args.from_db})")
    elif args.batches:
        batches = args.batches
    else:
        batches = ["ai_bp_0708101057_B2027"]
    if not api_reachable():
        print("ERROR: Query Web not running on ports", API_PORTS)
        print("Start with: start_query_web.bat  (do NOT set SD_SMA_DISABLE_OPCUA_MONITOR=1)")
        return 2

    print("Query Web API: OK")
    print("OPC UA endpoint:", cfg["opcua"]["endpoint_url"])
    print("buffer_node:", cfg["plugins"]["modules"]["general"]["pages"]["1"]["table_list_writeback"]["buffer_node"])
    print(f"Testing {len(batches)} batch codes ...")

    passed = 0
    failed = 0
    all_ok = True
    try:
        for i, batch_no in enumerate(batches, 1):
            if args.quiet:
                print(f"[{i}/{len(batches)}]", end=" ")
            ok = await run_one_test(cfg, batch_no, quiet=args.quiet)
            if ok:
                passed += 1
            else:
                failed += 1
            all_ok = all_ok and ok
    finally:
        await opcua_client.close_pool()

    print("\n=== SUMMARY ===")
    print(f"total={len(batches)} passed={passed} failed={failed}")
    if all_ok:
        print("ALL PASS")
        return 0
    print("SOME FAILED")
    return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
