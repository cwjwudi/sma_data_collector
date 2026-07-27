from __future__ import annotations

from pathlib import Path

import pytest

import app.main as main


def _config() -> dict:
    return {
        "report_source_dir": "",
        "destination_folder": "SMA_Report",
        "allowed_extensions": [".pdf"],
        "copy_subdirectories": True,
        "overwrite_by_default": False,
        "allowed_target_roots": [],
        "log_dir": "",
    }


def _create_reports(root: Path) -> None:
    (root / "batch_a" / "nested").mkdir(parents=True)
    (root / "batch_b").mkdir()
    (root / "batch_a" / "report1.pdf").write_bytes(b"one")
    (root / "batch_a" / "nested" / "report2.PDF").write_bytes(b"two")
    (root / "batch_a" / "nested" / "ignore.txt").write_bytes(b"ignored")
    (root / "batch_b" / "report3.pdf").write_bytes(b"three")


def test_selected_folders_expand_recursively_and_remove_overlaps(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "source"
    _create_reports(source)
    monkeypatch.setattr(main, "report_root", lambda: source)
    monkeypatch.setattr(main, "load_config", _config)

    request = main.CopyRequest(
        drive="E:\\",
        files=["batch_a/report1.pdf"],
        folders=["batch_a", "batch_a/nested", "batch_b"],
    )
    selected = main.collect_selected_reports(request)

    assert [path for path, _source in selected] == [
        "batch_a/nested/report2.PDF",
        "batch_a/report1.pdf",
        "batch_b/report3.pdf",
    ]


def test_folder_copy_preserves_relative_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "source"
    target_drive = tmp_path / "target"
    target_drive.mkdir()
    _create_reports(source)
    monkeypatch.setattr(main, "report_root", lambda: source)
    monkeypatch.setattr(main, "load_config", _config)
    monkeypatch.setattr(main, "ensure_target_drive", lambda _drive: target_drive)
    monkeypatch.setattr(
        main,
        "list_drives",
        lambda: [{"root": str(target_drive), "free_bytes": 10_000_000}],
    )
    monkeypatch.setattr(main, "append_operation_log", lambda _message: None)
    monkeypatch.setattr(main, "append_job_log", lambda _job_id, _message: None)
    monkeypatch.setattr(main, "update_job", lambda _job_id, **_updates: None)

    result = main.copy_reports_job(
        "folder-job",
        main.CopyRequest(
            drive="E:\\",
            files=["batch_a/report1.pdf"],
            folders=["batch_a", "batch_b"],
            destination_folder="Export",
        ),
    )

    assert len(result["copied"]) == 3
    assert (target_drive / "Export" / "batch_a" / "report1.pdf").read_bytes() == b"one"
    assert (target_drive / "Export" / "batch_a" / "nested" / "report2.PDF").read_bytes() == b"two"
    assert (target_drive / "Export" / "batch_b" / "report3.pdf").read_bytes() == b"three"
    assert not (target_drive / "Export" / "batch_a" / "nested" / "ignore.txt").exists()


def test_folder_selection_rejects_parent_traversal(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "source"
    source.mkdir()
    monkeypatch.setattr(main, "report_root", lambda: source)
    monkeypatch.setattr(main, "load_config", _config)

    with pytest.raises(ValueError, match="非法报表路径"):
        main.collect_selected_reports(
            main.CopyRequest(drive="E:\\", folders=["../outside"]),
        )


def test_frontend_keeps_file_and_folder_selections_across_navigation() -> None:
    static_dir = Path(__file__).resolve().parents[1] / "app" / "static"
    script = (static_dir / "app.js").read_text(encoding="utf-8")
    html = (static_dir / "index.html").read_text(encoding="utf-8")

    assert "const selectedReportPaths = new Set();" in script
    assert "const selectedFolderPaths = new Set();" in script
    assert 'class="folder-check"' in script
    assert "function selectedFolders()" in script
    assert "folders," in script
    assert "重叠选择会自动去重" in script
    assert 'id="selectionSummary"' in html
