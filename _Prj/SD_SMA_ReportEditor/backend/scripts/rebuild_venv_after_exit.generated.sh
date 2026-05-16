#!/usr/bin/env bash
set -euo pipefail
cd "/Users/dp/Documents/001_gitea/BRTeam/p000_sd_sma_scada/_Prj/SD_SMA_ReportEditor/backend"
echo "工作目录: $(pwd)"
if [ -d "venv" ]; then
  echo "正在删除 venv..."
  rm -rf venv
fi
if command -v python3 >/dev/null 2>&1; then
  python3 -m venv venv
else
  python -m venv venv
fi
venv/bin/pip install -r requirements.txt
echo "完成。请重新启动应用。"
read -r -p "按 Enter 退出"
