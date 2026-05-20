#!/bin/bash
# Shortcut -> packaging/mac/build.command (Finder double-click)
exec "$(cd "$(dirname "$0")" && pwd)/packaging/mac/build.command" "$@"
