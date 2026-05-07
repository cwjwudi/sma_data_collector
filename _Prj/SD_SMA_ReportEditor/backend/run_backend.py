"""打包入口：供 PyInstaller 生成 report_backend.exe，勿直接用于开发调试。"""
from __future__ import annotations

import multiprocessing


def main() -> None:
    import main as _main_module  # noqa: F401 — 确保 PyInstaller 收集 main.py

    import uvicorn

    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        reload=False,
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
