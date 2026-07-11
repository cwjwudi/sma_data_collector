"""binding_config_scan 单元测试。"""

from __future__ import annotations

from modules.binding_config_scan import looks_like_opc_node_id, scan_binding_config


def test_opc_node_format():
    assert looks_like_opc_node_id("ns=6;s=::Program:Var") is True
    assert looks_like_opc_node_id("ns=2;i=1234") is True
    assert looks_like_opc_node_id("bad") is False
    assert looks_like_opc_node_id("") is False


def test_empty_opc_binding():
    raw = {
        "bodyPages": [
            [
                {
                    "id": "e1",
                    "type": "parameter",
                    "bindingKind": "opcua",
                    "opcuaNodeId": "",
                    "text": "批次号",
                    "x": 120,
                    "y": 48,
                }
            ]
        ]
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="T")
    hit = next(i for i in issues if i["kind"] == "opc_binding_empty_node")
    assert "正文第1页" in hit["message"]
    assert "数据参数" in hit["message"]
    assert "批次号" in hit["message"]
    assert "坐标约(120,48)" in hit["message"]
    assert "ID=e1" in hit["message"]
    assert hit["meta"]["location"] == "正文第1页"
    assert hit["meta"]["elementId"] == "e1"


def test_placeholder_text_not_used_as_name():
    raw = {
        "coverElements": [
            {
                "id": "p-cover-1",
                "type": "parameter",
                "bindingKind": "opcua",
                "opcuaNodeId": "",
                "text": "{{value}}",
                "x": 200,
                "y": 80,
            }
        ]
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="审计")
    hit = next(i for i in issues if i["kind"] == "opc_binding_empty_node")
    assert "封面画布" in hit["message"]
    assert "{{value}}" not in hit["message"]
    assert "坐标约(200,80)" in hit["message"]
    assert "ID=p-cover-1" in hit["message"]
    assert "封面画布" in (hit.get("hint") or "")


def test_empty_opc_binding_on_page2_header():
    raw = {
        "bodyPages": [[], []],
        "headerElements": [
            {
                "id": "h1",
                "type": "parameter",
                "bindingKind": "opcua",
                "opcuaNodeId": "",
                "text": "页眉参数",
                "x": 10,
                "y": 5,
            }
        ],
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="T")
    hit = next(i for i in issues if i["kind"] == "opc_binding_empty_node")
    assert "页眉" in hit["message"]
    assert "页眉参数" in hit["message"]


def test_table_cell_opc_location():
    raw = {
        "bodyPages": [
            [
                {
                    "id": "tbl1",
                    "type": "table",
                    "text": "配方表",
                    "x": 40,
                    "y": 100,
                    "tableCells": [
                        [
                            {"text": "a", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": []},
                            {
                                "text": "",
                                "bindingKind": "opcua",
                                "opcuaNodeId": "",
                                "sqlText": "",
                                "sqlParams": [],
                            },
                        ]
                    ],
                }
            ]
        ]
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="T")
    hit = next(i for i in issues if i["kind"] == "opc_binding_empty_node")
    assert "正文第1页" in hit["message"]
    assert "表格" in hit["message"]
    assert "第1行" in hit["message"]
    assert "第2列" in hit["message"]


def test_table_opc_placeholder_mismatch():
    raw = {
        "bodyPages": [
            [
                {
                    "id": "tbl1",
                    "type": "table",
                    "tableCols": 2,
                    "tableRows": 2,
                    "tableCells": [],
                    "tableSqlFill": {
                        "enabled": True,
                        "fillMode": "visual",
                        "querySql": "SELECT a FROM `fixed_table`",
                        "visualSource": {
                            "connectionId": "c1",
                            "database": "db",
                            "table": "fixed_table",
                            "engine": "mysql",
                            "columns": ["a"],
                            "tableSource": "opcua",
                            "tableOpcNodeId": "ns=6;s=TableName",
                        },
                    },
                }
            ]
        ]
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="T")
    assert any(i["kind"] == "sql_fill_table_placeholder_mismatch" for i in issues)


def test_param_placeholder_oob():
    raw = {
        "elements": [
            {
                "id": "e2",
                "type": "parameter",
                "bindingKind": "sql",
                "sqlText": "SELECT 1 WHERE x={{p0}} AND y={{p1}}",
                "sqlParams": [{"source": "literal", "opcuaNodeId": "", "literalFallback": "1"}],
            }
        ]
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="T")
    assert any(i["kind"] == "sql_param_placeholder_oob" for i in issues)


def test_sql_fill_table_opc_missing_node():
    raw = {
        "elements": [
            {
                "id": "tbl2",
                "type": "table",
                "tableSqlFill": {
                    "enabled": True,
                    "fillMode": "visual",
                    "querySql": "",
                    "visualSource": {
                        "connectionId": "c1",
                        "database": "db",
                        "table": "",
                        "engine": "mysql",
                        "columns": [],
                        "tableSource": "opcua",
                        "tableOpcNodeId": "",
                    },
                },
            }
        ]
    }
    issues = scan_binding_config(raw, asset_kind="template", asset_id="t1", asset_name="T")
    kinds = {i["kind"] for i in issues}
    assert "sql_fill_table_opc_missing_node" in kinds
    assert "sql_fill_visual_no_structure_table" in kinds
