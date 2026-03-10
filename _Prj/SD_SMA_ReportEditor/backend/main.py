import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SD_SMA_ReportEditor API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
TEMPLATES_DIR = DATA_DIR / "templates"
HISTORY_DIR = DATA_DIR / "history"


def init_data_dirs():
    for d in [DATA_DIR, TEMPLATES_DIR, HISTORY_DIR]:
        d.mkdir(parents=True, exist_ok=True)
    config_file = DATA_DIR / "config.json"
    if not config_file.exists():
        config_file.write_text('{"db_connections": [], "opcua_servers": []}', encoding="utf-8")


@app.on_event("startup")
async def startup():
    init_data_dirs()


@app.get("/")
async def root():
    return {"status": "ok", "app": "SD_SMA_ReportEditor"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
