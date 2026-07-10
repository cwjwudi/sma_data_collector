"""AI 工具目录：元数据、分组、单工具开关。"""
from __future__ import annotations

from typing import Any, Literal

from modules import ai_config, ai_tools

ToolRisk = Literal["read", "write", "confirm"]
ToolCategory = Literal["diagnostic", "datasource", "assets", "config", "export", "system"]

# name -> meta（与 TOOL_DEFINITIONS 对齐）
TOOL_META: dict[str, dict[str, Any]] = {
    "list_db_connections": {"category": "datasource", "title_zh": "列出数据库连接", "description_zh": "已保存数据库连接脱敏列表", "risk": "read"},
    "list_opc_servers": {"category": "datasource", "title_zh": "列出 OPC UA 连接", "description_zh": "已保存 OPC UA 连接脱敏列表", "risk": "read"},
    "probe_connection": {"category": "datasource", "title_zh": "探活连接", "description_zh": "对已保存 DB/OPC 做连通测试", "risk": "read"},
    "get_connection_health_summary": {"category": "datasource", "title_zh": "连接健康摘要", "description_zh": "连接数量与探活设置摘要", "risk": "read"},
    "get_db_connection_detail": {"category": "datasource", "title_zh": "数据库连接详情", "description_zh": "单个 DB 连接脱敏详情", "risk": "read"},
    "get_opc_server_detail": {"category": "datasource", "title_zh": "OPC 连接详情", "description_zh": "单个 OPC 连接脱敏详情", "risk": "read"},
    "list_db_catalog": {"category": "datasource", "title_zh": "数据库目录", "description_zh": "库/表目录只读查询", "risk": "read"},
    "get_datasource_inventory": {
        "category": "datasource",
        "title_zh": "数据源库存汇总",
        "description_zh": "统计连接数、库/表数量、OPC 变量数量",
        "risk": "read",
    },
    "upsert_db_connection": {"category": "datasource", "title_zh": "保存数据库连接", "description_zh": "新建/更新 DB（密码走 UI 弹框）", "risk": "write"},
    "upsert_opc_server": {"category": "datasource", "title_zh": "保存 OPC 连接", "description_zh": "新建/更新 OPC（密码走 UI 弹框）", "risk": "write"},
    "delete_db_connection": {"category": "datasource", "title_zh": "删除数据库连接", "description_zh": "需 UI 确认后删除", "risk": "confirm"},
    "delete_opc_server": {"category": "datasource", "title_zh": "删除 OPC 连接", "description_zh": "需 UI 确认后删除", "risk": "confirm"},
    "request_connection_credentials": {"category": "datasource", "title_zh": "请求填写密码", "description_zh": "唤起密码弹框", "risk": "write"},
    "update_connection_probe_settings": {"category": "datasource", "title_zh": "更新探活设置", "description_zh": "修改连接定时探活开关与间隔", "risk": "write"},
    "query_audit_log": {"category": "diagnostic", "title_zh": "查询审计", "description_zh": "最近操作审计记录", "risk": "read"},
    "explain_export_diagnostics": {"category": "diagnostic", "title_zh": "解析导出诊断", "description_zh": "解析 EXPORT_DIAGNOSTICS 块", "risk": "read"},
    "diagnose_work_chain": {"category": "diagnostic", "title_zh": "工作链路诊断", "description_zh": "分阶段诊断 Runtime→导出→AI", "risk": "read"},
    "get_dev_runtime_snapshot": {"category": "diagnostic", "title_zh": "运行时快照", "description_zh": "版本、计数、最近失败摘要", "risk": "read"},
    "inspect_template_bindings": {"category": "diagnostic", "title_zh": "模版绑定检查", "description_zh": "解析模版 DB/OPC 引用", "risk": "read"},
    "list_templates": {"category": "assets", "title_zh": "列出模版", "description_zh": "报表模版摘要列表", "risk": "read"},
    "get_template_summary": {"category": "assets", "title_zh": "模版摘要", "description_zh": "单个模版摘要", "risk": "read"},
    "list_layout_presets": {"category": "assets", "title_zh": "列出版式", "description_zh": "版式预设摘要列表", "risk": "read"},
    "copy_template": {"category": "assets", "title_zh": "复制模版", "description_zh": "深拷贝模版并分配新 id", "risk": "write"},
    "copy_layout_preset": {"category": "assets", "title_zh": "复制版式", "description_zh": "深拷贝版式并分配新 id", "risk": "write"},
    "create_blank_template": {"category": "assets", "title_zh": "新建空模版", "description_zh": "创建最小合法空模版", "risk": "write"},
    "create_blank_layout": {"category": "assets", "title_zh": "新建空版式", "description_zh": "创建默认版式", "risk": "write"},
    "delete_template": {"category": "assets", "title_zh": "删除模版", "description_zh": "需 UI 确认后删除", "risk": "confirm"},
    "delete_layout_preset": {"category": "assets", "title_zh": "删除版式", "description_zh": "需 UI 确认后删除", "risk": "confirm"},
    "export_config_share_summary": {"category": "config", "title_zh": "配置摘要（脱敏）", "description_zh": "share 模式配置包统计", "risk": "read"},
    "request_config_backup_export": {"category": "config", "title_zh": "导出加密备份", "description_zh": "UI 另存 .rebak（含密不进 LLM）", "risk": "confirm"},
    "request_config_import_merge": {"category": "config", "title_zh": "merge 导入配置", "description_zh": "需 UI 确认后 merge 导入", "risk": "confirm"},
    "request_config_reset": {"category": "config", "title_zh": "快速复位", "description_zh": "需 UI 确认后清空数据", "risk": "confirm"},
    "get_export_dir_prefs": {"category": "config", "title_zh": "读取输出目录", "description_zh": "当前 PDF 输出/监视目录", "risk": "read"},
    "set_export_dir": {"category": "config", "title_zh": "设置输出目录", "description_zh": "写入路径（或 pending 选目录）", "risk": "write"},
    "request_pick_export_dir": {"category": "config", "title_zh": "选择输出目录", "description_zh": "唤起本机目录选择", "risk": "confirm"},
    "request_check_app_update": {"category": "system", "title_zh": "检查更新", "description_zh": "检查新版本（不自动安装）", "risk": "confirm"},
    "preflight_export": {"category": "export", "title_zh": "导出预检", "description_zh": "结批前绑定与模版检查", "risk": "read"},
    "request_manual_export": {"category": "export", "title_zh": "模拟结批", "description_zh": "确认后 UI 执行一次 PDF 导出", "risk": "confirm"},
    "get_template_display_order": {"category": "assets", "title_zh": "读取模版排序", "description_zh": "模版管理页本机展示顺序", "risk": "read"},
    "set_template_display_order": {"category": "assets", "title_zh": "设置模版排序", "description_zh": "调整模版管理页展示顺序", "risk": "write"},
    "request_open_template": {"category": "assets", "title_zh": "打开模版", "description_zh": "确认后跳转模版编辑器", "risk": "confirm"},
    "request_open_layout": {"category": "assets", "title_zh": "打开版式", "description_zh": "确认后跳转版式编辑器", "risk": "confirm"},
    "get_export_result_feedback": {"category": "export", "title_zh": "读取结批反馈", "description_zh": "结批结果写回 PLC 配置", "risk": "read"},
    "set_export_result_feedback": {"category": "export", "title_zh": "写入结批反馈", "description_zh": "配置结批结果 OPC 写回", "risk": "write"},
    "explain_plc_heartbeat": {"category": "system", "title_zh": "PLC 心跳说明", "description_zh": "心跳机制介绍与当前配置", "risk": "read"},
    "analyze_export_parallel_health": {"category": "export", "title_zh": "并行与健康度分析", "description_zh": "按导出耗时建议并行参数", "risk": "read"},
    "set_max_parallel_exports": {"category": "export", "title_zh": "设置并行上限", "description_zh": "自动结批并行数 1–16", "risk": "write"},
    "check_auto_trigger_bindings": {"category": "export", "title_zh": "检查触发变量", "description_zh": "校验自动结批触发绑定", "risk": "read"},
    "summarize_report_history": {"category": "export", "title_zh": "历史报表摘要", "description_zh": "导出目录 PDF 数量与最近文件", "risk": "read"},
    "get_app_version_and_endpoints": {"category": "system", "title_zh": "版本与端点", "description_zh": "应用版本与本机 /v1 地址", "risk": "read"},
    "suggest_config_change": {"category": "system", "title_zh": "配置建议", "description_zh": "生成建议 JSON，不直接写入", "risk": "read"},
}

