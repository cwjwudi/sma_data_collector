"""报表模版 / 版式保存审计：中文变更对比。"""
from __future__ import annotations

import json
from typing import Any

MAX_CHANGES = 80
VALUE_MAX_LEN = 80

ELEMENT_TYPE_ZH: dict[str, str] = {
    "text": "文本",
    "box": "文本框",
    "table": "表格",
    "image": "图片",
    "line": "线条",
    "date": "日期",
    "chart": "图表",
    "parameter": "参数",
    "signature": "签名",
}

FIELD_ZH: dict[str, str] = {
    "x": "位置 X",
    "y": "位置 Y",
    "w": "宽度",
    "h": "高度",
    "showBorder": "显示边框",
    "borderColor": "边框颜色",
    "borderWidth": "边框宽度",
    "fillColor": "填充颜色",
    "backgroundColor": "填充颜色",
    "bgColor": "填充颜色",
    "opacity": "不透明度",
    "rotation": "旋转角度",
    "imageRotationDeg": "图片旋转",
    "zIndex": "叠放顺序",
    "name": "名称",
    "label": "名称",
    "title": "名称",
    "text": "文字内容",
    "content": "文字内容",
    "fontSize": "字号",
    "fontFamily": "字体",
    "fontWeight": "字重",
    "color": "文字颜色",
    "textColor": "文字颜色",
    "textAlign": "对齐",
    "align": "对齐",
    "alignX": "水平对齐",
    "alignY": "垂直对齐",
    "textAutoWrap": "自动换行",
    "lineHeight": "行高",
    "src": "图片来源",
    "imageSrc": "图片来源",
    "imageUrl": "图片来源",
    "objectFit": "适应方式",
    "tableRows": "行数",
    "tableCols": "列数",
    "rowCount": "行数",
    "colCount": "列数",
    "tableRowHeightPx": "行高",
    "tableColWidthsPx": "列宽",
    "tableColBgColors": "列背景色",
    "tableSqlFill": "SQL 填充",
    "sqlText": "SQL",
    "opcuaNodeId": "OPC 绑定",
    "bindingKind": "绑定类型",
    "mongoQuery": "Mongo 查询",
    "dateFormat": "日期格式",
    "chartKind": "图表类型",
    "signerLabel": "签署人标签",
    "nullDisplayMode": "空值显示",
    "decimalPlaces": "小数位数",
    "pageNumberMode": "页码模式",
}

ROOT_FIELD_ZH: dict[str, str] = {
    "name": "名称",
    "paperKind": "纸张",
    "orientation": "方向",
    "headerText": "页眉文字",
    "footerText": "页脚文字",
    "layoutPresetId": "正文版式",
    "coverLayoutPresetId": "封面版式",
    "backLayoutPresetId": "封尾版式",
    "marginTopMm": "上边距(mm)",
    "marginRightMm": "右边距(mm)",
    "marginBottomMm": "下边距(mm)",
    "marginLeftMm": "左边距(mm)",
    "headerBandMm": "页眉高度(mm)",
    "footerBandMm": "页脚高度(mm)",
    "pageRole": "页面角色",
}

IGNORE_ELEMENT_KEYS = {
    "id",
    "updatedAt",
    "schemaVersion",
    "elements",  # legacy alias
}

# 模版顶层参与对比的标量（不含 updatedAt，避免「只点保存」误记）
TEMPLATE_ROOT_KEYS = (
    "name",
    "paperKind",
    "orientation",
    "layoutPresetId",
    "coverLayoutPresetId",
    "backLayoutPresetId",
    "headerText",
    "footerText",
)

LAYOUT_ROOT_KEYS = (
    "name",
    "paperKind",
    "orientation",
    "pageRole",
    "marginTopMm",
    "marginRightMm",
    "marginBottomMm",
    "marginLeftMm",
    "headerBandMm",
    "footerBandMm",
    "headerText",
    "footerText",
)


def truncate_value(v: Any, max_len: int = VALUE_MAX_LEN) -> str:
    if v is None:
        return "（空）"
    if isinstance(v, bool):
        return "是" if v else "否"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, (dict, list)):
        try:
            s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError):
            s = str(v)
    else:
        s = str(v)
    s = s.replace("\n", " ").strip()
    if not s:
        return "（空）"
    if len(s) > max_len:
        return s[: max_len - 1] + "…"
    return s


