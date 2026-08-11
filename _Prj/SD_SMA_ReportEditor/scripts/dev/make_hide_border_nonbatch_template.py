"""生成「一键隐藏边框 + 非批次导出」测试模版，写入本机 AI 版数据目录。"""
from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from schemas.report_template import parse_report_template  # noqa: E402


def uid(prefix: str = "") -> str:
    return f"{prefix}{uuid.uuid4()}" if prefix else str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def layout(header_mm: float = 22, footer_mm: float = 18) -> dict:
    return {
        "marginTopMm": 15,
        "marginRightMm": 15,
        "marginBottomMm": 15,
        "marginLeftMm": 15,
        "headerBandMm": header_mm,
        "footerBandMm": footer_mm,
        "bodyBackgroundCss": "rgb(249 249 251)",
    }


def zone(
    type_: str,
    *,
    text: str = "",
    x: float = 8,
    y: float = 4,
    w: float = 200,
    h: float = 28,
    show_border: bool = True,
    font_size: float = 13,
) -> dict:
    return {
        "id": uid("z_"),
        "type": type_,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "text": text,
        "color": "#18181b",
        "bgColor": "transparent",
        "fontSize": font_size,
        "fontFamily": "FangSong",
        "alignX": "start",
        "alignY": "center",
        "dateFormat": "yyyy-MM-dd HH:mm",
        "imageSrc": "",
        "imageRotationDeg": 0,
        "imageCaptionPosition": "none",
        "pageNumberMode": "slashTotal",
        "zIndex": 0,
        "textAutoWrap": False,
        "showBorder": show_border,
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
        "scalarSqlFillMode": None,
        "scalarSqlVisual": None,
        "mongoQuery": None,
        "nullDisplayMode": None,
        "decimalPlaces": None,
        "tableRows": 2,
        "tableCols": 2,
        "tableCells": [],
        "tableRowHeightPx": 28,
        "tableColWidthsPx": [],
        "tableColBgColors": [],
        "tableSqlFill": None,
    }


def body(
    type_: str,
    *,
    text: str = "",
    x: float = 24,
    y: float = 40,
    w: float = 320,
    h: float = 40,
    show_border: bool = True,
    font_size: float = 16,
) -> dict:
    el = {
        "id": uid("b_"),
        "type": type_,
        "x": x,
        "y": y,
        "w": w,
        "h": h,
        "text": text,
        "color": "#18181b",
        "bgColor": "transparent",
        "fontSize": font_size,
        "fontFamily": "FangSong",
        "zIndex": 0,
        "textAutoWrap": True,
        "showBorder": show_border,
        "imageSrc": "",
        "alignX": "start",
        "alignY": "center",
        "imageRotationDeg": 0,
        "imageCaptionPosition": "none",
        "bindingKind": "none",
        "opcuaNodeId": "",
        "sqlText": "",
        "sqlParams": [],
        "scalarSqlFillMode": None,
        "scalarSqlVisual": None,
        "mongoQuery": None,
        "nullDisplayMode": None,
        "decimalPlaces": None,
        "dateFormat": "yyyy-MM-dd HH:mm:ss" if type_ == "date" else "",
        "chartKind": "line",
        "signerLabel": "",
        "signatureAssetId": "",
        "signatureDisplayMode": "both",
        "tableRows": 3,
        "tableCols": 3,
        "tableCells": [],
        "tableRowHeightPx": 28,
        "tableColWidthsPx": [],
        "tableColBgColors": [],
        "tableSqlFill": None,
    }
    if type_ == "table":
        el["tableCells"] = [
            [
                {"text": "项目", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "#e4e4e7"},
                {"text": "数值", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "#e4e4e7"},
                {"text": "备注", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "#e4e4e7"},
            ],
            [
                {"text": "温度", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "transparent"},
                {"text": "25.0", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "transparent"},
                {"text": "示例", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "transparent"},
            ],
            [
                {"text": "压力", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "transparent"},
                {"text": "1.02", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "transparent"},
                {"text": "示例", "bindingKind": "none", "opcuaNodeId": "", "sqlText": "", "sqlParams": [], "bgColor": "transparent"},
            ],
        ]
        el["showBorder"] = True
    return el