CATEGORY_LABELS: dict[str, str] = {
    "diagnostic": "诊断与排障",
    "datasource": "数据源",
    "assets": "模版与版式",
    "config": "配置与备份",
    "export": "导出与结批",
    "system": "系统",
}

WRITE_TOOLS = frozenset(name for name, m in TOOL_META.items() if m.get("risk") == "write")
CONFIRM_TOOLS = frozenset(name for name, m in TOOL_META.items() if m.get("risk") == "confirm")


def _disabled_set(settings: dict[str, Any] | None = None) -> set[str]:
    s = ai_config.normalize_ai_settings(settings or ai_config.load_ai_settings())
    raw = s.get("disabled_tools")
    if not isinstance(raw, list):
        return set()
    return {str(x).strip() for x in raw if str(x).strip()}


def is_tool_enabled(name: str, settings: dict[str, Any] | None = None) -> bool:
    return name not in _disabled_set(settings)


def filter_tool_definitions(settings: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    disabled = _disabled_set(settings)
    return [t for t in ai_tools.TOOL_DEFINITIONS if (t.get("function") or {}).get("name") not in disabled]


def catalog_entries(settings: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    disabled = _disabled_set(settings)
    s = ai_config.normalize_ai_settings(settings or ai_config.load_ai_settings())
    write_ok = bool(s.get("write_tools_enabled"))
    out: list[dict[str, Any]] = []
    for td in ai_tools.TOOL_DEFINITIONS:
        fn = td.get("function") or {}
        name = str(fn.get("name") or "")
        if not name:
            continue
        meta = TOOL_META.get(name, {})
        risk = meta.get("risk") or "read"
        can_toggle = True
        toggle_disabled_reason = ""
        if risk in ("write", "confirm") and not write_ok:
            toggle_disabled_reason = "需先在设置中开启「允许 AI 写入工具」"
        out.append(
            {
                "name": name,
                "category": meta.get("category") or "system",
                "category_label": CATEGORY_LABELS.get(meta.get("category") or "system", "系统"),
                "title_zh": meta.get("title_zh") or name,
                "description_zh": meta.get("description_zh") or (fn.get("description") or ""),
                "risk": risk,
                "enabled": name not in disabled,
                "can_toggle": can_toggle,
                "toggle_disabled_reason": toggle_disabled_reason,
            }
        )
    return out


def set_tool_enabled(name: str, enabled: bool, settings: dict[str, Any] | None = None) -> dict[str, Any]:
    s = ai_config.normalize_ai_settings(settings or ai_config.load_ai_settings())
    disabled = list(_disabled_set(s))
    if enabled and name in disabled:
        disabled.remove(name)
    elif not enabled and name not in disabled:
        disabled.append(name)
    s["disabled_tools"] = sorted(disabled)
    ai_config.save_ai_settings({"disabled_tools": s["disabled_tools"]})
    return {"ok": True, "name": name, "enabled": enabled}
