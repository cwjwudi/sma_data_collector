import sqlite3
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock

import pytest

from database.data_storage import DataStorageProcessor
from database.persistent_queue import PersistentQueueStore, QueueCapacityError


def item(value=1):
    return {
        "group_name": "Data_Test",
        "collection_time": datetime(2026, 7, 13, 12, 0, 0),
        "trigger_type": "variable",
        "data": {"value": {"value": value}},
    }


def queue_config(path: Path, **overrides):
    result = {
        "enabled": True,
        "path": str(path),
        "synchronous": "FULL",
        "busy_timeout_ms": 100,
        "lease_seconds": 10,
        "max_queue_rows": 100,
        "completed_retention_days": 1,
    }
    result.update(overrides)
    return result


def processor(path: Path, batch_size=1):
    db = Mock()
    db.get_current_table_name.return_value = "Data_Test"
    db.create_data_table.return_value = True
    db.execute_insert_many.side_effect = lambda _table, rows: len(rows)
    db.execute_query.return_value = []
    result = DataStorageProcessor(db, batch_size=batch_size, persistent_queue_config=queue_config(path))
    result.group_data_points["Data_Test"] = ["value"]
    result.group_partition_interval_years["Data_Test"] = 0
    result.group_batch_sizes["Data_Test"] = batch_size
    assert result.initialize_tables_for_runtime()
    return result, db


def test_enqueue_commit_roundtrips_datetime_and_wal(tmp_path):
    path = tmp_path / "outbox.db"
    store = PersistentQueueStore(str(path))
    record_id = store.enqueue(item(7))

    restored = store.load_ready()
    assert restored[0]["_outbox_id"] == record_id
    assert restored[0]["collection_time"] == datetime(2026, 7, 13, 12, 0, 0)
    with sqlite3.connect(path) as connection:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 1
    store.close()


def test_processing_row_is_recovered_after_unclean_restart(tmp_path):
    path = tmp_path / "outbox.db"
    first = PersistentQueueStore(str(path))
    record_id = first.enqueue(item())
    first.mark_processing([record_id])
    assert first.counts()["processing"] == 1
    first.close()

    restarted = PersistentQueueStore(str(path))
    assert restarted.recovered_on_open == 1
    assert restarted.load_ready()[0]["_outbox_id"] == record_id
    restarted.close()


def test_capacity_failure_is_transactional(tmp_path):
    store = PersistentQueueStore(str(tmp_path / "outbox.db"), max_queue_rows=1)
    store.enqueue(item(1))
    with pytest.raises(QueueCapacityError):
        store.enqueue(item(2))
    assert store.counts()["pending"] == 1
    store.close()


def test_add_data_only_reaches_deque_after_sqlite_commit(tmp_path, monkeypatch):
    target, _ = processor(tmp_path / "outbox.db")

    def fail(_payload):
        raise sqlite3.OperationalError("disk full")

    monkeypatch.setattr(target.persistent_store, "enqueue", fail)
    with pytest.raises(sqlite3.OperationalError):
        target.add_data(item())
    assert list(target.data_queue) == []
    assert target.get_runtime_metrics()["outbox_pending_size"] == 0


@pytest.mark.asyncio
async def test_target_db_success_completes_durable_record(tmp_path):
    target, _ = processor(tmp_path / "outbox.db")
    target.add_data(item(9))
    assert target.persistent_store.counts()["pending"] == 1

    await target._process_data_by_groups()

    assert target.persistent_store.counts()["completed"] == 1
    assert target.get_runtime_metrics()["outbox_rows_completed"] == 1


@pytest.mark.asyncio
async def test_target_db_failure_remains_durable_and_restart_recovers(tmp_path):
    path = tmp_path / "outbox.db"
    target, db = processor(path)
    db.execute_insert_many.return_value = -1
    db.execute_insert_many.side_effect = None
    target.add_data(item(11))

    await target._process_data_by_groups()

    assert target.persistent_store.counts()["retry"] == 1
    target.persistent_store.close()
    restarted = PersistentQueueStore(str(path))
    # Retry delay protects the target DB from a hot loop; the row itself remains durable.
    assert restarted.counts()["retry"] == 1
    restarted.close()


@pytest.mark.asyncio
async def test_non_retryable_data_is_persisted_as_dead_letter(tmp_path):
    target, _ = processor(tmp_path / "outbox.db")
    target.add_data(item(12))

    async def conversion_error(_group, rows):
        return {
            target.STATUS_SUCCESS: 0,
            target.STATUS_UNIQUE_CONFLICT: 0,
            target.STATUS_DB_ERROR: 0,
            target.STATUS_OTHER_ERROR: len(rows),
        }

    target._process_group_data = conversion_error
    await target._process_data_by_groups()
    assert target.persistent_store.counts()["dead_letter"] == 1
    assert len(target.dead_letter_queue) == 1
