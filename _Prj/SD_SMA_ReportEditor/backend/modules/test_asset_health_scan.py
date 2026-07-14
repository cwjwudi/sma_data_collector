"""asset_health_scan 单元测试（不依赖磁盘数据目录时可测纯函数逻辑）。"""

from __future__ import annotations

from modules.ai_template_bindings import extract_template_bindings, validate_bindings_against_config
from modules.asset_health_scan import (
    _check_orphan_presets,
    _count_sql_fill_split_tables,
    _has_legacy_elements_only,
    _issue,
)
from modules.binding_config_scan import scan_binding_config


def test_issue_shape():
    i = _issue(
        severity="error",
        kind="missing_db",
        message="x",
        asset_kind="template",
        asset_id="t1",
        asset_name="T",
        hint="h",
        meta={"connection_id": "c"},
    )
    assert i["severity"] == "error"
    assert i["meta"]["connection_id"] == "c"


def test_orphan_preset_missing():
    raw = {"layoutPresetId": "missing-preset-id"}
    issues = _check_orphan_presets(raw, asset_id="t1", asset_name="T", layout_by_id={})
    assert any(x["kind"] == "orphan_layout_preset" for x in issues)


def test_orphan_preset_role_mismatch():
    class P:
        pageRole = "cover"

    raw = {"layoutPresetId": "p1"}
    issues = _check_orphan_presets(raw, asset_id="t1", asset_name="T", layout_by_id={"p1": P()})
    assert any(x["kind"] == "layout_preset_role_mismatch" for x in issues)


def test_legacy_elements_only():
    assert _has_legacy_elements_only({"elements": [{"id": "a"}], "bodyPages": []}) is True
    assert _has_legacy_elements_only({"elements": [{"id": "a"}], "bodyPages": [[{"id": "a"}]]}) is False


def test_split_sql_fill_count():
    raw = {
        "bodyPages": [
            [
                {
                    "type": "table",
                    "tableSqlFill": {"enabled": True, "splitReportsOnMaxRows": True},
                },
                {
                    "type": "table",
                    "tableSqlFill": {"enabled": True, "splitReportsOnMaxRows": True},
                },
            ]
        ]
    }
    assert _count_sql_fill_split_tables(raw) == 2


def test_missing_db_meta_has_connection_id_no_element_id():
    """007 B5：连接级 missing_db 汇总无 elementId。"""
    raw = {
        "bodyPages": [
            [
                {
                    "id": "e1",
                    "type": "parameter",
                    "bindingKind": "sql",
                    "scalarSqlVisual": {"connectionId": "stale-conn", "database": "db", "table": "t"},
                }
            ]
        ]
    }
    bindings = extract_template_bindings(raw)
    issues = validate_bindings_against_config(bindings, db_by_id={}, opc_by_id={})
    hit = next(i for i in issues if i["kind"] == "missing_db")
    assert hit["connection_id"] == "stale-conn"
    assert "elementId" not in hit


def test_missing_default_database_meta_no_element_id():
    """007 B6：连接存在但未设默认库 → 无 elementId。"""
    raw = {
        "bodyPages": [
            [
                {
                    "id": "e1",
                    "type": "parameter",
                    "scalarSqlVisual": {"connectionId": "c1", "database": "db", "table": "t"},
                }
            ]
        ]
    }
    bindings = extract_template_bindings(raw)
    issues = validate_bindings_against_config(
        bindings,
        db_by_id={
            "c1": {
                "id": "c1",
                "name": "SMA",
                "engine": "mysql",
                "database": "",
                "has_password": True,
            }
        },
        opc_by_id={},
    )
    hit = next(i for i in issues if i["kind"] == "missing_default_database")
    assert hit["connection_id"] == "c1"
    assert "elementId" not in hit


def test_cover_opc_empty_has_element_id():
    """007 B3：封面画布 OPC 空节点带 elementId。"""
    raw = {
        "coverElements": [
            {
                "id": "p-cover-1",
                "type": "parameter",
                "bindingKind": "opcua",
                "opcuaNodeId": "",
                "text": "批次",
                "x": 10,
                "y": 10,
            }
        ]
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="T")
    hit = next(i for i in issues if i["kind"] == "opc_binding_empty_node")
    assert hit["meta"]["elementId"] == "p-cover-1"