def _looks_secret(field: str, value: Any) -> bool:
    fl = field.lower()
    if any(k in fl for k in ("password", "secret", "token", "api_key", "apikey", "口令")):
        return True
    s = str(value or "")
    return False


def _fmt_val(field: str, value: Any) -> str:
    if _looks_secret(field, value):
        return "（已脱敏）"
    return truncate_value(value)


def element_type_zh(el: dict[str, Any] | None) -> str:
    if not isinstance(el, dict):
        return "控件"
    t = str(el.get("type") or "").strip()
    return ELEMENT_TYPE_ZH.get(t, "控件")


def element_label(el: dict[str, Any] | None) -> str:
    if not isinstance(el, dict):
        return ""
    for k in ("name", "label", "title", "signerLabel"):
        v = el.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()[:40]
    text = el.get("text")
    if isinstance(text, str) and text.strip():
        return text.strip()[:40]
    eid = str(el.get("id") or "").strip()
    return eid[:8] if eid else ""


def _change(
    *,
    key: str,
    location: str,
    field: str,
    before: Any,
    after: Any,
    kind: str = "modify",
) -> dict[str, Any]:
    return {
        "key": key,
        "location": location,
        "field": field,
        "before": None if kind == "add" else _fmt_val(field, before),
        "after": None if kind == "remove" else _fmt_val(field, after),
        "kind": kind,
    }


