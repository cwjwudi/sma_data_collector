#!/usr/bin/env python3
"""将图标圆角外的实心黑角改为透明，并可选重建 icon.ico。

用法:
  python clear-icon-black-corners.py [icon.png] [--ico]
"""

from __future__ import annotations

import argparse
import sys
from collections import deque
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow：pip install pillow", file=sys.stderr)
    raise SystemExit(1)

import numpy as np


def clear_connected_black_corners(png: Path, thresh: int = 28) -> int:
    im = Image.open(png).convert("RGBA")
    arr = np.array(im)
    h, w = arr.shape[:2]
    rgb_sum = arr[:, :, :3].astype(np.int16).sum(axis=2)
    alpha = arr[:, :, 3]

    vis = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        vis[y, x] = True
        q.append((x, y))

    while q:
        x, y = q.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not vis[ny, nx]:
                if alpha[ny, nx] == 0 or int(rgb_sum[ny, nx]) <= thresh:
                    vis[ny, nx] = True
                    q.append((nx, ny))

    cleared = int(vis.sum())
    arr[vis, 3] = 0
    arr[vis, 0:3] = 0
    Image.fromarray(arr, "RGBA").save(png, optimize=True)
    return cleared


def write_ico(png: Path, ico: Path) -> None:
    src = Image.open(png).convert("RGBA")
    sizes = [16, 24, 32, 48, 64, 128, 256]
    frames = [src.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    frames[-1].save(
        ico,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=frames[:-1],
    )


def main() -> None:
    root = Path(__file__).resolve().parent.parent / "build"
    ap = argparse.ArgumentParser(description="清除图标四角实心黑底为透明")
    ap.add_argument("png", nargs="?", default=str(root / "icon.png"))
    ap.add_argument("--ico", action="store_true", help="同时重建同目录 icon.ico")
    ap.add_argument("--thresh", type=int, default=28, help="从四角洪水填充的亮度阈值")
    args = ap.parse_args()

    png = Path(args.png)
    if not png.is_file():
        print(f"找不到: {png}", file=sys.stderr)
        raise SystemExit(1)

    n = clear_connected_black_corners(png, thresh=args.thresh)
    print(f"已清除约 {n} 个角落像素 -> {png}")
    if args.ico:
        ico = png.with_name("icon.ico")
        write_ico(png, ico)
        print(f"已重建 {ico}")


if __name__ == "__main__":
    main()
