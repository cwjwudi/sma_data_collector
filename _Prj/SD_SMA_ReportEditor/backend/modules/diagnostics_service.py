"""运行环境检测与安全修复建议。"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from pathlib import Path
from typing import Any

from core.runtime_mode import is_packaged_runtime, packaged_runtime_detail
from core.service_beacon import BACKEND_BEACON_MAGIC, beacon_file_path

# 与 backend/main.py + requirements.txt（eval-type-backport）一致：最低 3.9。
_MIN_SUPPORTED_PYTHON: tuple[int, int] = (3, 9)
_RECOMMENDED_PYTHON: tuple[int, int] = (3, 10)


def _python_version_diag_row() -> dict[str, Any]:
    v = sys.version_info
    ver = f"{v.major}.{v.minor}.{v.micro}"
    mm = (v.major, v.minor)
    if mm < _MIN_SUPPORTED_PYTHON:
        detail = (
            f"{ver}（需要 Python {_MIN_SUPPORTED_PYTHON[0]}.{_MIN_SUPPORTED_PYTHON[1]}+ "
            "并重建 backend/venv 后重启）"
        )
        status = "warn"
    elif mm < _RECOMMENDED_PYTHON:
        detail = (
            f"{ver}（已兼容：requirements 内含 eval-type-backport；新项目可选用 "
            f"Python {_RECOMMENDED_PYTHON[0]}.{_RECOMMENDED_PYTHON[1]}+）"
        )
        status = "ok"
    else:
        detail = ver
        status = "ok"
    return {"status": status, "detail": detail}


def _try_connect(host: str, port: int, timeout: float = 0.3) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _which(cmd: str) -> str | None:
    return shutil.which(cmd)


def _subprocess_no_window_kwargs() -> dict[str, Any]:
    if sys.platform == "win32":
        return {"creationflags": subprocess.CREATE_NO_WINDOW}  # type: ignore[attr-defined]
    return {}


def _log_line(msg: str) -> str:
    return f"[{time.strftime('%H:%M:%S')}] {msg}"


def port_listener_info(port: int) -> dict[str, Any]:
    """仅诊断：是否可连上本机端口，并尽量解析监听 PID（不杀进程）。"""
    listening = _try_connect("127.0.0.1", port)
    pids: list[int] = []
    raw_lines: list[str] = []
    if sys.platform.startswith("win"):
        try:
            r = subprocess.run(
                ["cmd", "/c", "netstat -ano"],
                capture_output=True,
                text=True,
                timeout=12,
                **_subprocess_no_window_kwargs(),
            )
            out = r.stdout or ""
            token = f":{port}"
            for ln in out.splitlines():
                if token not in ln:
                    continue
                up = ln.upper()
                if "LISTENING" not in up and "侦听" not in ln:
                    continue
                raw_lines.append(ln.strip())
                parts = ln.split()
                if parts and parts[-1].isdigit():
                    pids.append(int(parts[-1]))
        except (OSError, subprocess.TimeoutExpired) as e:
            raw_lines.append(f"netstat 失败: {e}")
    else:
        lsof = _which("lsof")
        if lsof:
            try:
                r = subprocess.run(
                    [lsof, "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"],
                    capture_output=True,
                    text=True,
                    timeout=8,
                )
                out = (r.stdout or "").strip()
                if out:
                    for x in out.splitlines():
                        if x.strip().isdigit():
                            pids.append(int(x.strip()))
                err = (r.stderr or "").strip()
                if err:
                    raw_lines.append(err)
            except (OSError, subprocess.TimeoutExpired) as e:
                raw_lines.append(f"lsof 失败: {e}")
        else:
            raw_lines.append("未找到 lsof，无法解析 PID（可安装 lsof 或使用系统网络工具自行查看）")
    pids = sorted(set(pids))
    return {"port": port, "listening": listening, "pids": pids, "raw_lines": raw_lines[:16]}


def _repo_venv_python_paths(backend_root: Path) -> list[Path]:
    out: list[Path] = []
    win = backend_root / "venv" / "Scripts" / "python.exe"
    nix3 = backend_root / "venv" / "bin" / "python3"
    nix = backend_root / "venv" / "bin" / "python"
    for p in (win, nix3, nix):
        if p.exists():
            try:
                out.append(p.resolve())
            except OSError:
                out.append(p)
    return out


def running_from_repo_venv(backend_root: Path) -> bool:
    """当前解释器是否正在使用 backend/venv 下的 python。"""
    try:
        exe = Path(sys.executable).resolve()
    except OSError:
        exe = Path(sys.executable)
    return exe in set(_repo_venv_python_paths(backend_root))


def resolve_venv_create_command(backend_root: Path) -> list[str]:
    """返回用于 `... -m venv <dest>` 的前缀命令（不含 -m venv dest，由调用方拼接）。"""
    dest = str(backend_root / "venv")
    exe_name = Path(sys.executable).name.lower()
    if exe_name in ("python.exe", "python3", "python") and not running_from_repo_venv(backend_root):
        return [str(Path(sys.executable).resolve()), "-m", "venv", dest]
    if sys.platform == "win32":
        py_launcher = _which("py")
        if py_launcher:
            return [py_launcher, "-3", "-m", "venv", dest]
    for w in (_which("python3"), _which("python")):
        if w:
            return [w, "-m", "venv", dest]
    raise RuntimeError(
        "找不到可用的 python / py 来创建 venv（请安装 Python 3.9+ 并加入 PATH，推荐 3.10+）"
    )


def pip_executable_for_venv(backend_root: Path) -> Path:
    if sys.platform == "win32":
        return backend_root / "venv" / "Scripts" / "pip.exe"
    return backend_root / "venv" / "bin" / "pip"


def write_rebuild_venv_script_windows(backend_root: Path) -> Path:
    """生成退出应用后由用户手动执行的 PowerShell 脚本。"""
    scripts_dir = backend_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    path = scripts_dir / "rebuild_venv_after_exit.generated.ps1"
    root_ps = str(backend_root.resolve()).replace("'", "''")
    content = f"""$ErrorActionPreference = "Stop"
