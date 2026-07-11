"""asset_health_scan 单元测试（不依赖磁盘数据目录时可测纯函数逻辑）。"""

from __future__ import annotations

from modules.asset_health_scan import (
    _check_orphan_presets,
    _count_sql_fill_split_tables,
    _has_legacy_elements_only,
    _issue,
)


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
