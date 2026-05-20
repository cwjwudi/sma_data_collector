#!/bin/bash
# Finder double-click: build macOS DMG into packaging/mac/output/

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

PACKAGING_MAC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PACKAGING_MAC" || exit 1

echo "━━━━━━━━ SD SMA Report Editor · macOS DMG 打包 ━━━━━━━━"
echo "打包目录: $PACKAGING_MAC"
echo "产物目录: $PACKAGING_MAC/output"
echo ""

chmod +x ./build.sh 2>/dev/null || true
chmod +x ../../backend/scripts/build-backend-exe.sh 2>/dev/null || true

./build.sh "$@"
status=$?

echo ""
if [[ $status -eq 0 ]]; then
  echo "打包完成。按 Enter 关闭本窗口…"
else
  echo "打包失败 (exit $status)。按 Enter 关闭本窗口…"
fi
read -r _

exit "$status"
