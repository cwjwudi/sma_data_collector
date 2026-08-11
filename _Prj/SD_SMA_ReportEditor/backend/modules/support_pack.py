"""048：问题反馈包（support pack）——Markdown + 附件打 zip，供 Agent 复现排障。"""

from __future__ import annotations

import io
import json
import re
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

AUDIT_WINDOW_SEC = 7 * 24 * 3600
AUDIT_CAP = 500
MAX_PDF_BYTES = 50 * 1024 * 1024
MAX_TEMPLATES = 40

AGENT_PROMPT = """# Agent 排障提示

你正在协助排查 **Report Editor AI**（仓库 `_Prj/SD_SMA_ReportEditor`）的现场问题。

1. 先读本包根目录 `ISSUE.md` 与 `ENV.md`，再读 `manifest.json`。
2. 对照 `data/templates/` 中的模版 JSON、`data/generator-prefs.json`（结批绑定）、`data/connections-skeleton.json`（无密连接骨架）、`data/audit.jsonl`。
3. 若有 `attachments/*.pdf`，对照导出结果与模版/绑定是否一致。
4. 在仓库中定位相关代码并复现；修复后补充/更新 `docs/NNN-…` 任务看板与测试。
5. **包内不含数据库/OPC/AI 明文密钥**；不要要求用户提供密码才能开始分析。
"""

_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "passwd",
        "password_enc",
        "secret",
        "token",
        "api_key",
        "apikey",
        "llm_api_key",
        "llm_api_key_enc",
        "agent_token",
        "agent_token_enc",
        "credential",
    }
)


def _strip_sensitive(obj: Any) -> Any:
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            key = str(k)
            # 保留 has_password 布尔；剔除口令/密钥本体
            if key.lower() in _SENSITIVE_KEYS:
                continue
            if key.lower().endswith("_enc") and "password" in key.lower():
                continue
            out[key] = _strip_sensitive(v)
        return out
    if isinstance(obj, list):
        return [_strip_sensitive(x) for x in obj]
    return obj


def connection_skeleton(
    db_connections: list[Any] | None,
    opcua_servers: list[Any] | None,
) -> dict[str, Any]:
    dbs: list[dict[str, Any]] = []
    for c in db_connections or []:
        if not isinstance(c, dict):
            continue
        row = {
            "id": c.get("id"),
            "name": c.get("name"),
            "host": c.get("host"),
            "port": c.get("port"),
            "database": c.get("database") or c.get("db_name"),
            "user": c.get("user"),
            "driver": c.get("driver") or c.get("type"),
            "has_password": bool(c.get("password_enc") or c.get("has_password") or c.get("password")),
        }
        dbs.append(_strip_sensitive(row))
    opcs: list[dict[str, Any]] = []
    for s in opcua_servers or []:
        if not isinstance(s, dict):
            continue
        row = {
            "id": s.get("id"),
            "name": s.get("name"),
            "endpoint": s.get("endpoint") or s.get("url"),
            "user": s.get("user") or s.get("username"),
            "has_password": bool(s.get("password_enc") or s.get("has_password") or s.get("password")),
        }
        opcs.append(_strip_sensitive(row))
    return {"db_connections": dbs, "opcua_servers": opcs}


def slice_audit_entries(entries: list[dict[str, Any]], *, now: float | None = None) -> list[dict[str, Any]]:
    """近 7 天、上限 500；失败优先。"""
    ts_now = float(now if now is not None else time.time())
    cutoff = ts_now - AUDIT_WINDOW_SEC
    recent = [e for e in entries if isinstance(e, dict) and float(e.get("ts") or 0) >= cutoff]
    fails = [e for e in recent if str(e.get("result") or "") == "fail"]
    others = [e for e in recent if str(e.get("result") or "") != "fail"]
    fails.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    others.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    return (fails + others)[:AUDIT_CAP]


def failed_template_ids_from_audit(entries: list[dict[str, Any]]) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for e in entries:
        if str(e.get("result") or "") != "fail":
            continue
        action = str(e.get("action") or "")
        if not action.startswith("export."):
            continue
        oid = str(e.get("object_id") or "").strip()
        if not oid or oid in seen:
            continue
        seen.add(oid)
        ids.append(oid)
    return ids


