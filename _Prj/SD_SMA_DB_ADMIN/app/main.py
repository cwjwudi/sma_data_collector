from __future__ import annotations

import csv
import json
import os
import re
import sqlite3
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

import pymysql
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


BASE_DIR = Path(__file__).resolve().parent.parent


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


def load_config() -> dict[str, Any]:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        return {}
    with CONFIG_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, dict) else {}


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


def mysql_tool(name: str) -> str:
    cfg = load_config()
    tools = cfg.get("mysql_tools") if isinstance(cfg.get("mysql_tools"), dict) else {}
    return str(tools.get(name) or name)


def default_connection() -> dict[str, Any]:
    cfg = load_config()
    conn = cfg.get("default_connection") if isinstance(cfg.get("default_connection"), dict) else {}
    base = DbConnection().model_dump()
    base.update(conn)
    return base


def choose_folder_dialog(initial_dir: str | None = None) -> str:
    try:
        import tkinter as tk
        from tkinter import filedialog
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Folder picker is not available: {exc}") from exc

    initial = resolve_output_dir(initial_dir) if initial_dir else backup_dir()
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


def connect_mysql(conn: DbConnection, database: str | None = None):
    return pymysql.connect(
        host=conn.host or "127.0.0.1",
        port=int(conn.port or 3306),
        user=conn.username or "",
        password=conn.password or "",
        database=database or conn.database or None,
        charset="utf8mb4",
        autocommit=True,
    )


def list_mysql_databases(conn: DbConnection) -> list[str]:
    with connect_mysql(conn) as db:
        with db.cursor() as cur:
            cur.execute("SHOW DATABASES")
            rows = [str(row[0]) for row in cur.fetchall()]
    hidden = {"information_schema", "performance_schema", "mysql", "sys"}
    return [name for name in rows if name not in hidden]


def list_mysql_tables(conn: DbConnection, database: str) -> list[str]:
    dbname = safe_identifier(database, "database")
    with connect_mysql(conn) as db:
        with db.cursor() as cur:
            cur.execute(f"SHOW FULL TABLES FROM {quote_ident(dbname)}")
            rows = cur.fetchall()
    tables: list[str] = []
    for row in rows:
        if len(row) >= 2 and str(row[1]).upper() == "BASE TABLE":
            tables.append(str(row[0]))
    return tables


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


def append_job_log(job_id: str, message: str) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return
        stamp = datetime.now().strftime("%H:%M:%S")
        job.setdefault("logs", []).append(f"[{stamp}] {message}")


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


def start_job(title: str, target, *args: Any) -> dict[str, Any]:
    job_id = str(uuid.uuid4())
    now = datetime.now().isoformat(timespec="seconds")
    with _jobs_lock:
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
        }

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


def run_cli(cmd: list[str], *, env: dict[str, str], stdin_path: Path | None = None, stdout_path: Path | None = None) -> None:
    stdin_file = stdin_path.open("rb") if stdin_path else None
    stdout_file = stdout_path.open("wb") if stdout_path else subprocess.PIPE
    try:
        result = subprocess.run(
            cmd,
            stdin=stdin_file,
            stdout=stdout_file,
            stderr=subprocess.PIPE,
            env=env,
            check=False,
        )
    finally:
        if stdin_file:
            stdin_file.close()
        if stdout_path and stdout_file:
            stdout_file.close()
    if result.returncode != 0:
        err = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(err or f"Command failed with code {result.returncode}")


def backup_mysql_job(job_id: str, conn: DbConnection, database: str, output_dir: str = "") -> dict[str, Any]:
    dbname = safe_identifier(database, "database")
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = resolve_output_dir(output_dir) / f"{dbname}_backup_{stamp}.sql"
    append_job_log(job_id, f"Running mysqldump for database {dbname}")
    set_job_progress(job_id, 5, "dumping")
    env = os.environ.copy()
    env["MYSQL_PWD"] = conn.password or ""
    cmd = [
        mysql_tool("mysqldump"),
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
        dbname,
    ]
    run_cli(cmd, env=env, stdout_path=out)
    set_job_progress(job_id, 95, "finalizing")
    append_job_log(job_id, f"Backup file: {out}")
    return {"filename": out.name, "path": str(out)}


