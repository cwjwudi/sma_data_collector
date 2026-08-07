from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import main


STATIC_DIR = Path(main.BASE_DIR) / "app" / "static"


@pytest.fixture(autouse=True)
def isolated_manager_state():
    with main._confirmations_lock:
        saved_confirmations = dict(main._confirmations)
        main._confirmations.clear()
    with main._protected_export_paths_lock:
        saved_protected = dict(main._protected_export_paths)
        main._protected_export_paths.clear()
    yield
    with main._confirmations_lock:
        main._confirmations.clear()
        main._confirmations.update(saved_confirmations)
    with main._protected_export_paths_lock:
        main._protected_export_paths.clear()
        main._protected_export_paths.update(saved_protected)


def write_export(path: Path, content: bytes, **extra) -> tuple[Path, dict[str, object]]:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    manifest: dict[str, object] = {
        "format_version": 1,
        "status": "complete",
        "filename": path.name,
        "size_bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "completed_at": "2026-08-07T14:00:00",
        **extra,
    }
    path.with_suffix(path.suffix + ".manifest.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    return path, manifest


def configure_roots(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> tuple[Path, Path, Path]:
    backup = tmp_path / "backup"
    output = tmp_path / "output"
    external = tmp_path / "external"
    for path in (backup, output, external):
        path.mkdir()
    monkeypatch.setattr(main, "backup_dir", lambda: backup)
    monkeypatch.setattr(main, "last_output_dir", lambda: output)
    monkeypatch.setattr(main, "windows_removable_roots", lambda: [external])
    return backup, output, external


def test_manager_browses_sql_csv_and_filters_invalid_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, output, _external = configure_roots(monkeypatch, tmp_path)
    sql, _ = write_export(backup / "database.sql", b"sql", scope="database", database="alarm")
    write_export(backup / "nested" / "table.csv", b"csv", kind="csv", database="alarm", table="events")
    (backup / "missing.sql").write_bytes(b"no manifest")
    bad, _ = write_export(backup / "bad.csv", b"bad")
    bad.with_suffix(bad.suffix + ".manifest.json").write_text("{}", encoding="utf-8")

    roots = main.backup_file_roots()["roots"]
    listing = main.backup_file_entries(str(backup))
    nested = main.backup_file_entries(str(backup / "nested"))

    assert {item["path"] for item in roots} == {str(backup.resolve()), str(output.resolve())}
    assert [item["name"] for item in listing["entries"]] == ["nested", sql.name]
    assert nested["entries"][0]["name"] == "table.csv"
    assert nested["entries"][0]["kind"] == "csv"
    assert nested["entries"][0]["database"] == "alarm"


def test_manager_rejects_paths_outside_backup_roots(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    configure_roots(monkeypatch, tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()

    with pytest.raises(main.FilesystemBrowserError):
        main.backup_file_entries(str(outside))
    with pytest.raises(main.FilesystemBrowserError):
        main._completed_export_path(outside / "escape.sql")


def test_copy_exact_sql_and_csv_paths_to_external_device(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, output, external = configure_roots(monkeypatch, tmp_path)
    sql, _ = write_export(backup / "database.sql", b"sql")
    csv, _ = write_export(output / "table.csv", b"csv", kind="csv")

    result = main.copy_backup_files_job(
        "job", [str(sql), str(csv)], str(external / "SD_SMA_Backups")
    )

    assert result["copied"] == ["database.sql", "table.csv"]
    for source in (sql, csv):
        target = external / "SD_SMA_Backups" / source.name
        assert target.read_bytes() == source.read_bytes()
        assert target.with_suffix(target.suffix + ".manifest.json").is_file()


def test_delete_removes_data_and_manifest_after_bound_confirmation(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, _output, _external = configure_roots(monkeypatch, tmp_path)
    sql, _ = write_export(backup / "database.sql", b"sql")
    csv, _ = write_export(backup / "table.csv", b"csv", kind="csv")
    paths = [str(sql), str(csv)]
    token = main.issue_delete_backup_files_confirmation(paths)

    result = main.delete_backup_files(list(reversed(paths)), token)

    assert result["count"] == 2
    assert result["size_bytes"] == 6
    for source in (sql, csv):
        assert not source.exists()
        assert not source.with_suffix(source.suffix + ".manifest.json").exists()


def test_delete_confirmation_is_single_use_and_path_bound(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, _output, _external = configure_roots(monkeypatch, tmp_path)
    first, _ = write_export(backup / "first.sql", b"first")
    second, _ = write_export(backup / "second.sql", b"second")
    first_prepared = main._prepare_managed_export_paths([str(first)])
    second_prepared = main._prepare_managed_export_paths([str(second)])
    token = main.issue_delete_backup_files_confirmation([str(first)])

    with pytest.raises(main.HTTPException, match="does not match"):
        main.consume_delete_backup_files_confirmation(token, second_prepared)
    with pytest.raises(main.HTTPException, match="invalid, expired, or already used"):
        main.consume_delete_backup_files_confirmation(token, first_prepared)


def test_delete_confirmation_cannot_be_used_for_restore(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, _output, _external = configure_roots(monkeypatch, tmp_path)
    source, _ = write_export(backup / "database.sql", b"sql")
    token = main.issue_delete_backup_files_confirmation([str(source)])

    with pytest.raises(main.HTTPException, match="does not match"):
        main.consume_confirmation(token, "restore-backup", "target_db")


def test_delete_rename_failure_rolls_back_all_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, _output, _external = configure_roots(monkeypatch, tmp_path)
    source, _ = write_export(backup / "database.sql", b"sql")
    manifest = source.with_suffix(source.suffix + ".manifest.json")
    monkeypatch.setattr(main.uuid, "uuid4", lambda: SimpleNamespace(hex="fixeddelete"))
    collision = manifest.with_name(f".{manifest.name}.delete-fixeddelete")
    collision.write_text("collision", encoding="utf-8")
    token = main.issue_delete_backup_files_confirmation([str(source)])

    with pytest.raises(RuntimeError, match="already exists"):
        main.delete_backup_files([str(source)], token)

    assert source.is_file()
    assert manifest.is_file()
    assert source.read_bytes() == b"sql"


def test_delete_is_blocked_while_export_is_in_use(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, _output, _external = configure_roots(monkeypatch, tmp_path)
    source, _ = write_export(backup / "database.sql", b"sql")
    token = main.issue_delete_backup_files_confirmation([str(source)])
    keys = main._reserve_export_paths([str(source)])
    try:
        with pytest.raises(main.HTTPException) as exc:
            main.delete_backup_files([str(source)], token)
        assert exc.value.status_code == 409
    finally:
        main._release_export_paths(keys)
    assert source.is_file()


def test_new_copy_api_uses_exact_paths_and_protects_sources(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup, _output, external = configure_roots(monkeypatch, tmp_path)
    source, _ = write_export(backup / "database.sql", b"sql")
    captured: dict[str, object] = {}

    def fake_start_job(title: str, target, *args, **kwargs):
        captured.update({"title": title, "target": target, "args": args, "kwargs": kwargs})
        return {"id": "copy-files", "status": "running"}

    monkeypatch.setattr(main, "start_job", fake_start_job)
    response = main.copy_backup_files(
        main.CopyBackupFilesRequest(paths=[str(source)], destination_dir=str(external))
    )

    assert response["job"]["id"] == "copy-files"
    assert captured["target"] is main.copy_backup_files_job
    assert captured["args"] == ([str(source.resolve())], str(external))
    assert captured["kwargs"] == {"protected_paths": [str(source.resolve())]}


def test_backup_file_manager_is_an_independent_top_level_panel() -> None:
    html = (STATIC_DIR / "admin.html").read_text(encoding="utf-8")
    script = (STATIC_DIR / "admin.js").read_text(encoding="utf-8")

    assert html.index("备份与导出") < html.index("恢复与导入") < html.index("备份文件管理") < html.index("任务日志")
    assert 'id="backupFilesList"' in html
    assert 'id="btnSelectCurrentBackupFiles"' in html
    assert 'id="btnCopyBackups"' in html
    assert 'id="btnDeleteBackupFiles"' in html
    assert "复制到外部设备" in html
    assert "移动硬盘 / U 盘" not in html
    assert "/api/backup-files/entries" in script
    assert "/api/copy-backup-files" in script
    assert "/api/delete-backup-files" in script
