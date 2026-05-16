"""报表模版 JSON schema（与前端 `TEMPLATE_SCHEMA_VERSION` 对齐）。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

PaperKind = Literal["A3", "A4", "A5", "Letter"]
BindingKind = Literal["none", "opcua", "sql"]
Orientation = Literal["portrait", "landscape"]
LayoutPageRole = Literal["normal", "cover", "back"]
ChartKind = Literal["line", "bar"]
LayoutControlType = Literal["text", "box", "image", "pageNumber", "date"]
TemplateControlType = Literal["text", "box", "image", "table", "chart", "parameter", "signature"]
PageNumberMode = Literal["plain", "slashTotal", "cnPage", "circle"]
AlignAxis = Literal["start", "center", "end"]
ImageCaptionPosition = Literal["none", "top", "bottom", "left", "right"]

TEMPLATE_SCHEMA_VERSION = 2


class LayoutSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    marginTopMm: float = Field(ge=0, default=12)
    marginRightMm: float = Field(ge=0, default=12)
    marginBottomMm: float = Field(ge=0, default=12)
    marginLeftMm: float = Field(ge=0, default=12)
    headerBandMm: float = Field(ge=0, default=0)
    footerBandMm: float = Field(ge=0, default=0)


class LayoutZoneElement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: LayoutControlType
    x: float = 0
    y: float = 0
    w: float = 16
    h: float = 16
    text: str = ""
    color: str = "#18181b"
    bgColor: str = "transparent"
    fontSize: float = 13
    alignX: AlignAxis = "start"
    alignY: AlignAxis = "center"
    dateFormat: str = "yyyy-MM-dd"
    imageSrc: str = ""
    imageRotationDeg: float = 0
    imageCaptionPosition: ImageCaptionPosition = "none"
    pageNumberMode: PageNumberMode = "plain"


class TemplateElement(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    type: TemplateControlType
    x: float = 0
    y: float = 0
    w: float = 20
    h: float = 20
    text: str = ""
    color: str = "#18181b"
    bgColor: str = "transparent"
    fontSize: float = 14
    imageSrc: str = ""
    alignX: AlignAxis = "start"
    alignY: AlignAxis = "center"
    imageRotationDeg: float = 0
    imageCaptionPosition: ImageCaptionPosition = "none"
    bindingKind: BindingKind = "none"
    opcuaNodeId: str = ""
    sqlText: str = ""
    chartKind: ChartKind = "line"
    signerLabel: str = ""
    signatureAssetId: str = ""


class ReportTemplate(BaseModel):
    """落盘单文件 JSON 根对象。"""

    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = Field(default=TEMPLATE_SCHEMA_VERSION, ge=1)
    id: str
    name: str
    updatedAt: str
    elements: list[TemplateElement] = Field(default_factory=list)
    paperKind: PaperKind = "A4"
    orientation: Orientation = "portrait"
    layoutPresetId: str | None = None
    layoutSnapshot: LayoutSnapshot
    coverLayoutPresetId: str | None = None
    coverLayoutSnapshot: LayoutSnapshot
    coverHeaderText: str = ""
    coverFooterText: str = ""
    coverHeaderElements: list[LayoutZoneElement] = Field(default_factory=list)
    coverFooterElements: list[LayoutZoneElement] = Field(default_factory=list)
    coverBodyZoneElements: list[LayoutZoneElement] = Field(default_factory=list)
    backLayoutPresetId: str | None = None
    backLayoutSnapshot: LayoutSnapshot
    backHeaderText: str = ""
    backFooterText: str = ""
    backHeaderElements: list[LayoutZoneElement] = Field(default_factory=list)
    backFooterElements: list[LayoutZoneElement] = Field(default_factory=list)
    backBodyZoneElements: list[LayoutZoneElement] = Field(default_factory=list)
    headerText: str = ""
    footerText: str = ""
    headerElements: list[LayoutZoneElement] = Field(default_factory=list)
    footerElements: list[LayoutZoneElement] = Field(default_factory=list)
    coverElements: list[TemplateElement] = Field(default_factory=list)
    backElements: list[TemplateElement] = Field(default_factory=list)


class ReportTemplateSummary(BaseModel):
    id: str
    name: str
    updatedAt: str
    paperKind: PaperKind
    orientation: Orientation


def parse_report_template(raw: dict[str, Any]) -> ReportTemplate:
    """兼容旧版缺省字段。"""
    data = dict(raw)
    if "schemaVersion" not in data:
        data["schemaVersion"] = 1
    for key in (
        "layoutSnapshot",
        "coverLayoutSnapshot",
        "backLayoutSnapshot",
    ):
        if key not in data or data[key] is None:
            data[key] = LayoutSnapshot().model_dump()
    for arr_key in (
        "coverHeaderElements",
        "coverFooterElements",
        "coverBodyZoneElements",
        "backHeaderElements",
        "backFooterElements",
        "backBodyZoneElements",
        "headerElements",
        "footerElements",
        "elements",
        "coverElements",
        "backElements",
    ):
        if arr_key not in data or data[arr_key] is None:
            data[arr_key] = []
    for text_key in (
        "coverHeaderText",
        "coverFooterText",
        "backHeaderText",
        "backFooterText",
        "headerText",
        "footerText",
    ):
        if text_key not in data or data[text_key] is None:
            data[text_key] = ""
    if "paperKind" not in data:
        data["paperKind"] = "A4"
    if "orientation" not in data:
        data["orientation"] = "portrait"
    return ReportTemplate.model_validate(data)


def template_to_jsonable(t: ReportTemplate) -> dict[str, Any]:
    return t.model_dump(mode="json")
