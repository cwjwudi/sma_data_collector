from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any


class ConfigManager:
    ALLOWED_COLLECTOR_KEYS = {
        "communications",
        "connections",
        "points",
        "groups",
        "database",
        "logging",
    }

    def __init__(
        self,
        app_settings_path: Path,
        collector_template_path: Path,
        query_view_config_path: Path,
    ):
        self.app_settings_path = app_settings_path
        self.collector_template_path = collector_template_path
        self.query_view_config_path = query_view_config_path
        self.app_settings = self._load_json(self.app_settings_path)

    @staticmethod
    def _load_json(path: Path) -> dict[str, Any]:
        if not path.exists():
            return {}
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)

    @staticmethod
    def _write_json(path: Path, data: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    @staticmethod
    def _validate_collector_payload(data: dict[str, Any]) -> None:
        if not isinstance(data, dict):
            raise ValueError("Collector config payload must be a JSON object")

        unknown_keys = [k for k in data.keys() if k not in ConfigManager.ALLOWED_COLLECTOR_KEYS]
        if unknown_keys:
            raise ValueError(f"Collector config contains unsupported keys: {unknown_keys}")

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        candidate = Path(filename).name.strip()
        if not candidate or candidate in {".", ".."}:
            raise ValueError("Invalid filename")
        if not candidate.lower().endswith(".json"):
            raise ValueError("Filename must end with .json")
        return candidate

    def get_collector_template(self) -> dict[str, Any]:
        return self._load_json(self.collector_template_path)

    def save_collector_template(self, data: dict[str, Any]) -> None:
        self._validate_collector_payload(data)
        self._write_json(self.collector_template_path, data)

    def export_collector_template(self, filename: str) -> Path:
        filename = self._sanitize_filename(filename)
        export_dir = (self.collector_template_path.parent / "exports").resolve()
        export_dir.mkdir(parents=True, exist_ok=True)
        target = export_dir / filename
        self._write_json(target, self.get_collector_template())
        return target

    def write_collector_config(self, filename: str) -> Path:
        filename = self._sanitize_filename(filename)
        collector_config_dir = Path(
            self.app_settings.get(
                "collector_config_dir",
                "D:/projects/50_/P000_SD_SMA_SCADA/_Prj/SD_SMA_DATA_COLLECTOR/config",
            )
        )
        collector_config_dir.mkdir(parents=True, exist_ok=True)
        target = (collector_config_dir / filename).resolve()

        backup_dir = (collector_config_dir / "_backup").resolve()
        backup_dir.mkdir(parents=True, exist_ok=True)

        if target.exists():
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_file = backup_dir / f"{target.stem}_{ts}{target.suffix}"
            shutil.copy2(target, backup_file)

        temp_target = target.with_suffix(f"{target.suffix}.tmp")
        self._write_json(temp_target, self.get_collector_template())
        temp_target.replace(target)
        return target

    def get_query_view_config(self) -> dict[str, Any]:
        return self._load_json(self.query_view_config_path)

    @staticmethod
    def _validate_query_view_config(data: dict[str, Any]) -> None:
        if not isinstance(data, dict):
            raise ValueError("Query view config payload must be a JSON object")

        default_page_size = int(data.get("default_page_size", 50))
        max_page_size = int(data.get("max_page_size", 500))
        if default_page_size < 1:
            raise ValueError("default_page_size must be greater than 0")
        if max_page_size < 1:
            raise ValueError("max_page_size must be greater than 0")
        if default_page_size > max_page_size:
            raise ValueError("default_page_size must be less than or equal to max_page_size")

        views = data.get("views")
        if not isinstance(views, dict) or not views:
            raise ValueError("views must be a non-empty object")

        for view_name, view in views.items():
            if not isinstance(view, dict):
                raise ValueError(f"view '{view_name}' must be an object")

            columns = view.get("columns", [])
            if not isinstance(columns, list):
                raise ValueError(f"view '{view_name}'.columns must be a list")

            filters = view.get("default_filters", [])
            if not isinstance(filters, list):
                raise ValueError(f"view '{view_name}'.default_filters must be a list")

            sort_dir = str(view.get("sort_dir", "desc")).lower()
            if sort_dir not in {"asc", "desc"}:
                raise ValueError(f"view '{view_name}'.sort_dir must be asc or desc")

            if "page_size" in view:
                page_size = int(view["page_size"])
                if page_size < 1 or page_size > max_page_size:
                    raise ValueError(f"view '{view_name}'.page_size out of range")

            per_table = view.get("per_table", {})
            if per_table is not None and not isinstance(per_table, dict):
                raise ValueError(f"view '{view_name}'.per_table must be an object")
            if isinstance(per_table, dict):
                for table_name, table_cfg in per_table.items():
                    if not isinstance(table_cfg, dict):
                        raise ValueError(f"view '{view_name}'.per_table.{table_name} must be an object")
                    if "columns" in table_cfg and not isinstance(table_cfg["columns"], list):
                        raise ValueError(f"view '{view_name}'.per_table.{table_name}.columns must be a list")
                    if "sort_dir" in table_cfg:
                        sdir = str(table_cfg["sort_dir"]).lower()
                        if sdir not in {"asc", "desc"}:
                            raise ValueError(f"view '{view_name}'.per_table.{table_name}.sort_dir must be asc or desc")
                    if "page_size" in table_cfg:
                        page_size = int(table_cfg["page_size"])
                        if page_size < 1 or page_size > max_page_size:
                            raise ValueError(f"view '{view_name}'.per_table.{table_name}.page_size out of range")
            per_group = view.get("per_group", {})
            if per_group is not None and not isinstance(per_group, dict):
                raise ValueError(f"view '{view_name}'.per_group must be an object")
            if isinstance(per_group, dict):
                for group_name, group_cfg in per_group.items():
                    if not isinstance(group_cfg, dict):
                        raise ValueError(f"view '{view_name}'.per_group.{group_name} must be an object")
                    if "columns" in group_cfg and not isinstance(group_cfg["columns"], list):
                        raise ValueError(f"view '{view_name}'.per_group.{group_name}.columns must be a list")
                    if "sort_dir" in group_cfg:
                        sdir = str(group_cfg["sort_dir"]).lower()
                        if sdir not in {"asc", "desc"}:
                            raise ValueError(f"view '{view_name}'.per_group.{group_name}.sort_dir must be asc or desc")
                    if "page_size" in group_cfg:
                        page_size = int(group_cfg["page_size"])
                        if page_size < 1 or page_size > max_page_size:
                            raise ValueError(f"view '{view_name}'.per_group.{group_name}.page_size out of range")

        group_baselines = data.get("group_baselines", {})
        if group_baselines is not None and not isinstance(group_baselines, dict):
            raise ValueError("group_baselines must be an object")

    def save_query_view_config(self, data: dict[str, Any]) -> None:
        self._validate_query_view_config(data)
        self._write_json(self.query_view_config_path, data)

    def get_query_views(self) -> dict[str, Any]:
        config = self.get_query_view_config()
        views = config.get("views", {})
        if not isinstance(views, dict):
            return {}
        return views

    @staticmethod
    def _normalize_column_defs(column_defs: list[Any]) -> tuple[list[str], dict[str, dict[str, str]]]:
        names: list[str] = []
        labels: dict[str, dict[str, str]] = {}
        for item in column_defs:
            if isinstance(item, str):
                names.append(item)
                labels[item] = {"label_en": item, "label_zh": item}
            elif isinstance(item, dict) and item.get("name"):
                name = str(item["name"])
                names.append(name)
                labels[name] = {
                    "label_en": str(item.get("label_en", name)),
                    "label_zh": str(item.get("label_zh", name)),
                }
        return names, labels

    def resolve_query_view(self, view_name: str, table: str | None = None, group: str | None = None) -> dict[str, Any]:
        config = self.get_query_view_config()
        self._validate_query_view_config(config)
        views = config["views"]
        if view_name not in views:
            raise ValueError(f"Unknown view_name: {view_name}")

        view = views[view_name]
        resolved = {
            "name": view_name,
            "title": view.get("title", view_name),
            "time_field": view.get("time_field", "collection_time"),
            "sort_by": view.get("sort_by", "collection_time"),
            "sort_dir": str(view.get("sort_dir", "desc")).lower(),
            "default_page_size": int(config.get("default_page_size", 50)),
            "max_page_size": int(config.get("max_page_size", 500)),
            "page_size": int(view.get("page_size", config.get("default_page_size", 50))),
            "columns": [],
            "column_labels": {},
            "default_filters": view.get("default_filters", []),
            "description": view.get("description", ""),
        }
        base_columns, base_labels = self._normalize_column_defs(view.get("columns", []))
        resolved["columns"] = base_columns
        resolved["column_labels"] = base_labels

        if group:
            per_group = view.get("per_group", {})
            if isinstance(per_group, dict):
                group_override = per_group.get(group)
                if isinstance(group_override, dict):
                    if "columns" in group_override and isinstance(group_override["columns"], list):
                        gcols, glabels = self._normalize_column_defs(group_override["columns"])
                        resolved["columns"] = gcols
                        resolved["column_labels"] = glabels
                    if "sort_by" in group_override and group_override["sort_by"]:
                        resolved["sort_by"] = str(group_override["sort_by"])
                    if "sort_dir" in group_override and str(group_override["sort_dir"]).lower() in {"asc", "desc"}:
                        resolved["sort_dir"] = str(group_override["sort_dir"]).lower()
                    if "page_size" in group_override:
                        page_size = int(group_override["page_size"])
                        page_size = min(max(page_size, 1), resolved["max_page_size"])
                        resolved["page_size"] = page_size

        # 当传入 group 时，按需求仅使用 group 级配置，不再让 per_table 覆盖。
        if table and group is None:
            per_table = view.get("per_table", {})
            if isinstance(per_table, dict):
                override = per_table.get(table)
                if isinstance(override, dict):
                    if "columns" in override and isinstance(override["columns"], list):
                        table_columns, table_labels = self._normalize_column_defs(override["columns"])
                        resolved["columns"] = table_columns
                        resolved["column_labels"] = table_labels
                    if "sort_by" in override and override["sort_by"]:
                        resolved["sort_by"] = str(override["sort_by"])
                    if "sort_dir" in override and str(override["sort_dir"]).lower() in {"asc", "desc"}:
                        resolved["sort_dir"] = str(override["sort_dir"]).lower()
                    if "page_size" in override:
                        page_size = int(override["page_size"])
                        page_size = min(max(page_size, 1), resolved["max_page_size"])
                        resolved["page_size"] = page_size

        return resolved

    def get_group_baseline(self, group: str) -> str | None:
        config = self.get_query_view_config()
        group_baselines = config.get("group_baselines", {})
        if not isinstance(group_baselines, dict):
            return None
        value = group_baselines.get(group)
        if value is None:
            return None
        return str(value)

    def set_group_baseline(self, group: str, baseline_table: str) -> None:
        config = self.get_query_view_config()
        self._validate_query_view_config(config)
        group_baselines = config.setdefault("group_baselines", {})
        if not isinstance(group_baselines, dict):
            raise ValueError("group_baselines must be an object")
        group_baselines[group] = baseline_table
        self._validate_query_view_config(config)
        self._write_json(self.query_view_config_path, config)

    def get_query_table_config(self, view_name: str, table: str) -> dict[str, Any]:
        resolved = self.resolve_query_view(view_name, table)
        columns = []
        for name in resolved["columns"]:
            labels = resolved["column_labels"].get(name, {"label_en": name, "label_zh": name})
            columns.append(
                {
                    "name": name,
                    "label_en": labels.get("label_en", name),
                    "label_zh": labels.get("label_zh", name),
                }
            )
        return {
            "view_name": view_name,
            "table": table,
            "sort_by": resolved["sort_by"],
            "sort_dir": resolved["sort_dir"],
            "page_size": resolved["page_size"],
            "columns": columns,
        }

    def update_query_table_config(
        self,
        view_name: str,
        table: str,
        sort_by: str,
        sort_dir: str,
        page_size: int,
        columns: list[dict[str, Any]],
    ) -> None:
        config = self.get_query_view_config()
        self._validate_query_view_config(config)
        views = config.get("views", {})
        if view_name not in views:
            raise ValueError(f"Unknown view_name: {view_name}")

        view = views[view_name]
        per_table = view.setdefault("per_table", {})
        if not isinstance(per_table, dict):
            raise ValueError("per_table config must be an object")

        normalized_columns: list[dict[str, str]] = []
        seen: set[str] = set()
        for col in columns:
            if not isinstance(col, dict):
                continue
            name = str(col.get("name", "")).strip()
            if not name or name in seen:
                continue
            seen.add(name)
            normalized_columns.append(
                {
                    "name": name,
                    "label_en": str(col.get("label_en", name)),
                    "label_zh": str(col.get("label_zh", name)),
                }
            )

        per_table[table] = {
            "columns": normalized_columns,
            "sort_by": str(sort_by),
            "sort_dir": "asc" if str(sort_dir).lower() == "asc" else "desc",
            "page_size": max(1, int(page_size)),
        }

        self._validate_query_view_config(config)
        self._write_json(self.query_view_config_path, config)

    def get_query_group_config(self, view_name: str, group: str, baseline_table: str) -> dict[str, Any]:
        resolved = self.resolve_query_view(view_name=view_name, table=baseline_table, group=group)
        columns = []
        for name in resolved["columns"]:
            labels = resolved["column_labels"].get(name, {"label_en": name, "label_zh": name})
            columns.append(
                {
                    "name": name,
                    "label_en": labels.get("label_en", name),
                    "label_zh": labels.get("label_zh", name),
                }
            )
        return {
            "view_name": view_name,
            "group": group,
            "baseline_table": baseline_table,
            "sort_by": resolved["sort_by"],
            "sort_dir": resolved["sort_dir"],
            "page_size": resolved["page_size"],
            "columns": columns,
        }

    def update_query_group_config(
        self,
        view_name: str,
        group: str,
        sort_by: str,
        sort_dir: str,
        page_size: int,
        columns: list[dict[str, Any]],
        baseline_table: str | None = None,
    ) -> None:
        config = self.get_query_view_config()
        self._validate_query_view_config(config)
        views = config.get("views", {})
        if view_name not in views:
            raise ValueError(f"Unknown view_name: {view_name}")

        view = views[view_name]
        per_group = view.setdefault("per_group", {})
        if not isinstance(per_group, dict):
            raise ValueError("per_group config must be an object")

        normalized_columns: list[dict[str, str]] = []
        seen: set[str] = set()
        for col in columns:
            if not isinstance(col, dict):
                continue
            name = str(col.get("name", "")).strip()
            if not name or name in seen:
                continue
            seen.add(name)
            normalized_columns.append(
                {
                    "name": name,
                    "label_en": str(col.get("label_en", name)),
                    "label_zh": str(col.get("label_zh", name)),
                }
            )

        per_group[group] = {
            "columns": normalized_columns,
            "sort_by": str(sort_by),
            "sort_dir": "asc" if str(sort_dir).lower() == "asc" else "desc",
            "page_size": max(1, int(page_size)),
        }

        if baseline_table:
            group_baselines = config.setdefault("group_baselines", {})
            if not isinstance(group_baselines, dict):
                raise ValueError("group_baselines must be an object")
            group_baselines[group] = baseline_table

        self._validate_query_view_config(config)
        self._write_json(self.query_view_config_path, config)
