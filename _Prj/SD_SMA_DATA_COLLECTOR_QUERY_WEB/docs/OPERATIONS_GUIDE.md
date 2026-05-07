# Query Web 操作手册

## 1. 启动前配置

编辑 `config/app_settings.json`：

- `database`：配置可访问的 MySQL/SQLite。
- `collector_config_dir`：采集程序 `config` 目录。
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

## 6. 采集配置输出

- 配置页支持：
  - 保存采集模板
  - 导出 JSON
  - 直写到采集程序 `config` 目录（自动备份）

## 7. 常见问题

- **1045 Access denied**
  - 检查数据库账号密码与主机权限。
- **429 请求过于频繁**
  - 降低前端轮询频率或调高 `requests_per_minute`。
- **查询结果为空**
  - 检查时间范围、表名、过滤条件；注意系统默认会应用查询窗口限制。
