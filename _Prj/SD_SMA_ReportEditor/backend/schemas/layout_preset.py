"""版式预设（页眉页脚 / 纸张），与前端 `LayoutPreset` 对齐。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from schemas.report_template import LayoutZoneElement

PaperKind = Literal["A3", "A4", "A5", "Letter"]
Orientation = Literal["portrait", "landscape"]
LayoutPageRole = Literal["normal", "cover", "back"]


class LayoutPreset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    updatedAt: str
    paperKind: PaperKind = "A4"
    orientation: Orientation = "portrait"
    marginTopMm: float = Field(ge=0, default=15)
    marginRightMm: float = Field(ge=0, default=15)
    marginBottomMm: float = Field(ge=0, default=15)
    marginLeftMm: float = Field(ge=0, default=15)
    headerBandMm: float = Field(ge=0, default=22)
    footerBandMm: float = Field(ge=0, default=18)
    bodyBackgroundCss: str = Field(default="rgb(249 249 251)")
    pageRole: LayoutPageRole = "normal"
    headerText: str = ""
    footerText: str = ""
    headerElements: list[LayoutZoneElement] = Field(default_factory=list)
    footerElements: list[LayoutZoneElement] = Field(default_factory=list)
    bodyElements: list[LayoutZoneElement] = Field(default_factory=list)


class LayoutPresetSummary(BaseModel):
    id: str
    name: str
    updatedAt: str
    paperKind: PaperKind
    orientation: Orientation
    pageRole: LayoutPageRole
