"""资产健康扫描 API（模版 / 版式）。"""

from __future__ import annotations

from fastapi import APIRouter

from modules.asset_health_scan import run_asset_health_scan

router = APIRouter(tags=["assets"])


@router.get("/assets/health-scan")
def assets_health_scan():
    """只读扫描全部模版与版式的潜在问题（不探活数据源）。"""
    return run_asset_health_scan()
