"""将驱动层连接错误转为更可读的说明与操作建议。"""
from __future__ import annotations


def _norm(raw: str) -> str:
    return (raw or "").strip()


def _lower(raw: str) -> str:
    return _norm(raw).lower()


def humanize_db_error(raw: str, *, connection_name: str | None = None) -> str:
    text = _norm(raw) or "未知错误"
    low = _lower(text)
    label = f"连接「{connection_name}」" if connection_name else "数据库连接"

    summary = ""
    hint = ""

    if (
        "connection refused" in low
        or "actively refused" in low
        or "(10061)" in low
        or "errno 111" in low
        or "(111)" in low
        or "can't connect to mysql server" in low
    ):
        summary = "无法连接到数据库服务器（连接被拒绝）"
        hint = "请检查主机名、端口号是否正确，数据库服务是否已启动，防火墙是否放行该端口。"
    elif "access denied" in low or "(1045)" in low or "password authentication failed" in low:
        summary = "数据库拒绝了登录（用户名或密码错误）"
        hint = "请核对用户名与密码；对已保存连接可重新输入密码后再测试。"
    elif "unknown database" in low or "does not exist" in low and "database" in low:
        summary = "指定的数据库不存在"
        hint = "请检查库名拼写，或先在数据库中创建该库。"
    elif "timed out" in low or "timeout" in low:
        summary = "连接超时"
        hint = "请检查网络是否可达、主机地址是否正确，或适当增大超时时间。"
    elif "no such file" in low or "unable to open database file" in low:
        summary = "找不到 SQLite 数据库文件"
        hint = "请确认文件路径存在且本软件有读取权限。"
    elif "getaddrinfo failed" in low or "name or service not known" in low or "nodename nor servname" in low:
        summary = "无法解析数据库主机名"
        hint = "请检查主机名或 IP 是否填写正确，DNS 是否可用。"
    elif "ssl" in low and ("required" in low or "certificate" in low):
        summary = "SSL/TLS 连接失败"
        hint = "请确认数据库是否要求加密连接，以及证书/加密参数是否匹配现场配置。"

    if summary:
        return f"{label}失败：{summary}\n原因：{text}\n建议：{hint}"
    return f"{label}失败：{text}"


def humanize_opcua_error(
    raw: str,
    *,
    connection_name: str | None = None,
    endpoint: str | None = None,
) -> str:
    text = _norm(raw) or "未知错误"
    low = _lower(text)
    label = f"连接「{connection_name}」" if connection_name else "OPC UA 连接"
    endpoint_hint = f"（{endpoint}）" if endpoint else ""

    summary = ""
    hint = ""

    if "connection refused" in low or "actively refused" in low or "errno 111" in low:
        summary = "无法连接到 OPC UA 服务器（连接被拒绝）"
        hint = "请检查 Endpoint URL、主机与端口是否正确，OPC UA 服务是否已启动。"
    elif "baduseraccess" in low or "bad identity" in low or "authentication" in low:
        summary = "OPC UA 认证失败（用户名或密码错误）"
        hint = "请核对账号密码；部分服务器需使用证书登录，请确认现场认证方式。"
    elif "badcertificate" in low or "certificate" in low or "ssl" in low:
        summary = "OPC UA 证书或安全策略不匹配"
        hint = "请确认 Endpoint 的安全策略、证书信任链是否与服务器一致。"
    elif "timed out" in low or "timeout" in low:
        summary = "OPC UA 连接超时"
        hint = "请检查网络是否可达，Endpoint URL 是否正确，防火墙是否放行。"
    elif "getaddrinfo failed" in low or "name or service not known" in low or "nodename nor servname" in low:
        summary = "无法解析 OPC UA 主机名"
        hint = "请检查 Endpoint 中的主机名或 IP 是否填写正确。"
    elif "badconnectionclosed" in low or "connection closed" in low:
        summary = "OPC UA 连接被服务器关闭"
        hint = "请确认 Endpoint URL 与安全策略是否匹配，服务器是否限制并发会话。"

    if summary:
        return f"{label}{endpoint_hint}失败：{summary}\n原因：{text}\n建议：{hint}"
    return f"{label}{endpoint_hint}失败：{text}"
