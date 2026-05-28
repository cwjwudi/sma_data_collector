#!/usr/bin/env bash
# Build Report Editor macOS DMG (electron-builder).
# Output: packaging/mac/output/Report Editor-<version>-<arch>.dmg

set -euo pipefail

PACKAGING_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$PACKAGING_DIR/../.." && pwd)"
FRONTEND="$PROJECT_ROOT/frontend"
BACKEND="$PROJECT_ROOT/backend"
OUTPUT_DIR="$PACKAGING_DIR/output"
SKIP_FRONTEND=0
SKIP_BACKEND=0
FRESH=0
ARCH=""
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

usage() {
  cat <<'EOF'
Usage: ./build.sh [options]

Options:
  --fresh                 Remove packaging/mac/output before build
  --skip-frontend-install Skip npm ci
  --skip-backend-build    Skip PyInstaller
  --arch arm64|x64        Target CPU (default: native)
  -h, --help              Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh) FRESH=1 ;;
    --skip-frontend-install) SKIP_FRONTEND=1 ;;
    --skip-backend-build) SKIP_BACKEND=1 ;;
    --arch)
      shift
      ARCH="${1:?--arch requires arm64 or x64}"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: macOS DMG must be built on Darwin (macOS)." >&2
  exit 1
fi

if [[ -z "$ARCH" ]]; then
  case "$(uname -m)" in
    arm64) ARCH="arm64" ;;
    x86_64) ARCH="x64" ;;
    *) ARCH="arm64" ;;
  esac
fi

BACKEND_BIN="$BACKEND/dist/report_backend/report_backend"

step() { echo ""; echo "== $1 =="; }
ok() { echo "[OK] $1"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: missing $1. $2" >&2
    exit 1
  }
}

npm_run() {
  (cd "$FRONTEND" && NPM_CONFIG_REGISTRY="$NPM_REGISTRY" npm "$@")
}

read_manifest_version() {
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      process.stdout.write(String(j.version || '').trim());
    } catch { process.stdout.write(''); }
  " "$PROJECT_ROOT/packaging/updates/latest.json" 2>/dev/null || true
}

node_major() {
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo "0"
}

mkdir -p "$OUTPUT_DIR"

if [[ -d "$FRONTEND/release-mac" ]]; then
  step "Migrate legacy frontend/release-mac -> packaging/mac/output"
  bash "$FRONTEND/scripts/migrate-legacy-release.sh"
fi

step "SD SMA Report Editor - macOS DMG build"
PKG_VERSION="$(node -p "require('$FRONTEND/package.json').version" 2>/dev/null || echo '?')"
MANIFEST_VERSION="$(read_manifest_version)"
EXPECTED_DMG="Report Editor-${PKG_VERSION}-${ARCH}.dmg"
echo "Version:      $PKG_VERSION"
echo "Expected:     $EXPECTED_DMG"
if [[ -n "$MANIFEST_VERSION" && "$MANIFEST_VERSION" != "$PKG_VERSION" ]]; then
  echo "[WARN] package.json ($PKG_VERSION) != packaging/updates/latest.json ($MANIFEST_VERSION)" >&2
  echo "       Run: node packaging/scripts/bump-version.mjs $PKG_VERSION" >&2
fi
echo "Project root: $PROJECT_ROOT"
echo "Packaging:    $PACKAGING_DIR"
echo "Output dir:   $OUTPUT_DIR"
echo "Target arch:  $ARCH"
NODE_VER="$(node -p 'process.versions.node' 2>/dev/null || echo '?')"
echo "Node.js:      $NODE_VER"
NODE_MAJ="$(node_major)"
if [[ "$NODE_MAJ" -ge 24 ]]; then
  echo "[WARN] Node.js $NODE_VER is newer than tested (recommend 22.x LTS)." >&2
elif [[ "$NODE_MAJ" -lt 20 ]]; then
  echo "ERROR: Node.js $NODE_VER is too old. Install Node.js 20.x or 22.x LTS." >&2
  exit 1
fi

require_cmd node "Install Node.js LTS"
require_cmd npm "Install npm"
require_cmd python3 "Install Python 3.10+"

if [[ "$FRESH" == "1" ]]; then
  step "Clean packaging/mac/output"
  rm -rf "$OUTPUT_DIR"/*
fi

if [[ "$SKIP_FRONTEND" == "0" ]]; then
  step "Frontend dependencies (npm ci)"
  if [[ -f "$FRONTEND/package-lock.json" ]]; then
    npm_run ci --no-audit --no-fund
  else
    npm_run install --no-audit --no-fund
  fi
  ok "npm dependencies ready"
fi

if [[ "$SKIP_BACKEND" == "0" ]]; then
  step "Backend executable (PyInstaller)"
  bash "$BACKEND/scripts/build-backend-exe.sh"
  [[ -f "$BACKEND_BIN" ]] || {
    echo "ERROR: Backend build failed: $BACKEND_BIN" >&2
    exit 1
  }
  ok "Backend: $BACKEND_BIN"
elif [[ ! -f "$BACKEND_BIN" ]]; then
  echo "ERROR: --skip-backend-build but missing $BACKEND_BIN" >&2
  exit 1
fi

step "Unit tests (vitest)"
npm_run run test -- --run
ok "npm test passed"

step "Vite production build"
npm_run run build
ok "frontend/dist ready"

step "electron-builder (DMG)"
export ELECTRON_MIRROR
EB_EXIT=0
(
  cd "$FRONTEND"
  OUT_CFG="$OUTPUT_DIR"
  if [[ -x "./node_modules/.bin/electron-builder" ]]; then
    ./node_modules/.bin/electron-builder --mac dmg --"$ARCH" --config.directories.output="$OUT_CFG" || EB_EXIT=$?
  else
    npx electron-builder --mac dmg --"$ARCH" --config.directories.output="$OUT_CFG" || EB_EXIT=$?
  fi
) || EB_EXIT=$?
if [[ "$EB_EXIT" -ne 0 ]]; then
  echo "ERROR: electron-builder failed (exit $EB_EXIT). See packaging/mac/README.md." >&2
  exit 1
fi

DMG="$(find "$OUTPUT_DIR" -maxdepth 1 -name "Report Editor-*-${ARCH}.dmg" -type f 2>/dev/null | head -1 || true)"
if [[ -z "$DMG" ]]; then
  DMG="$(find "$OUTPUT_DIR" -maxdepth 1 -name '*.dmg' -type f 2>/dev/null | head -1 || true)"
fi

step "Done"
if [[ -n "$DMG" && -f "$DMG" ]]; then
  ok "Installer: $DMG"
  echo ""
  echo "Deliver this .dmg to Mac users ($ARCH)."
  echo "User data: ~/Library/Application Support/sd-sma-report-editor/"

  step "Update manifest + sync Portal (if mounted)"
  if node "$PROJECT_ROOT/packaging/scripts/publish-portal-release.mjs" --copy-artifacts --only mac; then
    ok "latest.json synced (darwin-arm64; win32-x64 同版本已保留若存在)"
  else
    echo "[WARN] publish-portal-release failed; run manually after build." >&2
  fi
else
  echo "[WARN] No .dmg under $OUTPUT_DIR." >&2
  exit 1
fi
