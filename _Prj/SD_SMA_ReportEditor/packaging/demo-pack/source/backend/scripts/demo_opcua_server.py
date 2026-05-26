#!/usr/bin/env python3
"""
本地演示用 OPC UA Server（asyncua），与 ReportEditor 后端 Client 一致：匿名、无加密。

用法（在 backend 目录、使用本仓库 venv）:

  ./venv/bin/python3 scripts/demo_opcua_server.py

连接地址（在应用里填「端点 URL」，用户名/密码留空）:

  opc.tcp://127.0.0.1:4840/report-editor/demo-opcua/

节点 ReportEditorDemo 下提供 Counter（周期自增）、ClockUtc（周期 UTC ISO 时间串）及静态示例变量，
便于在地址空间树上行观察自动读值是否在刷新。
说明：服务端监听 --host/--port（默认 0.0.0.0:4840）；若在 Docker 内需自行映射端口。
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
for _noisy in ("asyncua", "asyncua.server", "asyncua.server.internal_server"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
logger = logging.getLogger("demo_opcua")

from asyncua import Server, ua  # noqa: E402


async def _counter_task(node, interval_sec: float):
    """周期自增计数，便于在读值 / 树上预览观察刷新。"""
    i = 0
    while True:
        await asyncio.sleep(interval_sec)
        i += 1
        await node.write_value(i)
        logger.info("ReportEditorDemo.Counter = %s", i)


async def _clock_task(node, interval_sec: float):
    """按固定间隔写入 UTC ISO 时间，便于验证前端树上自动读值是否正确刷新。"""
    while True:
        await asyncio.sleep(interval_sec)
        text = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        await node.write_value(text)


async def _run(args: argparse.Namespace) -> None:
    path_seg = args.path.strip().strip("/")
    listen_host = args.host
    bind_url = f"opc.tcp://{listen_host}:{args.port}/{path_seg}/"

    srv = Server()
    await srv.init()
    srv.set_endpoint(bind_url)
    srv.set_server_name("SD SMA ReportEditor Demo OPC UA")
    srv.set_security_policy([ua.SecurityPolicyType.NoSecurity])

    ns_idx = await srv.register_namespace("urn:brt:sd-sma-reporteditor:opc-demo")
    demo = await srv.nodes.objects.add_object(ns_idx, "ReportEditorDemo")
    counter_var = await demo.add_variable(ns_idx, "Counter", 0)
    await counter_var.set_writable()
    await demo.add_variable(ns_idx, "Temperature", 23.5)
    await demo.add_variable(ns_idx, "Message", ua.LocalizedText("演示服务器运行中"))
    clock_var = await demo.add_variable(ns_idx, "ClockUtc", "")
    logger.info(
        "变量 Counter / ClockUtc：默认每 1s 写入，便于前端树行预览验证；可通过 --tick-sec / --counter-sec 调整。"
    )

    counter_sec = max(0.2, args.counter_sec)
    tick_sec = max(0.2, args.tick_sec)

    client_hint = bind_url.replace("0.0.0.0", "127.0.0.1").replace("*", "127.0.0.1")
    logger.info("监听: %s", bind_url)
    logger.info("在 ReportEditor 中填写端点（本机一般用）: %s", client_hint)
    logger.info("认证：匿名，用户名和密码留空。Ctrl+C 结束。")

    async with srv:
        counter_task = asyncio.create_task(_counter_task(counter_var, counter_sec))
        clock_task = asyncio.create_task(_clock_task(clock_var, tick_sec))
        try:
            await asyncio.Event().wait()
        finally:
            counter_task.cancel()
            clock_task.cancel()
            for t in (counter_task, clock_task):
                try:
                    await t
                except asyncio.CancelledError:
                    pass


def main() -> None:
    p = argparse.ArgumentParser(description="ReportEditor 本地 OPC UA 演示服务")
    p.add_argument("--host", default="0.0.0.0", help="监听地址，默认全盘符")
    p.add_argument("--port", type=int, default=4840, help="端口，默认 4840（勿与冲突服务共用）")
    p.add_argument(
        "--path",
        default="report-editor/demo-opcua",
        help='URL 路径段，例如默认为 .../report-editor/demo-opcua/',
    )
    p.add_argument(
        "--counter-sec",
        type=float,
        default=1.0,
        dest="counter_sec",
        metavar="SEC",
        help="Counter 自增写入间隔（秒），默认 1，最小约 0.2",
    )
    p.add_argument(
        "--tick-sec",
        type=float,
        default=1.0,
        dest="tick_sec",
        metavar="SEC",
        help="ClockUtc UTC 时间字符串写入间隔（秒），默认 1，最小约 0.2",
    )
    args = p.parse_args()
    try:
        asyncio.run(_run(args))
    except KeyboardInterrupt:
        logger.info("已退出。")


if __name__ == "__main__":
    main()
