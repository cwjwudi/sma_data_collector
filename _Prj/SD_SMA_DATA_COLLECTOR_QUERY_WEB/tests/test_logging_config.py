"""Tests for logging configuration."""

from __future__ import annotations

import logging

from app.logging_config import (
    LOG_DATE_FORMAT,
    LOG_FORMAT,
    TruncateMessageFilter,
    build_logging_config,
    setup_logging,
)


def test_logging_config_has_timestamp_and_level():
    assert "%(asctime)s" in LOG_FORMAT
    assert "%(levelname)" in LOG_FORMAT
    assert LOG_DATE_FORMAT


def test_setup_logging_emits_formatted_record(capsys):
    setup_logging()
    logging.getLogger("app.test_logging").warning("formatted-check")
    captured = capsys.readouterr()
    assert "formatted-check" in captured.err
    assert "WARNING" in captured.err
    assert "|" in captured.err


def test_build_logging_config_respects_level():
    cfg = build_logging_config("DEBUG")
    assert cfg["root"]["level"] == "DEBUG"


def test_build_logging_config_quiets_asyncua():
    cfg = build_logging_config("INFO")
    assert cfg["loggers"]["asyncua"]["level"] == "WARNING"
    assert cfg["loggers"]["asyncua.client"]["level"] == "WARNING"
    assert "truncate" in cfg["filters"]


def test_truncate_message_filter_shortens_long_message():
    filt = TruncateMessageFilter(max_len=80)
    record = logging.LogRecord(
        name="asyncua.client.client",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="find_endpoint " + ("X" * 500),
        args=(),
        exc_info=None,
    )
    assert filt.filter(record) is True
    msg = record.getMessage()
    assert len(msg) < 120
    assert "truncated" in msg
    assert msg.startswith("find_endpoint ")
