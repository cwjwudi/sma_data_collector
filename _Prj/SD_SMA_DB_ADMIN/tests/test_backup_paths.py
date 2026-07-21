from __future__ import annotations

import json
from pathlib import Path

from app import main


def test_backup_dir_prefers_launcher_environment(monkeypatch, tmp_path: Path) -> None:
    launcher_backup_dir = tmp_path / "package" / "backups"
    monkeypatch.setenv(main.BACKUP_DIR_ENV, str(launcher_backup_dir))
    monkeypatch.setattr(main, "CONFIG_DIR", tmp_path / "package" / "config" / "db_admin")
    monkeypatch.setattr(main, "CONFIG_FILE", main.CONFIG_DIR / "default.json")

    assert main.backup_dir() == launcher_backup_dir.resolve()
    assert launcher_backup_dir.is_dir()


def test_standalone_config_uses_project_root_backups(monkeypatch, tmp_path: Path) -> None:
    project_root = tmp_path / "SD_SMA_DB_ADMIN"
    config_dir = project_root / "config"
    config_dir.mkdir(parents=True)
    (config_dir / "default.json").write_text(
        json.dumps({"backup_dir": "${DB_ADMIN_ROOT}/backups"}),
        encoding="utf-8",
    )
    monkeypatch.delenv(main.BACKUP_DIR_ENV, raising=False)
    monkeypatch.setattr(main, "BASE_DIR", project_root)
    monkeypatch.setattr(main, "CONFIG_DIR", config_dir)
    monkeypatch.setattr(main, "CONFIG_FILE", config_dir / "default.json")

    assert main.backup_dir() == (project_root / "backups").resolve()


def test_standalone_without_config_uses_project_root_backups(monkeypatch, tmp_path: Path) -> None:
    project_root = tmp_path / "SD_SMA_DB_ADMIN"
    config_dir = project_root / "config"
    monkeypatch.delenv(main.BACKUP_DIR_ENV, raising=False)
    monkeypatch.setattr(main, "BASE_DIR", project_root)
    monkeypatch.setattr(main, "CONFIG_DIR", config_dir)
    monkeypatch.setattr(main, "CONFIG_FILE", config_dir / "default.json")

    assert main.backup_dir() == (project_root / "backups").resolve()