Set-Location -LiteralPath '{root_ps}'
Write-Host "工作目录: $(Get-Location)"
if (Test-Path -LiteralPath '.\\venv') {{
  Write-Host "正在删除 .\\venv ..."
  Remove-Item -LiteralPath '.\\venv' -Recurse -Force
}}
Write-Host "创建虚拟环境..."
if (Get-Command py -ErrorAction SilentlyContinue) {{
  py -3 -m venv venv
}} elseif (Get-Command python -ErrorAction SilentlyContinue) {{
  python -m venv venv
}} else {{
  throw "未找到 py 或 python，请安装 Python 3.9+ 并加入 PATH（推荐 3.10+）"
}}
& .\\venv\\Scripts\\pip.exe install -r requirements.txt
Write-Host "完成。请重新启动报表编辑器。"
Read-Host "按 Enter 退出"
"""
    path.write_text(content, encoding="utf-8-sig")
    return path


def write_rebuild_venv_script_unix(backend_root: Path) -> Path:
    scripts_dir = backend_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    path = scripts_dir / "rebuild_venv_after_exit.generated.sh"
    root_sh = str(backend_root.resolve()).replace('"', '\\"')
    content = f'''#!/usr/bin/env bash
set -euo pipefail
cd "{root_sh}"
echo "工作目录: $(pwd)"
if [ -d "venv" ]; then
  echo "正在删除 venv..."
  rm -rf venv
fi
if command -v python3 >/dev/null 2>&1; then
  python3 -m venv venv
else
  python -m venv venv
fi
venv/bin/pip install -r requirements.txt
echo "完成。请重新启动应用。"
read -r -p "按 Enter 退出"
'''
    path.write_text(content, encoding="utf-8")
    try:
        os.chmod(path, 0o755)
    except OSError:
        pass
    return path


def _stream_subprocess_output_lines(argv: list[str], *, cwd: Path) -> tuple[int, list[str]]:
    """运行子进程并收集输出行（用于日志）。"""
    lines: list[str] = []
    try:
        proc = subprocess.Popen(
            argv,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding="utf-8",
            errors="replace",
            **_subprocess_no_window_kwargs(),
        )
    except OSError as e:
        return 1, [f"无法启动进程 {argv[0]}: {e}"]
    assert proc.stdout is not None
    for line in proc.stdout:
        lines.append(line.rstrip("\n"))
    code = int(proc.wait() or 0)
    return code, lines


def has_repo_venv(backend_root: Path) -> bool:
    """Windows / Unix：backend/venv 内是否存在可用的 Python。"""
    return bool(_repo_venv_python_paths(backend_root))


def _hit_health_endpoint(path_hint: str, url: str, timeout: float) -> tuple[bool, str]:
    """单次 GET `/health` 系接口；校验 JSON 体是否与本应用一致。"""
    try:
        req = urllib.request.Request(
            url,
            headers={"Accept": "application/json", "Connection": "close"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(65536).decode("utf-8", "replace")
        data = json.loads(body)
        if isinstance(data, dict) and ("config_exists" in data or "templates_dir_exists" in data):
            detail = (
                f"报表后端就绪：{path_hint} 可访问。"
                f" status={data.get('status')!r} config_exists={data.get('config_exists')!r}"
            )
            return True, detail
    except Exception as e:
        return False, f"无法确认为本应用 {path_hint}: {e}"
    return False, f"端口有响应或未识别为本应用（{path_hint}）"


def probe_report_editor_health_quick(
    port: int = 8000,
    *,
    timeout_per_req: float = 2.25,
    rounds: int = 2,
) -> tuple[bool, str]:
    """`/environment/check` 与向导：短时并行 `/health`、`/api/health`，谁先回认谁。

    避免「检查」链路误用超长多轮超时把页面卡在「扫描」数分钟。
    """
    base = f"http://127.0.0.1:{port}"
    pairs = (
        ("/health", f"{base}/health"),
        ("/api/health", f"{base}/api/health"),
    )
    last_err = "端口有响应或未识别为本应用"
    slack = min(1.05, timeout_per_req * 0.45)
    deadline_cap = timeout_per_req + slack + 0.12 * rounds

    for rnd in range(rounds):
        if rnd:
            try:
                time.sleep(0.2)
            except OSError:
                pass

        batch_deadline = time.monotonic() + deadline_cap
        with ThreadPoolExecutor(max_workers=len(pairs)) as pool:
            futures = tuple(pool.submit(_hit_health_endpoint, h, u, timeout_per_req) for h, u in pairs)
            pending = set(futures)

            while pending and time.monotonic() < batch_deadline:
                wait_remain = batch_deadline - time.monotonic()
                if wait_remain <= 0:
                    break
                chunk = min(wait_remain, timeout_per_req + 0.08)
                done_sub, pend_sub = wait(
                    pending,
                    timeout=chunk,
                    return_when=FIRST_COMPLETED,
                )
                for fut in done_sub:
                    ok, detail = fut.result()
                    if ok:
                        return True, detail
                    last_err = detail
                pending = pend_sub

    return False, last_err


def probe_report_editor_health(port: int = 8000, *, timeout_per_req: float = 12.0, max_rounds: int = 5) -> tuple[bool, str]:
    """慢速顺序多轮（网络极差或脚本需要时可显式调用）。UI 「检查」请用 `probe_report_editor_health_quick`。"""
    base = f"http://127.0.0.1:{port}"
    paths = (
        ("/health", f"{base}/health"),
        ("/api/health", f"{base}/api/health"),
    )
    last_err = "端口有响应或未识别为本应用"
    for rnd in range(max_rounds):
        for hint, url in paths:
            ok, detail = _hit_health_endpoint(hint, url, timeout_per_req)
            if ok:
                return True, detail
            last_err = detail
        if rnd + 1 < max_rounds:
            try:
                time.sleep(0.45 + 0.35 * rnd)
            except OSError:
                pass
    return False, last_err


def _install_repo_venv_fresh(backend_root: Path) -> dict[str, Any]:
    """假定 venv 目录已不存在或可覆盖，执行 python -m venv + pip install。"""
    message_lines: list[str] = []
    pip_lines: list[str] = []

    def m(msg: str) -> None:
        message_lines.append(_log_line(msg))

    m("正在创建新的 backend/venv …")
    try:
        venv_cmd = resolve_venv_create_command(backend_root)
    except RuntimeError as e:
        m(str(e))
        return {
            "message_lines": message_lines,
            "pip_lines": pip_lines,
            "done": {"success": False, "venv_rebuilt": False, "reason": "no_bootstrap_python"},
        }

    code, out_lines = _stream_subprocess_output_lines(venv_cmd, cwd=backend_root)
    for ln in out_lines[:200]:
        if ln.strip():
            message_lines.append(_log_line(ln))
    if code != 0:
        m(f"python -m venv 失败，退出码 {code}")
        return {
            "message_lines": message_lines,
            "pip_lines": pip_lines,
            "done": {"success": False, "venv_rebuilt": False, "reason": "venv_failed"},
        }
    m("venv 目录创建成功")

    pip_ex = pip_executable_for_venv(backend_root)
    if not pip_ex.exists():
        m(f"未找到 pip：{pip_ex}")
        return {
            "message_lines": message_lines,
            "pip_lines": pip_lines,
            "done": {"success": False, "venv_rebuilt": False, "reason": "pip_missing"},
        }

    m("pip install -r requirements.txt …")
    pip_cmd = [str(pip_ex), "install", "-r", "requirements.txt"]
    p_code, p_out = _stream_subprocess_output_lines(pip_cmd, cwd=backend_root)
    pip_lines.extend(p_out)
    if p_code != 0:
        m(f"pip install 失败，退出码 {p_code}")
        return {
            "message_lines": message_lines,
            "pip_lines": pip_lines,
            "done": {"success": False, "venv_rebuilt": True, "reason": "pip_failed"},
        }
    m("pip install 完成。请重启后端 / Electron。")
    return {
        "message_lines": message_lines,
        "pip_lines": pip_lines,
        "done": {"success": True, "venv_rebuilt": True},
    }


def force_repo_venv_reinstall(backend_root: Path) -> dict[str, Any]:
    """删除并重装 backend/venv（工控一键流式专用）。"""
    message_lines: list[str] = []

    def m(msg: str) -> None:
        message_lines.append(_log_line(msg))

    req = backend_root / "requirements.txt"
    if not req.exists():
        m(f"未找到 {req}，跳过 venv 重建")
        return {
            "message_lines": message_lines,
            "pip_lines": [],
            "done": {"success": True, "venv_rebuilt": False, "reason": "no_requirements"},
        }

    if running_from_repo_venv(backend_root):
        sp = (
            write_rebuild_venv_script_windows(backend_root)
            if sys.platform == "win32"
            else write_rebuild_venv_script_unix(backend_root)
        )
        m("当前后端使用仓库内 venv：无法原位删除；已生成离线脚本。")
        m(f"{sp}")
        return {
            "message_lines": message_lines,
            "pip_lines": [],
            "done": {
                "success": True,
                "venv_rebuilt": False,
                "venv_deferred": True,
                "reason": "running_inside_repo_venv",
                "script_path": str(sp),
            },
        }

    vdir = backend_root / "venv"
    try:
        if vdir.exists():
            m("正在删除旧 backend/venv …")
            shutil.rmtree(vdir)
            m("旧目录已清空")
        inner = _install_repo_venv_fresh(backend_root)
        return {
            "message_lines": message_lines + inner["message_lines"],
            "pip_lines": inner["pip_lines"],
            "done": inner["done"],
        }
    except OSError as e:
        m(f"venv 安装异常: {e}")
        return {
            "message_lines": message_lines,
            "pip_lines": [],
            "done": {"success": False, "venv_rebuilt": False, "reason": str(e)},
        }


def ensure_repo_venv_installed(backend_root: Path) -> dict[str, Any]:
    """仅在缺省时创建 venv；不删除健康目录。"""
    message_lines: list[str] = []

    def m(msg: str) -> None:
        message_lines.append(_log_line(msg))

    if has_repo_venv(backend_root):
        m("backend/venv 已就绪（跳过创建）")
        return {
            "message_lines": message_lines,
            "pip_lines": [],
            "done": {"success": True, "venv_installed": False},
        }

    req = backend_root / "requirements.txt"
    if not req.exists():
        m(f"缺少 requirements.txt：无法按需创建 venv")
        return {
            "message_lines": message_lines,
            "pip_lines": [],
            "done": {"success": True, "venv_installed": False, "reason": "no_requirements"},
        }

    if running_from_repo_venv(backend_root):
        sp = (
            write_rebuild_venv_script_windows(backend_root)
            if sys.platform == "win32"
            else write_rebuild_venv_script_unix(backend_root)
        )
        m("需在退出应用后离线重建（已写脚本）：")
        m(f"{sp}")
        return {
            "message_lines": message_lines,
            "pip_lines": [],
            "done": {
                "success": True,
                "venv_installed": False,
                "venv_deferred": True,
                "script_path": str(sp),
                "reason": "running_inside_repo_venv",
            },
        }

    vdir = backend_root / "venv"
    try:
        if vdir.exists():
            m("检测到不完整或未就绪的 backend/venv，清理后重装…")
            shutil.rmtree(vdir)
        inner = _install_repo_venv_fresh(backend_root)
        return {
            "message_lines": message_lines + inner["message_lines"],
            "pip_lines": inner["pip_lines"],
            "done": inner["done"],
        }
    except OSError as e:
        m(str(e))
        return {
            "message_lines": message_lines,
            "pip_lines": [],
            "done": {"success": False, "venv_installed": False, "reason": str(e)},
        }


def run_warning_autofix_bundle(
    backend_root: Path,
    data_dir: Path,
    config_file: Path,
    templates_dir: Path,
    history_dir: Path,
    default_config: dict,
) -> dict[str, Any]:
    logs: list[str] = []
    skipped: list[dict[str, str]] = []

    logs.append(_log_line("══ 一键尽力消除当前列表中的告警项 ══"))
    fx = apply_safe_fixes(
        ["ensure_directories", "write_default_config"],
        data_dir,
        config_file,
        templates_dir,
        history_dir,
        default_config,
    )
    logs.extend(fx.get("logs") or [])

    if not is_packaged_runtime():
        logs.append(_log_line("══ 按需安装 backend/venv ══"))
        vin = ensure_repo_venv_installed(backend_root)
        logs.extend(vin["message_lines"])
        logs.extend(vin["pip_lines"])
    else:
        vin = {"done": {"success": True, "venv_installed": False, "reason": "packaged_runtime"}}
        logs.append(_log_line("安装版内置后端：跳过 backend/venv 安装"))

    logs.append(_log_line("══ 仅能通过人工/系统层面处理的项 ══"))
    if not is_packaged_runtime() and (sys.version_info.major, sys.version_info.minor) < _MIN_SUPPORTED_PYTHON:
        skipped.append(
            {
                "id": "python_version",
                "hint": (
                    f"须安装 Python {_MIN_SUPPORTED_PYTHON[0]}.{_MIN_SUPPORTED_PYTHON[1]}+ "
                    "并用该解释器重建 backend/venv 后重启 Electron/uvicorn；运行中进程无法在内存内替换解释器。"
                ),
            }
        )
        logs.append(
            _log_line(
                f"⚠ 运行进程 Python 低于 {_MIN_SUPPORTED_PYTHON[0]}.{_MIN_SUPPORTED_PYTHON[1]}，"
                "须换新版解释器并重建 venv 后告警才会消除"
            )
        )

    if not is_packaged_runtime():
        npm = _which("npm") or _which("npm.cmd")
        if not npm:
            skipped.append({"id": "npm", "hint": "请在机器安装 Node.js LTS 或将 npm 加入 PATH。"})
            logs.append(_log_line("⚠ PATH 中无 npm"))

    vd = vin.get("done") or {}
    if not is_packaged_runtime() and vd.get("venv_deferred"):
        skipped.append(
            {"id": "venv", "hint": str(vd.get("script_path") or "请先退出再用离线脚本重装 venv")}
        )

    err = []
    err.extend(list(fx.get("errors") or []))
    if vd.get("success") is False:
        err.append(str(vd.get("reason") or "venv_step_failed"))

    return {
        "logs": logs,
        "skipped": skipped,
        "applied": fx.get("applied") or [],
        "errors": err,
        "venv_result": vd,
    }


def confirm_backend_via_data_beacon(data_dir: Path, port: int) -> tuple[bool, str]:
    """data 目录信标 + 监听 PID 对齐：不依赖 /health 是否在本次窗口内返回。"""
    fp = beacon_file_path(data_dir)
    if not fp.is_file():
        return False, ""
    try:
        raw = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, ValueError, TypeError):
        return False, ""
    if raw.get("magic") != BACKEND_BEACON_MAGIC:
        return False, ""
    title = raw.get("title")
    if title not in (None, "SD_SMA_ReportEditor"):
        return False, ""
    try:
        bid = int(raw["pid"])
    except (KeyError, TypeError, ValueError):
        return False, ""
    hint = raw.get("listen_port_hint")
    if hint is not None:
        try:
            if int(hint) != port:
                return False, ""
        except (TypeError, ValueError):
            pass
    pinfo = port_listener_info(port)
    if bid not in pinfo["pids"]:
        return False, ""
    ver = raw.get("api_version", "?")
    return (
        True,
        f"已通过 data 目录运行时信标确认 SD_SMA 后端（PID={bid}，api_version={ver!r}）",
    )


def _collect_dev_toolchain_checks(backend_root: Path) -> list[dict[str, Any]]:
    """仅开发/源码运行：venv、npm、解释器版本。"""
    checks: list[dict[str, Any]] = []

    py_row = _python_version_diag_row()
    checks.append(
        {
            "id": "python_version",
            "label": "Python 版本",
            "status": py_row["status"],
            "detail": py_row["detail"],
            "fixable": False,
        }
    )

    venv_ix = _repo_venv_python_paths(backend_root)
    has_v = bool(venv_ix)
    checks.append(
        {
            "id": "venv",
            "label": "后端虚拟环境 backend/venv",
            "status": "ok" if has_v else "warn",
            "detail": (str(venv_ix[0]) if has_v else "未检测到可用 venv，可在下方点「一键尽力消除告警」"),
            "fixable": True,
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
    return checks


def _collect_packaged_runtime_checks() -> list[dict[str, Any]]:
    """Electron 安装版内置 report_backend：不检查仓库 venv / npm。"""
    exe = Path(sys.executable)
    try:
        exe_s = str(exe.resolve())
    except OSError:
        exe_s = str(exe)
    py_row = _python_version_diag_row()
    checks: list[dict[str, Any]] = [
        {
            "id": "deployment_mode",
            "label": "运行模式",
            "status": "ok",
            "detail": packaged_runtime_detail(),
            "fixable": False,
        },
        {
            "id": "bundled_backend",
            "label": "内置后端",
            "status": "ok",
            "detail": f"{exe_s}（内置 Python {py_row['detail']}）",
            "fixable": False,
        },
    ]
    return checks


def collect_checks(
    data_dir: Path,
    config_file: Path,
    backend_root: Path,
    templates_dir: Path,
    history_dir: Path,
) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    packaged = is_packaged_runtime()

    if packaged:
        checks.extend(_collect_packaged_runtime_checks())
    else:
        checks.extend(_collect_dev_toolchain_checks(backend_root))

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

    listens8000 = _try_connect("127.0.0.1", 8000)
    if listens8000:
        ok_hp, hp_detail = probe_report_editor_health_quick(8000)
        ok_bc, bc_detail = confirm_backend_via_data_beacon(data_dir, 8000)
        if ok_hp:
            checks.append(
                {
                    "id": "port_8000",
                    "label": "端口 8000（后端 HTTP）",
                    "status": "ok",
                    "detail": hp_detail,
                    "fixable": False,
                }
            )
        elif ok_bc:
            extras = hp_detail.strip() if hp_detail else "本次未取得 /health 有效响应"
            checks.append(
                {
                    "id": "port_8000",
                    "label": "端口 8000（后端 HTTP）",
                    "status": "ok",
                    "detail": (
                        f"{bc_detail}；已用运行时信标确认进程；"
                        f"HTTP /health：{extras}"
                    ),
                    "fixable": False,
                }
            )
        else:
            pinfo = port_listener_info(8000)
            pidtxt = ",".join(str(p) for p in pinfo["pids"]) or "未知"
            checks.append(
                {
                    "id": "port_8000",
                    "label": "端口 8000（后端 HTTP）",
                    "status": "warn",
                    "detail": f"{hp_detail}（推断监听 PID：{pidtxt}）",
                    "fixable": False,
                }
            )
    else:
        checks.append(
            {
                "id": "port_8000",
                "label": "端口 8000（后端 HTTP）",
                "status": "warn",
                "detail": "8000 无监听：若需使用本编辑器请先启动后端（uvicorn 或 Electron 拉起）。",
                "fixable": False,
            }
        )

    listens5173 = _try_connect("127.0.0.1", 5173)
    if packaged:
        vite_detail = (
            "5173 有监听（本机另有前端开发服务，与安装版无关）。"
            if listens5173
            else "安装版使用内置静态前端，无需 Vite 开发服务。"
        )
        vite_label = "前端开发服务（Vite，可选）"
    else:
        vite_detail = (
            "5173 有监听（通常为本地 npm run dev / Vite）。"
            if listens5173
            else "5173 未监听——Electron 打包运行或仅桌面壳时通常不需 Vite。"
        )
        vite_label = "端口 5173（Vite）"
    checks.append(
        {
            "id": "port_5173",
            "label": vite_label,
            "status": "ok",
            "detail": vite_detail,
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
    logs: list[str] = []

    def slog(text: str) -> None:
        logs.append(_log_line(text))

    slog("安全修复：开始执行")
    for action in actions:
        if action == "ensure_directories":
            try:
                slog(f"ensure_directories → 创建/校验目录: {data_dir}, {templates_dir}, {history_dir}")
                for d in (data_dir, templates_dir, history_dir):
                    d.mkdir(parents=True, exist_ok=True)
                    slog(f"  目录就绪: {d}")
                applied.append(action)
                slog(f"ensure_directories → 完成")
            except OSError as e:
                msg = f"{action}: {e}"
                errors.append(msg)
                slog(msg)
        elif action == "write_default_config":
            try:
                slog("write_default_config → 校验数据目录与 config.json")
                data_dir.mkdir(parents=True, exist_ok=True)
                if not config_file.exists():
                    config_file.write_text(
                        json.dumps(default_config, ensure_ascii=False, indent=2),
                        encoding="utf-8",
                    )
                    applied.append(action)
                    slog(f"已写入默认配置: {config_file}")
                else:
                    applied.append(f"{action}:skipped_exists")
                    slog("config.json 已存在，跳过覆盖（仍为安全策略）")
            except OSError as e:
                msg = f"{action}: {e}"
                errors.append(msg)
                slog(msg)
        else:
            msg = f"未知修复动作: {action}"
            errors.append(msg)
            slog(msg)

    slog("安全修复：结束（未结束任何占用端口的进程）")
    return {"applied": applied, "errors": errors, "logs": logs}


def iter_environment_repair_stream(
    backend_root: Path,
    data_dir: Path,
    config_file: Path,
    templates_dir: Path,
    history_dir: Path,
    default_config: dict,
    safe_actions: list[str] | None = None,
) -> Iterator[str]:
    """
    NDJSON 流：先输出端口诊断与日志，再执行安全修复，最后在可行时重建 backend/venv 并 pip install。
    每行一个 JSON 对象：{"event":"log","line":...} 或 {"event":"done",...} 等。
    """

    def pack(obj: dict[str, Any]) -> str:
        return json.dumps(obj, ensure_ascii=False) + "\n"

    def elog(msg: str) -> str:
        return pack({"event": "log", "line": _log_line(msg)})

    actions = safe_actions or ["ensure_directories", "write_default_config"]

    yield elog("══ 端口诊断（仅查看，不会「释放」或结束其它进程）══")
    for port in (8000, 5173):
        info = port_listener_info(port)
        label = "有进程在监听" if info["listening"] else "本机尝试连接未成功（可能无监听）"
        pids = info.get("pids") or []
        yield elog(f"端口 {port}：{label}。推断 PID: {', '.join(str(p) for p in pids) or '未知'}")
        for raw in info.get("raw_lines") or []:
            yield elog(f"  {raw[:240]}")

    yield elog("══ 安全修复（创建目录、缺省 config 等）══")
    fix_res = apply_safe_fixes(actions, data_dir, config_file, templates_dir, history_dir, default_config)
    for line in fix_res.get("logs") or []:
        yield pack({"event": "log", "line": line})
    yield pack({"event": "safe_fix", "result": {"applied": fix_res["applied"], "errors": fix_res["errors"]}})

    if is_packaged_runtime():
        yield elog("安装版内置后端：跳过 backend/venv 重建")
        yield pack({"event": "done", "success": True, "venv_rebuilt": False, "reason": "packaged_runtime"})
    else:
        yield elog("══ Python 虚拟环境（backend/venv），此处为强制重装 ══")
        fout = force_repo_venv_reinstall(backend_root)
        for ln in fout["message_lines"]:
            yield pack({"event": "log", "line": ln})
        for pl in fout["pip_lines"]:
            yield pack({"event": "log", "line": pl})
        dn = fout["done"]
        if dn.get("venv_deferred"):
            yield pack(
                {
                    "event": "blocked",
                    "reason": str(dn.get("reason") or "venv_deferred"),
                    "script_path": dn.get("script_path"),
                }
            )
        yield pack({"event": "done", **dn})


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
