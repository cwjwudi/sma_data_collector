from __future__ import annotations

import json
import secrets
import shutil
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping

_COMMON_ROOT = Path(__file__).resolve().parent.parent / "_Prj" / "SD_SMA_COMMON"
if _COMMON_ROOT.is_dir() and str(_COMMON_ROOT) not in sys.path:
    sys.path.insert(0, str(_COMMON_ROOT))

from sd_sma_common.filesystem_browser import FilesystemBrowser, FilesystemBrowserError, windows_removable_roots


SERVICE_FOLDERS = {
    "collector_web": "collector",
    "query_web": "query_web",
    "db_admin": "db_admin",
    "report_copy": "report_copy",
}

KNOWN_KEYS = {
    "collector_web": {"communications", "connections", "data_groups", "database", "points", "logging"},
    "query_web": {"version", "name", "app_settings", "opcua", "query_view"},
    "db_admin": {"mysql_tools", "backup_dir", "default_connection", "allowed_browse_roots"},
    "report_copy": {"report_source_dir", "destination_folder", "allowed_extensions", "copy_subdirectories"},
}


def _atomic_json(path: Path, data: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _sanitize_secrets(value: Any, warnings: list[str], location: str = "") -> Any:
    if isinstance(value, list):
        return [_sanitize_secrets(item, warnings, f"{location}[]") for item in value]
    if not isinstance(value, dict):
        return value
    result: dict[str, Any] = {}
    for key, child in value.items():
        lowered = str(key).lower()
        child_location = f"{location}.{key}" if location else str(key)
        if lowered in {"password", "password_enc", "clear_password", "password_configured"}:
            if child not in (None, "", False):
                warnings.append(f"已移除外部敏感字段：{child_location}")
            continue
        result[str(key)] = _sanitize_secrets(child, warnings, child_location)
    return result


class ConfigImportManager:
    def __init__(self, data_root: Path, *, preview_seconds: int = 10 * 60) -> None:
        self.data_root = data_root
        self.import_box = data_root / "ImportBox"
        self.settings_path = data_root / "config" / "launcher" / "import_settings.json"
        self.preview_seconds = preview_seconds
        self._lock = threading.RLock()
        self._previews: dict[str, dict[str, Any]] = {}
        self.import_box.mkdir(parents=True, exist_ok=True)

    def settings(self) -> dict[str, Any]:
        try:
            raw = json.loads(self.settings_path.read_text(encoding="utf-8"))
            roots = raw.get("allowed_import_roots", [])
            if isinstance(roots, list):
                return {"allowed_import_roots": [str(item) for item in roots if str(item).strip()]}
        except (OSError, ValueError, TypeError):
            pass
        return {"allowed_import_roots": []}

    def update_settings(self, roots: list[str]) -> dict[str, Any]:
        normalized: list[str] = []
        for value in roots:
            path = Path(str(value)).expanduser().resolve(strict=False)
            if not path.is_absolute() or not path.is_dir():
                raise ValueError(f"目录不存在：{value}")
            if str(path).startswith("\\\\"):
                raise ValueError("首版不允许网络路径")
            if str(path) not in normalized:
                normalized.append(str(path))
        result = {"version": 1, "allowed_import_roots": normalized}
        _atomic_json(self.settings_path, result)
        return {"allowed_import_roots": normalized}

    def browser(self) -> FilesystemBrowser:
        roots = [self.import_box, *windows_removable_roots(), *self.settings()["allowed_import_roots"]]
        return FilesystemBrowser(roots)

    def roots(self) -> list[dict[str, object]]:
        return self.browser().public_roots()

    def entries(self, path: str) -> dict[str, object]:
        return self.browser().entries(path, extensions=(".json",), include_files=True)

    def inspect(self, service: str, paths: list[str]) -> dict[str, Any]:
        if service not in SERVICE_FOLDERS:
            raise ValueError("未知目标服务")
        if not paths:
            raise ValueError("请选择 JSON 文件或目录")
        browser = self.browser()
        candidates: list[Path] = []
        for raw_path in paths:
            authorized, _root = browser.authorize(raw_path)
            if authorized.is_dir():
                candidates.extend(sorted(authorized.glob("*.json")))
            elif authorized.is_file() and authorized.suffix.lower() == ".json":
                candidates.append(authorized)
            else:
                raise ValueError(f"只允许 JSON 文件或目录：{authorized}")
        unique = {str(path.resolve(strict=True)): path.resolve(strict=True) for path in candidates}
        candidates = list(unique.values())
        if service in {"db_admin", "report_copy"} and len(candidates) != 1:
            raise ValueError("该服务每次必须且只能导入一个 JSON 文件")
        if not candidates:
            raise ValueError("所选位置没有 JSON 文件")

        warnings: list[str] = []
        files: list[dict[str, Any]] = []
        for source in candidates:
            try:
                raw = json.loads(source.read_text(encoding="utf-8-sig"))
            except (OSError, ValueError) as exc:
                raise ValueError(f"无法解析 {source.name}：{exc}") from exc
            if not isinstance(raw, dict):
                raise ValueError(f"{source.name} 顶层必须是 JSON 对象")
            if not (set(raw) & KNOWN_KEYS[service]):
                raise ValueError(f"{source.name} 不像 {service} 的配置文件")
            sanitized = _sanitize_secrets(raw, warnings)
            target_name = "default.json" if service in {"db_admin", "report_copy"} else source.name
            stat = source.stat()
            files.append(
                {
                    "source": str(source),
                    "target_name": target_name,
                    "size": int(stat.st_size),
                    "mtime_ns": int(stat.st_mtime_ns),
                    "data": sanitized,
                }
            )
        token = secrets.token_urlsafe(24)
        with self._lock:
            self._prune_previews()
            self._previews[token] = {
                "expires": time.monotonic() + self.preview_seconds,
                "service": service,
                "files": files,
                "warnings": warnings,
            }
        target_dir = self.data_root / "config" / SERVICE_FOLDERS[service]
        return {
            "preview_token": token,
            "service": service,
            "target_dir": str(target_dir),
            "files": [
                {
                    "source": row["source"],
                    "target_name": row["target_name"],
                    "size": row["size"],
                    "will_overwrite": (target_dir / row["target_name"]).exists(),
                }
                for row in files
            ],
            "warnings": warnings,
        }

    def apply(self, token: str) -> dict[str, Any]:
        with self._lock:
            preview = self._previews.pop(token, None)
        if not preview or float(preview.get("expires", 0)) <= time.monotonic():
            raise ValueError("导入预览已过期，请重新检查")
        service = str(preview["service"])
        files = list(preview["files"])
        for row in files:
            source = Path(row["source"])
            try:
                stat = source.stat()
            except OSError as exc:
                raise ValueError(f"源文件已不可用：{source}") from exc
            if int(stat.st_size) != int(row["size"]) or int(stat.st_mtime_ns) != int(row["mtime_ns"]):
                raise ValueError(f"检查后源文件发生变化：{source.name}")

        target_dir = self.data_root / "config" / SERVICE_FOLDERS[service]
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        backup_dir = self.data_root / "backups" / "config_import" / stamp / service
        target_dir.mkdir(parents=True, exist_ok=True)
        backup_dir.mkdir(parents=True, exist_ok=True)
        written: list[str] = []
        try:
            for row in files:
                target = target_dir / str(row["target_name"])
                if target.exists():
                    shutil.copy2(target, backup_dir / target.name)
                _atomic_json(target, row["data"])
                written.append(str(target))
        except Exception:
            for row in files:
                target = target_dir / str(row["target_name"])
                backup = backup_dir / target.name
                if backup.exists():
                    shutil.copy2(backup, target)
                elif str(target) in written:
                    target.unlink(missing_ok=True)
            raise
        return {
            "ok": True,
            "service": service,
            "files": written,
            "backup_dir": str(backup_dir),
            "target_names": [str(row["target_name"]) for row in files],
            "warnings": list(preview.get("warnings", [])),
        }

    def rollback(self, result: Mapping[str, Any]) -> None:
        service = str(result.get("service", ""))
        if service not in SERVICE_FOLDERS:
            raise ValueError("未知回滚服务")
        target_dir = self.data_root / "config" / SERVICE_FOLDERS[service]
        backup_dir = Path(str(result.get("backup_dir", ""))).resolve(strict=True)
        expected_backup_root = (self.data_root / "backups" / "config_import").resolve(strict=True)
        try:
            backup_dir.relative_to(expected_backup_root)
        except ValueError as exc:
            raise ValueError("回滚备份目录越界") from exc
        for name in result.get("target_names", []):
            safe_name = Path(str(name)).name
            target = target_dir / safe_name
            backup = backup_dir / safe_name
            if backup.exists():
                shutil.copy2(backup, target)
            else:
                target.unlink(missing_ok=True)

    def _prune_previews(self) -> None:
        now = time.monotonic()
        self._previews = {
            token: preview for token, preview in self._previews.items() if float(preview.get("expires", 0)) > now
        }


__all__ = ["ConfigImportManager", "FilesystemBrowserError"]
