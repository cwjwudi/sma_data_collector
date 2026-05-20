#!/usr/bin/env bash
# Builds backend/dist/report_backend/ for electron-builder extraResources (macOS / Linux).
set -euo pipefail

cd "$(dirname "$0")/.."

pick_python() {
  if [[ -x "./venv/bin/python" ]]; then
    echo "./venv/bin/python"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return
  fi
  echo "ERROR: python3 not found. Install Python 3.10+ (e.g. brew install python@3.12)." >&2
  exit 1
}

PY="$(pick_python)"

if [[ ! -x "./venv/bin/python" ]]; then
  echo "Creating venv..."
  "$PY" -m venv venv
fi

VENV_PY="./venv/bin/python"
"$VENV_PY" -m pip install -q -r requirements-dev.txt

echo "Running PyInstaller..."
"$VENV_PY" -m PyInstaller \
  --noconfirm --clean --onedir \
  --name report_backend \
  --paths . \
  run_backend.py \
  --hidden-import uvicorn.logging \
  --hidden-import uvicorn.loops \
  --hidden-import uvicorn.loops.auto \
  --hidden-import uvicorn.protocols \
  --hidden-import uvicorn.protocols.http \
  --hidden-import uvicorn.protocols.http.auto \
  --hidden-import uvicorn.protocols.websockets \
  --hidden-import uvicorn.protocols.websockets.auto \
  --hidden-import uvicorn.lifespan \
  --hidden-import uvicorn.lifespan.on \
  --hidden-import pydantic.deprecated.decorator \
  --hidden-import pymysql \
  --collect-all uvicorn \
  --collect-all fastapi \
  --collect-all starlette \
  --collect-all pydantic \
  --collect-all sqlalchemy \
  --collect-all cryptography \
  --collect-all asyncua

if [[ "$(uname -s)" == "Darwin" ]]; then
  EXE="./dist/report_backend/report_backend"
else
  EXE="./dist/report_backend/report_backend"
fi

if [[ ! -f "$EXE" ]]; then
  echo "ERROR: Build failed: missing $EXE" >&2
  exit 1
fi
chmod +x "$EXE" 2>/dev/null || true
echo "OK: $EXE"
