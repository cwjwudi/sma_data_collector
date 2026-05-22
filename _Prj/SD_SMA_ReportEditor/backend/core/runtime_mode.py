"""区分开发仓库运行与 PyInstaller 内置后端（Electron 安装版）。"""
from __future__ import annotations

import sys


def is_packaged_runtime() -> bool:
    """当前 Python 进程是否由 PyInstaller 打包（report_backend 可执行文件）。"""
    return bool(getattr(sys, "frozen", False)) or hasattr(sys, "_MEIPASS")


def deployment_mode_label() -> str:
    return "packaged" if is_packaged_runtime() else "development"


def packaged_platform_label() -> str:
    """安装版运行模式在诊断页展示的平台名称。"""
    if sys.platform == "win32":
        return "Windows 安装版"
    if sys.platform == "darwin":
        return "macOS 安装版"
    if sys.platform.startswith("linux"):
        return "Linux 安装版"
    return "安装版"


def packaged_runtime_detail() -> str:
    """安装版运行模式诊断说明（含内置后端提示）。"""
    return f"{packaged_platform_label()}（内置后端，无需本机 Python/Node 开发环境）"
