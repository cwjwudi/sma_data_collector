#!/usr/bin/env bash
# Delete legacy frontend/release* (run migrate-legacy-release.sh first if you need to keep artifacts).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$(cd "$SCRIPT_DIR/.." && pwd)"

LEGACY=(release release-mac release-alt release-installer)

echo "Removing legacy electron-builder dirs under frontend/ ..."
for name in "${LEGACY[@]}"; do
  target="$FRONTEND/$name"
  if [[ -d "$target" ]]; then
    echo "  rm -rf $target"
    rm -rf "$target"
  fi
done
echo "OK. New builds go to packaging/windows/output and packaging/mac/output."
