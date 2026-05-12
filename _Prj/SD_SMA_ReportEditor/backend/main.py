import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from api.routers import database as database_router
from api.routers import environment as environment_router
from api.routers import opcua as opcua_router
from core.settings import (
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
    logger.info("SD_SMA_ReportEditor 后端启动完成")
    yield
    logger.info("SD_SMA_ReportEditor 后端关闭")


app = FastAPI(
    title="SD_SMA_ReportEditor API",
    version="0.2.0",
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

app.include_router(environment_router.router)
app.include_router(opcua_router.router)
app.include_router(database_router.router)


@app.get("/")
async def root():
    return {"status": "ok", "app": "SD_SMA_ReportEditor", "version": "0.2.0"}


@app.get("/health")
async def health():
    data_ok = DATA_DIR.exists() and CONFIG_FILE.exists()
    return {
        "status": "healthy" if data_ok else "degraded",
        "data_dir": str(DATA_DIR),
        "config_exists": CONFIG_FILE.exists(),
        "templates_dir_exists": TEMPLATES_DIR.exists(),
        "history_dir_exists": HISTORY_DIR.exists(),
    }

