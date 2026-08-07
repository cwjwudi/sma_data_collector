from __future__ import annotations

from app import main


def test_launcher_managed_connection_overrides_imported_values(monkeypatch) -> None:
    monkeypatch.setenv("SD_SMA_DB_HOST", "central-db")
    monkeypatch.setenv("SD_SMA_DB_PORT", "3307")
    monkeypatch.setenv("SD_SMA_DB_USERNAME", "central-user")
    monkeypatch.setenv("SD_SMA_DB_DATABASE", "central-name")
    monkeypatch.setenv("SD_SMA_DB_PASSWORD", "central-password")
    imported = main.DbConnection(
        host="imported-db", port=3306, username="imported-user", database="imported-name", password="imported"
    )

    managed = main.managed_connection(imported)
    public = main.default_connection()
    assert (managed.host, managed.port, managed.username, managed.database) == (
        "central-db", 3307, "central-user", "central-name"
    )
    assert main.connection_password(imported) == "central-password"
    assert (public["host"], public["port"], public["username"], public["database"]) == (
        "central-db", 3307, "central-user", "central-name"
    )
