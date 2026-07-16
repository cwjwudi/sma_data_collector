from __future__ import annotations

import csv
import hashlib
import ipaddress
import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

import pymysql
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent.parent
AUTH_TOKEN_ENV = "SD_SMA_WEB_TOKEN"
AUTH_TOKEN_HEADER = "X-SD-SMA-Token"
AUTH_EXEMPT_PATHS = {"/api/health"}


def _is_loopback_host(host: str | None) -> bool:
    if not host:
        return False
    h = host.strip().lower()
    if h in ("localhost", "127.0.0.1", "::1", "[::1]"):
        return True
    try:
        return ipaddress.ip_address(h.strip("[]")).is_loopback
    except ValueError:
        return False


def _remote_token_ok(provided: str | None) -> bool:
    expected = (os.getenv(AUTH_TOKEN_ENV) or "").strip()
    if not expected or not provided or not provided.strip():
        return False
    return secrets.compare_digest(provided.strip(), expected)


def _resolve_config_dir() -> Path:
    raw = os.getenv("SD_SMA_DB_ADMIN_CONFIG_DIR")
    if not raw:
        return (BASE_DIR / "config").resolve()
    value = raw.replace("${DB_ADMIN_ROOT}", str(BASE_DIR))
    path = Path(os.path.expandvars(value))
    if not path.is_absolute():
        path = BASE_DIR / path
    return path.resolve()


CONFIG_DIR = _resolve_config_dir()
CONFIG_FILE = CONFIG_DIR / "default.json"
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9_]+$")


class DbConnection(BaseModel):
    engine: str = "mysql"
    host: str = "127.0.0.1"
    port: int = 3306
    database: str = ""
    username: str = ""
    password: str = ""
    sqlite_path: str = ""


class BackupRequest(BaseModel):
    connection: DbConnection
    database: str
    output_dir: str = ""


class TableRequest(BaseModel):
    connection: DbConnection
    database: str


class CsvExportRequest(BaseModel):
    connection: DbConnection
    database: str
    table: str
    output_dir: str = ""


class ConfirmationRequest(BaseModel):
    action: str
    database: str
    table: str = ""


class RestoreBackupRequest(BaseModel):
    connection: DbConnection
    database: str
    filename: str
    confirmation_token: str


class JobCancelled(RuntimeError):
    pass


def load_config() -> dict[str, Any]:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        return {}
    with CONFIG_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


