#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker 命令，请先安装并启动 Docker Desktop。" >&2
  exit 1
fi
docker compose up -d --build
echo ""
echo "演示环境已启动。"
echo "  MariaDB: 127.0.0.1:3306 / 库 report"
echo "  OPC UA:  opc.tcp://127.0.0.1:4840/report-editor/demo-opcua/"
echo "在 Report Editor 设置 → 演示与培训 中选择「本地工具包」并检测连接。"
