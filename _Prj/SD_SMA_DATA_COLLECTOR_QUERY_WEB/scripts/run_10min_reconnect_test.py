"""10-minute live OPC UA interaction + reconnect test using default.json.

Phases (approx):
  0-60s     baseline (heartbeat / runtime)
  60-180s   next/prev page pulses + trigger
  then      wait for operator PLC restart via signal file
  remaining post-reconnect checks until 600s

PLC restart handshake (chat-friendly):
  Script creates logs/plc_restart_wait.txt with status=need_down
  Operator restarts PLC, then agent writes status=down then status=up
  Or create/update the file manually.

Usage:
  python scripts/run_10min_reconnect_test.py
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import opcua_client

CONFIG_PATH = ROOT / "config" / "default.json"
API = "http://127.0.0.1:8092"
DURATION_SEC = 600
SIGNAL_PATH = ROOT / "logs" / "plc_restart_wait.txt"
REPORT: list[dict] = []


def log(msg: str, **extra) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    if extra:
        line += " | " + " ".join(f"{k}={v!r}" for k, v in extra.items())
    print(line, flush=True)
    REPORT.append({"ts": ts, "msg": msg, **extra})


def api_get(path: str, timeout: float = 4.0) -> dict:
    with urllib.request.urlopen(f"{API}{path}", timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_cfg() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def write_signal(status: str, note: str = "") -> None:
    SIGNAL_PATH.parent.mkdir(parents=True, exist_ok=True)
    SIGNAL_PATH.write_text(
        f"status={status}\nnote={note}\nts={datetime.now().isoformat()}\n",
        encoding="utf-8",
    )


def read_signal_status() -> str:
    if not SIGNAL_PATH.exists():
        return ""
    for line in SIGNAL_PATH.read_text(encoding="utf-8").splitlines():
        if line.startswith("status="):
            return line.split("=", 1)[1].strip().lower()
    return ""


async def wait_signal(expect: str, poll_sec: float = 2.0) -> None:
    log(f"waiting for signal status={expect}", path=str(SIGNAL_PATH))
    while True:
        if read_signal_status() == expect.lower():
            log(f"signal received: {expect}")
            return
        await asyncio.sleep(poll_sec)


async def read_nodes(endpoint: str, nodes: dict[str, str]) -> dict:
    opcua_client.reset_pool_for_tests()
    out: dict = {}
    for key, node_id in nodes.items():
        try:
            out[key] = await opcua_client.read_scalar(endpoint, node_id)
        except Exception as exc:
            out[key] = f"ERR:{type(exc).__name__}:{exc}"
    await opcua_client.close_pool()
    return out


async def pulse(endpoint: str, node_id: str, hold_sec: float = 0.4) -> None:
    opcua_client.reset_pool_for_tests()
    await opcua_client.write_scalar(endpoint, node_id, False)
    await asyncio.sleep(0.25)
    await opcua_client.write_scalar(endpoint, node_id, True)
    await asyncio.sleep(hold_sec)
    await opcua_client.close_pool()


async def phase_baseline(endpoint: str, nodes: dict[str, str]) -> None:
    log("PHASE baseline start")
    opc = api_get("/api/config/opcua")
    health = api_get("/api/health")
    rt = api_get("/api/plugins/runtime-state/general_1")
    log(
        "API ok",
        endpoint=opc.get("endpoint_url"),
        poll_ms=opc.get("poll_interval_ms"),
        health=health.get("status"),
        page=rt.get("page"),
        revision=rt.get("revision"),
    )
    st = await read_nodes(endpoint, nodes)
    log("OPC snapshot", **st)


async def phase_pages(endpoint: str, nodes: dict[str, str], *, which: str, count: int) -> None:
    node_id = nodes["next" if which == "next" else "prev"]
    log(f"PHASE {which}-page", count=count)
    for i in range(count):
        before = api_get("/api/plugins/runtime-state/general_1")
        await pulse(endpoint, node_id)
        await asyncio.sleep(1.2)
        after = api_get("/api/plugins/runtime-state/general_1")
        st = await read_nodes(endpoint, {which: node_id})
        log(
            f"{which} {i+1}/{count}",
            page_before=before.get("page"),
            page_after=after.get("page"),
            rev_before=before.get("revision"),
            rev_after=after.get("revision"),
            node_after=st.get(which),
        )


async def phase_trigger(endpoint: str, nodes: dict[str, str], buffer_node: str) -> None:
    log("PHASE trigger")
    before = api_get("/api/plugins/runtime-state/general_1")
    batch_st = await read_nodes(endpoint, {"batch": nodes["batch"]})
    log("before trigger", batch=batch_st.get("batch"), rev=before.get("revision"))
    await pulse(endpoint, nodes["trigger"], hold_sec=0.5)
    ok = False
    for step in range(12):
        await asyncio.sleep(0.5)
        st = await read_nodes(endpoint, {"trigger": nodes["trigger"], "buffer": buffer_node})
        buf = st.get("buffer")
        names = [str(x).strip() for x in buf if str(x or "").strip()] if isinstance(buf, list) else []
        trig = st.get("trigger")
        log(f"trigger +{(step+1)*0.5:.1f}s", trigger=trig, buffer_n=len(names), head=names[:3])
        if names and (trig is False or trig == 0):
            ok = True
            break
    after = api_get("/api/plugins/runtime-state/general_1")
    log(
        "trigger done",
        ok=ok,
        last_writeback_ok=after.get("last_writeback_ok"),
        last_trigger_batch=after.get("last_trigger_batch"),
        revision=after.get("revision"),
    )


async def phase_reconnect(endpoint: str, nodes: dict[str, str], deadline: float) -> dict:
    write_signal("need_down", "Please restart PLC now, then set status=down")
    log(
        "REQUEST: please manually restart PLC now",
        hint="After PLC is offline/restarting, agent will set signal=down",
    )
    # Also print clearly for chat operator
    print("\n*** 请现在手动重启 PLC ***\n*** 重启开始后回复：PLC已断开 ***\n", flush=True)
    await wait_signal("down")

    down_at = time.monotonic()
    fail_seen = False
    for _ in range(40):
        st = await read_nodes(endpoint, {"heartbeat": nodes["heartbeat"]})
        hb = st.get("heartbeat")
        if isinstance(hb, str) and hb.startswith("ERR:"):
            fail_seen = True
            log("disconnect observed", heartbeat=hb)
            break
        log("still reachable", heartbeat=hb)
        await asyncio.sleep(2.0)

    write_signal("need_up", "Wait for PLC boot, then set status=up")
    print("\n*** 请等待 PLC 启动完成 ***\n*** 恢复后回复：PLC已恢复 ***\n", flush=True)
    await wait_signal("up")
    up_at = time.monotonic()

    restored_at = None
    for i in range(60):
        if time.monotonic() > deadline:
            break
        st = await read_nodes(endpoint, {"heartbeat": nodes["heartbeat"]})
        hb = st.get("heartbeat")
        if not (isinstance(hb, str) and hb.startswith("ERR:")):
            restored_at = time.monotonic()
            log("OPC restored", attempt=i + 1, heartbeat=hb, sec=round(restored_at - up_at, 1))
            break
        log("reconnect probe fail", attempt=i + 1, heartbeat=hb)
        await asyncio.sleep(2.0)

    await asyncio.sleep(3.0)
    try:
        rt0 = api_get("/api/plugins/runtime-state/general_1")
        await pulse(endpoint, nodes["next"])
        await asyncio.sleep(1.5)
        rt1 = api_get("/api/plugins/runtime-state/general_1")
        log(
            "post-reconnect next",
            page_before=rt0.get("page"),
            page_after=rt1.get("page"),
            rev_before=rt0.get("revision"),
            rev_after=rt1.get("revision"),
        )
    except Exception as exc:
        log("post-reconnect signal FAIL", err=str(exc))

    write_signal("done", "reconnect phase finished")
    return {
        "down_at": down_at,
        "up_at": up_at,
        "restored_at": restored_at,
        "fail_seen": fail_seen,
    }


async def main() -> int:
    cfg = load_cfg()
    endpoint = cfg["opcua"]["endpoint_url"]
    page = cfg["plugins"]["modules"]["general"]["pages"]["1"]
    wb = page["table_list_writeback"]
    adv = wb["advanced"]
    nodes = {
        "heartbeat": cfg["opcua"]["heartbeat_node"],
        "prev": adv["prev_page_node"],
        "next": adv["next_page_node"],
        "trigger": adv["trigger_node"],
        "batch": adv["batch_no_node"],
    }
    buffer_node = wb["buffer_node"]

    t0 = time.monotonic()
    deadline = t0 + DURATION_SEC
    write_signal("running", "test started")
    log("=== 10min test START ===", endpoint=endpoint)

    opcua_client.reset_pool_for_tests()
    for key in ("prev", "next", "trigger"):
        try:
            await opcua_client.write_scalar(endpoint, nodes[key], False)
        except Exception as exc:
            log("reset fail", node=key, err=str(exc))
    await opcua_client.close_pool()

    await phase_baseline(endpoint, nodes)

    while time.monotonic() - t0 < 45:
        await asyncio.sleep(8)
        st = await read_nodes(endpoint, {"heartbeat": nodes["heartbeat"]})
        log("baseline tick", elapsed=round(time.monotonic() - t0), heartbeat=st.get("heartbeat"))

    await phase_pages(endpoint, nodes, which="next", count=3)
    await phase_pages(endpoint, nodes, which="prev", count=2)
    await phase_trigger(endpoint, nodes, buffer_node)

    while time.monotonic() - t0 < 200:
        await asyncio.sleep(10)
        st = await read_nodes(endpoint, {"heartbeat": nodes["heartbeat"]})
        log("pre-restart idle", elapsed=round(time.monotonic() - t0), heartbeat=st.get("heartbeat"))

    reconnect = await phase_reconnect(endpoint, nodes, deadline)

    while time.monotonic() < deadline:
        await asyncio.sleep(15)
        st = await read_nodes(endpoint, {"heartbeat": nodes["heartbeat"]})
        try:
            rt = api_get("/api/plugins/runtime-state/general_1")
            page_n, rev = rt.get("page"), rt.get("revision")
        except Exception:
            page_n, rev = "ERR", "ERR"
        log(
            "post tick",
            elapsed=round(time.monotonic() - t0),
            heartbeat=st.get("heartbeat"),
            page=page_n,
            revision=rev,
        )

    log("=== 10min test END ===", reconnect=reconnect)
    report_path = ROOT / "logs" / f"reconnect_10min_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(REPORT, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    log("report written", path=str(report_path))
    return 0 if reconnect.get("restored_at") else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
