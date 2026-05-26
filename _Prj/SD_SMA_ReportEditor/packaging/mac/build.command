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
  echo "打包完成。"
else
  echo "打包失败 (exit $status)。"
fi

# Finder 双击 .command 时在「终端.app」中运行：按 Enter 后主动关闭窗口。
# Cursor / VS Code 集成终端无法由脚本关闭标签页，故不等待 Enter。
case "${TERM_PROGRAM:-}" in
  Apple_Terminal)
    echo "按 Enter 关闭本窗口…"
    read -r _
    osa_err=$(/usr/bin/osascript 2>&1 <<'APPLESCRIPT'
tell application "Terminal"
  try
    close front window saving false
  on error errMsg number errNum
    return "AppleScript error " & errNum & ": " & errMsg
  end try
end tell
APPLESCRIPT
)
    if [[ -n "$osa_err" ]]; then
      echo "[Terminal] 未能自动关闭窗口：${osa_err}"
      echo "[Terminal] 请手动 ⌘W；或在「系统设置 › 隐私与安全性 › 自动化」中允许「终端」控制「终端」。"
    fi
    ;;
  iTerm.app)
    echo "按 Enter 关闭本窗口…"
    read -r _
    /usr/bin/osascript -e 'tell application "iTerm" to close current window' 2>/dev/null || true
    ;;
  vscode)
    echo "（Cursor / VS Code 集成终端请手动关闭本标签页）"
    ;;
  *)
    echo "按 Enter 结束…"
    read -r _
    ;;
esac

exit "$status"
