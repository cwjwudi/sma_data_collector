#!/usr/bin/env bash
set -euo pipefail

BackendRoot="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BackendRoot"

if [[ ! -f "$BackendRoot/main.py" ]]; then
  echo "[错误] 未在 backend 目录找到 main.py，请确认脚本位于 backend/scripts/ 下。" >&2
  exit 1
fi

export NO_COLOR=1
export FORCE_COLOR=0
export PYTHONUTF8=1
export REPORT_EDITOR_HTTP_PORT=8000

PyExe="$BackendRoot/venv/bin/python3"
if [[ ! -x "$PyExe" ]]; then
  PyExe="$BackendRoot/venv/bin/python"
fi
if [[ ! -x "$PyExe" ]]; then
  PyExe="python3"
fi

echo "SD_SMA_ReportEditor 后端 http://127.0.0.1:8000"
echo "停止：在本终端按 Ctrl+C。"
echo ""

exec "$PyExe" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
