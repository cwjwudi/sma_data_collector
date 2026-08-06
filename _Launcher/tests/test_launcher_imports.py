from __future__ import annotations

import json

from launcher_imports import ConfigImportManager


def test_import_preview_strips_secrets_and_backs_up(tmp_path) -> None:
    data_root = tmp_path / "data"
    source_root = tmp_path / "source"
    source_root.mkdir()
    source = source_root / "profile.json"
    source.write_text(
        json.dumps(
            {
                "version": 1,
                "name": "profile",
                "app_settings": {"database": {"host": "db", "password": "plain", "password_enc": "foreign"}},
            }
        ),
        encoding="utf-8",
    )
    target = data_root / "config" / "query_web" / "profile.json"
    target.parent.mkdir(parents=True)
    target.write_text('{"version":1,"name":"old"}', encoding="utf-8")

    manager = ConfigImportManager(data_root)
    manager.update_settings([str(source_root)])
    preview = manager.inspect("query_web", [str(source)])
    assert preview["files"][0]["will_overwrite"] is True
    assert preview["warnings"]
    result = manager.apply(preview["preview_token"])

    imported = json.loads(target.read_text(encoding="utf-8"))
    database = imported["app_settings"]["database"]
    assert "password" not in database
    assert "password_enc" not in database
    backup = result["backup_dir"]
    assert (type(target)(backup) / "profile.json").exists()


def test_db_admin_requires_exactly_one_json(tmp_path) -> None:
    source_root = tmp_path / "source"
    source_root.mkdir()
    for name in ("a.json", "b.json"):
        (source_root / name).write_text('{"default_connection":{}}', encoding="utf-8")
    manager = ConfigImportManager(tmp_path / "data")
    manager.update_settings([str(source_root)])
    try:
        manager.inspect("db_admin", [str(source_root)])
    except ValueError as exc:
        assert "只能导入一个" in str(exc)
    else:
        raise AssertionError("multiple DB Admin configs must be rejected")
