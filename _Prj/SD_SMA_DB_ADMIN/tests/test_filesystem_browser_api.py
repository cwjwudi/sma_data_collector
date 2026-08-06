from pathlib import Path

import pytest

from app import main


def test_db_browser_limits_file_types(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    (tmp_path / "dump.sql").write_text("sql", encoding="utf-8")
    (tmp_path / "data.csv").write_text("csv", encoding="utf-8")
    monkeypatch.setattr(main, "backup_dir", lambda: tmp_path)
    monkeypatch.setattr(main, "windows_removable_roots", lambda: [])
    monkeypatch.setattr(main, "load_config", lambda: {"allowed_browse_roots": []})

    listing = main.filesystem_entries(str(tmp_path), "sql")

    assert [item["name"] for item in listing["entries"]] == ["dump.sql"]


def test_register_file_rejects_outside_allowed_roots(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside.sql"
    outside.write_text("sql", encoding="utf-8")
    monkeypatch.setattr(main, "backup_dir", lambda: allowed)
    monkeypatch.setattr(main, "windows_removable_roots", lambda: [])
    monkeypatch.setattr(main, "load_config", lambda: {"allowed_browse_roots": []})

    with pytest.raises(main.HTTPException) as exc:
        main.register_file({"kind": "sql", "path": str(outside)})

    assert exc.value.status_code == 400
