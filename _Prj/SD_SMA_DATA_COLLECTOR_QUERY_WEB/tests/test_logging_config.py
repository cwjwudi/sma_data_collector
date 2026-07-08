"""Tests for logging configuration."""

from __future__ import annotations

import logging

from app.logging_config import LOG_FORMAT, LOG_DATE_FORMAT, build_logging_config, setup_logging


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
