from pathlib import Path

import pytest

from app import main


def test_report_browser_lists_directories_only(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    (tmp_path / "batch").mkdir()
    (tmp_path / "report.pdf").write_bytes(b"pdf")
    monkeypatch.setattr(main, "report_root", lambda: tmp_path)
    monkeypatch.setattr(
        main,
        "load_config",
        lambda: {"allowed_source_roots": [], "allowed_target_roots": []},
    )
    monkeypatch.setattr(main, "list_drives", lambda: [])

    listing = main.filesystem_entries(str(tmp_path), "source")

    assert [item["name"] for item in listing["entries"]] == ["batch"]