def save_config(cfg: dict[str, Any]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    _atomic_json(CONFIG_FILE, cfg)


def _config_path(value: str | None, default: Path) -> Path:
    if not value:
        return default
    raw = value.replace("${DB_ADMIN_ROOT}", str(BASE_DIR)).replace("${CONFIG_DIR}", str(CONFIG_DIR))
    path = Path(os.path.expandvars(raw))
    if not path.is_absolute():
        path = CONFIG_DIR / path
    return path.resolve()


def backup_dir() -> Path:
    cfg = load_config()
    path = _config_path(str(cfg.get("backup_dir") or "backups"), CONFIG_DIR / "backups")
    path.mkdir(parents=True, exist_ok=True)
    return path


def last_output_dir() -> Path | None:
    cfg = load_config()
    raw = str(cfg.get("last_output_dir") or "").strip()
    if not raw:
        return None
    path = _config_path(raw, backup_dir())
    return path if path.is_dir() else None


def persist_last_output_dir(path: Path) -> None:
    resolved = path.resolve()
    if not resolved.is_dir():
        return
    cfg = load_config()
    if str(cfg.get("last_output_dir") or "") == str(resolved):
        return
    cfg["last_output_dir"] = str(resolved)
    save_config(cfg)


def backup_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()
    for candidate in (backup_dir(), last_output_dir()):
        if candidate is None:
            continue
        key = str(candidate.resolve())
        if key in seen or not candidate.is_dir():
            continue
        seen.add(key)
        roots.append(candidate.resolve())
    return roots


def resolve_output_dir(value: str | None) -> Path:
    raw = (value or "").strip()
    if not raw:
        return backup_dir()
    raw = raw.replace("${DB_ADMIN_ROOT}", str(BASE_DIR)).replace("${CONFIG_DIR}", str(CONFIG_DIR))
    path = Path(os.path.expandvars(raw))
    if not path.is_absolute():
        path = CONFIG_DIR / path
    path = path.resolve()
    path.mkdir(parents=True, exist_ok=True)
    if not path.is_dir():
        raise ValueError(f"Output directory is not available: {path}")
    return path


_TOOL_ALIASES: dict[str, tuple[str, ...]] = {
    "mysqldump": ("mysqldump.exe", "mariadb-dump.exe", "mysqldump", "mariadb-dump"),
    "mysql": ("mysql.exe", "mariadb.exe", "mysql", "mariadb"),
}


def _tool_not_found_message(name: str) -> str:
    return (
        f"找不到 MySQL/MariaDB 客户端工具: {name}。"
        "请在 mysql_tools 中配置绝对路径，或将客户端加入 PATH，或使用项目 _tools。"
    )


def resolve_mysql_tool(name: str) -> str:
    cfg = load_config()
    tools = cfg.get("mysql_tools") if isinstance(cfg.get("mysql_tools"), dict) else {}
    configured = str(tools.get(name) or "").strip()
    aliases = _TOOL_ALIASES.get(name, (name, f"{name}.exe"))

    if configured:
        configured_path = Path(os.path.expandvars(configured))
        if configured_path.is_file():
            return str(configured_path.resolve())
        # Bare command name in config: resolve via PATH / aliases below.
        if Path(configured).name == configured:
            which_hit = shutil.which(configured)
            if which_hit:
                return which_hit
            for alias in aliases:
                which_hit = shutil.which(alias)
                if which_hit:
                    return which_hit

    for alias in aliases:
        which_hit = shutil.which(alias)
        if which_hit:
            return which_hit

    tools_root = BASE_DIR / "_tools"
    if tools_root.is_dir():
        for alias in aliases:
            matches = sorted(tools_root.rglob(alias))
            for match in matches:
                if match.is_file():
                    return str(match.resolve())

    raise FileNotFoundError(_tool_not_found_message(name))


def mysql_tool(name: str) -> str:
    """Resolve a MySQL/MariaDB client tool; raises FileNotFoundError with a clear message."""
    return resolve_mysql_tool(name)


def mysql_dump_client_is_mariadb(tool_path: str) -> bool:
    try:
        completed = subprocess.run(
            [tool_path, "--version"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    text = f"{completed.stdout or ''}{completed.stderr or ''}"
    return "MariaDB" in text


def default_connection() -> dict[str, Any]:
    cfg = load_config()
    conn = cfg.get("default_connection") if isinstance(cfg.get("default_connection"), dict) else {}
    base = DbConnection().model_dump()
    base.update(conn)
    return base


def _folder_dialog_initial(initial_dir: str | None = None) -> Path:
    raw = (initial_dir or "").strip()
    if not raw:
        return last_output_dir() or backup_dir()
    raw = raw.replace("${DB_ADMIN_ROOT}", str(BASE_DIR)).replace("${CONFIG_DIR}", str(CONFIG_DIR))
    path = Path(os.path.expandvars(raw))
    if not path.is_absolute():
        path = CONFIG_DIR / path
    try:
        path = path.resolve()
    except OSError:
        return last_output_dir() or backup_dir()
    if path.is_dir():
        return path
    if path.parent.is_dir():
        return path.parent
    return last_output_dir() or backup_dir()


def choose_folder_dialog(initial_dir: str | None = None) -> str:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Folder picker is not available: {exc}") from exc

    initial = _folder_dialog_initial(initial_dir)
    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        selected = filedialog.askdirectory(
            initialdir=str(initial),
            title="选择导出文件夹",
            mustexist=True,
        )
    finally:
        root.destroy()
    return str(Path(selected).resolve()) if selected else ""

def safe_identifier(value: str, label: str) -> str:
    text = (value or "").strip()
    if not SAFE_NAME_RE.match(text):
        raise ValueError(f"{label} can only contain letters, digits, and underscores: {value!r}")
    return text


def quote_ident(value: str) -> str:
    return f"`{safe_identifier(value, 'identifier')}`"


def connect_mysql(conn: DbConnection, database: str | None = None, *, autocommit: bool = True):
    return pymysql.connect(
        host=conn.host or "127.0.0.1",
        port=int(conn.port or 3306),
        user=conn.username or "",
        password=conn.password or "",
        database=database or conn.database or None,
        charset="utf8mb4",
        autocommit=autocommit,
        connect_timeout=10,
        read_timeout=3600,
        write_timeout=3600,
    )


def list_mysql_databases(conn: DbConnection) -> list[dict[str, Any]]:
    hidden = ("information_schema", "performance_schema", "mysql", "sys")
    with connect_mysql(conn) as db:
        with db.cursor() as cur:
            cur.execute(
                "SELECT table_schema, COALESCE(SUM(data_length + index_length), 0) "
                "FROM information_schema.tables "
                "WHERE table_schema NOT IN (%s, %s, %s, %s) "
                "GROUP BY table_schema "
                "ORDER BY table_schema",
                hidden,
            )
            sized = {
                str(row[0]): int(row[1] or 0)
                for row in cur.fetchall()
                if row and row[0] is not None
            }
            cur.execute("SHOW DATABASES")
            names = [str(row[0]) for row in cur.fetchall() if row and row[0] is not None]
    return [
        {"name": name, "size_bytes": sized.get(name, 0)}
        for name in names
        if name not in set(hidden)
    ]


def list_mysql_tables(conn: DbConnection, database: str) -> list[dict[str, Any]]:
    dbname = safe_identifier(database, "database")
    with connect_mysql(conn) as db:
        with db.cursor() as cur:
            cur.execute(
                "SELECT table_name, COALESCE(data_length + index_length, 0) "
                "FROM information_schema.tables "
                "WHERE table_schema=%s AND table_type='BASE TABLE' "
                "ORDER BY table_name",
                (dbname,),
            )
            rows = cur.fetchall()
    return [{"name": str(row[0]), "size_bytes": int(row[1] or 0)} for row in rows if row and row[0] is not None]


def ensure_mysql_connection(conn: DbConnection) -> dict[str, Any]:
    with connect_mysql(conn) as db:
        with db.cursor() as cur:
            cur.execute("SELECT VERSION()")
            version = str(cur.fetchone()[0])
    return {"ok": True, "engine": "mysql", "version": version}


def ensure_sqlite_connection(path: str) -> dict[str, Any]:
    if not path:
        raise ValueError("sqlite_path is required")
    with sqlite3.connect(path) as db:
        db.execute("SELECT 1")
    return {"ok": True, "engine": "sqlite", "path": path}


_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()
MAX_FINISHED_JOBS = 200
MAX_JOB_LOG_LINES = 1000
_confirmations: dict[str, dict[str, Any]] = {}
_confirmations_lock = threading.Lock()
CONFIRMATION_TTL_SECONDS = 120


def _prune_finished_jobs_locked() -> None:
    finished = [job_id for job_id, job in _jobs.items() if job.get("status") != "running"]
    overflow = len(finished) - MAX_FINISHED_JOBS
    if overflow <= 0:
        return
    finished.sort(key=lambda job_id: str(_jobs[job_id].get("created_at", "")))
    for job_id in finished[:overflow]:
        _jobs.pop(job_id, None)


def append_job_log(job_id: str, message: str) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        stamp = datetime.now().strftime("%H:%M:%S")
        logs = job.setdefault("logs", [])
        logs.append(f"[{stamp}] {message}")
        if len(logs) > MAX_JOB_LOG_LINES:
            del logs[: len(logs) - MAX_JOB_LOG_LINES]


def update_job(job_id: str, **updates: Any) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job:
            updates.setdefault("updated_at", datetime.now().isoformat(timespec="seconds"))
            job.update(updates)


def set_job_progress(job_id: str, progress: int, phase: str | None = None) -> None:
    updates: dict[str, Any] = {"progress": max(0, min(100, int(progress)))}
    if phase is not None:
        updates["phase"] = phase
    update_job(job_id, **updates)


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    public = {k: v for k, v in job.items() if not k.startswith("_")}
    started = float(job.get("_started_monotonic") or time.monotonic())
    stopped = float(job.get("_finished_monotonic") or time.monotonic())
    elapsed = max(0.0, stopped - started)
    progress = int(public.get("progress") or 0)
    public["elapsed_seconds"] = round(elapsed, 1)
    public["eta_seconds"] = None
    if public.get("status") == "running" and 0 < progress < 100:
        public["eta_seconds"] = round((elapsed / progress) * (100 - progress), 1)
    return public


def issue_confirmation(action: str, database: str, table: str = "") -> str:
    action_name = (action or "").strip().lower()
    if action_name not in {"restore-sql", "restore-backup", "import-csv"}:
        raise ValueError("Unsupported confirmation action")
    database_name = safe_identifier(database, "database")
    table_name = safe_identifier(table, "table") if table else ""
    if action_name == "import-csv" and not table_name:
        raise ValueError("table is required for CSV import confirmation")
    token = secrets.token_urlsafe(32)
    now = time.monotonic()
    with _confirmations_lock:
        expired = [key for key, item in _confirmations.items() if float(item["expires_at"]) <= now]
        for key in expired:
            _confirmations.pop(key, None)
        _confirmations[token] = {
            "action": action_name,
            "database": database_name,
            "table": table_name,
            "expires_at": now + CONFIRMATION_TTL_SECONDS,
        }
    return token


def consume_confirmation(token: str, action: str, database: str, table: str = "") -> None:
    with _confirmations_lock:
        item = _confirmations.pop((token or "").strip(), None)
    if not item or float(item["expires_at"]) <= time.monotonic():
        raise HTTPException(400, "Confirmation token is invalid, expired, or already used")
    expected = (action, safe_identifier(database, "database"), safe_identifier(table, "table") if table else "")
    actual = (item["action"], item["database"], item["table"])
    if actual != expected:
        raise HTTPException(400, "Confirmation token does not match this operation")


def start_job(title: str, target, *args: Any) -> dict[str, Any]:
    job_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="seconds")
    with _jobs_lock:
        cfg = load_config()
        max_running = max(1, int(cfg.get("max_concurrent_jobs") or 2))
        running = sum(1 for job in _jobs.values() if job.get("status") == "running")
        if running >= max_running:
            raise HTTPException(429, f"Too many running jobs (limit={max_running})")
        _jobs[job_id] = {
            "id": job_id,
            "title": title,
            "status": "running",
            "progress": 0,
            "phase": "starting",
            "created_at": now,
            "updated_at": now,
            "logs": [],
            "result": None,
            "_started_monotonic": time.monotonic(),
            "_cancel_event": threading.Event(),
        }
        _prune_finished_jobs_locked()

    def runner() -> None:
        try:
            append_job_log(job_id, "Job started")
            result = target(job_id, *args)
            update_job(
                job_id,
                status="done",
                progress=100,
                phase="done",
                result=result,
                _finished_monotonic=time.monotonic(),
            )
            append_job_log(job_id, "Job finished")
        except JobCancelled as exc:
            append_job_log(job_id, f"CANCELLED: {exc}")
            update_job(
                job_id,
                status="cancelled",
                phase="cancelled",
                error=str(exc),
                _finished_monotonic=time.monotonic(),
            )
        except Exception as exc:  # noqa: BLE001
            append_job_log(job_id, f"ERROR: {exc}")
            update_job(
                job_id,
                status="failed",
                phase="failed",
                error=str(exc),
                _finished_monotonic=time.monotonic(),
            )

    thread = threading.Thread(target=runner, name=f"db-admin-job-{job_id[:8]}", daemon=True)
    thread.start()
    return _public_job(_jobs[job_id])


def _job_cancel_event(job_id: str) -> threading.Event | None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        event = job.get("_cancel_event") if job else None
    return event if isinstance(event, threading.Event) else None


def _raise_if_cancelled(job_id: str) -> None:
    event = _job_cancel_event(job_id)
    if event and event.is_set():
        raise JobCancelled("Job cancellation was requested")


def _cli_progress_mapper(
    job_id: str,
    *,
    phase: str,
    start: int,
    end: int,
) -> Callable[[float], None]:
    last = [-1]

    def hook(fraction: float) -> None:
        clamped = max(0.0, min(1.0, float(fraction)))
        value = start + int(clamped * (end - start))
        value = max(start, min(end, value))
        if value != last[0]:
            last[0] = value
            set_job_progress(job_id, value, phase)

    return hook


def run_cli(
    cmd: list[str],
    *,
    env: dict[str, str],
    stdin_path: Path | None = None,
    stdout_path: Path | None = None,
    timeout_seconds: int | None = None,
    cancel_event: threading.Event | None = None,
    progress_hook: Callable[[float], None] | None = None,
    progress_total_bytes: int | None = None,
) -> None:
    feed_stdin = stdin_path is not None and progress_hook is not None
    stdin_file = None if feed_stdin else (stdin_path.open("rb") if stdin_path else None)
    stdout_file = stdout_path.open("wb") if stdout_path else subprocess.PIPE
    process: subprocess.Popen[bytes] | None = None
    stop_helpers = threading.Event()
    helper_threads: list[threading.Thread] = []
    feed_error: list[BaseException] = []
    stderr = b""

    def _stdout_monitor() -> None:
        total = max(1, int(progress_total_bytes or 0))
        while not stop_helpers.is_set():
            try:
                size = stdout_path.stat().st_size if stdout_path and stdout_path.is_file() else 0
                if progress_hook:
                    progress_hook(min(0.99, size / total))
            except OSError:
                pass
            stop_helpers.wait(0.5)

    def _stdin_feeder(proc: subprocess.Popen[bytes]) -> None:
        assert stdin_path is not None and progress_hook is not None and proc.stdin is not None
        try:
            total = int(progress_total_bytes or 0)
            if total <= 0:
                try:
                    total = max(1, stdin_path.stat().st_size)
                except OSError:
                    total = 1
            sent = 0
            with stdin_path.open("rb") as src:
                while not stop_helpers.is_set():
                    if cancel_event is not None and cancel_event.is_set():
                        break
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    proc.stdin.write(chunk)
                    sent += len(chunk)
                    progress_hook(min(1.0, sent / total))
            try:
                proc.stdin.close()
            except OSError:
                pass
        except BrokenPipeError:
            pass
        except BaseException as exc:  # noqa: BLE001
            feed_error.append(exc)
            try:
                if proc.stdin:
                    proc.stdin.close()
            except OSError:
                pass

    try:
        try:
            process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE if feed_stdin else stdin_file,
                stdout=stdout_file,
                stderr=subprocess.PIPE,
                env=env,
            )
        except FileNotFoundError as exc:
            tool = Path(str(cmd[0])).name if cmd else "mysql"
            logical = (
                "mysqldump"
                if "dump" in tool.lower()
                else ("mysql" if "mysql" in tool.lower() or "mariadb" in tool.lower() else tool)
            )
            raise FileNotFoundError(_tool_not_found_message(logical)) from exc

        if feed_stdin:
            feeder = threading.Thread(target=_stdin_feeder, args=(process,), daemon=True)
            helper_threads.append(feeder)
            feeder.start()
        elif stdout_path is not None and progress_hook is not None and int(progress_total_bytes or 0) > 0:
            monitor = threading.Thread(target=_stdout_monitor, daemon=True)
            helper_threads.append(monitor)
            monitor.start()

        deadline = time.monotonic() + timeout_seconds if timeout_seconds else None
        while True:
            try:
                _, stderr = process.communicate(timeout=0.5)
                break
            except subprocess.TimeoutExpired:
                cancelled = cancel_event is not None and cancel_event.is_set()
                timed_out = deadline is not None and time.monotonic() >= deadline
                if not cancelled and not timed_out:
                    continue
                stop_helpers.set()
                process.terminate()
                try:
                    _, stderr = process.communicate(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    _, stderr = process.communicate()
                if cancelled:
                    raise JobCancelled("External database command was cancelled")
                raise TimeoutError(f"External database command exceeded timeout_seconds={timeout_seconds}")
    finally:
        stop_helpers.set()
        for thread in helper_threads:
            thread.join(timeout=5)
        if stdin_file:
            stdin_file.close()
        if stdout_path and stdout_file:
            stdout_file.close()
    if feed_error:
        raise feed_error[0]
    if process is None:
        raise RuntimeError("External database command failed to start")
    if progress_hook is not None:
        progress_hook(1.0)
    if process.returncode != 0:
        err = (stderr or b"").decode("utf-8", errors="replace").strip()
        raise RuntimeError(err or f"Command failed with code {process.returncode}")


def _sha256_file(
    path: Path,
    chunk_size: int = 8 * 1024 * 1024,
    progress_hook: Callable[[float], None] | None = None,
) -> str:
    digest = hashlib.sha256()
    total = path.stat().st_size if path.is_file() else 0
    done = 0
    with path.open("rb") as file:
        while chunk := file.read(chunk_size):
            digest.update(chunk)
            done += len(chunk)
            if progress_hook and total > 0:
                progress_hook(min(1.0, done / total))
    if progress_hook:
        progress_hook(1.0)
    return digest.hexdigest()


def _database_storage_bytes(conn: DbConnection, database: str) -> int:
    with connect_mysql(conn) as db:
        with db.cursor() as cur:
            cur.execute(
                "SELECT COALESCE(SUM(data_length + index_length), 0) "
                "FROM information_schema.tables WHERE table_schema=%s",
                (database,),
            )
            return int(cur.fetchone()[0] or 0)


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    temp = path.with_suffix(path.suffix + ".partial")
    try:
        with temp.open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
            file.flush()
            os.fsync(file.fileno())
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def backup_mysql_job(job_id: str, conn: DbConnection, database: str, output_dir: str = "") -> dict[str, Any]:
    dbname = safe_identifier(database, "database")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    out = resolve_output_dir(output_dir) / f"{dbname}_backup_{stamp}.sql"
    partial = out.with_suffix(out.suffix + ".partial")
    estimated_bytes = _database_storage_bytes(conn, dbname)
    reserve_factor = float(load_config().get("backup_free_space_factor") or 1.5)
    required_bytes = max(64 * 1024 * 1024, int(estimated_bytes * reserve_factor))
    free_bytes = shutil.disk_usage(out.parent).free
    if free_bytes < required_bytes:
        raise RuntimeError(
            f"Insufficient disk space: free={free_bytes}, required={required_bytes}, estimated_database={estimated_bytes}"
        )
    dump_tool = resolve_mysql_tool("mysqldump")
    append_job_log(job_id, f"Running mysqldump for database {dbname}")
    append_job_log(job_id, f"Estimated database bytes: {estimated_bytes}; free bytes: {free_bytes}")
    set_job_progress(job_id, 5, "dumping")
    env = os.environ.copy()
    env["MYSQL_PWD"] = conn.password or ""
    cmd = [
        dump_tool,
        "--host",
        conn.host or "127.0.0.1",
        "--port",
        str(int(conn.port or 3306)),
        "--user",
        conn.username or "",
        "--default-character-set=utf8mb4",
        "--single-transaction",
        "--routines",
        "--events",
        "--triggers",
    ]
    if not mysql_dump_client_is_mariadb(dump_tool):
        cmd.append("--column-statistics=0")
    cmd.append(dbname)
    timeout_seconds = max(60, int(load_config().get("cli_timeout_seconds") or 86400))
    started_at = datetime.now().isoformat(timespec="seconds")
    dump_total = max(estimated_bytes, 1)
    try:
        run_cli(
            cmd,
            env=env,
            stdout_path=partial,
            timeout_seconds=timeout_seconds,
            cancel_event=_job_cancel_event(job_id),
            progress_hook=_cli_progress_mapper(job_id, phase="dumping", start=5, end=90),
            progress_total_bytes=dump_total,
        )
        if not partial.is_file() or partial.stat().st_size == 0:
            raise RuntimeError("mysqldump produced an empty backup")
        set_job_progress(job_id, 90, "checksumming")
        sha256 = _sha256_file(
            partial,
            progress_hook=_cli_progress_mapper(job_id, phase="checksumming", start=90, end=95),
        )
        size_bytes = partial.stat().st_size
        partial.replace(out)
        manifest = {
            "format_version": 1,
            "status": "complete",
            "database": dbname,
            "filename": out.name,
            "size_bytes": size_bytes,
            "sha256": sha256,
            "estimated_database_bytes": estimated_bytes,
            "started_at": started_at,
            "completed_at": datetime.now().isoformat(timespec="seconds"),
        }
        manifest_path = out.with_suffix(out.suffix + ".manifest.json")
        _atomic_json(manifest_path, manifest)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
    persist_last_output_dir(out.parent)
    append_job_log(job_id, f"Backup file: {out}")
    return {
        "filename": out.name,
        "path": str(out),
        "size_bytes": size_bytes,
        "sha256": sha256,
        "manifest": manifest_path.name,
        "download_url": f"/api/download/{out.name}",
    }


UPLOAD_TMP_PREFIX = "sd_sma_db_admin_"


def _cleanup_upload(path_value: str) -> None:
    """删除 _save_upload 创建的临时目录（仅识别本服务前缀，避免误删）。"""
    temp_dir = Path(path_value).parent
    if temp_dir.name.startswith(UPLOAD_TMP_PREFIX):
        shutil.rmtree(temp_dir, ignore_errors=True)


def restore_mysql_job(job_id: str, conn: DbConnection, database: str, sql_path: str) -> dict[str, Any]:
    try:
        dbname = safe_identifier(database, "database")
        source = Path(sql_path)
        if not source.is_file():
            raise FileNotFoundError(source)
        append_job_log(job_id, f"Restoring SQL into database {dbname}")
        set_job_progress(job_id, 5, "restoring")
        env = os.environ.copy()
        env["MYSQL_PWD"] = conn.password or ""
        cmd = [
            resolve_mysql_tool("mysql"),
            "--host",
            conn.host or "127.0.0.1",
            "--port",
            str(int(conn.port or 3306)),
            "--user",
            conn.username or "",
            "--default-character-set=utf8mb4",
            dbname,
        ]
        run_cli(
            cmd,
            env=env,
            stdin_path=source,
            cancel_event=_job_cancel_event(job_id),
            progress_hook=_cli_progress_mapper(job_id, phase="restoring", start=5, end=95),
            progress_total_bytes=source.stat().st_size,
        )
        set_job_progress(job_id, 95, "finalizing")
        append_job_log(job_id, f"Restored from: {source.name}")
        return {"source": source.name, "database": dbname}
    finally:
        _cleanup_upload(sql_path)


def _find_export_file(filename: str, *, suffixes: set[str]) -> Path | None:
    safe = Path(filename).name
    if safe != filename or Path(safe).suffix.lower() not in suffixes:
        return None
    best: Path | None = None
    best_mtime = -1.0
    for root in backup_roots():
        candidate = root / safe
        if not candidate.is_file():
            continue
        mtime = candidate.stat().st_mtime
        if mtime >= best_mtime:
            best = candidate
            best_mtime = mtime
    return best


def _completed_backup(filename: str) -> tuple[Path, dict[str, Any]]:
    safe = Path(filename).name
    if safe != filename or Path(safe).suffix.lower() != ".sql":
        raise ValueError("Invalid backup filename")
    path = _find_export_file(safe, suffixes={".sql"})
    if path is None:
        raise FileNotFoundError("Completed backup or manifest not found")
    manifest_path = path.with_suffix(path.suffix + ".manifest.json")
    if not path.is_file() or not manifest_path.is_file():
        raise FileNotFoundError("Completed backup or manifest not found")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or manifest.get("status") != "complete" or manifest.get("filename") != safe:
        raise ValueError("Backup manifest is invalid or incomplete")
    if int(manifest.get("size_bytes") or -1) != path.stat().st_size:
        raise ValueError("Backup size does not match manifest")
    return path, manifest


def restore_verified_backup_job(job_id: str, conn: DbConnection, database: str, filename: str) -> dict[str, Any]:
    source, manifest = _completed_backup(filename)
    append_job_log(job_id, f"Verifying SHA-256 for {source.name}")
    set_job_progress(job_id, 2, "verifying")
    actual_sha256 = _sha256_file(
        source,
        progress_hook=_cli_progress_mapper(job_id, phase="verifying", start=2, end=8),
    )
    if not secrets.compare_digest(actual_sha256, str(manifest.get("sha256") or "")):
        raise RuntimeError("Backup SHA-256 does not match manifest")
    dbname = safe_identifier(database, "database")
    append_job_log(job_id, f"Restoring verified backup into database {dbname}")
    set_job_progress(job_id, 8, "restoring")
    env = os.environ.copy()
    env["MYSQL_PWD"] = conn.password or ""
    cmd = [
        resolve_mysql_tool("mysql"),
        "--host",
        conn.host or "127.0.0.1",
        "--port",
        str(int(conn.port or 3306)),
        "--user",
        conn.username or "",
        "--default-character-set=utf8mb4",
        dbname,
    ]
    timeout_seconds = max(60, int(load_config().get("cli_timeout_seconds") or 86400))
    run_cli(
        cmd,
        env=env,
        stdin_path=source,
        timeout_seconds=timeout_seconds,
        cancel_event=_job_cancel_event(job_id),
        progress_hook=_cli_progress_mapper(job_id, phase="restoring", start=8, end=95),
        progress_total_bytes=source.stat().st_size,
    )
    set_job_progress(job_id, 95, "finalizing")
    return {"source": source.name, "database": dbname, "sha256": actual_sha256}


def export_csv_job(job_id: str, conn: DbConnection, database: str, table: str, output_dir: str = "") -> dict[str, Any]:
    dbname = safe_identifier(database, "database")
    table_name = safe_identifier(table, "table")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = resolve_output_dir(output_dir) / f"{dbname}_{table_name}_{stamp}.csv"
    append_job_log(job_id, f"Exporting {dbname}.{table_name} to CSV")
    rows = 0
    total_rows = 0
    with connect_mysql(conn, dbname) as count_db:
        with count_db.cursor() as count_cur:
            count_cur.execute(f"SELECT COUNT(*) FROM {quote_ident(table_name)}")
            total_rows = int(count_cur.fetchone()[0] or 0)
    set_job_progress(job_id, 5 if total_rows else 90, "exporting")
    next_progress = 7
    with pymysql.connect(
        host=conn.host or "127.0.0.1",
        port=int(conn.port or 3306),
        user=conn.username or "",
        password=conn.password or "",
        database=dbname,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.SSCursor,
    ) as db:
        with db.cursor() as cur, out.open("w", encoding="utf-8-sig", newline="") as f:
            cur.execute(f"SELECT * FROM {quote_ident(table_name)}")
            columns = [item[0] for item in cur.description or []]
            writer = csv.writer(f)
            writer.writerow(columns)
            while True:
                _raise_if_cancelled(job_id)
                batch = cur.fetchmany(1000)
                if not batch:
                    break
                writer.writerows(batch)
                rows += len(batch)
                if total_rows:
                    progress = 5 + int((rows / total_rows) * 90)
                    if progress >= next_progress:
                        set_job_progress(job_id, progress, "exporting")
                        next_progress = progress + 2
    set_job_progress(job_id, 95, "finalizing")
    persist_last_output_dir(out.parent)
    append_job_log(job_id, f"CSV file: {out}")
    return {"filename": out.name, "path": str(out), "rows": rows, "download_url": f"/api/download/{out.name}"}


def import_csv_job(job_id: str, conn: DbConnection, database: str, table: str, csv_path: str, truncate: bool) -> dict[str, Any]:
    try:
        dbname = safe_identifier(database, "database")
        table_name = safe_identifier(table, "table")
        source = Path(csv_path)
        if not source.is_file():
            raise FileNotFoundError(source)
        append_job_log(job_id, f"Importing CSV into {dbname}.{table_name}")
        try:
            with source.open("r", encoding="utf-8-sig", newline="") as counter:
                total_rows = max(sum(1 for _ in counter) - 1, 0)
        except OSError:
            total_rows = 0
        set_job_progress(job_id, 5 if total_rows else 50, "importing")
        next_progress = 7
        rows = 0
        with connect_mysql(conn, dbname, autocommit=False) as db:
            with db.cursor() as cur, source.open("r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                columns = reader.fieldnames or []
                if not columns:
                    raise ValueError("CSV header is empty")
                for col in columns:
                    safe_identifier(col, "csv column")
                if truncate:
                    append_job_log(job_id, "Deleting target rows transactionally before import")
                    cur.execute(f"DELETE FROM {quote_ident(table_name)}")
                cols = ", ".join(quote_ident(c) for c in columns)
                placeholders = ", ".join(["%s"] * len(columns))
                sql = f"INSERT INTO {quote_ident(table_name)} ({cols}) VALUES ({placeholders})"
                batch: list[tuple[Any, ...]] = []
                for row in reader:
                    _raise_if_cancelled(job_id)
                    batch.append(tuple(row.get(c, "") for c in columns))
                    if len(batch) >= 500:
                        cur.executemany(sql, batch)
                        rows += len(batch)
                        batch.clear()
                        if total_rows:
                            progress = 5 + int((rows / total_rows) * 90)
                            if progress >= next_progress:
                                set_job_progress(job_id, progress, "importing")
                                next_progress = progress + 2
                if batch:
                    cur.executemany(sql, batch)
                    rows += len(batch)
            db.commit()
        set_job_progress(job_id, 95, "finalizing")
        append_job_log(job_id, f"Imported rows: {rows}")
        return {"database": dbname, "table": table_name, "rows": rows}
    finally:
        _cleanup_upload(csv_path)


app = FastAPI(title="SD SMA DB Admin", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")


@app.middleware("http")
async def enforce_remote_token(request: Request, call_next):
    if request.url.path in AUTH_EXEMPT_PATHS:
        return await call_next(request)
    if request.method.upper() not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin:
            parsed = urlsplit(origin)
            origin_host = parsed.netloc.lower()
            request_host = (request.headers.get("host") or "").lower()
            if parsed.scheme not in {"http", "https"} or origin_host != request_host:
                return JSONResponse(status_code=403, content={"detail": "Cross-origin state-changing request is forbidden"})
    client_host = request.client.host if request.client else None
    if _is_loopback_host(client_host):
        return await call_next(request)
    if _remote_token_ok(request.headers.get(AUTH_TOKEN_HEADER)):
        return await call_next(request)
    return JSONResponse(
        status_code=403,
        content={"detail": f"非本机访问需在请求头 {AUTH_TOKEN_HEADER} 提供有效令牌（服务端环境变量 {AUTH_TOKEN_ENV}）"},
    )


@app.get("/")
def root() -> FileResponse:
    return FileResponse(BASE_DIR / "app" / "static" / "admin.html")


@app.get("/admin")
def admin_page() -> FileResponse:
    return FileResponse(BASE_DIR / "app" / "static" / "admin.html")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok"}


@app.get("/api/config")
def get_config() -> dict[str, Any]:
    cfg = load_config()
    connection = default_connection()
    connection.pop("password", None)
    remembered = last_output_dir()
    return {
        "default_connection": connection,
        "backup_dir": str(backup_dir()),
        "last_output_dir": str(remembered) if remembered else "",
        "mysql_tools": cfg.get("mysql_tools") or {},
        "max_upload_mb": int(cfg.get("max_upload_mb") or 512),
        "max_concurrent_jobs": max(1, int(cfg.get("max_concurrent_jobs") or 2)),
    }


@app.post("/api/folder-dialog")
def folder_dialog(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        selected = choose_folder_dialog(str(payload.get("initial_dir") or ""))
        if selected:
            persist_last_output_dir(Path(selected))
        return {"selected": selected}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/connect/test")
def test_connection(conn: DbConnection) -> dict[str, Any]:
    try:
        if (conn.engine or "mysql").lower() == "sqlite":
            return ensure_sqlite_connection(conn.sqlite_path)
        return ensure_mysql_connection(conn)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": str(exc)}


@app.post("/api/confirmations")
def create_confirmation(req: ConfirmationRequest) -> dict[str, Any]:
    try:
        token = issue_confirmation(req.action, req.database, req.table)
        return {"token": token, "expires_in_seconds": CONFIRMATION_TTL_SECONDS}
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/databases")
def databases(conn: DbConnection) -> dict[str, Any]:
    try:
        if (conn.engine or "mysql").lower() != "mysql":
            raise ValueError("Database list currently supports MySQL only")
        return {"databases": list_mysql_databases(conn)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/tables")
def tables(req: TableRequest) -> dict[str, Any]:
    try:
        return {"tables": list_mysql_tables(req.connection, req.database)}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, str(exc)) from exc


@app.post("/api/backup")
def create_backup(req: BackupRequest) -> dict[str, Any]:
    job = start_job(f"Backup {req.database}", backup_mysql_job, req.connection, req.database, req.output_dir)
    return {"job": job}


@app.post("/api/export-csv")
def export_csv(req: CsvExportRequest) -> dict[str, Any]:
    job = start_job(f"Export CSV {req.table}", export_csv_job, req.connection, req.database, req.table, req.output_dir)
    return {"job": job}


def _parse_connection_json(connection_json: str) -> DbConnection:
    try:
        data = json.loads(connection_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, "Invalid connection JSON") from exc
    if isinstance(data, dict) and "connection" in data:
        data = data["connection"]
    return DbConnection(**data)


def _save_upload(upload: UploadFile, suffix: str) -> str:
    temp_dir = Path(tempfile.mkdtemp(prefix=UPLOAD_TMP_PREFIX))
    filename = Path(upload.filename or f"upload{suffix}").name
    target = temp_dir / filename
    limit_mb = int(load_config().get("max_upload_mb") or 512)
    limit_bytes = max(1, limit_mb) * 1024 * 1024
    copied = 0
    try:
        with target.open("wb") as f:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                copied += len(chunk)
                if copied > limit_bytes:
                    raise HTTPException(413, f"Upload exceeds max_upload_mb={limit_mb}")
                f.write(chunk)
    except BaseException:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    return str(target)


@app.post("/api/restore-sql")
def restore_sql(
    connection_json: str = Form(...),
    database: str = Form(...),
    confirmation_token: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    consume_confirmation(confirmation_token, "restore-sql", database)
    conn = _parse_connection_json(connection_json)
    sql_path = _save_upload(file, ".sql")
    job = start_job(f"Restore SQL {database}", restore_mysql_job, conn, database, sql_path)
    return {"job": job}


@app.get("/api/backups")
def list_backups() -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for root in backup_roots():
        for manifest_path in root.glob("*.sql.manifest.json"):
            try:
                filename = manifest_path.name.removesuffix(".manifest.json")
                if filename in seen:
                    continue
                _, manifest = _completed_backup(filename)
                seen.add(filename)
                items.append(
                    {
                        "filename": filename,
                        "size_bytes": int(manifest["size_bytes"]),
                        "sha256": str(manifest["sha256"]),
                        "completed_at": str(manifest.get("completed_at") or ""),
                    }
                )
            except (OSError, ValueError, json.JSONDecodeError, FileNotFoundError):
                continue
    items.sort(key=lambda item: item["completed_at"], reverse=True)
    return {"backups": items}


@app.post("/api/restore-backup")
def restore_backup(req: RestoreBackupRequest) -> dict[str, Any]:
    consume_confirmation(req.confirmation_token, "restore-backup", req.database)
    try:
        _completed_backup(req.filename)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(400, str(exc)) from exc
    job = start_job(
        f"Restore backup {req.database}",
        restore_verified_backup_job,
        req.connection,
        req.database,
        req.filename,
    )
    return {"job": job}


@app.post("/api/import-csv")
def import_csv(
    connection_json: str = Form(...),
    database: str = Form(...),
    table: str = Form(...),
    confirmation_token: str = Form(...),
    truncate: bool = Form(False),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    consume_confirmation(confirmation_token, "import-csv", database, table)
    conn = _parse_connection_json(connection_json)
    csv_path = _save_upload(file, ".csv")
    job = start_job(f"Import CSV {table}", import_csv_job, conn, database, table, csv_path, truncate)
    return {"job": job}


@app.get("/api/jobs")
def list_jobs() -> dict[str, Any]:
    with _jobs_lock:
        jobs = [_public_job(job) for job in _jobs.values()]
    jobs.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return {"jobs": jobs[:50]}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return {"job": _public_job(job)}


@app.post("/api/jobs/{job_id}/cancel")
def cancel_job(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        if job.get("status") != "running":
            raise HTTPException(409, "Only a running job can be cancelled")
        event = job.get("_cancel_event")
        if not isinstance(event, threading.Event):
            raise HTTPException(409, "Job does not support cancellation")
        event.set()
    append_job_log(job_id, "Cancellation requested")
    return {"ok": True, "job_id": job_id}


@app.get("/api/download/{filename}")
def download(filename: str, request: Request):
    safe = Path(filename).name
    path = _find_export_file(safe, suffixes={".sql", ".csv"})
    if safe != filename or path is None:
        raise HTTPException(404, "File not found")
    size = path.stat().st_size
    range_header = request.headers.get("range")
    start = 0
    end = max(0, size - 1)
    status_code = 200
    if range_header:
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
        if not match or (not match.group(1) and not match.group(2)):
            return JSONResponse(status_code=416, content={"detail": "Invalid byte range"}, headers={"Content-Range": f"bytes */{size}"})
        if match.group(1):
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else end
        else:
            suffix_length = int(match.group(2))
            start = max(0, size - suffix_length)
        if start >= size or start > end:
            return JSONResponse(status_code=416, content={"detail": "Byte range is outside file"}, headers={"Content-Range": f"bytes */{size}"})
        end = min(end, size - 1)
        status_code = 206

    length = 0 if size == 0 else end - start + 1

    def iterator():
        remaining = length
        with path.open("rb") as file:
            file.seek(start)
            while remaining > 0:
                chunk = file.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
        "Content-Disposition": f'attachment; filename="{safe}"',
    }
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(iterator(), status_code=status_code, media_type="application/octet-stream", headers=headers)
