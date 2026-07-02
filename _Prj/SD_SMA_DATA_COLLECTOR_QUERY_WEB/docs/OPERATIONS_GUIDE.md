# Query Web 操作手册

## 1. 启动前配置

编辑 `config/app_settings.json`：

- `database`：配置可访问的 MySQL/SQLite。
- `query_limits`：
  - `requests_per_minute`：每个客户端每分钟最大请求数
  - `default_window_hours`：未指定时间时默认查询窗口
  - `max_window_hours`：最大允许查询窗口

## 2. 启动服务

在本目录执行：

- `pip install -r requirements.txt`
- `python -m uvicorn app.main:app --host 0.0.0.0 --port 8090`

## 3. 连接验证

访问：

- `GET /api/db/check`

返回 `status=ok` 即可继续。

## 4. 查询配置编辑（推荐流程）

1. 打开查询页面。
2. 点击“加载查询配置”。
3. 在“每个标的查询列和顺序”中选择 `View` 与 `Table`。
4. 点击“加载列”，编排列顺序并设置：
   - `SortBy`
   - `SortDir`
   - `PageSize`
5. 点击“应用并保存”。
6. 使用查询区执行查询，确认列顺序与排序生效。

## 5. 报警/审计视图说明

- `alarm` / `audit` 默认按模板字段查询。
- 若模板字段在目标表不存在，后端会自动忽略并在响应 `warnings`/`missing_columns` 返回提示。
- 前端会显示提示，不会因为部分字段不存在而直接失败。

## 6. 插件页 OPC UA 回写

### 6.1 PLC 变量准备

- 每个需要回写的列：一个长度为 **50** 的数组变量（`ARRAY[0..49]`）
- 一个 **cursor** 标量（`DINT`，如 `diCursor`）：`-1` = 未选中；`0..49` = 当前页行索引

### 6.2 配置

1. **配置页 → 基础设定**：填写 OPC Endpoint（及可选用户名/密码），点「保存基础设定」写入 profile 顶层 `opcua`
2. **配置页 → 插件页面**：选择模块与页码，设置 `bind_group` 后，在「OPC UA 回写」区块勾选列并填写 NodeId，保存当前页配置
3. 列清单来自 `query_view.per_group[bind_group]`，须先在「Group 与列」中配置该 group
4. 折叠的 **opcua_writeback JSON 预览** 仅供查看/复制，保存时以表单为准

也可直接编辑 profile JSON：顶层 `opcua` + 各页 `opcua_writeback`。

### 6.3 运行行为

- 查询、翻页成功后：写当前页各绑定列数组，`diCursor=-1`
- 点击表格某行：写 `diCursor=行索引`（0 起，最大 49）
- 写失败：服务端 WARNING 日志，前端与 API 无报错

### 6.4 日志排查

- 成功：`DEBUG` 级别（列名、节点、行数）
- 失败：`WARNING`，搜索 `OPC UA writeback`

本地联调可启动 mock 服务器：

```bash
python scripts/query_web_opcua_mock_server.py
```

并将 profile 中 `endpoint_url` 设为 `opc.tcp://127.0.0.1:4851/query-web/mock/`（默认端口 4851，可用 `--port` 修改）。NodeId 须与 mock 服务启动日志或 `--meta-out` 文件中的实际值一致。

## 7. 常见问题

- **1045 Access denied**
  - 检查数据库账号密码与主机权限。
- **429 请求过于频繁**
  - 降低前端轮询频率或调高 `requests_per_minute`。
- **查询结果为空**
  - 检查时间范围、表名、过滤条件；注意系统默认会应用查询窗口限制。
