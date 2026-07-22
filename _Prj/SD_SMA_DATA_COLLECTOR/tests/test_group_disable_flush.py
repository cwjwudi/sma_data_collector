from datetime import datetime
from unittest.mock import Mock

import pytest

from database.data_storage import DataStorageProcessor


def queue_item(group_name, value):
    return {
        "group_name": group_name,
        "collection_time": datetime.now(),
        "data": {"value": {"value": value}},
    }


def make_processor():
    processor = DataStorageProcessor(Mock(), batch_size=10)
    processor.group_batch_sizes.update({"Target": 10, "Other": 10})
    return processor


@pytest.mark.asyncio
async def test_group_disable_flushes_only_target_partial_batch(monkeypatch):
    processor = make_processor()
    processed = []

    async def process_group(group_name, rows):
        processed.append((group_name, [row["data"]["value"]["value"] for row in rows]))
        outcomes = processor._empty_outcomes()
        outcomes[processor.STATUS_SUCCESS] = len(rows)
        return outcomes

    monkeypatch.setattr(processor, "_process_group_data", process_group)
    processor.add_data(queue_item("Target", 1))
    processor.add_data(queue_item("Other", 9))
    processor.add_data(queue_item("Target", 2))

    assert processor._has_enough_data_for_batch() is False
    assert processor.request_group_flush("Target") == 2
    assert processor._has_enough_data_for_batch() is True

    await processor._process_data_by_groups()

    assert processed == [("Target", [1, 2])]
    assert [row["group_name"] for row in processor.data_queue] == ["Other"]
    assert processor.metrics["group_flush_rows_committed"] == 2
    assert "Target" not in processor._group_flush_requests


@pytest.mark.asyncio
async def test_failed_disable_flush_remains_requested_for_retry(monkeypatch):
    processor = make_processor()
    attempts = 0

    async def process_group(_group_name, rows):
        nonlocal attempts
        attempts += 1
        outcomes = processor._empty_outcomes()
        status = processor.STATUS_DB_ERROR if attempts == 1 else processor.STATUS_SUCCESS
        outcomes[status] = len(rows)
        return outcomes

    monkeypatch.setattr(processor, "_process_group_data", process_group)
    processor.add_data(queue_item("Target", 3))
    processor.request_group_flush("Target")

    await processor._process_data_by_groups()
    assert len(processor.data_queue) == 1
    assert "Target" in processor._group_flush_requests

    await processor._process_data_by_groups()
    assert len(processor.data_queue) == 0
    assert "Target" not in processor._group_flush_requests
    assert processor.metrics["group_flush_rows_committed"] == 1


def test_empty_group_disable_does_not_leave_stale_flush_request():
    processor = make_processor()

    assert processor.request_group_flush("Target") == 0
    assert "Target" not in processor._group_flush_requests
    assert processor.metrics["group_flush_empty"] == 1
