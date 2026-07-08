"""Pulse OPC UA with proper rising edge (reset FALSE first)."""
from __future__ import annotations

import asyncio
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import opcua_client

ROOT = Path(__file__).resolve().parents[1]
cfg = json.loads((ROOT / "config" / "default.json").read_text(encoding="utf-8"))
endpoint = cfg["opcua"]["endpoint_url"]
page = cfg["plugins"]["modules"]["general"]["pages"]["1"]
wb = page["table_list_writeback"]
adv = wb["advanced"]
API = "http://127.0.0.1:8092"


async def snap():
    opcua_client.reset_pool_for_tests()
    buf = await opcua_client.read_scalar(endpoint, wb["buffer_node"])
    return {
        "batch": await opcua_client.read_scalar(endpoint, adv["batch_no_node"]),
        "trigger": await opcua_client.read_scalar(endpoint, adv["trigger_node"]),
        "prev": await opcua_client.read_scalar(endpoint, adv["prev_page_node"]),
        "buffer": [str(x).strip() for x in buf if str(x or "").strip()],
    }


async def main() -> int:
    with urllib.request.urlopen(f"{API}/api/plugins/runtime-state/general_1", timeout=3) as r:
        rt0 = json.loads(r.read().decode())
    print("runtime before:", rt0.get("revision"), rt0.get("page"))

    opcua_client.reset_pool_for_tests()
    for node in (adv["trigger_node"], adv["prev_page_node"], adv["next_page_node"]):
        await opcua_client.write_scalar(endpoint, node, False)
    await asyncio.sleep(0.3)

    print("=== TRIGGER rising edge ===")
    await opcua_client.write_scalar(endpoint, adv["trigger_node"], True)
    for i in range(10):
        await asyncio.sleep(0.4)
        st = await snap()
        print(f"  +{(i+1)*0.4:.1f}s trigger={st['trigger']!r} buffer={st['buffer'][:3]}")
        if (st["trigger"] is False or st["trigger"] == 0) and st["buffer"]:
            break

    with urllib.request.urlopen(f"{API}/api/plugins/runtime-state/general_1", timeout=3) as r:
        rt1 = json.loads(r.read().decode())
    print("runtime after trigger:", rt1.get("revision"), rt1.get("last_trigger_batch"), rt1.get("last_writeback_ok"))

    print("=== PREV rising edge ===")
    opcua_client.reset_pool_for_tests()
    await opcua_client.write_scalar(endpoint, adv["prev_page_node"], False)
    await asyncio.sleep(0.2)
    await opcua_client.write_scalar(endpoint, adv["prev_page_node"], True)
    await asyncio.sleep(1.0)
    st = await snap()
    print("prev after:", st["prev"])
    with urllib.request.urlopen(f"{API}/api/plugins/runtime-state/general_1", timeout=3) as r:
        rt2 = json.loads(r.read().decode())
    print("runtime after prev:", rt2.get("revision"), "page=", rt2.get("page"), "rows=", len(rt2.get("rows") or []))

    ok = rt1.get("last_writeback_ok") is True and (st["trigger"] is False or st["trigger"] == 0)
    print("RESULT:", "PASS" if ok else "PARTIAL/FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
