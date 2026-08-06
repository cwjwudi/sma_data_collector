from pathlib import Path

import pytest

from sd_sma_common import FilesystemBrowser, FilesystemBrowserError


def test_browse_filters_files_and_stops_at_root(tmp_path: Path) -> None:
    root = tmp_path / "allowed"
    child = root / "child"
    child.mkdir(parents=True)
    (child / "dump.sql").write_text("sql", encoding="utf-8")
    (child / "note.txt").write_text("text", encoding="utf-8")
    browser = FilesystemBrowser([root])

    listing = browser.entries(child, extensions=[".sql"])

    assert listing["parent"] == str(root.resolve())
    assert [item["name"] for item in listing["entries"]] == ["dump.sql"]
    assert browser.entries(root)["parent"] == ""


def test_rejects_parent_traversal(tmp_path: Path) -> None:
    root = tmp_path / "allowed"
    root.mkdir()
    browser = FilesystemBrowser([root])

    with pytest.raises(FilesystemBrowserError):
        browser.entries(root / "..")


def test_does_not_return_symlink_escape(tmp_path: Path) -> None:
    root = tmp_path / "allowed"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    link = root / "escape"
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip("symlink creation is unavailable")

    listing = FilesystemBrowser([root]).entries(root)

    assert "escape" not in [item["name"] for item in listing["entries"]]
