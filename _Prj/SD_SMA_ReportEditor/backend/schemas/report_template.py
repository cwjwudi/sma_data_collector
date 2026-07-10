"""报表模版 JSON schema（与前端 `TEMPLATE_SCHEMA_VERSION` 对齐）。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PaperKind = Literal["A3", "A4", "A5", "Letter"]
NullDisplayMode = Literal["blank", "emptyLabel", "fallbackText"]
BindingKind = Literal["none", "opcua", "sql", "mongo"]
TableSqlParamSource = Literal["opcua", "above_cell", "literal", "batch_no"]
ScalarSqlFillMode = Literal["manual", "visual"]
MongoQueryMode = Literal["find", "aggregate"]
Orientation = Literal["portrait", "landscape"]
LayoutPageRole = Literal["normal", "cover", "back"]
ChartKind = Literal["line", "bar"]
SignatureDisplayMode = Literal["watermark", "handwriting", "both"]
LayoutControlType = Literal["text", "box", "image", "pageNumber", "date", "table", "parameter"]
TemplateControlType = Literal["text", "box", "image", "date", "table", "chart", "parameter", "signature"]
PageNumberMode = Literal["plain", "slashTotal", "cnPage", "circle"]
AlignAxis = Literal["start", "center", "end"]
ImageCaptionPosition = Literal["none", "top", "bottom", "left", "right"]

TEMPLATE_SCHEMA_VERSION = 4


class LayoutSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")

    marginTopMm: float = Field(ge=0, default=12)
    marginRightMm: float = Field(ge=0, default=12)
    marginBottomMm: float = Field(ge=0, default=12)
    marginLeftMm: float = Field(ge=0, default=12)
    headerBandMm: float = Field(ge=0, default=0)
    footerBandMm: float = Field(ge=0, default=0)


class TemplateTableCell(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = ""
    bindingKind: BindingKind = "none"
    opcuaNodeId: str = ""
    sqlText: str = ""
    sqlParams: list["TableSqlParamBinding"] = Field(default_factory=list)
    mongoQuery: MongoQueryConfig | None = None
    bgColor: str = "transparent"
    decimalPlaces: int | None = Field(default=None, ge=0, le=10)


class TableSqlParamBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: TableSqlParamSource = "opcua"
    opcuaNodeId: str = ""
    aboveCellColumnIndex: int = Field(default=0, ge=0, le=29)
    literalFallback: str = ""


class ScalarSqlVisualConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connectionId: str = ""
    database: str = ""
    table: str = ""
    engine: str = ""
    valueColumn: str = ""
    whereColumn: str = ""
    whereParamSlot: int = Field(default=0, ge=0, le=1)


class MongoQueryConfig(BaseModel):
    """MongoDB 报表取数：find（默认）或 aggregate pipeline。"""

    model_config = ConfigDict(extra="forbid")

    connectionId: str = ""
    database: str = ""
    collection: str = ""
    mode: MongoQueryMode = "find"
    filterJson: str = "{}"
    projectionJson: str = ""
    sortJson: str = ""
    pipelineJson: str = "[]"
    limit: int = Field(default=200, ge=1, le=5000)
    """标量取值字段名；空则取首行首列。"""
    valueField: str = ""
    """可选：运行时用 OPC 节点值替换集合名（对齐 SQL {{table}}）。"""
    collectionOpcNodeId: str = ""


TableSqlFillMode = Literal["manual_sql", "visual", "mongo"]
TableSqlTableSource = Literal["manual", "opcua"]
TableSqlLayoutMode = Literal["horizontal", "vertical"]
TableSqlColumnRole = Literal["field", "blank", "sequence"]
TableSqlSequencePageMode = Literal["continuous", "restart_per_page"]
TableSqlVerticalMultiRecordMode = Literal["continue", "page_per_record"]
VisualSqlFilterKind = Literal["equality", "datetime_between", "date_between", "numeric_between"]


class TableSqlVisualSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connectionId: str = ""
    database: str = ""
    table: str = ""
    engine: str = ""
    columns: list[str] = Field(default_factory=list)
    # 与前端 table-sql-fill.ts 对齐：manual 用 table；opcua 读 tableOpcNodeId 作运行时表名
    tableSource: TableSqlTableSource = "manual"
    tableOpcNodeId: str = ""


class TableSqlVisualFilter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = ""
    column: str = ""
    kind: VisualSqlFilterKind = "equality"
    defaults: list[str] = Field(default_factory=list)
    bindings: list[TableSqlParamBinding] = Field(default_factory=list)


class TableSqlFillConfig(BaseModel):
    """表格整表按 SQL 结果动态填充（schemaVersion≥4）；导出由生成器执行。"""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    fillMode: TableSqlFillMode = "visual"
    querySql: str = ""
    params: list[TableSqlParamBinding] = Field(default_factory=list)
    resultColumnNames: list[str] = Field(default_factory=list)
    repeatHeaderOnPageBreak: bool = True
    splitReportsOnMaxRows: bool = False
    allowWidgetsBelowSqlFillTable: bool = False
    maxRows: int = Field(default=2000, ge=1, le=50000)
    visualSource: TableSqlVisualSource | None = None
    visualFilters: list[TableSqlVisualFilter] = Field(default_factory=list)
    mongoQuery: MongoQueryConfig | None = None
    layoutMode: TableSqlLayoutMode = "horizontal"
    columnRoles: list[TableSqlColumnRole] = Field(default_factory=list)
    sequencePageMode: TableSqlSequencePageMode = "continuous"
    verticalMultiRecordMode: TableSqlVerticalMultiRecordMode = "continue"
    verticalFieldLabels: list[str] = Field(default_factory=list)
    decimalPlaces: int | None = Field(default=None, ge=0, le=10)


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
    fontFamily: str = ""
    alignX: AlignAxis = "start"
    alignY: AlignAxis = "center"
    dateFormat: str = "yyyy-MM-dd"
    imageSrc: str = ""
    imageRotationDeg: float = 0
    imageCaptionPosition: ImageCaptionPosition = "none"
    pageNumberMode: PageNumberMode = "plain"
    zIndex: int = Field(default=0, ge=0, le=10000)
    textAutoWrap: bool = False
    showBorder: bool = True
    bindingKind: BindingKind = "none"
    opcuaNodeId: str = ""
    sqlText: str = ""
    sqlParams: list[TableSqlParamBinding] = Field(default_factory=list)
    scalarSqlFillMode: ScalarSqlFillMode | None = None
    scalarSqlVisual: ScalarSqlVisualConfig | None = None
    mongoQuery: MongoQueryConfig | None = None
    nullDisplayMode: NullDisplayMode | None = None
    decimalPlaces: int | None = Field(default=None, ge=0, le=10)
    tableRows: int = Field(default=3, ge=1, le=100)
    tableCols: int = Field(default=4, ge=1, le=30)
    tableCells: list[list[TemplateTableCell]] = Field(default_factory=list)
    tableRowHeightPx: float = Field(default=28, ge=16, le=120)
    tableColWidthsPx: list[float] = Field(default_factory=list)
    tableColBgColors: list[str] = Field(default_factory=list)
    tableSqlFill: TableSqlFillConfig | None = None


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
    fontFamily: str = ""
    zIndex: int = Field(default=0, ge=0, le=10000)
    textAutoWrap: bool = False
    showBorder: bool = True
    imageSrc: str = ""
    alignX: AlignAxis = "start"
    alignY: AlignAxis = "center"
    imageRotationDeg: float = 0
    imageCaptionPosition: ImageCaptionPosition = "none"
    bindingKind: BindingKind = "none"
    opcuaNodeId: str = ""
    sqlText: str = ""
    sqlParams: list[TableSqlParamBinding] = Field(default_factory=list)
    scalarSqlFillMode: ScalarSqlFillMode | None = None
    scalarSqlVisual: ScalarSqlVisualConfig | None = None
    mongoQuery: MongoQueryConfig | None = None
    nullDisplayMode: NullDisplayMode | None = None
    decimalPlaces: int | None = Field(default=None, ge=0, le=10)
    dateFormat: str = ""
    chartKind: ChartKind = "line"
    signerLabel: str = ""
    signatureAssetId: str = ""
    signatureDisplayMode: SignatureDisplayMode = "both"
    tableRows: int = Field(default=3, ge=1, le=100)
    tableCols: int = Field(default=4, ge=1, le=30)
    tableCells: list[list[TemplateTableCell]] = Field(default_factory=list)
    tableRowHeightPx: float = Field(default=28, ge=16, le=120)
    tableColWidthsPx: list[float] = Field(default_factory=list)
    tableColBgColors: list[str] = Field(default_factory=list)
    tableSqlFill: TableSqlFillConfig | None = None


class ReportTemplate(BaseModel):
    """落盘单文件 JSON 根对象。"""

    model_config = ConfigDict(extra="forbid")

    schemaVersion: int = Field(default=TEMPLATE_SCHEMA_VERSION, ge=1)
    id: str
    name: str
    updatedAt: str
    elements: list[TemplateElement] = Field(default_factory=list)
    bodyPages: list[list[TemplateElement]] = Field(default_factory=list)
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

    @model_validator(mode="before")
    @classmethod
    def _normalize_body_pages(cls, data: Any) -> Any:
        """旧 JSON 仅有 elements：自动归一为 bodyPages=[elements]，并与 elements 同步第一页。"""
        if not isinstance(data, dict):
            return data
        d = dict(data)
        bp = d.get("bodyPages")
        els = d.get("elements")
        if not isinstance(bp, list) or len(bp) == 0:
            row = list(els) if isinstance(els, list) else []
            d["bodyPages"] = [row]
        else:
            norm: list[list[Any]] = []
            for row in bp:
                norm.append(list(row) if isinstance(row, list) else [])
            if not norm:
                row = list(els) if isinstance(els, list) else []
                d["bodyPages"] = [row]
            else:
                d["bodyPages"] = norm
        bp2 = d.get("bodyPages")
        if isinstance(bp2, list) and len(bp2) > 0 and isinstance(bp2[0], list):
            d["elements"] = list(bp2[0])
        return d


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
        "bodyPages",
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
