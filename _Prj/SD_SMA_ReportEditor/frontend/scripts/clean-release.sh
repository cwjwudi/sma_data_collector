#!/usr/bin/env bash
# Remove electron-builder output folder (e.g. release-mac).
set -euo pipefail

OUTPUT="${1:-release-mac}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$(cd "$SCRIPT_DIR/.." && pwd)/$OUTPUT"

if [[ ! -d "$TARGET" ]]; then
  echo "OK: nothing to clean ($TARGET)"
  exit 0
fi

echo "Removing $TARGET ..."
rm -rf "$TARGET"
echo "OK: removed"