def restore_mysql_job(job_id: str, conn: DbConnection, database: str, sql_path: str) -> dict[str, Any]:
    dbname = safe_identifier(database, "database")
    source = Path(sql_path)
    if not source.is_file():
        raise FileNotFoundError(source)
    append_job_log(job_id, f"Restoring SQL into database {dbname}")
    set_job_progress(job_id, 5, "restoring")
    env = os.environ.copy()
    env["MYSQL_PWD"] = conn.password or ""
    cmd = [
        mysql_tool("mysql"),
        "--host",
        conn.host or "127.0.0.1",
        "--port",
        str(int(conn.port or 3306)),
        "--user",
        conn.username or "",
        "--default-character-set=utf8mb4",
        dbname,
    ]
    run_cli(cmd, env=env, stdin_path=source)
    set_job_progress(job_id, 95, "finalizing")
    append_job_log(job_id, f"Restored from: {source.name}")
    return {"source": source.name, "database": dbname}


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
    next_progress = 10
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
                batch = cur.fetchmany(1000)
                if not batch:
                    break
                writer.writerows(batch)
                rows += len(batch)
                if total_rows:
                    progress = 5 + int((rows / total_rows) * 90)
                    if progress >= next_progress:
                        set_job_progress(job_id, progress, "exporting")
                        next_progress = progress + 10
    set_job_progress(job_id, 95, "finalizing")
    append_job_log(job_id, f"CSV file: {out}")
    return {"filename": out.name, "path": str(out), "rows": rows}


def import_csv_job(job_id: str, conn: DbConnection, database: str, table: str, csv_path: str, truncate: bool) -> dict[str, Any]:
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
    next_progress = 10
    rows = 0
    with connect_mysql(conn, dbname) as db:
        with db.cursor() as cur, source.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            columns = reader.fieldnames or []
            if not columns:
                raise ValueError("CSV header is empty")
            for col in columns:
                safe_identifier(col, "csv column")
            if truncate:
                append_job_log(job_id, "Truncating target table before import")
                cur.execute(f"TRUNCATE TABLE {quote_ident(table_name)}")
            cols = ", ".join(quote_ident(c) for c in columns)
            placeholders = ", ".join(["%s"] * len(columns))
            sql = f"INSERT INTO {quote_ident(table_name)} ({cols}) VALUES ({placeholders})"
            batch: list[tuple[Any, ...]] = []
            for row in reader:
                batch.append(tuple(row.get(c, "") for c in columns))
                if len(batch) >= 500:
                    cur.executemany(sql, batch)
                    rows += len(batch)
                    batch.clear()
                    if total_rows:
                        progress = 5 + int((rows / total_rows) * 90)
                        if progress >= next_progress:
                            set_job_progress(job_id, progress, "importing")
                            next_progress = progress + 10
            if batch:
                cur.executemany(sql, batch)
                rows += len(batch)
    set_job_progress(job_id, 95, "finalizing")
    append_job_log(job_id, f"Imported rows: {rows}")
    return {"database": dbname, "table": table_name, "rows": rows}


app = FastAPI(title="SD SMA DB Admin", version="0.1.0")
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")


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
    return {
        "default_connection": default_connection(),
        "backup_dir": str(backup_dir()),
        "mysql_tools": cfg.get("mysql_tools") or {},
        "max_upload_mb": int(cfg.get("max_upload_mb") or 512),
    }


@app.post("/api/folder-dialog")
def folder_dialog(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        selected = choose_folder_dialog(str(payload.get("initial_dir") or ""))
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
    temp_dir = Path(tempfile.mkdtemp(prefix="sd_sma_db_admin_"))
    filename = Path(upload.filename or f"upload{suffix}").name
    target = temp_dir / filename
    limit_mb = int(load_config().get("max_upload_mb") or 512)
    limit_bytes = max(1, limit_mb) * 1024 * 1024
    copied = 0
    with target.open("wb") as f:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            copied += len(chunk)
            if copied > limit_bytes:
                raise HTTPException(413, f"Upload exceeds max_upload_mb={limit_mb}")
            f.write(chunk)
    return str(target)


@app.post("/api/restore-sql")
def restore_sql(
    connection_json: str = Form(...),
    database: str = Form(...),
    confirmed: bool = Form(False),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    if not confirmed:
        raise HTTPException(400, "Restore confirmation is required")
    conn = _parse_connection_json(connection_json)
    sql_path = _save_upload(file, ".sql")
    job = start_job(f"Restore SQL {database}", restore_mysql_job, conn, database, sql_path)
    return {"job": job}


@app.post("/api/import-csv")
def import_csv(
    connection_json: str = Form(...),
    database: str = Form(...),
    table: str = Form(...),
    confirmed: bool = Form(False),
    truncate: bool = Form(False),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    if not confirmed:
        raise HTTPException(400, "Import confirmation is required")
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


@app.get("/api/download/{filename}")
def download(filename: str) -> FileResponse:
    safe = Path(filename).name
    path = backup_dir() / safe
    if not path.is_file():
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename=safe)
