#!/bin/bash
# Shortcut -> packaging/mac/build.sh
exec "$(cd "$(dirname "$0")" && pwd)/packaging/mac/build.sh" "$@"
