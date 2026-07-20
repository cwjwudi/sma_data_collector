from pathlib import Path

import sd_sma_launcher as launcher


def test_resolve_launcher_dir_honors_explicit_override(monkeypatch, tmp_path: Path) -> None:
    expected = tmp_path / "installed" / "_Launcher"
    monkeypatch.setenv("SD_SMA_LAUNCHER_DIR", str(expected))

    assert launcher.resolve_launcher_dir() == expected.resolve()


def test_source_launcher_dir_is_launcher_folder(monkeypatch) -> None:
    monkeypatch.delenv("SD_SMA_LAUNCHER_DIR", raising=False)

    assert launcher.resolve_launcher_dir() == Path(launcher.__file__).resolve().parent
