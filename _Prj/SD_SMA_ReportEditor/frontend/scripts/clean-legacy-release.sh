#!/usr/bin/env bash
# Remove old electron-builder folders under frontend/ (before packaging/output layout).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$(cd "$SCRIPT_DIR/.." && pwd)"

LEGACY=(release release-mac release-alt release-installer)

echo "Cleaning legacy electron-builder dirs under frontend/ ..."
for name in "${LEGACY[@]}"; do
  target="$FRONTEND/$name"
  if [[ -d "$target" ]]; then
    echo "  rm -rf $target"
    rm -rf "$target"
  fi
done
echo "OK. Use packaging/windows/output and packaging/mac/output for new builds."
