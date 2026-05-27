from __future__ import annotations

import copy
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from core.config_loader import ConfigLoader


class CollectorConfigManager:
    ALLOWED_TOP_LEVEL_KEYS = {
        "communications",
        "connections",
        "points",
        "groups",
        "database",
        "logging",
    }
    REMOVED_TRIGGER_TYPES = {"query"}

    def __init__(
        self,
        collector_config_dir: Path,
    ):
        self.collector_config_dir = collector_config_dir

    @staticmethod
    def _load_json(path: Path) -> dict[str, Any]:
        if not path.exists():
            return {}
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError(f"配置文件必须是 JSON 对象: {path}")
        return data

    @staticmethod
    def _write_json(path: Path, data: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        candidate = Path(filename).name.strip()
        if not candidate or candidate in {".", ".."}:
            raise ValueError("文件名无效")
        if not candidate.lower().endswith(".json"):
            raise ValueError("文件名必须以 .json 结尾")
        return candidate

    def sanitize_filename(self, filename: str) -> str:
        return self._sanitize_filename(filename)

    @classmethod
    def default_payload(cls) -> dict[str, Any]:
        return {
            "communications": [],
            "connections": [],
            "points": [],
            "groups": [],
            "database": {
                "type": "mysql",
                "name": "",
                "host": "127.0.0.1",
                "port": 3306,
                "username": "",
                "password": "",
                "data_groups": [],
            },
            "logging": {
                "level": "INFO",
                "output_dir": "logs",
                "backup_days": 14,
                "rotation_when": "midnight",
                "rotation_interval": 1,
                "console_enabled": True,
            },
        }

    @classmethod
    def sanitize_for_ui(cls, payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, int]]:
        if not isinstance(payload, dict):
            raise ValueError("配置必须是 JSON 对象")

        sanitized = cls.default_payload()
        stats = {"query_groups_hidden": 0, "query_fields_hidden": 0}

        for key in cls.ALLOWED_TOP_LEVEL_KEYS:
            if key not in payload:
                continue
            if key == "groups":
                continue
            sanitized[key] = payload[key]

        groups = payload.get("groups", [])
        if isinstance(groups, list):
            clean_groups: list[dict[str, Any]] = []
            for item in groups:
                if not isinstance(item, dict):
                    continue
                trigger = str(item.get("trigger", "")).lower()
                if trigger in cls.REMOVED_TRIGGER_TYPES:
                    raise ValueError("当前版本已删除 trigger=query 功能，请先从配置中移除查询组")
                group_copy = copy.deepcopy(item)
                if "query_config" in group_copy:
                    raise ValueError("当前版本已删除 groups[].query_config 字段，请先从配置中移除")
                if "output_mode" in group_copy:
                    raise ValueError("当前版本已删除 groups[].output_mode 字段，请先从配置中移除")
                clean_groups.append(group_copy)
            sanitized["groups"] = clean_groups

        # 保证关键结构类型正确，避免前端渲染失败
        for list_key in ("communications", "connections", "points", "groups"):
            if not isinstance(sanitized.get(list_key), list):
                sanitized[list_key] = []
        if not isinstance(sanitized.get("database"), dict):
            sanitized["database"] = cls.default_payload()["database"]
        if not isinstance(sanitized.get("logging"), dict):
            sanitized["logging"] = cls.default_payload()["logging"]

        return sanitized, stats

    def _validate_scope(self, payload: dict[str, Any]) -> None:
        if not isinstance(payload, dict):
            raise ValueError("配置必须是 JSON 对象")

        unknown_keys = [k for k in payload.keys() if k not in self.ALLOWED_TOP_LEVEL_KEYS]
        if unknown_keys:
            raise ValueError(f"包含不支持的顶层字段: {unknown_keys}")

        groups = payload.get("groups", [])
        if not isinstance(groups, list):
            raise ValueError("groups 必须是数组")

        self._validate_points_unique(payload)

        for group in groups:
            if not isinstance(group, dict):
                raise ValueError("groups 数组元素必须是对象")
            trigger = str(group.get("trigger", "")).lower()
            if trigger in self.REMOVED_TRIGGER_TYPES:
                raise ValueError("当前版本已删除 trigger=query")
            if "query_config" in group:
                raise ValueError("当前版本已删除 groups[].query_config 字段")
            if "output_mode" in group:
                raise ValueError("当前版本已删除 groups[].output_mode 字段")

    @staticmethod
    def _validate_points_unique(payload: dict[str, Any]) -> None:
        points = payload.get("points", [])
        if not isinstance(points, list):
            raise ValueError("校验失败：points 必须是数组")

        seen_names: set[str] = set()
        seen_paths: set[str] = set()
        for idx, point in enumerate(points):
            if not isinstance(point, dict):
                raise ValueError(f"校验失败：points[{idx}] 必须是对象")

            name = str(point.get("name", "")).strip()
            path = str(point.get("path", "")).strip()

            if not name:
                raise ValueError(f"校验失败：points[{idx}].name 不能为空")
            if not path:
                raise ValueError(f"校验失败：points[{idx}].path 不能为空")

            if name in seen_names:
                raise ValueError(f"校验失败：points.name 重复：{name}")
            if path in seen_paths:
                raise ValueError(f"校验失败：points.path 重复：{path}")

            seen_names.add(name)
            seen_paths.add(path)

    def _validate_by_loader(self, payload: dict[str, Any]) -> None:
        try:
            ConfigLoader._parse_config(payload)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"配置校验失败: {exc}") from exc

    def get_template(self) -> dict[str, Any]:
        return self.default_payload()

    def list_config_files(self) -> list[str]:
        self.collector_config_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for path in self.collector_config_dir.glob("*.json"):
            if path.is_file():
                files.append(path.name)
        return sorted(files)

    def load_config_file(self, filename: str) -> dict[str, Any]:
        safe_name = self._sanitize_filename(filename)
        source = (self.collector_config_dir / safe_name).resolve()
        if source.parent != self.collector_config_dir.resolve():
            raise ValueError("非法路径")
        if not source.exists():
            raise ValueError(f"配置文件不存在: {safe_name}")

        payload = self._load_json(source)
        sanitized, stats = self.sanitize_for_ui(payload)
        return {
            "filename": safe_name,
            "payload": sanitized,
            "hidden": stats,
        }

    def delete_config_file(self, filename: str) -> Path:
        safe_name = self._sanitize_filename(filename)
        source = (self.collector_config_dir / safe_name).resolve()
        if source.parent != self.collector_config_dir.resolve():
            raise ValueError("非法路径")
        if not source.exists():
            raise ValueError(f"配置文件不存在: {safe_name}")
        source.unlink()
        return source

    def save_template(self, payload: dict[str, Any]) -> None:
        self._validate_scope(payload)
        self._validate_by_loader(payload)

    def validate_template(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._validate_scope(payload)
        self._validate_by_loader(payload)
        return {"ok": True}

    def export_to_path(self, payload: dict[str, Any], output_path: Path) -> Path:
        self._validate_scope(payload)
        self._validate_by_loader(payload)
        self._write_json(output_path, payload)
        return output_path

    def write_collector_config(self, payload: dict[str, Any], filename: str) -> Path:
        self._validate_scope(payload)
        self._validate_by_loader(payload)

        safe_name = self._sanitize_filename(filename)
        self.collector_config_dir.mkdir(parents=True, exist_ok=True)
        target = (self.collector_config_dir / safe_name).resolve()

        backup_dir = (self.collector_config_dir / "_backup").resolve()
        backup_dir.mkdir(parents=True, exist_ok=True)

        if target.exists():
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = backup_dir / f"{target.stem}_{timestamp}{target.suffix}"
            shutil.copy2(target, backup_file)

        tmp_target = target.with_suffix(f"{target.suffix}.tmp")
        self._write_json(tmp_target, payload)
        tmp_target.replace(target)
        return target

    @staticmethod
    def build_point_from_node(
        node_id: str,
        display_name: str,
        description: str = "",
        datatype: str | None = None,
    ) -> dict[str, str]:
        raw_name = display_name.strip() or "point"
        normalized = "".join(ch if (ch.isalnum() or ch == "_") else "_" for ch in raw_name)
        normalized = normalized.strip("_") or "point"
        if normalized[0].isdigit():
            normalized = f"p_{normalized}"
        point = {
            "name": normalized,
            "path": node_id,
            "description": description or display_name or node_id,
        }
        if datatype:
            point["datatype"] = datatype
        return point

    @staticmethod
    def append_point(payload: dict[str, Any], point_item: dict[str, Any]) -> dict[str, Any]:
        new_payload = copy.deepcopy(payload)
        points = new_payload.setdefault("points", [])
        if not isinstance(points, list):
            raise ValueError("points 字段不是数组")

        point_item = dict(point_item)
        new_name = str(point_item.get("name", "")).strip()
        new_path = str(point_item.get("path", "")).strip()

        for item in points:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            path = str(item.get("path", "")).strip()
            if new_name and name == new_name:
                raise ValueError(f"校验失败：points.name 重复：{new_name}")
            if new_path and path == new_path:
                raise ValueError(f"校验失败：points.path 重复：{new_path}")

        if not new_name:
            raise ValueError("校验失败：points.name 不能为空")
        if not new_path:
            raise ValueError("校验失败：points.path 不能为空")

        point_item["name"] = new_name
        point_item["path"] = new_path
        points.append(point_item)
        return new_payload

