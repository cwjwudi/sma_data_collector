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
BUILD_VERSION=""
BUILD_NOTES=""
ALLOW_VERSION_MISMATCH=0
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"

usage() {
  cat <<'EOF'
Usage: ./build.sh [options]

Options:
  --version <semver>      发版前 bump（写 package.json + latest.json 占位）
  --notes <text>          与 --version 一并写入 latest.json notes
  --fresh                 Rebuild current version only; keep older .dmg in output/
  --skip-frontend-install Skip npm ci
  --skip-backend-build    Skip PyInstaller
  --arch arm64|x64        Target CPU (default: native)
  --allow-version-mismatch  仅警告 package.json 与 latest.json 不一致（不推荐）
  -h, --help              Show this help

发版示例：
  ./build.sh --version 0.1.19 --notes "侧边栏更新进度与版本号" --fresh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh) FRESH=1 ;;
    --skip-frontend-install) SKIP_FRONTEND=1 ;;
    --skip-backend-build) SKIP_BACKEND=1 ;;
    --allow-version-mismatch) ALLOW_VERSION_MISMATCH=1 ;;
    --version)
      shift
      BUILD_VERSION="${1:?--version requires semver e.g. 0.1.19}"
      ;;
    --notes)
      shift
      BUILD_NOTES="${1:?--notes requires text}"
      ;;
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

sync_lockfile_version() {
  local lock="$FRONTEND/package-lock.json"
  [[ -f "$lock" ]] || return 0
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const lock = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const v = pkg.version;
    const cur = (lock.packages && lock.packages[''] && lock.packages[''].version) || lock.version || '';
    if (cur === v) process.exit(0);
    lock.version = v;
    if (lock.packages && lock.packages['']) lock.packages[''].version = v;
    fs.writeFileSync(process.argv[2], JSON.stringify(lock, null, 2) + '\n', 'utf8');
    console.log('[OK] package-lock.json version -> ' + v);
  " "$FRONTEND/package.json" "$lock"
}

assert_version_alignment() {
  local pkg_ver="$1"
  local manifest_ver="$2"
  if [[ -z "$manifest_ver" || "$pkg_ver" == "$manifest_ver" ]]; then
    return 0
  fi
  echo "ERROR: package.json ($pkg_ver) != packaging/updates/latest.json ($manifest_ver)" >&2
  echo "       Run: node packaging/scripts/bump-version.mjs $pkg_ver" >&2
  echo "       Or:  ./build.sh --version $manifest_ver   # 以 manifest 为准 bump" >&2
  echo "       Or:  ./build.sh --version $pkg_ver --notes \"...\"" >&2
  return 1
}

if [[ -n "$BUILD_VERSION" ]]; then
  step "Bump version -> $BUILD_VERSION"
  BUMP_ARGS=(node "$PROJECT_ROOT/packaging/scripts/bump-version.mjs" "$BUILD_VERSION")
  if [[ -n "$BUILD_NOTES" ]]; then
    BUMP_ARGS+=(--notes "$BUILD_NOTES")
  fi
  "${BUMP_ARGS[@]}"
  ok "version bumped"
fi

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
  if [[ "$ALLOW_VERSION_MISMATCH" == "1" ]]; then
    echo "[WARN] package.json ($PKG_VERSION) != packaging/updates/latest.json ($MANIFEST_VERSION)" >&2
  else
    assert_version_alignment "$PKG_VERSION" "$MANIFEST_VERSION" || exit 1
  fi
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
  step "Fresh rebuild for $PKG_VERSION (keep older .dmg in output/)"
  mkdir -p "$OUTPUT_DIR"
  # Current-version artifacts + rebuild intermediates only
  rm -rf \
    "$OUTPUT_DIR/$EXPECTED_DMG" \
    "$OUTPUT_DIR/${EXPECTED_DMG}.blockmap" \
    "$OUTPUT_DIR/latest-mac.yml" \
    "$OUTPUT_DIR/builder-debug.yml" \
    "$OUTPUT_DIR/mac" \
    "$OUTPUT_DIR/mac-arm64" \
    "$OUTPUT_DIR/mac-x64"
  # Versioned leftovers (any arch for this version)
  shopt -s nullglob
  for f in "$OUTPUT_DIR"/Report\ Editor-"$PKG_VERSION"-*.dmg \
           "$OUTPUT_DIR"/Report\ Editor-"$PKG_VERSION"-*.dmg.blockmap \
           "$OUTPUT_DIR"/Report\ Editor-"$PKG_VERSION"-*.zip \
           "$OUTPUT_DIR"/Report\ Editor-"$PKG_VERSION"-*.zip.blockmap; do
    rm -rf "$f"
  done
  shopt -u nullglob
  kept=()
  shopt -s nullglob
  for f in "$OUTPUT_DIR"/Report\ Editor-*-*.dmg; do
    base="$(basename "$f")"
    if [[ "$base" != "$EXPECTED_DMG" && "$base" != Report\ Editor-"$PKG_VERSION"-*.dmg ]]; then
      kept+=("$base")
    fi
  done
  shopt -u nullglob
  # Re-scan kept after cleanup (any remaining other-version dmgs)
  kept=()
  shopt -s nullglob
  for f in "$OUTPUT_DIR"/Report\ Editor-*-*.dmg; do
    kept+=("$(basename "$f")")
  done
  shopt -u nullglob
  if [[ ${#kept[@]} -gt 0 ]]; then
    ok "Preserved older installers: ${kept[*]}"
  else
    ok "No older installers to preserve"
  fi
fi

if [[ "$SKIP_FRONTEND" == "0" ]]; then
  step "Frontend dependencies (npm ci)"
  if [[ -f "$FRONTEND/package-lock.json" ]]; then
    npm_run ci --no-audit --no-fund
    sync_lockfile_version
  else
    npm_run install --no-audit --no-fund
  fi
  ok "npm dependencies ready"
  PKG_VERSION="$(node -p "require('$FRONTEND/package.json').version" 2>/dev/null || echo '?')"
  EXPECTED_DMG="Report Editor-${PKG_VERSION}-${ARCH}.dmg"
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

EXPECTED_DMG_PATH="$OUTPUT_DIR/$EXPECTED_DMG"
DMG=""
if [[ -f "$EXPECTED_DMG_PATH" ]]; then
  DMG="$EXPECTED_DMG_PATH"
else
  DMG="$(find "$OUTPUT_DIR" -maxdepth 1 -name "Report Editor-*-${ARCH}.dmg" -type f 2>/dev/null | head -1 || true)"
  if [[ -n "$DMG" && "$(basename "$DMG")" != "$EXPECTED_DMG" ]]; then
    echo "ERROR: Found $(basename "$DMG") but expected $EXPECTED_DMG" >&2
    echo "       package.json version is $PKG_VERSION — run bump-version or use --fresh" >&2
    ls -la "$OUTPUT_DIR"/*.dmg 2>/dev/null || true
    exit 1
  fi
fi
if [[ -z "$DMG" ]]; then
  DMG="$(find "$OUTPUT_DIR" -maxdepth 1 -name '*.dmg' -type f 2>/dev/null | head -1 || true)"
  if [[ -n "$DMG" ]]; then
    echo "ERROR: No $EXPECTED_DMG under $OUTPUT_DIR (found $(basename "$DMG"))" >&2
    exit 1
  fi
fi

step "Done"
if [[ -n "$DMG" && -f "$DMG" ]]; then
  ok "Installer: $DMG ($(basename "$DMG"))"
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
