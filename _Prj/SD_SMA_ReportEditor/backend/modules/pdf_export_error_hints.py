"""PDF 导出 / 渲染失败时的可读说明。"""
from __future__ import annotations


def _norm(raw: str) -> str:
    return (raw or "").strip()


def _lower(raw: str) -> str:
    return _norm(raw).lower()


def humanize_pdf_export_error(raw: str, *, phase: str = "export") -> str:
    text = _norm(raw) or "未知错误"
    low = _lower(text)

    if "渲染超时" in text or "pdf 渲染超时" in low:
        return (
            "PDF 渲染超时（超过 2 分钟）。\n"
            "可能原因：模版较大、数据源响应慢或网络不稳定。\n"
            "建议：检查数据库 / OPC UA 连接是否正常，关闭其他占用资源的程序后重试。"
        )
    if "渲染失败" in text:
        return (
            f"PDF 渲染失败。\n原因：{text}\n"
            "建议：在模版编辑器中打开「导出预览」确认能否正常显示；若绑定报错请先修复数据源连接。"
        )
    if "not found" in low or "未找到" in text and "模版" in text:
        return "找不到指定的报表模版，可能已被删除或尚未同步。请刷新模版列表后重试。"
    if "enospc" in low or "no space" in low:
        return "磁盘空间不足，无法保存 PDF。请清理磁盘后重试。"
    if "eperm" in low or "eacces" in low or "permission denied" in low:
        return "没有权限写入 PDF 文件。请更换保存目录，或关闭可能占用文件的程序后重试。"
    if "timeout" in low or "timed out" in low:
        return "导出超时。请检查数据库 / OPC UA 连接与网络，然后重试。"
    if "connection" in low or "连接" in text:
        return (
            f"导出前数据源检查未通过。\n{text}\n"
            "建议：前往「数据源配置」测试相关连接。"
        )
    return text