def recent_failed_pdf_paths(entries: list[dict[str, Any]], *, limit: int = 3) -> list[str]:
    paths: list[str] = []
    seen: set[str] = set()
    for e in entries:
        detail = e.get("detail") if isinstance(e.get("detail"), dict) else {}
        candidates: list[str] = []
        fp = detail.get("filePath")
        if isinstance(fp, str) and fp.strip():
            candidates.append(fp.strip())
        fps = detail.get("filePaths")
        if isinstance(fps, list):
            for x in fps:
                if isinstance(x, str) and x.strip():
                    candidates.append(x.strip())
        # 失败条目优先；成功条目也可附最近 PDF（Q7B 默认附最近失败，若无失败则用最近成功）
        for p in candidates:
            if p in seen:
                continue
            if not p.lower().endswith(".pdf"):
                continue
            seen.add(p)
            paths.append(p)
            if len(paths) >= limit:
                return paths
    return paths


def build_issue_md(
    *,
    title: str,
    symptom: str,
    expected: str,
    steps: str,
    occurred_at: str,
    env_summary: str,
) -> str:
    lines = [
        "# 问题反馈",
        "",
        f"## 标题",
        "",
        (title or "（未填写）").strip() or "（未填写）",
        "",
        "## 现象",
        "",
        (symptom or "（未填写）").strip() or "（未填写）",
        "",
        "## 期望",
        "",
        (expected or "（未填写）").strip() or "（未填写）",
        "",
        "## 复现步骤",
        "",
        (steps or "（未填写）").strip() or "（未填写）",
        "",
        "## 发生时间",
        "",
        (occurred_at or "（未填写）").strip() or "（未填写）",
        "",
        "## 环境摘要",
        "",
        (env_summary or "见 ENV.md").strip() or "见 ENV.md",
        "",
    ]
    return "\n".join(lines)


def build_env_md(env: dict[str, Any] | None) -> str:
    e = env if isinstance(env, dict) else {}
    keys = [
        ("appVersion", "应用版本"),
        ("electronVersion", "Electron"),
        ("platform", "平台"),
        ("arch", "架构"),
        ("osRelease", "OS"),
        ("hostname", "主机名"),
        ("dataDir", "数据目录"),
        ("exportPerfTier", "导出性能档"),
        ("silentStart", "静默启动"),
    ]
    lines = ["# 环境信息", ""]
    for key, label in keys:
        val = e.get(key)
        if val is None or val == "":
            continue
        lines.append(f"- **{label}**：{val}")
    extra = {k: v for k, v in e.items() if k not in {x[0] for x in keys}}
    if extra:
        lines.append("")
        lines.append("## 其它")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(_strip_sensitive(extra), ensure_ascii=False, indent=2))
        lines.append("```")
    lines.append("")
    return "\n".join(lines)


def _safe_pdf_bytes(path_str: str) -> tuple[str, bytes] | None:
    try:
        p = Path(path_str).expanduser().resolve()
    except Exception:
        return None
    if not p.is_file():
        return None
    if p.suffix.lower() != ".pdf":
        return None
    try:
        size = p.stat().st_size
    except OSError:
        return None
    if size <= 0 or size > MAX_PDF_BYTES:
        return None
    try:
        data = p.read_bytes()
    except OSError:
        return None
    # zip 内文件名只用 basename，避免路径穿越
    name = re.sub(r"[^\w.\u4e00-\u9fff\-]+", "_", p.name) or "failed.pdf"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name, data


