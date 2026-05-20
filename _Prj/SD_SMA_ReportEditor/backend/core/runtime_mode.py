"""区分开发仓库运行与 PyInstaller 内置后端（Electron 安装版）。"""
from __future__ import annotations

import sys


def is_packaged_runtime() -> bool:
    """当前 Python 进程是否由 PyInstaller 打包（report_backend.exe）。"""
    return bool(getattr(sys, "frozen", False)) or hasattr(sys, "_MEIPASS")


def deployment_mode_label() -> str:
    return "packaged" if is_packaged_runtime() else "development"
