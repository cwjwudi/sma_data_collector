"""跨机配置导入：明文 password 与 foreign password_enc 处理。"""
from __future__ import annotations

import tempfile
from pathlib import Path

from modules import config_import_export as cie
from modules import config_store


def _make_data_dir() -> Path:
    return Path(tempfile.mkdtemp())


def test_export_and_import_plain_password_across_machines():
    src = _make_data_dir()
    dst = _make_data_dir()
    plain = "secret-pass-123"
    enc = config_store.encrypt_db_password(src, plain)
    row = {
        "id": "c1",
        "engine": "mysql",
        "host": "127.0.0.1",
        "password_enc": enc,
    }
    exported = cie.export_credential_row_for_bundle(src, row, config_store.decrypt_db_password)
    assert exported.get("password") == plain
    assert "password_enc" not in exported

    merged, warnings = cie.apply_import_replace(
        {
            "schema_version": 1,
            "app_preferences": {},
            "db_connections": [exported],
            "opcua_servers": [],
        },
        **cie.import_credential_kwargs(dst),
    )
    assert not warnings
    stored = merged["db_connections"][0]
    assert stored.get("password_enc")
    assert config_store.decrypt_db_password(dst, stored) == plain


def test_foreign_password_enc_stripped_with_warning():
    src = _make_data_dir()
    dst = _make_data_dir()
    enc = config_store.encrypt_db_password(src, "only-on-src")
    incoming = {
        "schema_version": 1,
        "app_preferences": {},
        "db_connections": [
            {"id": "c1", "engine": "mysql", "host": "h", "password_enc": enc},
        ],
        "opcua_servers": [],
    }
    merged, warnings = cie.apply_import_replace(incoming, **cie.import_credential_kwargs(dst))
    assert merged["db_connections"][0].get("password_enc") is None
    assert any("其它电脑" in w for w in cie.format_import_warnings(warnings))


def test_bundle_import_passes_data_dir_for_password_reencrypt():
    """回归：apply_bundle_import(**import_credential_kwargs) 必须把明文 password 写成 password_enc。"""
    from modules import config_bundle as cbundle

    dst = _make_data_dir()
    plain = "bundle-pass-456"
    incoming = {
        "bundle_version": 3,
        "schema_version": 1,
        "exported_at": "2026-07-11T00:00:00Z",
        "app_preferences": {},
        "db_connections": [
            {
                "id": "c-bundle",
                "name": "MySQL",
                "engine": "mysql",
                "host": "127.0.0.1",
                "port": 3306,
                "username": "root",
                "password": plain,
            }
        ],
        "opcua_servers": [],
        "templates": [],
        "layout_presets": [],
        "signature_assets": [],
        "client_prefs": {},
    }
    current = {
        "schema_version": 1,
        "app_preferences": {},
        "db_connections": [],
        "opcua_servers": [],
    }
    # 用 merge 避免清空本机 TEMPLATES_DIR 等真实目录
    merged, _result = cbundle.apply_bundle_import(
        current, incoming, "merge", **cie.import_credential_kwargs(dst)
    )
    stored = merged["db_connections"][0]
    assert stored.get("password_enc"), "导入后应有 password_enc"
    assert "password" not in stored
    assert config_store.decrypt_db_password(dst, stored) == plain
