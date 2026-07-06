"""从 JSON 文件头部快速提取顶层标量字段。

用于模版 / 版式「列表页」摘要：这些大文件常含 base64 图片（数百 KB），
用 `json.loads` 解析整份文件仅为取几个顶层标量（id/name/paperKind…）代价很高。
本模块只读取文件前若干字节并用正则提取，显著降低首屏（尤其升级后无缓存时）耗时。

限制：仅适用于「顶层标量字段出现在文件较前位置」的场景；找不到时调用方应回退到完整解析。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

DEFAULT_HEAD_BYTES = 16384

_CACHE: dict[str, re.Pattern[str]] = {}


def read_head(path: Path, n: int = DEFAULT_HEAD_BYTES) -> str:
    with path.open("r", encoding="utf-8", errors="replace") as f:
        return f.read(n)


def _key_re(key: str) -> re.Pattern[str]:
    pat = _CACHE.get(key)
    if pat is None:
        pat = re.compile(r'"' + re.escape(key) + r'"\s*:\s*"((?:[^"\\]|\\.)*)"')
        _CACHE[key] = pat
    return pat


def extract_string(text: str, key: str) -> str | None:
    """提取首个 `"key": "..."`（首次出现即顶层字段，因大数组均排在其后）。"""
    m = _key_re(key).search(text)
    if not m:
        return None
    raw = m.group(1)
    try:
        return json.loads('"' + raw + '"')
    except (json.JSONDecodeError, ValueError):
        return raw