def _diff_mapped_fields(
    before: dict[str, Any],
    after: dict[str, Any],
    *,
    location: str,
    key_prefix: str,
    field_map: dict[str, str],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    keys = set(before) | set(after)
    for k in sorted(keys):
        if k not in field_map:
            continue
        if k in IGNORE_ELEMENT_KEYS:
            continue
        bv, av = before.get(k), after.get(k)
        if bv == av:
            continue
        # 双方皆空
        if (bv is None or bv == "" or bv == []) and (av is None or av == "" or av == []):
            continue
        out.append(
            _change(
                key=f"{key_prefix}|{k}",
                location=location,
                field=field_map[k],
                before=bv,
                after=av,
            )
        )
    return out


def _diff_table_cells(
    before: dict[str, Any],
    after: dict[str, Any],
    *,
    location: str,
    key_prefix: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    b_cells = before.get("tableCells")
    a_cells = after.get("tableCells")
    if not isinstance(b_cells, list) and not isinstance(a_cells, list):
        return out
    b_cells = b_cells if isinstance(b_cells, list) else []
    a_cells = a_cells if isinstance(a_cells, list) else []
    max_r = max(len(b_cells), len(a_cells))
    for r in range(max_r):
        brow = b_cells[r] if r < len(b_cells) and isinstance(b_cells[r], list) else []
        arow = a_cells[r] if r < len(a_cells) and isinstance(a_cells[r], list) else []
        max_c = max(len(brow), len(arow))
        for c in range(max_c):
            bv = brow[c] if c < len(brow) else None
            av = arow[c] if c < len(arow) else None
            if bv == av:
                continue
            b_empty = bv is None or bv == "" or bv == {}
            a_empty = av is None or av == "" or av == {}
            if b_empty and a_empty:
                continue
            loc = f"{location} · 单元格（第 {r + 1} 行，第 {c + 1} 列）"
            # cell may be dict with text/sql
            if isinstance(bv, dict) or isinstance(av, dict):
                bd = bv if isinstance(bv, dict) else {}
                ad = av if isinstance(av, dict) else {}
                for fk, zh in (("text", "单元格文字"), ("sqlText", "SQL"), ("value", "单元格值")):
                    if bd.get(fk) == ad.get(fk):
                        continue
                    if (not bd.get(fk)) and (not ad.get(fk)):
                        continue
                    out.append(
                        _change(
                            key=f"{key_prefix}|cell:{r}:{c}:{fk}",
                            location=loc,
                            field=zh,
                            before=bd.get(fk),
                            after=ad.get(fk),
                        )
                    )
            else:
                out.append(
                    _change(
                        key=f"{key_prefix}|cell:{r}:{c}",
                        location=loc,
                        field="单元格内容",
                        before=bv,
                        after=av,
                    )
                )
    return out


def _diff_element_list(
    before_list: list[Any],
    after_list: list[Any],
    *,
    zone_label: str,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    bmap: dict[str, dict[str, Any]] = {}
    amap: dict[str, dict[str, Any]] = {}
    for el in before_list:
        if isinstance(el, dict) and el.get("id"):
            bmap[str(el["id"])] = el
    for el in after_list:
        if isinstance(el, dict) and el.get("id"):
            amap[str(el["id"])] = el

    for eid in sorted(set(bmap) - set(amap)):
        el = bmap[eid]
        label = element_label(el)
        loc = f"{zone_label} · {element_type_zh(el)}" + (f"「{label}」" if label else "")
        out.append(
            _change(
                key=f"{zone_label}|{eid}|__remove__",
                location=loc,
                field="控件",
                before=label or eid[:8],
                after=None,
                kind="remove",
            )
        )

    for eid in sorted(set(amap) - set(bmap)):
        el = amap[eid]
        label = element_label(el)
        loc = f"{zone_label} · {element_type_zh(el)}" + (f"「{label}」" if label else "")
        out.append(
            _change(
                key=f"{zone_label}|{eid}|__add__",
                location=loc,
                field="控件",
                before=None,
                after=label or eid[:8],
                kind="add",
            )
        )

    for eid in sorted(set(bmap) & set(amap)):
        bel, ael = bmap[eid], amap[eid]
        label = element_label(ael) or element_label(bel)
        loc = f"{zone_label} · {element_type_zh(ael)}" + (f"「{label}」" if label else "")
        out.extend(
            _diff_mapped_fields(
                bel,
                ael,
                location=loc,
                key_prefix=f"{zone_label}|{eid}",
                field_map=FIELD_ZH,
            )
        )
        if bel.get("type") == "table" or ael.get("type") == "table":
            out.extend(
                _diff_table_cells(
                    bel,
                    ael,
                    location=loc,
                    key_prefix=f"{zone_label}|{eid}",
                )
            )
    return out


def _as_el_list(raw: Any) -> list[Any]:
    return raw if isinstance(raw, list) else []


def diff_report_template(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    """对比模版。返回 detail 片段：changes / change_count / truncated / created。"""
    changes: list[dict[str, Any]] = []
    created = old is None
    if created:
        name = str(new.get("name") or "").strip() or "未命名"
        return {
            "created": True,
            "change_count": 0,
            "changes": [],
            "truncated": False,
            "change_lines": [f"新建报表模版「{name}」"],
        }

    assert old is not None
    for k in TEMPLATE_ROOT_KEYS:
        zh = ROOT_FIELD_ZH.get(k, k)
        if old.get(k) == new.get(k):
            continue
        changes.append(
            _change(
                key=f"root|{k}",
                location="模版",
                field=zh,
                before=old.get(k),
                after=new.get(k),
            )
        )

    # body pages
    b_pages = old.get("bodyPages")
    a_pages = new.get("bodyPages")
    if not isinstance(b_pages, list):
        b_pages = [old.get("elements") or []]
    if not isinstance(a_pages, list):
        a_pages = [new.get("elements") or []]
    max_p = max(len(b_pages), len(a_pages))
    if len(a_pages) > len(b_pages):
        for i in range(len(b_pages), len(a_pages)):
            changes.append(
                _change(
                    key=f"page|{i}|__add__",
                    location=f"第 {i + 1} 页",
                    field="页面",
                    before=None,
                    after=f"第 {i + 1} 页",
                    kind="add",
                )
            )
    if len(b_pages) > len(a_pages):
        for i in range(len(a_pages), len(b_pages)):
            changes.append(
                _change(
                    key=f"page|{i}|__remove__",
                    location=f"第 {i + 1} 页",
                    field="页面",
                    before=f"第 {i + 1} 页",
                    after=None,
                    kind="remove",
                )
            )
    for i in range(min(len(b_pages), len(a_pages))):
        changes.extend(
            _diff_element_list(
                _as_el_list(b_pages[i]),
                _as_el_list(a_pages[i]),
                zone_label=f"第 {i + 1} 页",
            )
        )

    zone_pairs = [
        ("headerElements", "页眉"),
        ("footerElements", "页脚"),
        ("coverElements", "封面"),
        ("backElements", "封尾"),
        ("coverHeaderElements", "封面页眉"),
        ("coverFooterElements", "封面页脚"),
        ("coverBodyZoneElements", "封面正文区"),
        ("backHeaderElements", "封尾页眉"),
        ("backFooterElements", "封尾页脚"),
    ]
    for key, label in zone_pairs:
        changes.extend(
            _diff_element_list(
                _as_el_list(old.get(key)),
                _as_el_list(new.get(key)),
                zone_label=label,
            )
        )

    return _finalize_diff(changes, created=False)


def diff_layout_preset(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    changes: list[dict[str, Any]] = []
    if old is None:
        name = str(new.get("name") or "").strip() or "未命名"
        return {
            "created": True,
            "change_count": 0,
            "changes": [],
            "truncated": False,
            "change_lines": [f"新建版式「{name}」"],
        }
    for k in LAYOUT_ROOT_KEYS:
        zh = ROOT_FIELD_ZH.get(k, k)
        if old.get(k) == new.get(k):
            continue
        changes.append(
            _change(key=f"root|{k}", location="版式", field=zh, before=old.get(k), after=new.get(k))
        )
    for key, label in (
        ("headerElements", "页眉"),
        ("footerElements", "页脚"),
        ("bodyElements", "正文区"),
    ):
        changes.extend(
            _diff_element_list(
                _as_el_list(old.get(key)),
                _as_el_list(new.get(key)),
                zone_label=label,
            )
        )
    return _finalize_diff(changes, created=False)


def _finalize_diff(changes: list[dict[str, Any]], *, created: bool) -> dict[str, Any]:
    truncated = False
    omitted = 0
    if len(changes) > MAX_CHANGES:
        omitted = len(changes) - MAX_CHANGES
        changes = changes[:MAX_CHANGES]
        truncated = True
        changes.append(
            {
                "key": "__truncated__",
                "location": "（摘要）",
                "field": "其它变更",
                "before": None,
                "after": f"另有 {omitted} 处未列出",
                "kind": "modify",
            }
        )
    listed = len([c for c in changes if c.get("key") != "__truncated__"])
    return {
        "created": created,
        "change_count": listed + omitted,
        "changes": changes,
        "truncated": truncated,
        "change_lines": format_change_lines(changes),
    }


def format_change_lines(changes: list[dict[str, Any]]) -> list[str]:
    lines: list[str] = []
    by_loc: dict[str, list[dict[str, Any]]] = {}
    for c in changes:
        loc = str(c.get("location") or "")
        by_loc.setdefault(loc, []).append(c)
    for loc, items in by_loc.items():
        if loc:
            lines.append(loc)
        for c in items:
            kind = c.get("kind")
            field = c.get("field") or ""
            if kind == "add":
                lines.append(f"  · 新增{field}：{c.get('after') or ''}")
            elif kind == "remove":
                lines.append(f"  · 删除{field}：{c.get('before') or ''}")
            else:
                lines.append(f"  · {field}：{c.get('before')} → {c.get('after')}")
    return lines


def merge_changes(
    existing: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """同一 key：保留最早 before、最新 after。"""
    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for c in existing + incoming:
        if not isinstance(c, dict):
            continue
        key = str(c.get("key") or "")
        if not key or key == "__truncated__":
            continue
        if key not in merged:
            merged[key] = dict(c)
            order.append(key)
        else:
            prev = merged[key]
            # keep earliest before
            if prev.get("before") is None and c.get("before") is not None:
                prev["before"] = c.get("before")
            # always take latest after / location / field
            if c.get("after") is not None:
                prev["after"] = c.get("after")
            if c.get("location"):
                prev["location"] = c["location"]
            if c.get("field"):
                prev["field"] = c["field"]
            if c.get("kind") == "remove":
                prev["kind"] = "remove"
            elif prev.get("kind") == "add" and c.get("kind") == "modify":
                prev["kind"] = "modify"
    out = [merged[k] for k in order]
    if len(out) > MAX_CHANGES:
        omitted = len(out) - MAX_CHANGES
        out = out[:MAX_CHANGES]
        out.append(
            {
                "key": "__truncated__",
                "location": "（摘要）",
                "field": "其它变更",
                "before": None,
                "after": f"另有 {omitted} 处未列出",
                "kind": "modify",
            }
        )
    return out


def build_save_summary(
    *,
    kind: str,
    name: str,
    change_count: int,
    save_count: int = 1,
    created: bool = False,
) -> str:
    label = "报表模版" if kind == "template" else "版式"
    nm = name.strip() or "未命名"
    if created:
        return f"新建并保存{label}「{nm}」"
    if save_count > 1:
        return f"保存{label}「{nm}」（15 分钟内共 {save_count} 次，累计变更 {change_count} 处）"
    return f"保存{label}「{nm}」（变更 {change_count} 处）"
