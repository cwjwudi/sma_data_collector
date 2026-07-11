#!/usr/bin/env bash
# 将 PNG 转为 electron-builder 用的 1024×1024 图标
# 策略：居中裁切为正方形（不拉伸、不补白/黑边），再缩放到 1024
set -euo pipefail

SRC="${1:-}"
DST="${2:-$(dirname "$0")/../build/icon.png}"

if [[ -z "$SRC" || ! -f "$SRC" ]]; then
  echo "用法: $0 <源 PNG> [输出路径]" >&2
  exit 1
fi

mkdir -p "$(dirname "$DST")"
TMP="$(mktemp /tmp/icon-work.XXXXXX.png)"
trap 'rm -f "$TMP"' EXIT

W=$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/ {print $2}')
H=$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/ {print $2}')

if [[ "$W" == "$H" ]]; then
  cp "$SRC" "$TMP"
else
  SIDE=$(( W < H ? W : H ))
  sips -c "$SIDE" "$SIDE" "$SRC" --out "$TMP" >/dev/null
fi

sips -Z 1024 "$TMP" --out "$DST" >/dev/null

# 去掉圆角外实心黑角（桌面快捷方式否则四角发黑）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if command -v python3 >/dev/null 2>&1; then
  python3 "$SCRIPT_DIR/clear-icon-black-corners.py" "$DST" || true
elif command -v python >/dev/null 2>&1; then
  python "$SCRIPT_DIR/clear-icon-black-corners.py" "$DST" || true
fi

FW=$(sips -g pixelWidth "$DST" | awk '/pixelWidth/ {print $2}')
FH=$(sips -g pixelHeight "$DST" | awk '/pixelHeight/ {print $2}')
echo "已生成 ${FW}x${FH}（居中裁切，无补边）-> $DST"

ICO="$(dirname "$DST")/icon.ico"
if command -v npx >/dev/null 2>&1; then
  npx --yes png-to-ico "$DST" > "$ICO"
  echo "已生成 Windows 图标 -> $ICO"
else
  echo "未找到 npx，请手动生成 $ICO（例如: npx png-to-ico $DST > $ICO）" >&2
fi
