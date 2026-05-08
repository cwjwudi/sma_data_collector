from __future__ import annotations

import asyncio
import logging
import sys
from collections import deque
from pathlib import Path
from typing import Any, Optional

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.collector_runtime import DataCollectionSystem

from .config_manager import CollectorConfigManager


class RingBufferLogHandler(logging.Handler):
    """将根日志器输出复制一份到环形缓冲，供监视页轮询展示。"""

    def __init__(self, maxlen: int = 800) -> None:
        super().__init__()
        self._lines: deque[str] = deque(maxlen=maxlen)
        self.setFormatter(
            logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        )
        self.setLevel(logging.DEBUG)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._lines.append(self.format(record))
        except Exception:
            pass

    def get_lines(self) -> list[str]:
        return list(self._lines)

    def clear(self) -> None:
        self._lines.clear()


class CollectorHost:
    """在 Uvicorn 同一事件循环内托管 DataCollectionSystem（通过监视页启动/停止）。"""

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._task: Optional[asyncio.Task] = None
        self._system: Optional[DataCollectionSystem] = None
        self._phase = "idle"
        self._last_error: Optional[str] = None
        self._log_handler = RingBufferLogHandler()

    @property
    def phase(self) -> str:
        return self._phase

    def get_log_handler(self) -> RingBufferLogHandler:
        return self._log_handler

    @staticmethod
    def resolve_config_file(filename: str, collector_config_dir: Path) -> Path:
        safe = CollectorConfigManager._sanitize_filename(filename)
        target = (collector_config_dir / safe).resolve()
        if target.parent != collector_config_dir.resolve():
            raise ValueError("非法路径")
        return target

    async def start(self, filename: str, collector_config_dir: Path) -> dict[str, Any]:
        async with self._lock:
            if self._task and not self._task.done():
                raise RuntimeError("采集已在运行中，请先停止")
            path = self.resolve_config_file(filename, collector_config_dir)
            if not path.is_file():
                raise FileNotFoundError(f"配置文件不存在: {path.name}")

            self._last_error = None
            self._log_handler.clear()
            self._phase = "starting"
            path_str = str(path)

            async def runner() -> None:
                sys_obj: Optional[DataCollectionSystem] = None
                try:
                    sys_obj = DataCollectionSystem(
                        path_str,
                        extra_log_handlers=[self._log_handler],
                    )
                    self._system = sys_obj
                    if not await sys_obj.initialize():
                        self._phase = "error"
                        self._last_error = "初始化失败，请查看下方日志或 data_collector.log"
                        return
                    self._phase = "running"
                    await sys_obj.start()
                except asyncio.CancelledError:
                    if sys_obj is not None:
                        sys_obj.running = False
                    raise
                except Exception as exc:  # noqa: BLE001
                    self._phase = "error"
                    self._last_error = str(exc)
                finally:
                    self._phase = "stopping"
                    if sys_obj is not None:
                        try:
                            await sys_obj.stop()
                        except Exception:
                            pass
                    self._system = None
                    self._task = None
                    self._phase = "idle"

            self._task = asyncio.create_task(runner(), name="sd_sma_collector_host")

        return {"status": "ok", "path": path_str}

    async def stop(self) -> dict[str, Any]:
        async with self._lock:
            if not self._task or self._task.done():
                return {"status": "idle", "message": "当前无采集任务"}
            if self._system is not None:
                self._system.running = False
            task = self._task
        try:
            await asyncio.wait_for(task, timeout=180.0)
        except asyncio.TimeoutError:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        return {"status": "stopped"}

    def status(self) -> dict[str, Any]:
        snapshot: Any = None
        if self._system is not None:
            try:
                snapshot = self._system.get_runtime_snapshot()
            except Exception as exc:  # noqa: BLE001
                snapshot = {"error": str(exc)}
        return {
            "phase": self._phase,
            "snapshot": snapshot,
            "last_error": self._last_error,
            "task_active": bool(self._task and not self._task.done()),
        }

    async def shutdown(self) -> None:
        await self.stop()


_host: Optional[CollectorHost] = None


def get_collector_host() -> CollectorHost:
    global _host
    if _host is None:
        _host = CollectorHost()
    return _host
