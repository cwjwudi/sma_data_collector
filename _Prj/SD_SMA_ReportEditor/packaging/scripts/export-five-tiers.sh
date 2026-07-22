#!/usr/bin/env bash
# 用五档导出模式各导出一份 PDF（复用本机已运行的后端 :8000）。
# 用法：
#   ./packaging/scripts/export-five-tiers.sh [templateId] [outDir]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FRONTEND="$ROOT/frontend"
TEMPLATE_ID="${1:-336a5e28-552a-4def-afa4-fdac8c09c46e}"
OUT_DIR="${2:-$HOME/Desktop/report-editor-five-tier-exports}"
mkdir -p "$OUT_DIR"
if [[ ! -f "$FRONTEND/dist/index.html" ]]; then
  echo "[export-five-tiers] building frontend dist…"
  (cd "$FRONTEND" && npm run build)
fi
echo "[export-five-tiers] template=$TEMPLATE_ID"
echo "[export-five-tiers] outDir=$OUT_DIR"
export REPORT_EDITOR_REUSE_BACKEND=1
export REPORT_EDITOR_LOAD_DIST=1
export REPORT_EDITOR_FIVE_TIER_EXPORT="${TEMPLATE_ID}|${OUT_DIR}"
cd "$FRONTEND"
exec npx electron .
