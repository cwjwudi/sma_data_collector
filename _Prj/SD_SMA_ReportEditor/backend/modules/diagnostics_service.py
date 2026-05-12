"""运行环境检测与安全修复建议。"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any


def _try_connect(host: str, port: int, timeout: float = 0.3) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


def collect_checks(
    data_dir: Path,
    config_file: Path,
    backend_root: Path,
    templates_dir: Path,
    history_dir: Path,
) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    py_ver = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    checks.append(
        {
            "id": "python_version",
            "label": "Python 版本",
            "status": "ok" if sys.version_info >= (3, 10) else "warn",
            "detail": py_ver + ("（建议 3.10+）" if sys.version_info < (3, 10) else ""),
            "fixable": False,
        }
    )

    venv_py = backend_root / "venv" / "Scripts" / "python.exe"
    has_venv = venv_py.exists()
    checks.append(
        {
            "id": "venv",
            "label": "后端虚拟环境 backend/venv",
            "status": "ok" if has_venv else "warn",
            "detail": str(venv_py) if has_venv else "未找到 venv，可使用系统 Python",
            "fixable": False,
        }
    )

    npm = _which("npm") or _which("npm.cmd")
    checks.append(
        {
            "id": "npm",
            "label": "npm 可用性",
            "status": "ok" if npm else "warn",
            "detail": npm or "PATH 中未找到 npm",
            "fixable": False,
        }
    )

    checks.append(
        {
            "id": "data_dir_writable",
            "label": "数据目录可写",
            "status": "ok" if os.access(data_dir.parent, os.W_OK) else "fail",
            "detail": str(data_dir),
            "fixable": True,
            "fix_action": "ensure_directories",
        }
    )

    checks.append(
        {
            "id": "config_file",
            "label": "配置文件存在",
            "status": "ok" if config_file.exists() else "warn",
            "detail": str(config_file),
            "fixable": True,
            "fix_action": "write_default_config",
        }
    )

    checks.append(
        {
            "id": "port_8000",
            "label": "端口 8000（后端）占用",
            "status": "warn" if _try_connect("127.0.0.1", 8000) else "ok",
            "detail": "有进程监听 8000（通常为后端自身或其它服务）" if _try_connect("127.0.0.1", 8000) else "未被占用",
            "fixable": False,
        }
    )

    checks.append(
        {
            "id": "port_5173",
            "label": "端口 5173（Vite）占用",
            "status": "warn" if _try_connect("127.0.0.1", 5173) else "ok",
            "detail": "有进程监听 5173（通常前端开发服务器）" if _try_connect("127.0.0.1", 5173) else "未被占用",
            "fixable": False,
        }
    )

    templates_ok = templates_dir.exists()
    history_ok = history_dir.exists()
    checks.append(
        {
            "id": "templates_dir",
            "label": "templates 目录",
            "status": "ok" if templates_ok else "warn",
            "detail": str(templates_dir),
            "fixable": True,
            "fix_action": "ensure_directories",
        }
    )
    checks.append(
        {
            "id": "history_dir",
            "label": "history 目录",
            "status": "ok" if history_ok else "warn",
            "detail": str(history_dir),
            "fixable": True,
            "fix_action": "ensure_directories",
        }
    )

    return checks


def apply_safe_fixes(
    actions: list[str],
    data_dir: Path,
    config_file: Path,
    templates_dir: Path,
    history_dir: Path,
    default_config: dict,
) -> dict[str, Any]:
    applied: list[str] = []
    errors: list[str] = []

    for action in actions:
        if action == "ensure_directories":
            try:
                for d in (data_dir, templates_dir, history_dir):
                    d.mkdir(parents=True, exist_ok=True)
                applied.append(action)
            except OSError as e:
                errors.append(f"{action}: {e}")
        elif action == "write_default_config":
            try:
                data_dir.mkdir(parents=True, exist_ok=True)
                if not config_file.exists():
                    import json

                    config_file.write_text(
                        json.dumps(default_config, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                    applied.append(action)
                else:
                    applied.append(f"{action}:skipped_exists")
            except OSError as e:
                errors.append(f"{action}: {e}")
        else:
            errors.append(f"未知修复动作: {action}")

    return {"applied": applied, "errors": errors}


def try_node_versions() -> dict[str, str | None]:
    out: dict[str, str | None] = {"node": None, "npm": None}
    for cmd, key in (("node", "node"), ("npm", "npm")):
        exe = _which(cmd) or _which(cmd + ".cmd")
        if not exe:
            continue
        try:
            r = subprocess.run(
                [exe, "--version"],
                capture_output=True,
                text=True,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
            out[key] = (r.stdout or r.stderr or "").strip() or None
        except (OSError, subprocess.TimeoutExpired):
            out[key] = None
    return out
