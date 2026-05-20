from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from core.runtime_mode import deployment_mode_label
from core.settings import BACKEND_ROOT, CONFIG_FILE, DATA_DIR, DEFAULT_CONFIG, HISTORY_DIR, TEMPLATES_DIR
from modules import diagnostics_service
from schemas.common import FixAllWarningsRequest, FixRequest, RebuildEnvironmentRequest

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
    mode = deployment_mode_label()
    versions = diagnostics_service.try_node_versions() if mode == "development" else {}
    return {
        "checks": checks,
        "node_tools": versions,
        "deployment_mode": mode,
    }


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


@router.post("/environment/repair-stream")
async def environment_repair_stream(body: RebuildEnvironmentRequest):
    """
    工控一键：流式返回 NDJSON 日志（端口诊断 → 安全目录修复 → 条件允许时重建 backend/venv 并 pip install）。
    **不会**擅自结束占用 8000/5173 的进程；仅打印 netstat/lsof 推断的 PID 供人工处置。
    """
    if not body.confirm:
        raise HTTPException(status_code=400, detail="请确认执行后再调用（JSON 中传入 confirm: true）")
    gen = diagnostics_service.iter_environment_repair_stream(
        BACKEND_ROOT,
        DATA_DIR,
        CONFIG_FILE,
        TEMPLATES_DIR,
        HISTORY_DIR,
        DEFAULT_CONFIG,
        None,
    )
    return StreamingResponse(gen, media_type="application/x-ndjson; charset=utf-8")


@router.post("/environment/fix-all-warnings")
async def environment_fix_all_warnings(body: FixAllWarningsRequest):
    """
    尽力消除诊断列表中可由此服务自动处理的告警项（目录、缺省配置、按需安装 venv）。
    Python 主版本过低、npm 缺失、需退出后脚本修复的 venv，在返回 skipped / logs 中说明。
    """
    if not body.confirm:
        raise HTTPException(
            status_code=400,
            detail="请先确认后再执行（JSON 传入 confirm: true）。",
        )
    return diagnostics_service.run_warning_autofix_bundle(
        BACKEND_ROOT,
        DATA_DIR,
        CONFIG_FILE,
        TEMPLATES_DIR,
        HISTORY_DIR,
        DEFAULT_CONFIG,
    )


@router.get("/environment/pip-install-hint")
async def pip_install_hint():
    """仅返回提示文案，不在服务端静默安装依赖。"""
    return {
        "cmd_windows": r".\venv\Scripts\pip.exe install -r requirements.txt",
        "cmd_unix": "pip install -r requirements.txt",
        "cwd_hint": str(BACKEND_ROOT),
    }
