"""SD_SMA_ReportEditor FastAPI 入口。"""

# Python 3.9：在加载 Pydantic 模型前先启用 PEP604 注解回退（需安装 requirements 中的 eval-type-backport）
try:
    import eval_type_backport  # noqa: F401
except ImportError:
    pass

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routers import ai_openai as ai_openai_router
from api.routers import assets as assets_router
from api.routers import audit as audit_router
from api.routers import database as database_router
from api.routers import demo as demo_router
from api.routers import opcua as opcua_router
from api.routers import settings_config as settings_config_router
from api.routers import layout_presets as layout_presets_router
from api.routers import signatures as signatures_router
from api.routers import templates as templates_router
from core.settings import (
    APP_VERSION,
    CONFIG_FILE,
    DATA_DIR,
    HISTORY_DIR,
    TEMPLATES_DIR,
    init_data_dirs,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_data_dirs()
    from core.service_beacon import clear_service_beacon, write_service_beacon

    write_service_beacon(api_version=app.version)

    # 后台预热模版摘要 sidecar：低版本升级后首次进入模版页无需在请求内同步解析全部大模版
    try:
        from modules import template_store

        template_store.warm_sidecars()
    except Exception:
        logger.warning("预热模版摘要失败", exc_info=True)

    logger.info("SD_SMA_ReportEditor 后端启动完成")
    try:
        yield
    finally:
        clear_service_beacon()
        logger.info("SD_SMA_ReportEditor 后端关闭")


app = FastAPI(
    title="SD_SMA_ReportEditor API",
    version=APP_VERSION,
    lifespan=lifespan,
)


@app.middleware("http")
async def log_request_exceptions(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception("未捕获异常: %s %s", request.method, request.url.path)
        raise


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _attach_routes() -> None:
    """每个路由同时挂在根路径与 /api 前缀下（兼容 Vite rewrite 与直连 /api/*）。"""
    routers = (
        settings_config_router.router,
        ai_openai_router.settings_router,
        opcua_router.router,
        database_router.router,
        templates_router.router,
        layout_presets_router.router,
        signatures_router.router,
        audit_router.router,
        demo_router.router,
        assets_router.router,
    )
    for r in routers:
        app.include_router(r)
        app.include_router(r, prefix="/api")


_attach_routes()

# OpenAI 兼容 /v1（Cursor 接入，不带 /api 前缀）
app.include_router(ai_openai_router.openai_router)


def _health_body() -> dict:
    data_ok = DATA_DIR.exists() and CONFIG_FILE.exists()
    return {
        "status": "healthy" if data_ok else "degraded",
        "data_dir": str(DATA_DIR),
        "config_exists": CONFIG_FILE.exists(),
        "templates_dir_exists": TEMPLATES_DIR.exists(),
        "history_dir_exists": HISTORY_DIR.exists(),
    }


@app.get("/api")
@app.get("/api/")
async def root_api_prefixed():
    return {"status": "ok", "app": "SD_SMA_ReportEditor", "version": app.version}


@app.get("/health")
async def health():
    return _health_body()


@app.get("/api/health")
async def health_prefixed():
    return _health_body()


def _resolve_web_dist() -> Path | None:
    """前端静态页目录：正式包由 Electron 传入 REPORT_EDITOR_WEB_DIST；
    开发模式回退到仓库 frontend/dist（若已执行过 vite build）。"""
    raw = os.environ.get("REPORT_EDITOR_WEB_DIST", "").strip()
    candidates = (
        [Path(raw)] if raw else [Path(__file__).resolve().parent.parent / "frontend" / "dist"]
    )
    for p in candidates:
        try:
            if p.is_dir() and (p / "index.html").is_file():
                return p
        except OSError:
            continue
    return None


_WEB_DIST = _resolve_web_dist()

if _WEB_DIST is not None:
    # 挂在最后：先匹配上面的 API 路由，未命中的路径交给静态资源（含 / → index.html）。
    # 前端路由使用 hash 模式，无需额外的 SPA fallback。
    app.mount("/", StaticFiles(directory=str(_WEB_DIST), html=True), name="web")
    logger.info("前端静态页已挂载: %s（浏览器可直接访问本服务地址）", _WEB_DIST)
else:

    @app.get("/")
    async def root():
        return {"status": "ok", "app": "SD_SMA_ReportEditor", "version": app.version}