def build_support_pack_zip(
    *,
    title: str = "",
    symptom: str = "",
    expected: str = "",
    steps: str = "",
    occurred_at: str = "",
    env: dict[str, Any] | None = None,
    template_ids: list[str] | None = None,
    templates_raw: list[dict[str, Any]] | None = None,
    generator_prefs: dict[str, Any] | None = None,
    connections: dict[str, Any] | None = None,
    audit_entries: list[dict[str, Any]] | None = None,
    include_failed_pdf: bool = True,
    pdf_paths: list[str] | None = None,
    app_version: str = "",
) -> tuple[bytes, dict[str, Any]]:
    """返回 (zip_bytes, manifest)。"""
    templates = []
    for t in templates_raw or []:
        if isinstance(t, dict) and t.get("id"):
            templates.append(_strip_sensitive(t))
        if len(templates) >= MAX_TEMPLATES:
            break

    audit = [_strip_sensitive(e) for e in slice_audit_entries(list(audit_entries or []))]
    prefs = _strip_sensitive(generator_prefs if isinstance(generator_prefs, dict) else {})
    conn = connections if isinstance(connections, dict) else {"db_connections": [], "opcua_servers": []}
    conn = _strip_sensitive(conn)

    env_obj = env if isinstance(env, dict) else {}
    if app_version and not env_obj.get("appVersion"):
        env_obj = {**env_obj, "appVersion": app_version}

    issue = build_issue_md(
        title=title,
        symptom=symptom,
        expected=expected,
        steps=steps,
        occurred_at=occurred_at,
        env_summary=f"应用版本 {env_obj.get('appVersion') or '未知'} · 平台 {env_obj.get('platform') or '未知'}",
    )
    env_md = build_env_md(env_obj)

    attachment_names: list[str] = []
    pdf_blobs: list[tuple[str, bytes]] = []
    if include_failed_pdf:
        candidates = list(pdf_paths or [])
        if not candidates:
            # 失败优先切片里找路径；再扫原始审计成功落盘
            candidates = recent_failed_pdf_paths(audit, limit=3)
            if not candidates and audit_entries:
                candidates = recent_failed_pdf_paths(
                    sorted(
                        [e for e in audit_entries if isinstance(e, dict)],
                        key=lambda x: float(x.get("ts") or 0),
                        reverse=True,
                    ),
                    limit=1,
                )
        used_names: set[str] = set()
        for path_str in candidates:
            got = _safe_pdf_bytes(path_str)
            if not got:
                continue
            name, data = got
            base = name
            i = 1
            while name in used_names:
                name = f"{Path(base).stem}_{i}.pdf"
                i += 1
            used_names.add(name)
            pdf_blobs.append((name, data))
            attachment_names.append(name)
            if len(pdf_blobs) >= 3:
                break

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ver = str(app_version or env_obj.get("appVersion") or "dev").replace(" ", "")
    pack_name = f"support-pack-{ver}-{stamp}"

    manifest = {
        "schema": "report-editor-support-pack/v1",
        "packName": pack_name,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "appVersion": env_obj.get("appVersion") or app_version or "",
        "templateIds": [str(t.get("id")) for t in templates],
        "templateNames": [str(t.get("name") or "") for t in templates],
        "auditCount": len(audit),
        "attachments": attachment_names,
        "includeFailedPdf": bool(include_failed_pdf),
        "requestedTemplateIds": list(template_ids or []),
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("ISSUE.md", issue)
        zf.writestr("AGENT_PROMPT.md", AGENT_PROMPT)
        zf.writestr("ENV.md", env_md)
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        zf.writestr(
            "data/generator-prefs.json",
            json.dumps(prefs, ensure_ascii=False, indent=2) + "\n",
        )
        zf.writestr(
            "data/connections-skeleton.json",
            json.dumps(conn, ensure_ascii=False, indent=2) + "\n",
        )
        audit_lines = "\n".join(json.dumps(e, ensure_ascii=False) for e in audit)
        if audit_lines:
            audit_lines += "\n"
        zf.writestr("data/audit.jsonl", audit_lines)
        for t in templates:
            tid = str(t.get("id") or "unknown")
            safe = re.sub(r"[^\w.\-]+", "_", tid) or "template"
            zf.writestr(
                f"data/templates/{safe}.json",
                json.dumps(t, ensure_ascii=False, indent=2) + "\n",
            )
        for name, data in pdf_blobs:
            zf.writestr(f"attachments/{name}", data)

    return buf.getvalue(), manifest


def assert_no_sensitive_in_zip(zip_bytes: bytes) -> None:
    """测试用：zip 内文本不得出现明文口令字段名赋值痕迹。"""
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            if info.filename.lower().endswith(".pdf"):
                continue
            text = zf.read(info.filename).decode("utf-8", errors="replace")
            # 允许 has_password 布尔；禁止 password_enc / 明文 password 键
            if '"password_enc"' in text or '"llm_api_key"' in text or '"apiKey"' in text:
                raise AssertionError(f"sensitive key in {info.filename}")
            if re.search(r'"password"\s*:\s*"[^"]+"', text):
                raise AssertionError(f"plaintext password in {info.filename}")