def build(output_dir: Path) -> dict:
    page0 = [
        body(
            "text",
            text="【正文页1】灰色外框应可见。点「一键隐藏边框」后，本控件与页眉/页脚边框消失；下方表格边框应保留。",
            x=24,
            y=24,
            w=520,
            h=72,
            show_border=True,
            font_size=15,
        ),
        body("box", text="", x=24, y=110, w=180, h=56, show_border=True),
        body("date", text="", x=220, y=110, w=200, h=40, show_border=True, font_size=14),
        body("table", text="", x=24, y=190, w=520, h=110, show_border=True),
    ]
    page1 = [
        body(
            "text",
            text="【正文页2】本页边框默认仍显示。在页1点「一键隐藏边框」不应改本页；切到本页再点才会隐藏。",
            x=24,
            y=24,
            w=520,
            h=72,
            show_border=True,
            font_size=15,
        ),
        body("text", text="页2 文本（有边框）", x=24, y=120, w=240, h=40, show_border=True),
    ]

    cover_body = [
        body(
            "text",
            text="封面测试 · 一键隐藏边框 / 非批次导出",
            x=40,
            y=80,
            w=500,
            h=48,
            show_border=True,
            font_size=22,
        ),
        body(
            "text",
            text="封面正文控件带边框。切到「封面」后点「一键隐藏边框」，应隐藏封面页眉/页脚/正文外框（表格除外）。",
            x=40,
            y=150,
            w=500,
            h=80,
            show_border=True,
            font_size=14,
        ),
    ]

    return {
        "schemaVersion": 4,
        "id": "a040-nonbatch-hide-border-test",
        "name": "测试·一键隐藏边框+非批次导出",
        "updatedAt": now_iso(),
        "reportKind": "nonBatch",
        "nonBatchOutputDir": str(output_dir),
        "elements": page0,
        "bodyPages": [page0, page1],
        "paperKind": "A4",
        "orientation": "portrait",
        "layoutPresetId": None,
        "layoutSnapshot": layout(),
        "coverLayoutPresetId": None,
        "coverLayoutSnapshot": layout(),
        "coverHeaderText": "",
        "coverFooterText": "",
        "coverHeaderElements": [
            zone("text", text="封面页眉（有边框）", x=8, y=6, w=360, h=28, show_border=True),
        ],
        "coverFooterElements": [
            zone("pageNumber", text="", x=8, y=4, w=200, h=24, show_border=True),
            zone("text", text="封面页脚（有边框）", x=220, y=4, w=240, h=24, show_border=True),
        ],
        "coverBodyZoneElements": [
            zone("text", text="封面区装饰（有边框）", x=40, y=40, w=220, h=28, show_border=True),
        ],
        "backLayoutPresetId": None,
        "backLayoutSnapshot": layout(header_mm=18, footer_mm=16),
        "backHeaderText": "",
        "backFooterText": "",
        "backHeaderElements": [
            zone("text", text="封底页眉（有边框）", x=8, y=6, w=300, h=28, show_border=True),
        ],
        "backFooterElements": [
            zone("text", text="封底页脚（有边框）", x=8, y=4, w=280, h=24, show_border=True),
        ],
        "backBodyZoneElements": [],
        "headerText": "",
        "footerText": "",
        "headerElements": [
            zone("text", text="正文页眉（有边框）· 测一键隐藏", x=8, y=6, w=400, h=28, show_border=True),
        ],
        "footerElements": [
            zone("pageNumber", text="", x=8, y=4, w=160, h=24, show_border=True),
            zone("text", text="正文页脚（有边框）", x=180, y=4, w=260, h=24, show_border=True),
        ],
        "coverElements": cover_body,
        "backElements": [
            body(
                "text",
                text="封底正文（有边框）。切到封底再点「一键隐藏边框」验证。",
                x=40,
                y=80,
                w=500,
                h=60,
                show_border=True,
            ),
        ],
    }


def main() -> int:
    desktop = Path.home() / "Desktop"
    out_dir = desktop / "ReportEditorNonBatchTest"
    out_dir.mkdir(parents=True, exist_ok=True)

    sample_dir = BACKEND.parent / "getting-started" / "samples"
    sample_dir.mkdir(parents=True, exist_ok=True)
    sample_path = sample_dir / "test-hide-border-nonbatch-template.json"

    raw = build(out_dir)
    t = parse_report_template(raw)
    payload = t.model_dump(mode="json")

    sample_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    # 写入已安装 AI 版用户数据（若目录存在）
    app_templates = (
        Path.home()
        / "AppData"
        / "Roaming"
        / "sd-sma-report-editor-ai"
        / "backend-data"
        / "templates"
    )
    installed = False
    if app_templates.is_dir():
        app_templates.mkdir(parents=True, exist_ok=True)
        dest = app_templates / f"{t.id}.json"
        dest.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        meta = {
            "id": t.id,
            "name": t.name,
            "updatedAt": t.updatedAt,
            "paperKind": t.paperKind,
            "orientation": t.orientation,
            "reportKind": t.reportKind,
            "nonBatchOutputDir": t.nonBatchOutputDir,
        }
        (app_templates / f"{t.id}.meta.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        installed = True

    print(f"sample: {sample_path}")
    print(f"nonBatchOutputDir: {out_dir}")
    print(f"installed_to_appdata: {installed} -> {app_templates if installed else '(skip)'}")
    print(f"template_id: {t.id}")
    print(f"name: {t.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
