"""签名库条目（PNG data URL），供模版控件引用。"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SignatureAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    imageSrc: str = Field(description="通常为 PNG data URL")
    updatedAt: str
