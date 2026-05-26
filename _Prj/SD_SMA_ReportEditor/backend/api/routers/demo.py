from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from core.settings import CONFIG_FILE, DATA_DIR
from modules import config_store, demo_service
from schemas.common import DemoApplyRequest

router = APIRouter(tags=["demo"])


def _load():
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _save(cfg):
    config_store.save_config(CONFIG_FILE, cfg)


@router.get("/demo/presets")
async def demo_presets():
    cfg = _load()
    return demo_service.get_presets(cfg)


@router.get("/demo/health")
async def demo_health(channel: str = Query("remote")):
    ch = channel.strip().lower()
    if ch not in ("remote", "local"):
        raise HTTPException(400, "channel 须为 remote 或 local")
    cfg = _load()
    return await demo_service.check_health(cfg, ch)  # type: ignore[arg-type]


@router.post("/demo/apply_connections")
async def demo_apply_connections(body: DemoApplyRequest):
    ch = (body.channel or "remote").strip().lower()
    if ch not in ("remote", "local"):
        raise HTTPException(400, "channel 须为 remote 或 local")
    cfg = _load()
    try:
        result = demo_service.apply_demo_connections(cfg, DATA_DIR, ch)  # type: ignore[arg-type]
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    _save(cfg)
    return result
