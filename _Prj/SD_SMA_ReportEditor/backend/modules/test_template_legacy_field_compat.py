"""047：旧版落盘模版旧值须能通过 ReportTemplate 校验（冒烟·一键无边框打不开）。

现场 0.3.x 早期文件存在：scalarSqlFillMode='none'、nullDisplayMode='empty'、
mongoQuery=''、tableCells/tableColWidthsPx/tableColBgColors=null、
TemplateElement 残留 pageNumberMode。后端收紧 schema 后这些文件 404「模版不存在」。
"""

from __future__ import annotations

from schemas.report_template import (
    LayoutZoneElement,
    TemplateElement,
    TemplateTableCell,
    parse_report_template,
)


def _minimal_tpl(**overrides):
    base = {
        "id": "tpl-047",
        "name": "冒烟·一键无边框",
        "updatedAt": "2026-08-04T00:00:00Z",
        "schemaVersion": 4,
        "paperKind": "A4",
        "orientation": "portrait",
        "coverElements": [],
        "bodyPages": [[]],
        "backElements": [],
    }
    base.update(overrides)
    return base


def _legacy_element(**overrides):
    el = {
        "id": "el-legacy",
        "type": "parameter",
        "bindingKind": "opcua",
        "scalarSqlFillMode": "none",
        "nullDisplayMode": "empty",
        "mongoQuery": "",
        "tableCells": None,
        "tableColWidthsPx": None,
        "tableColBgColors": None,
        "pageNumberMode": "plain",
    }
    el.update(overrides)
    return el


def test_template_element_normalizes_legacy_values():
    el = TemplateElement.model_validate(_legacy_element())
    assert el.scalarSqlFillMode is None
    assert el.nullDisplayMode == "blank"
    assert el.mongoQuery is None
    assert el.tableCells == []
    assert el.tableColWidthsPx == []
    assert el.tableColBgColors == []


def test_zone_element_keeps_valid_page_number_mode():
    raw = _legacy_element(type="pageNumber", pageNumberMode="slashTotal")
    zone = LayoutZoneElement.model_validate(raw)
    assert zone.pageNumberMode == "slashTotal"
    assert zone.scalarSqlFillMode is None
    assert zone.nullDisplayMode == "blank"


def test_table_cell_normalizes_none_fill_mode_and_empty_mongo():
    cell = TemplateTableCell.model_validate(
        {"bindingKind": "sql", "scalarSqlFillMode": "none", "mongoQuery": ""}
    )
    assert cell.scalarSqlFillMode is None
    assert cell.mongoQuery is None


def test_full_template_with_legacy_fields_parses_like_field_repro():
    """复现现场：冒烟·一键无边框（0.3.x 旧文件）各纸面均带旧值。"""
    raw = _minimal_tpl(
        elements=[_legacy_element()],
        bodyPages=[[_legacy_element(id="el-body")]],
        coverElements=[_legacy_element(id="el-cover")],
        headerElements=[_legacy_element(id="el-hdr", type="parameter", pageNumberMode="plain")],
        coverFooterElements=[_legacy_element(id="el-cf", type="text", pageNumberMode="plain")],
    )
    tpl = parse_report_template(raw)
    assert tpl.name == "冒烟·一键无边框"
    assert tpl.bodyPages[0][0].nullDisplayMode == "blank"
    assert tpl.coverElements[0].scalarSqlFillMode is None
    assert tpl.headerElements[0].mongoQuery is None
