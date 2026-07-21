from pathlib import Path

import sd_sma_launcher as launcher


def test_resolve_launcher_dir_honors_explicit_override(monkeypatch, tmp_path: Path) -> None:
    expected = tmp_path / "installed" / "_Launcher"
    monkeypatch.setenv("SD_SMA_LAUNCHER_DIR", str(expected))

    assert launcher.resolve_launcher_dir() == expected.resolve()


def test_source_launcher_dir_is_launcher_folder(monkeypatch) -> None:
    monkeypatch.delenv("SD_SMA_LAUNCHER_DIR", raising=False)

    assert launcher.resolve_launcher_dir() == Path(launcher.__file__).resolve().parent


def test_repair_venv_config_rewrites_relocated_paths(tmp_path: Path) -> None:
    runtime = tmp_path / "installed"
    venv_dir = runtime / ".venv"
    python_home = runtime / "_Python"
    venv_dir.mkdir(parents=True)
    python_home.mkdir(parents=True)
    (python_home / "python.exe").write_bytes(b"placeholder")
    config = venv_dir / "pyvenv.cfg"
    config.write_text(
        "home = C:\\build\\staging\\_Python\n"
        "include-system-site-packages = false\n"
        "version = 3.12.13\n"
        "executable = C:\\build\\staging\\_Python\\python.exe\n"
        "command = C:\\build\\staging\\_Python\\python.exe -m venv C:\\build\\staging\\.venv\n",
        encoding="utf-8",
    )

    assert launcher.repair_venv_config(venv_dir, python_home) is True
    repaired = config.read_text(encoding="utf-8")
    assert f"home = {python_home.resolve()}" in repaired
    assert f"executable = {(python_home / 'python.exe').resolve()}" in repaired
    assert f"command = {(python_home / 'python.exe').resolve()} -m venv {venv_dir.resolve()}" in repaired
    assert "C:\\build\\staging" not in repaired
    assert launcher.repair_venv_config(venv_dir, python_home) is False


def test_repair_venv_config_requires_bundled_python(tmp_path: Path) -> None:
    venv_dir = tmp_path / ".venv"
    venv_dir.mkdir()
    (venv_dir / "pyvenv.cfg").write_text("home = C:\\old\n", encoding="utf-8")

    assert launcher.repair_venv_config(venv_dir, tmp_path / "_Python") is False


def test_db_admin_backup_dir_resolves_from_package_root() -> None:
    config = launcher.load_json(launcher.DEFAULT_CONFIG)
    service = next(item for item in config["services"] if item["name"] == "db_admin")

    env = launcher.resolve_service_env(service)

    assert env["SD_SMA_DB_ADMIN_BACKUP_DIR"] == str((launcher.PACKAGE_ROOT / "backups").resolve())
