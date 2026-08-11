#!/usr/bin/env python3
"""Mock OPC UA server for Query Web plugin writeback integration tests."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
for _noisy in ("asyncua", "asyncua.server", "asyncua.server.internal_server"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
logger = logging.getLogger("query_web_opcua_mock")

from asyncua import Server, ua  # noqa: E402
from asyncua.server.user_managers import PermissiveUserManager  # noqa: E402

ARRAY_LEN = 50


async def _run(args: argparse.Namespace) -> None:
    path_seg = args.path.strip().strip("/")
    bind_url = f"opc.tcp://{args.host}:{args.port}/{path_seg}/"

    srv = Server()
    await srv.init()
    srv.set_endpoint(bind_url)
    srv.set_server_name("Query Web OPC UA Mock")
    srv.set_security_policy([ua.SecurityPolicyType.NoSecurity])
    srv.user_manager = PermissiveUserManager()

    ns_idx = await srv.register_namespace("urn:sd-sma:query-web:mock")
    demo = await srv.nodes.objects.add_object(ns_idx, "QueryDemo")

    cursor_var = await demo.add_variable(ns_idx, "cursor", -1, varianttype=ua.VariantType.Int32)
    await cursor_var.set_writable()

    ar_code = await demo.add_variable(
        ns_idx,
        "arCode",
        [0] * ARRAY_LEN,
        varianttype=ua.VariantType.Int32,
    )
    await ar_code.set_writable()

    ar_msg = await demo.add_variable(
        ns_idx,
        "arMsg",
        [""] * ARRAY_LEN,
        varianttype=ua.VariantType.String,
    )
    await ar_msg.set_writable()

    ar_table_names = await demo.add_variable(
        ns_idx,
        "strListName",
        [""] * ARRAY_LEN,
        varianttype=ua.VariantType.String,
    )
    await ar_table_names.set_writable()

    query_var = await demo.add_variable(ns_idx, "query", False, varianttype=ua.VariantType.Boolean)
    await query_var.set_writable()
    prev_var = await demo.add_variable(ns_idx, "prevPage", False, varianttype=ua.VariantType.Boolean)
    await prev_var.set_writable()
    next_var = await demo.add_variable(ns_idx, "nextPage", False, varianttype=ua.VariantType.Boolean)
    await next_var.set_writable()

    meta = {
        "endpoint_url": bind_url.replace(f"{args.host}", "127.0.0.1"),
        "ns": ns_idx,
        "cursor": cursor_var.nodeid.to_string(),
        "arCode": ar_code.nodeid.to_string(),
        "arMsg": ar_msg.nodeid.to_string(),
        "strListName": ar_table_names.nodeid.to_string(),
        "query": query_var.nodeid.to_string(),
        "prevPage": prev_var.nodeid.to_string(),
        "nextPage": next_var.nodeid.to_string(),
    }
    if args.meta_out:
        Path(args.meta_out).write_text(json.dumps(meta, indent=2), encoding="utf-8")

    logger.info("Listening: %s", bind_url)
    logger.info("Nodes: %s", meta)
    logger.info("Ctrl+C to stop.")

    async with srv:
        await asyncio.Event().wait()


def main() -> None:
    parser = argparse.ArgumentParser(description="Query Web OPC UA mock server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4851)
    parser.add_argument("--path", default="query-web/mock")
    parser.add_argument("--meta-out", default="", help="Write node metadata JSON for tests")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()
