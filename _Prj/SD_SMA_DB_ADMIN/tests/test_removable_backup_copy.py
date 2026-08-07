from __future__ import annotations

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import main


def _write_backup(root: Path, filename: str, content: bytes) -> tuple[Path, dict[str, object]]:
    root.mkdir(parents=True, exist_ok=True)
    source = root / filename
    source.write_bytes(content)
    manifest: dict[str, object] = {
        "format_version": 1,
        "status": "complete",
        "scope": "database",
        "filename": filename,
        "size_bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "completed_at": "2026-08-07T12:00:00",
    }
    source.with_suffix(source.suffix + ".manifest.json").write_text(
        json.dumps(manifest), encoding="utf-8"
    )
    return source, manifest


def _configure_paths(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> tuple[Path, Path]:
    backup_root = tmp_path / "backups"
    removable_root = tmp_path / "usb"
    backup_root.mkdir()
    removable_root.mkdir()
    monkeypatch.setattr(main, "backup_dir", lambda: backup_root)
    monkeypatch.setattr(main, "last_output_dir", lambda: None)
    monkeypatch.setattr(main, "windows_removable_roots", lambda: [removable_root])
    return backup_root, removable_root


def test_copy_multiple_backups_with_manifests_and_hash_verification(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup_root, removable_root = _configure_paths(monkeypatch, tmp_path)
    _write_backup(backup_root, "one.sql", b"one" * 1024)
    _write_backup(backup_root, "two.sql", b"two" * 2048)

    result = main.copy_backups_job(
        "job", ["one.sql", "two.sql"], str(removable_root / "SD_SMA_Backups")
    )

    destination = removable_root / "SD_SMA_Backups"
    assert result["copied"] == ["one.sql", "two.sql"]
    assert result["skipped"] == []
    assert result["verified"] == ["one.sql", "two.sql"]
    for filename in ("one.sql", "two.sql"):
        target = destination / filename
        manifest = json.loads(
            target.with_suffix(target.suffix + ".manifest.json").read_text(encoding="utf-8")
        )
        assert hashlib.sha256(target.read_bytes()).hexdigest() == manifest["sha256"]


def test_same_hash_is_skipped_and_manifest_is_repaired(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup_root, removable_root = _configure_paths(monkeypatch, tmp_path)
    source, manifest = _write_backup(backup_root, "same.sql", b"same-content")
    destination = removable_root / "archive"
    destination.mkdir()
    target = destination / source.name
    target.write_bytes(source.read_bytes())
    target_manifest = target.with_suffix(target.suffix + ".manifest.json")
    target_manifest.write_text("{}", encoding="utf-8")

    result = main.copy_backups_job("job", [source.name], str(destination))

    assert result["copied"] == []
    assert result["skipped"] == [source.name]
    assert json.loads(target_manifest.read_text(encoding="utf-8")) == manifest


def test_different_same_name_rejects_entire_batch_before_copy(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup_root, removable_root = _configure_paths(monkeypatch, tmp_path)
    _write_backup(backup_root, "first.sql", b"first")
    _write_backup(backup_root, "conflict.sql", b"source")
    destination = removable_root / "archive"
    destination.mkdir()
    (destination / "conflict.sql").write_bytes(b"different")

    with pytest.raises(RuntimeError, match="same name"):
        main.copy_backups_job("job", ["first.sql", "conflict.sql"], str(destination))

    assert not (destination / "first.sql").exists()


@pytest.mark.parametrize("filenames", [["same.sql", "same.sql"], ["../escape.sql"]])
def test_invalid_or_duplicate_names_are_rejected(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, filenames: list[str]
) -> None:
    _, removable_root = _configure_paths(monkeypatch, tmp_path)
    with pytest.raises(ValueError):
        main.copy_backups_job("job", filenames, str(removable_root))


def test_removable_browser_does_not_include_configured_fixed_roots(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    fixed = tmp_path / "fixed"
    removable = tmp_path / "usb"
    fixed.mkdir()
    removable.mkdir()
    monkeypatch.setattr(main, "backup_dir", lambda: fixed)
    monkeypatch.setattr(main, "windows_removable_roots", lambda: [removable])
    monkeypatch.setattr(main, "load_config", lambda: {"allowed_browse_roots": [str(fixed)]})

    roots = main.filesystem_roots("removable-directory")["roots"]

    assert [item["path"] for item in roots] == [str(removable.resolve())]
    with pytest.raises(main.HTTPException):
        main.filesystem_entries(str(fixed), "removable-directory")


def test_insufficient_removable_space_is_rejected(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup_root, removable_root = _configure_paths(monkeypatch, tmp_path)
    _write_backup(backup_root, "large.sql", b"content")
    monkeypatch.setattr(main.shutil, "disk_usage", lambda _path: SimpleNamespace(free=0))

    with pytest.raises(RuntimeError, match="free space is insufficient"):
        main.copy_backups_job("job", ["large.sql"], str(removable_root))


def test_cancellation_removes_temporary_and_uncommitted_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup_root, removable_root = _configure_paths(monkeypatch, tmp_path)
    _write_backup(backup_root, "cancel.sql", b"x" * (3 * 1024 * 1024))
    checks = 0

    def cancel_during_second_chunk(_job_id: str) -> None:
        nonlocal checks
        checks += 1
        if checks >= 4:
            raise main.JobCancelled("cancelled by test")

    monkeypatch.setattr(main, "_raise_if_cancelled", cancel_during_second_chunk)

    with pytest.raises(main.JobCancelled):
        main.copy_backups_job("job", ["cancel.sql"], str(removable_root))

    assert not (removable_root / "cancel.sql").exists()
    assert list(removable_root.glob("*.tmp")) == []


def test_mid_batch_failure_reports_completed_and_failed_files(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    backup_root, removable_root = _configure_paths(monkeypatch, tmp_path)
    _write_backup(backup_root, "first.sql", b"first")
    _write_backup(backup_root, "second.sql", b"second")
    original_copy = main._copy_job_file
    calls = 0

    def fail_on_second_sql(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 3:
            raise OSError("drive removed")
        return original_copy(*args, **kwargs)

    monkeypatch.setattr(main, "_copy_job_file", fail_on_second_sql)

    with pytest.raises(main.JobFailedWithResult) as exc:
        main.copy_backups_job("job", ["first.sql", "second.sql"], str(removable_root))

    assert exc.value.result["copied"] == ["first.sql"]
    assert exc.value.result["failed"] == [{"filename": "second.sql", "error": "drive removed"}]
    assert (removable_root / "first.sql").is_file()
    assert (removable_root / "first.sql.manifest.json").is_file()
    assert not (removable_root / "second.sql").exists()
    assert list(removable_root.glob("*.tmp")) == []


def test_background_job_preserves_partial_failure_result() -> None:
    expected = {
        "destination": "E:\\archive",
        "copied": ["first.sql"],
        "skipped": [],
        "failed": [{"filename": "second.sql", "error": "drive removed"}],
        "verified": ["first.sql"],
        "total_bytes": 10,
    }

    def fail_with_result(_job_id: str) -> None:
        raise main.JobFailedWithResult("drive removed", expected)

    job = main.start_job("copy test", fail_with_result)
    for _ in range(100):
        with main._jobs_lock:
            current = main._public_job(main._jobs[job["id"]])
        if current["status"] != "running":
            break
        main.time.sleep(0.01)

    assert current["status"] == "failed"
    assert current["error"] == "drive removed"
    assert current["result"] == expected


def test_copy_api_starts_background_job(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    def fake_start_job(title: str, target, *args):
        captured.update({"title": title, "target": target, "args": args})
        return {"id": "copy-job", "status": "running"}

    monkeypatch.setattr(main, "start_job", fake_start_job)
    response = main.copy_backups(
        main.CopyBackupsRequest(filenames=["backup.sql"], destination_dir="E:\\SD_SMA_Backups")
    )

    assert response["job"]["id"] == "copy-job"
    assert captured["target"] is main.copy_backups_job
    assert captured["args"] == (["backup.sql"], "E:\\SD_SMA_Backups")
