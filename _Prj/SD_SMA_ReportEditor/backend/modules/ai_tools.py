"""Report Editor AI 诊断工具（只读为主；0.3.2 受控写入）。"""
from __future__ import annotations

import json
import logging
from typing import Any

from core.settings import CONFIG_FILE, DATA_DIR
from modules import ai_asset_ops, ai_config, ai_config_ops, ai_datasource_ops, ai_tool_catalog, ai_work_chain, audit_log, config_store, template_store
from modules import db_connection_ops, opcua_service
from schemas.common import DbConnectionSave

logger = logging.getLogger(__name__)

EXPORT_DIAG_MARKER = "---EXPORT_DIAGNOSTICS---"

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_db_connections",
            "description": "列出已保存的数据库连接（脱敏，不含密码）。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_opc_servers",
            "description": "列出已保存的 OPC UA 服务器连接（脱敏）。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "probe_connection",
            "description": "对已保存的数据库或 OPC UA 连接做连通测试。",
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["db", "opcua"], "description": "连接类型"},
                    "connection_id": {"type": "string", "description": "连接 id"},
                },
                "required": ["kind", "connection_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_connection_health_summary",
            "description": "汇总已保存连接与探活设置；可选 live_probe 对每个连接做测试。",
            "parameters": {
                "type": "object",
                "properties": {
                    "live_probe": {
                        "type": "boolean",
                        "description": "是否对每个连接执行实时探活（较慢）",
                        "default": False,
                    }
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_audit_log",
            "description": "查询最近操作审计记录。",
            "parameters": {
                "type": "object",
                "properties": {
                    "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 20},
                    "action": {"type": "string", "description": "按 action 过滤，如 export.batch"},
                    "result": {"type": "string", "enum": ["ok", "fail", "error"], "description": "按结果过滤"},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_templates",
            "description": "列出报表模版摘要。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_template_summary",
            "description": "获取单个模版的摘要信息。",
            "parameters": {
                "type": "object",
                "properties": {"template_id": {"type": "string"}},
                "required": ["template_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "explain_export_diagnostics",
            "description": "解析导出失败消息中的 EXPORT_DIAGNOSTICS JSON 块并给出可读说明。",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "含 ---EXPORT_DIAGNOSTICS--- 的完整错误文本或 JSON"},
                },
                "required": ["text"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_app_version_and_endpoints",
            "description": "返回应用版本与本机 OpenAI 兼容 /v1 地址。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "suggest_config_change",
            "description": "根据目标生成配置修改建议 JSON，不直接写入（0.3.1）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "enum": ["connection_probe", "ai_settings", "app_preferences"],
                        "description": "建议针对的配置域",
                    },
                    "intent": {"type": "string", "description": "用户意图的自然语言描述"},
                },
                "required": ["target", "intent"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_connection_probe_settings",
            "description": "更新连接定时探活开关与间隔（需设置中启用 AI 写入工具，0.3.2）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "enabled": {"type": "boolean"},
                    "interval_sec": {"type": "integer", "minimum": 10, "maximum": 3600},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_db_connection_detail",
            "description": "获取单个数据库连接脱敏详情（不含密码）。",
            "parameters": {
                "type": "object",
                "properties": {"connection_id": {"type": "string"}},
                "required": ["connection_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_opc_server_detail",
            "description": "获取单个 OPC UA 连接脱敏详情（不含密码）。",
            "parameters": {
                "type": "object",
                "properties": {"connection_id": {"type": "string", "description": "OPC 服务器 id"}},
                "required": ["connection_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_db_catalog",
            "description": "列出已保存数据库连接的库/表目录（只读）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "connection_id": {"type": "string"},
                    "database": {"type": "string", "description": "可选，指定库则返回表列表"},
                },
                "required": ["connection_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "upsert_db_connection",
            "description": "新建或更新数据库连接（不含 password 参数；需密时在 UI 弹框填写，0.3.2）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "更新时必填"},
                    "name": {"type": "string"},
                    "engine": {"type": "string", "enum": ["mysql", "mariadb", "postgres", "sqlite", "mongodb"]},
                    "host": {"type": "string"},
                    "port": {"type": "integer"},
                    "database": {"type": "string"},
                    "username": {"type": "string"},
                    "sqlite_path": {"type": "string"},
                    "mongo_auth_source": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "upsert_opc_server",
            "description": "新建或更新 OPC UA 连接（不含 password；需密时在 UI 弹框，0.3.2）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "endpoint_url": {"type": "string"},
                    "security_policy": {"type": "string"},
                    "message_security_mode": {"type": "string"},
                    "username": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_db_connection",
            "description": "请求删除数据库连接（需用户在 UI 确认，0.3.2）。",
            "parameters": {
                "type": "object",
                "properties": {"connection_id": {"type": "string"}},
                "required": ["connection_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_opc_server",
            "description": "请求删除 OPC UA 连接（需用户在 UI 确认，0.3.2）。",
            "parameters": {
                "type": "object",
                "properties": {"connection_id": {"type": "string", "description": "OPC 服务器 id"}},
                "required": ["connection_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_connection_credentials",
            "description": "请求用户在 UI 弹框填写连接密码（不向 LLM 传递密码，0.3.2）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string", "enum": ["db", "opcua"]},
                    "connection_id": {"type": "string"},
                },
                "required": ["kind", "connection_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "diagnose_work_chain",
            "description": "分阶段诊断工作链路（Runtime→Datasource→Assets→Bindings→Export→AI），供开发排障。",
            "parameters": {
                "type": "object",
                "properties": {
                    "live_probe": {"type": "boolean", "default": False},
                    "template_id": {"type": "string", "description": "可选，深查该模版绑定"},
                },
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_dev_runtime_snapshot",
            "description": "开发向轻量运行时快照：版本、健康、计数、最近失败审计。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_template_bindings",
            "description": "解析指定模版的 DB/OPC 绑定并对照已保存连接（只读）。",
            "parameters": {
                "type": "object",
                "properties": {"template_id": {"type": "string"}},
                "required": ["template_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_layout_presets",
            "description": "列出已保存的版式预设摘要。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "copy_template",
            "description": "复制报表模版（新 id 与新名称）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    "new_name": {"type": "string"},
                },
                "required": ["source_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "copy_layout_preset",
            "description": "复制版式预设。",
            "parameters": {
                "type": "object",
                "properties": {
                    "source_id": {"type": "string"},
                    "new_name": {"type": "string"},
                },
                "required": ["source_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_blank_template",
            "description": "创建空白报表模版。",
            "parameters": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_blank_layout",
            "description": "创建空白版式。",
            "parameters": {
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_template",
            "description": "请求删除模版（需用户在 UI 确认）。",
            "parameters": {
                "type": "object",
                "properties": {"template_id": {"type": "string"}},
                "required": ["template_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_layout_preset",
            "description": "请求删除版式（需用户在 UI 确认）。",
            "parameters": {
                "type": "object",
                "properties": {"layout_id": {"type": "string"}},
                "required": ["layout_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_config_share_summary",
            "description": "脱敏配置包摘要（不含口令）。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_config_backup_export",
            "description": "请求在 UI 另存加密 .rebak 备份。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_config_import_merge",
            "description": "请求 merge 导入配置（需 UI 确认）。",
            "parameters": {
                "type": "object",
                "properties": {"bundle": {"type": "object", "description": "配置 JSON 对象"}},
                "required": ["bundle"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_config_reset",
            "description": "请求快速复位清空数据（需 UI 确认）。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_export_dir_prefs",
            "description": "读取 PDF 输出/监视目录偏好。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_export_dir",
            "description": "设置 PDF 默认输出目录路径。",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_pick_export_dir",
            "description": "唤起本机目录选择器设置输出路径。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_check_app_update",
            "description": "请求检查软件更新（不自动安装）。",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "preflight_export",
            "description": "结批/导出前预检模版绑定。",
            "parameters": {
                "type": "object",
                "properties": {"template_id": {"type": "string"}},
                "required": ["template_id"],
                "additionalProperties": False,
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "request_manual_export",
            "description": "请求一次模拟结批 PDF 导出（需 UI 确认）。",
            "parameters": {
                "type": "object",
                "properties": {"template_id": {"type": "string"}},
                "required": ["template_id"],
                "additionalProperties": False,
            },
        },
    },
]


def _cfg() -> dict[str, Any]:
    return config_store.load_config(CONFIG_FILE, DATA_DIR)


def _mask_audit_entry(entry: dict[str, Any]) -> dict[str, Any]:
    out = dict(entry)
    detail = out.get("detail")
    if isinstance(detail, dict):
        safe = dict(detail)
        for k in list(safe.keys()):
            if "password" in k.lower() or "secret" in k.lower() or "token" in k.lower():
                safe[k] = "[redacted]"
        out["detail"] = safe
    return out


def filtered_tool_definitions() -> list[dict[str, Any]]:
    return ai_tool_catalog.filter_tool_definitions()


_WRITE_TOOLS = ai_tool_catalog.WRITE_TOOLS
_CONFIRM_TOOLS = ai_tool_catalog.CONFIRM_TOOLS


async def execute_tool(name: str, arguments: dict[str, Any] | None, *, page_context: dict[str, Any] | None = None) -> Any:
    args = arguments if isinstance(arguments, dict) else {}
    settings = ai_config.load_ai_settings()
    write_ok = bool(settings.get("write_tools_enabled"))

    if not ai_tool_catalog.is_tool_enabled(name, settings):
        return {"ok": False, "error": f"工具「{name}」已在 AI 工具页禁用。"}

    if name in _WRITE_TOOLS and not write_ok:
        return {"ok": False, "error": "AI 写入工具未启用。请在设置 → AI 助手中开启「允许 AI 写入工具」。"}
    if name in _CONFIRM_TOOLS and not write_ok:
        return {"ok": False, "error": "AI 写入/确认类工具未启用。请在设置中开启「允许 AI 写入工具」。"}

    result: Any
    if name == "list_db_connections":
        result = _tool_list_db_connections()
    elif name == "list_opc_servers":
        result = _tool_list_opc_servers()
    elif name == "probe_connection":
        result = await _tool_probe_connection(args)
    elif name == "get_connection_health_summary":
        result = await _tool_health_summary(args)
    elif name == "query_audit_log":
        result = _tool_query_audit(args)
    elif name == "list_templates":
        result = _tool_list_templates()
    elif name == "get_template_summary":
        result = _tool_get_template_summary(args)
    elif name == "explain_export_diagnostics":
        result = _tool_explain_export_diagnostics(args)
    elif name == "get_app_version_and_endpoints":
        result = _tool_app_version()
    elif name == "suggest_config_change":
        result = _tool_suggest_config(args, page_context=page_context)
    elif name == "update_connection_probe_settings":
        result = _tool_update_probe(args)
    elif name == "get_db_connection_detail":
        result = ai_datasource_ops.get_db_connection_detail(str(args.get("connection_id") or ""))
    elif name == "get_opc_server_detail":
        result = ai_datasource_ops.get_opc_server_detail(str(args.get("connection_id") or ""))
    elif name == "list_db_catalog":
        result = ai_datasource_ops.list_db_catalog(
            str(args.get("connection_id") or ""),
            str(args.get("database")).strip() if args.get("database") else None,
        )
    elif name == "upsert_db_connection":
        result = ai_datasource_ops.upsert_db_connection(args)
    elif name == "upsert_opc_server":
        result = ai_datasource_ops.upsert_opc_server(args)
    elif name == "delete_db_connection":
        result = ai_datasource_ops.delete_db_connection(str(args.get("connection_id") or ""))
    elif name == "delete_opc_server":
        result = ai_datasource_ops.delete_opc_server(str(args.get("connection_id") or ""))
    elif name == "request_connection_credentials":
        result = ai_datasource_ops.request_connection_credentials(args)
    elif name == "diagnose_work_chain":
        result = await ai_work_chain.diagnose_work_chain(
            live_probe=bool(args.get("live_probe")),
            template_id=str(args.get("template_id")).strip() if args.get("template_id") else None,
        )
    elif name == "get_dev_runtime_snapshot":
        result = await ai_work_chain.get_dev_runtime_snapshot()
    elif name == "inspect_template_bindings":
        result = ai_work_chain.inspect_template_bindings(str(args.get("template_id") or ""))
    elif name == "list_layout_presets":
        result = ai_asset_ops.list_layout_presets()
    elif name == "copy_template":
        result = ai_asset_ops.copy_template(str(args.get("source_id") or ""), str(args.get("new_name") or ""))
    elif name == "copy_layout_preset":
        result = ai_asset_ops.copy_layout_preset(str(args.get("source_id") or ""), str(args.get("new_name") or ""))
    elif name == "create_blank_template":
        result = ai_asset_ops.create_blank_template(str(args.get("name") or ""))
    elif name == "create_blank_layout":
        result = ai_asset_ops.create_blank_layout(str(args.get("name") or ""))
    elif name == "delete_template":
        result = ai_asset_ops.request_delete_template(str(args.get("template_id") or ""))
    elif name == "delete_layout_preset":
        result = ai_asset_ops.request_delete_layout(str(args.get("layout_id") or ""))
    elif name == "export_config_share_summary":
        result = ai_config_ops.export_config_share_summary()
    elif name == "request_config_backup_export":
        result = ai_config_ops.request_config_backup_export()
    elif name == "request_config_import_merge":
        bundle = args.get("bundle")
        result = ai_config_ops.request_config_import_merge(bundle if isinstance(bundle, dict) else {})
    elif name == "request_config_reset":
        result = ai_config_ops.request_config_reset()
    elif name == "get_export_dir_prefs":
        result = ai_config_ops.get_export_dir_prefs()
    elif name == "set_export_dir":
        result = ai_config_ops.set_export_dir(str(args.get("path") or ""))
    elif name == "request_pick_export_dir":
        result = ai_config_ops.request_pick_export_dir()
    elif name == "request_check_app_update":
        result = ai_config_ops.request_check_app_update()
    elif name == "preflight_export":
        result = await ai_config_ops.preflight_export(str(args.get("template_id") or ""))
    elif name == "request_manual_export":
        result = ai_config_ops.request_manual_export(str(args.get("template_id") or ""))
    else:
        result = {"ok": False, "error": f"未知工具: {name}"}

    try:
        audit_log.append_audit(
            DATA_DIR,
            action="ai.tool_call",
            result="ok" if not (isinstance(result, dict) and result.get("ok") is False) else "fail",
            summary=f"{name}",
            object_type="ai_tool",
            object_id=name,
            detail={"arguments": args, "page_context": page_context or {}, "result_preview": _preview(result)},
        )
    except Exception:
        logger.warning("写入 ai.tool_call 审计失败", exc_info=True)

    return result


def _preview(obj: Any, max_len: int = 2000) -> Any:
    try:
        text = json.dumps(obj, ensure_ascii=False)
    except (TypeError, ValueError):
        text = str(obj)
    if len(text) > max_len:
        return text[: max_len - 1] + "…"
    return obj


def _tool_list_db_connections() -> dict[str, Any]:
    cfg = _cfg()
    conns = [
        config_store.mask_connection_for_response(c)
        for c in (cfg.get("db_connections") or [])
        if isinstance(c, dict)
    ]
    return {"connections": conns, "count": len(conns)}


def _tool_list_opc_servers() -> dict[str, Any]:
    cfg = _cfg()
    servers = [
        config_store.mask_opcua_for_response(s)
        for s in (cfg.get("opcua_servers") or [])
        if isinstance(s, dict)
    ]
    return {"servers": servers, "count": len(servers)}


async def _tool_probe_connection(args: dict[str, Any]) -> dict[str, Any]:
    kind = str(args.get("kind") or "").strip().lower()
    cid = str(args.get("connection_id") or "").strip()
    if not cid:
        return {"ok": False, "message": "缺少 connection_id"}
    cfg = _cfg()
    if kind == "db":
        conn = next((c for c in cfg.get("db_connections") or [] if c.get("id") == cid), None)
        if not conn:
            return {"ok": False, "message": "未找到数据库连接"}
        body = DbConnectionSave(
            id=conn.get("id"),
            name=conn.get("name") or "",
            engine=conn.get("engine") or "",
            host=conn.get("host"),
            port=conn.get("port"),
            database=conn.get("database"),
            username=conn.get("username"),
            password=None,
            sqlite_path=conn.get("sqlite_path"),
            mongo_auth_source=conn.get("mongo_auth_source") or "admin",
        )
        try:
            enc = conn.get("password_enc")
            pwd = config_store.decrypt_db_password(DATA_DIR, conn) if enc else ""
            merged = body.model_copy(update={"password": pwd or None})
        except ValueError as e:
            return {"ok": False, "message": str(e)}
        ok, err = db_connection_ops.run_connectivity_test(
            merged,
            connection_name=str(conn.get("name") or cid),
        )
        return {"ok": ok, "message": err, "kind": "db", "connection_id": cid, "name": conn.get("name")}
    if kind in ("opcua", "opc"):
        srv = next((s for s in cfg.get("opcua_servers") or [] if s.get("id") == cid), None)
        if not srv:
            return {"ok": False, "message": "未找到 OPC UA 配置"}
        endpoint = str(srv.get("endpoint_url") or srv.get("endpoint") or "").strip()
        if not endpoint:
            return {"ok": False, "message": "Endpoint URL 为空"}
        try:
            pwd = config_store.decrypt_opcua_password(DATA_DIR, srv)
        except ValueError as e:
            return {"ok": False, "message": str(e)}
        res = await opcua_service.test_connection(
            endpoint,
            srv.get("username"),
            pwd,
            connection_name=str(srv.get("name") or cid),
        )
        return {**res, "kind": "opcua", "connection_id": cid, "name": srv.get("name")}
    return {"ok": False, "message": "kind 须为 db 或 opcua"}


async def _tool_health_summary(args: dict[str, Any]) -> dict[str, Any]:
    cfg = _cfg()
    prefs = cfg.get("app_preferences") or {}
    dbs = _tool_list_db_connections()["connections"]
    opcs = _tool_list_opc_servers()["servers"]
    out: dict[str, Any] = {
        "db_count": len(dbs),
        "opc_count": len(opcs),
        "connection_probe_enabled": bool(prefs.get("connection_probe_enabled")),
        "connection_probe_interval_sec": prefs.get("connection_probe_interval_sec", 30),
        "databases": [{"id": c.get("id"), "name": c.get("name"), "engine": c.get("engine")} for c in dbs],
        "opc_servers": [{"id": s.get("id"), "name": s.get("name"), "endpoint_url": s.get("endpoint_url")} for s in opcs],
    }
    if args.get("live_probe"):
        probes = []
        for c in dbs:
            cid = c.get("id")
            if cid:
                probes.append(await _tool_probe_connection({"kind": "db", "connection_id": cid}))
        for s in opcs:
            sid = s.get("id")
            if sid:
                probes.append(await _tool_probe_connection({"kind": "opcua", "connection_id": sid}))
        out["live_probe_results"] = probes
    return out


def _tool_query_audit(args: dict[str, Any]) -> dict[str, Any]:
    limit = int(args.get("limit") or 20)
    limit = max(1, min(limit, 100))
    data = audit_log.list_audit(
        DATA_DIR,
        limit=limit,
        offset=0,
        action=str(args.get("action")).strip() if args.get("action") else None,
        result=str(args.get("result")).strip() if args.get("result") else None,
    )
    entries = [_mask_audit_entry(e) for e in (data.get("entries") or [])]
    return {"entries": entries, "total": data.get("total", len(entries))}


def _tool_list_templates() -> dict[str, Any]:
    summaries = [s.model_dump(mode="json") for s in template_store.list_summaries()]
    return {"templates": summaries, "count": len(summaries)}


def _tool_get_template_summary(args: dict[str, Any]) -> dict[str, Any]:
    tid = str(args.get("template_id") or "").strip()
    if not tid:
        return {"ok": False, "error": "缺少 template_id"}
    for s in template_store.list_summaries():
        if s.id == tid:
            return {"ok": True, "summary": s.model_dump(mode="json")}
    return {"ok": False, "error": "模版不存在"}


def _tool_explain_export_diagnostics(args: dict[str, Any]) -> dict[str, Any]:
    text = str(args.get("text") or "")
    idx = text.find(EXPORT_DIAG_MARKER)
    payload: dict[str, Any] | None = None
    message = text
    if idx >= 0:
        message = text[:idx].strip()
        json_part = text[idx + len(EXPORT_DIAG_MARKER) :].strip()
        try:
            parsed = json.loads(json_part)
            if isinstance(parsed, dict):
                payload = parsed
        except json.JSONDecodeError as e:
            return {"ok": False, "message": message, "parse_error": str(e)}
    elif text.strip().startswith("{"):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                payload = parsed
                message = ""
        except json.JSONDecodeError as e:
            return {"ok": False, "parse_error": str(e)}
    if not payload:
        return {"ok": False, "message": message or text, "hint": "未找到 EXPORT_DIAGNOSTICS 块"}
    issues = payload.get("issues") or []
    lines = []
    if message:
        lines.append(f"主消息：{message}")
    lines.append(f"问题数：{payload.get('issueCount', len(issues))}")
    for i, issue in enumerate(issues[:20], 1):
        if not isinstance(issue, dict):
            continue
        key = issue.get("key", "?")
        kind = issue.get("kind", "other")
        msg = issue.get("message", "")
        lines.append(f"{i}. [{kind}] {key}: {msg}")
    stats = payload.get("stats")
    if isinstance(stats, dict):
        lines.append(f"统计：{json.dumps(stats, ensure_ascii=False)}")
    return {
        "ok": True,
        "human_summary": "\n".join(lines),
        "diagnostics": payload,
    }


def _tool_app_version() -> dict[str, Any]:
    from core.settings import APP_VERSION

    port = ai_config.resolve_backend_port()
    pub = ai_config.public_ai_settings(port=port)
    return {
        "app": "SD_SMA_ReportEditor",
        "version": APP_VERSION,
        "agent_chat_url_loopback": pub.get("agent_chat_url_loopback"),
        "agent_chat_url_lan": pub.get("agent_chat_url_lan"),
        "ai_enabled": pub.get("enabled"),
        "ai_ready": pub.get("ready"),
    }


def _tool_suggest_config(args: dict[str, Any], *, page_context: dict[str, Any] | None) -> dict[str, Any]:
    target = str(args.get("target") or "").strip()
    intent = str(args.get("intent") or "").strip()
    cfg = _cfg()
    prefs = cfg.get("app_preferences") or {}
    suggestion: dict[str, Any] = {"target": target, "intent": intent, "apply": False, "patch": {}}
    low = intent.lower()
    if target == "connection_probe":
        if any(w in intent for w in ("开启", "启用", "打开", "enable")):
            suggestion["patch"] = {"connection_probe_enabled": True}
        elif any(w in intent for w in ("关闭", "禁用", "disable")):
            suggestion["patch"] = {"connection_probe_enabled": False}
        for token in ("30", "60", "120", "300"):
            if token in intent:
                suggestion["patch"]["connection_probe_interval_sec"] = int(token)
                break
        suggestion["current"] = {
            "connection_probe_enabled": prefs.get("connection_probe_enabled"),
            "connection_probe_interval_sec": prefs.get("connection_probe_interval_sec"),
        }
    elif target == "ai_settings":
        ai = ai_config.public_ai_settings()
        suggestion["current"] = ai
        suggestion["notes"] = "请在设置页手动修改 LLM Key / Agent Token；助手仅建议不写入密钥。"
    elif target == "app_preferences":
        suggestion["current"] = {k: prefs.get(k) for k in ("default_connection_id", "default_opcua_server_id")}
        suggestion["notes"] = "根据 intent 生成 patch 供人工确认。"
    else:
        return {"ok": False, "error": f"未知 target: {target}"}
    if page_context:
        suggestion["page_context"] = page_context
    return {"ok": True, "suggestion": suggestion}


def _tool_update_probe(args: dict[str, Any]) -> dict[str, Any]:
    cfg = _cfg()
    prefs = dict(cfg.get("app_preferences") or {})
    if "enabled" in args:
        prefs["connection_probe_enabled"] = bool(args["enabled"])
    if args.get("interval_sec") is not None:
        sec = int(args["interval_sec"])
        prefs["connection_probe_interval_sec"] = max(10, min(sec, 3600))
    cfg["app_preferences"] = prefs
    config_store.save_config(CONFIG_FILE, cfg)
    return {
        "ok": True,
        "applied": {
            "connection_probe_enabled": prefs.get("connection_probe_enabled"),
            "connection_probe_interval_sec": prefs.get("connection_probe_interval_sec"),
        },
    }
