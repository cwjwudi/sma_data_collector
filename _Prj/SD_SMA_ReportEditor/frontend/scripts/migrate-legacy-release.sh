#!/usr/bin/env bash
# Move legacy frontend/release* electron-builder output into packaging/*/output.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT="$(cd "$FRONTEND/.." && pwd)"
WIN_OUT="$PROJECT/packaging/windows/output"
WIN_ALT="$PROJECT/packaging/windows/output-alt"
MAC_OUT="$PROJECT/packaging/mac/output"

move_dir_contents() {
  local src="$1"
  local dest="$2"
  local label="$3"

  if [[ ! -d "$src" ]]; then
    echo "[skip] $label: not found ($src)"
    return 0
  fi

  mkdir -p "$dest"
  local count=0
  shopt -s dotglob nullglob
  for item in "$src"/*; do
    local base
    base="$(basename "$item")"
    if [[ -e "$dest/$base" ]]; then
      echo "[warn] $label: dest already has $base — skip (remove or merge manually)"
      continue
    fi
    echo "[move] $item -> $dest/"
    mv "$item" "$dest/"
    count=$((count + 1))
  done
  shopt -u dotglob nullglob

  if [[ -d "$src" ]] && [[ -z "$(ls -A "$src" 2>/dev/null || true)" ]]; then
    rmdir "$src" 2>/dev/null || true
    echo "[ok] removed empty $src"
  elif [[ -d "$src" ]]; then
    echo "[warn] $label: $src not empty after move; check leftovers"
  fi

  echo "[done] $label: moved $count item(s) -> $dest"
}

echo "Migrating legacy electron-builder output under frontend/ ..."
move_dir_contents "$FRONTEND/release" "$WIN_OUT" "release (Windows)"
move_dir_contents "$FRONTEND/release-alt" "$WIN_ALT" "release-alt (Windows alt)"
move_dir_contents "$FRONTEND/release-installer" "$WIN_OUT" "release-installer"
move_dir_contents "$FRONTEND/release-mac" "$MAC_OUT" "release-mac (macOS)"

echo ""
echo "Target dirs:"
echo "  Windows: $WIN_OUT"
echo "  Windows alt: $WIN_ALT"
echo "  macOS:     $MAC_OUT"
echo "If release-mac was already deleted, re-run: packaging/mac/build.sh"
