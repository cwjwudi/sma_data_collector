"""打包入口：供 PyInstaller 生成 report_backend.exe，勿直接用于开发调试。"""
from __future__ import annotations

import multiprocessing
import os


def main() -> None:
    import main as _main_module  # noqa: F401 — 确保 PyInstaller 收集 main.py

    import uvicorn

    # 默认绑定 0.0.0.0：本机可用 127.0.0.1 访问，同网段亦可通过局域网 IP 访问。
    host = os.environ.get("REPORT_EDITOR_HTTP_HOST", "0.0.0.0").strip() or "0.0.0.0"
    try:
        port = int(os.environ.get("REPORT_EDITOR_HTTP_PORT", "8000") or "8000")
    except ValueError:
        port = 8000

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        log_level="info",
        reload=False,
    )


if __name__ == "__main__":
    multiprocessing.freeze_support()
    main()
