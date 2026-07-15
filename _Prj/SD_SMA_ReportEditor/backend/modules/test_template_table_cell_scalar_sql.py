"""024：普通表格单元格 scalarSql* 须能通过 ReportTemplate 校验（与前端对齐）。"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from schemas.report_template import TemplateTableCell, parse_report_template, template_to_jsonable


def _minimal_tpl(**overrides):
    base = {
        "id": "tpl-024",
        "name": "SMA数据测试",
        "updatedAt": "2026-07-15T00:00:00Z",
        "schemaVersion": 4,
        "paperKind": "A4",
        "orientation": "portrait",
        "coverElements": [],
        "bodyPages": [[]],
        "backElements": [],
    }
    base.update(overrides)
    return base


CELL_VISUAL = {
    "connectionId": "47e8cc6e-test",
    "database": "wn_9",
    "table": "product_data",
    "engine": "mysql",
    "valueColumn": "product_name",
    "whereColumn": "batch_no",
    "whereParamSlot": 0,
}


def test_table_cell_accepts_scalar_sql_visual_fields():
    cell = TemplateTableCell.model_validate(
        {
            "text": "",
            "bindingKind": "sql",
            "sqlText": "",
            "sqlParams": [{"source": "opcua", "opcuaNodeId": "ns=2;s=Batch"}],
            "scalarSqlFillMode": "visual",
            "scalarSqlVisual": CELL_VISUAL,
        }
    )
    assert cell.scalarSqlFillMode == "visual"
    assert cell.scalarSqlVisual is not None
    assert cell.scalarSqlVisual.table == "product_data"
    assert cell.scalarSqlVisual.whereParamSlot == 0


def test_cover_table_cell_visual_sql_parses_like_field_repro():
    """复现现场：coverElements[].tableCells[][].scalarSql* 不得 extra_forbidden。"""
    raw = _minimal_tpl(
        coverElements=[
            {
                "id": "tbl-cover",
                "type": "table",
                "x": 10,
                "y": 10,
                "w": 200,
                "h": 80,
                "tableRows": 1,
                "tableCols": 1,
                "tableCells": [
                    [
                        {
                            "text": "",
                            "bindingKind": "sql",
                            "sqlText": "",
                            "sqlParams": [],
                            "scalarSqlFillMode": "Visual",  # 现场报错原文大小写
                            "scalarSqlVisual": CELL_VISUAL,
                        }
                    ]
                ],
            }
        ]
    )
    tpl = parse_report_template(raw)
    cell = tpl.coverElements[0].tableCells[0][0]
    assert cell.scalarSqlFillMode == "visual"
    assert cell.scalarSqlVisual is not None
    assert cell.scalarSqlVisual.connectionId == CELL_VISUAL["connectionId"]


def test_cell_scalar_sql_fill_mode_normalizes_case():
    cell = TemplateTableCell.model_validate(
        {"bindingKind": "sql", "scalarSqlFillMode": "MANUAL"}
    )
    assert cell.scalarSqlFillMode == "manual"


def test_body_page_table_cell_visual_sql_roundtrip():
    raw = _minimal_tpl(
        bodyPages=[
            [
                {
                    "id": "tbl-body",
                    "type": "table",
                    "x": 0,
                    "y": 0,
                    "w": 100,
                    "h": 40,
                    "tableRows": 1,
                    "tableCols": 1,
                    "tableCells": [
                        [
                            {
                                "bindingKind": "sql",
                                "scalarSqlFillMode": "visual",
                                "scalarSqlVisual": CELL_VISUAL,
                                "sqlParams": [
                                    {
                                        "source": "opcua",
                                        "opcuaNodeId": "ns=2;s=X",
                                    }
                                ],
                            }
                        ]
                    ],
                }
            ]
        ]
    )
    tpl = parse_report_template(raw)
    dumped = template_to_jsonable(tpl)
    again = parse_report_template(dumped)
    cell = again.bodyPages[0][0].tableCells[0][0]
    assert cell.scalarSqlVisual is not None
    assert cell.scalarSqlVisual.valueColumn == "product_name"


def test_table_cell_still_forbids_unknown_extra():
    with pytest.raises(ValidationError) as ei:
        TemplateTableCell.model_validate({"bindingKind": "sql", "notARealField": 1})
    assert "notARealField" in str(ei.value)


def test_element_level_scalar_sql_unaffected():
    raw = _minimal_tpl(
        bodyPages=[
            [
                {
                    "id": "param-1",
                    "type": "parameter",
                    "x": 0,
                    "y": 0,
                    "w": 40,
                    "h": 20,
                    "bindingKind": "sql",
                    "scalarSqlFillMode": "visual",
                    "scalarSqlVisual": CELL_VISUAL,
                    "sqlParams": [],
                }
            ]
        ]
    )
    tpl = parse_report_template(raw)
    el = tpl.bodyPages[0][0]
    assert el.scalarSqlFillMode == "visual"
    assert el.scalarSqlVisual is not None
