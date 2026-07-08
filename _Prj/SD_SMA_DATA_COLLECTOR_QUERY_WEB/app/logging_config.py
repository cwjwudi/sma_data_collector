"""Central logging configuration for Query Web."""
from __future__ import annotations

import logging
import logging.config
import os
from typing import Any

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

_configured = False


def _resolve_level() -> str:
    raw = str(os.getenv("SD_SMA_LOG_LEVEL", "INFO") or "INFO").strip().upper()
    if raw not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        return "INFO"
    return raw


def build_logging_config(level: str | None = None) -> dict[str, Any]:
    resolved = (level or _resolve_level()).upper()
    formatter = {
        "format": LOG_FORMAT,
        "datefmt": LOG_DATE_FORMAT,
    }
    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": formatter,
            "access": formatter,
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "stream": "ext://sys.stderr",
            },
            "access": {
                "class": "logging.StreamHandler",
                "formatter": "access",
                "stream": "ext://sys.stdout",
            },
        },
        "loggers": {
            "uvicorn": {"handlers": ["console"], "level": resolved, "propagate": False},
            "uvicorn.error": {"level": resolved, "propagate": True},
            "uvicorn.access": {"handlers": ["access"], "level": resolved, "propagate": False},
            "app": {"handlers": ["console"], "level": resolved, "propagate": False},
        },
        "root": {"level": resolved, "handlers": ["console"]},
    }


LOGGING_CONFIG = build_logging_config()


def setup_logging(level: str | None = None) -> None:
    global _configured
    if _configured:
        return
    logging.config.dictConfig(build_logging_config(level))
    _configured = True
