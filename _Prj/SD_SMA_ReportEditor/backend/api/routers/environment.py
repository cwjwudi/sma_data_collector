from fastapi import APIRouter

from core.settings import BACKEND_ROOT, CONFIG_FILE, DATA_DIR, DEFAULT_CONFIG, HISTORY_DIR, TEMPLATES_DIR
from modules import diagnostics_service
from schemas.common import FixRequest

router = APIRouter(tags=["environment"])


@router.get("/environment/check")
async def environment_check():
    checks = diagnostics_service.collect_checks(
        DATA_DIR,
        CONFIG_FILE,
        BACKEND_ROOT,
        TEMPLATES_DIR,
        HISTORY_DIR,
    )
    versions = diagnostics_service.try_node_versions()
    return {"checks": checks, "node_tools": versions}


@router.post("/environment/fix")
async def environment_fix(body: FixRequest):
    actions = body.actions or [
        "ensure_directories",
        "write_default_config",
    ]
    result = diagnostics_service.apply_safe_fixes(
        actions,
        DATA_DIR,
        CONFIG_FILE,
        TEMPLATES_DIR,
        HISTORY_DIR,
        DEFAULT_CONFIG,
    )
    return result


@router.get("/environment/pip-install-hint")
async def pip_install_hint():
    """仅返回提示文案，不在服务端静默安装依赖。"""
    return {
        "cmd_windows": r".\venv\Scripts\pip.exe install -r requirements.txt",
        "cmd_unix": "pip install -r requirements.txt",
        "cwd_hint": str(BACKEND_ROOT),
    }
