"""Read-only inspection, export and explicit dead-letter replay for the outbox."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database.persistent_queue import PersistentQueueStore  # noqa: E402


def json_default(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect or maintain the collector SQLite outbox")
    parser.add_argument("database", help="Path to collector_outbox.db")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("stats")
    list_parser = subparsers.add_parser("list")
    list_parser.add_argument("--status")
    list_parser.add_argument("--limit", type=int, default=100)
    export_parser = subparsers.add_parser("export")
    export_parser.add_argument("output")
    export_parser.add_argument("--status", default="dead_letter")
    export_parser.add_argument("--limit", type=int, default=100000)
    replay_parser = subparsers.add_parser("replay-dead-letter")
    replay_parser.add_argument("--id", action="append", dest="ids")
    replay_parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()

    store = PersistentQueueStore(args.database, recover_on_open=False)
    try:
        if args.command == "stats":
            result = store.counts()
        elif args.command == "list":
            result = store.list_records(args.status, args.limit)
        elif args.command == "export":
            records = store.list_records(args.status, args.limit)
            output = Path(args.output).expanduser().resolve()
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(
                json.dumps(records, ensure_ascii=False, indent=2, default=json_default),
                encoding="utf-8",
            )
            result = {"exported": len(records), "output": str(output)}
        else:
            if not args.execute:
                result = {
                    "executed": False,
                    "message": "Dry run only; add --execute to replay persistent dead letters",
                    "matching": len(store.list_records("dead_letter", 100000)),
                }
            else:
                result = {"executed": True, "replayed": store.replay_dead_letters(args.ids)}
        print(json.dumps(result, ensure_ascii=False, indent=2, default=json_default))
        return 0
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
