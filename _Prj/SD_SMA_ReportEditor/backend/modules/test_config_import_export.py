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
    merged, result = cbundle.apply_bundle_import(
        current, incoming, "merge", **cie.import_credential_kwargs(dst)
    )
    stored = merged["db_connections"][0]
    assert stored.get("password_enc"), "导入后应有 password_enc"
    assert "password" not in stored
    assert config_store.decrypt_db_password(dst, stored) == plain
    assert result["imported"].get("db_connections") == 1
    assert result["imported"].get("opcua_servers") == 0


def test_opcua_and_ai_and_prefs_roundtrip_via_bundle():
    from modules import config_bundle as cbundle
    from modules import secrets as secrets_mod

    src = _make_data_dir()
    dst = _make_data_dir()
    opc_plain = "opc-secret"
    ai_key = "sk-test-key"
    cfg = {
        "schema_version": 1,
        "app_preferences": {
            "auto_select_last_connection": True,
            "connection_probe_enabled": True,
            "connection_probe_interval_sec": 45,
            "demo_preferred_channel": "remote",
        },
        "db_connections": [],
        "opcua_servers": [
            {
                "id": "opc1",
                "name": "PLC",
                "endpoint_url": "opc.tcp://127.0.0.1:4840",
                "password_enc": config_store.encrypt_opcua_password(src, opc_plain),
            }
        ],
        "ai_settings": {
            "enabled": True,
            "llm_base_url": "https://example.com/v1",
            "llm_model": "demo-model",
            "llm_api_key_enc": secrets_mod.encrypt_secret(src, ai_key),
            "allow_lan_access": True,
            "write_tools_enabled": False,
            "disabled_tools": [],
        },
    }
    # 写入查询会话到 src
    qs_path = src / "query_sessions.json"
    qs_path.write_text(
        '{"favorites": ["SELECT 1"], "history": ["SELECT 2"]}',
        encoding="utf-8",
    )

    bundle = cbundle.build_export_bundle(
        cfg,
        mask_conn=config_store.mask_connection_for_response,
        mask_opcua=config_store.mask_opcua_for_response,
        mode="backup",
        data_dir=src,
        decrypt_db=config_store.decrypt_db_password,
        decrypt_opcua=config_store.decrypt_opcua_password,
        client_prefs={},
        include_audit=False,
    )
    assert bundle["opcua_servers"][0].get("password") == opc_plain
    assert bundle["ai_settings"].get("llm_api_key") == ai_key
    assert "llm_api_key_enc" not in bundle["ai_settings"]
    assert bundle["app_preferences"].get("connection_probe_enabled") is True
    assert bundle["query_sessions"]["favorites"] == ["SELECT 1"]

    counts = cbundle.bundle_content_counts(bundle)
    assert counts["opcua_servers"] == 1
    assert counts["query_session_favorites"] == 1
    assert counts["has_ai_settings"] is True

    current = {
        "schema_version": 1,
        "app_preferences": {},
        "db_connections": [],
        "opcua_servers": [],
    }
    merged, result = cbundle.apply_bundle_import(
        current, bundle, "merge", **cie.import_credential_kwargs(dst)
    )
    assert merged["app_preferences"].get("connection_probe_enabled") is True
    assert merged["app_preferences"].get("connection_probe_interval_sec") == 45
    assert config_store.decrypt_opcua_password(dst, merged["opcua_servers"][0]) == opc_plain
    assert secrets_mod.decrypt_secret(dst, merged["ai_settings"]["llm_api_key_enc"]) == ai_key
    assert merged["ai_settings"].get("enabled") is True
    assert result["imported"].get("opcua_servers") == 1
    assert result["imported"].get("has_ai_settings") is True

    qs_dst = dst / "query_sessions.json"
    assert qs_dst.exists()
    import json

    qs = json.loads(qs_dst.read_text(encoding="utf-8"))
    assert "SELECT 1" in qs["favorites"]


def test_app_preferences_replace_keeps_probe_fields():
    merged, _ = cie.apply_import_replace(
        {
            "schema_version": 1,
            "app_preferences": {
                "connection_probe_enabled": True,
                "connection_probe_interval_sec": 60,
                "demo_preferred_channel": "local",
            },
            "db_connections": [],
            "opcua_servers": [],
        },
        **cie.import_credential_kwargs(_make_data_dir()),
    )
    prefs = merged["app_preferences"]
    assert prefs.get("connection_probe_enabled") is True
    assert prefs.get("connection_probe_interval_sec") == 60
    assert prefs.get("demo_preferred_channel") == "local"
