import json
import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
TEMPLATES_DIR = DATA_DIR / "templates"
HISTORY_DIR = DATA_DIR / "history"
CONFIG_FILE = DATA_DIR / "config.json"

DEFAULT_CONFIG = {
    "db_connections": [],
    "opcua_servers": [],
}


def init_data_dirs():
    for d in [DATA_DIR, TEMPLATES_DIR, HISTORY_DIR]:
        d.mkdir(parents=True, exist_ok=True)
        logger.info("目录就绪: %s", d)

    if not CONFIG_FILE.exists():
        CONFIG_FILE.write_text(json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info("已创建默认配置: %s", CONFIG_FILE)
    else:
        logger.info("配置文件已存在: %s", CONFIG_FILE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_data_dirs()
    logger.info("SD_SMA_ReportEditor 后端启动完成")
    yield
    logger.info("SD_SMA_ReportEditor 后端关闭")


app = FastAPI(
    title="SD_SMA_ReportEditor API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "ok", "app": "SD_SMA_ReportEditor", "version": "0.1.0"}


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
