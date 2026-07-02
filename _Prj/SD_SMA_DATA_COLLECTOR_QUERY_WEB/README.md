# SD_SMA_DATA_COLLECTOR_QUERY_WEB

独立的本地查询与配置程序，用于与 `SD_SMA_DATA_COLLECTOR` 并行运行，降低耦合。

## 功能范围（第一版）

- 数据库查询 API：健康检查、组/表/列元数据、历史数据分页查询。
- 查询配置驱动查询：通过 `query_view_config.json` 定义每个视图的列、分页、默认筛选、排序。
- 支持“每个标(表)独立列配置与顺序”：`views.<view>.per_table.<table>.columns`。
- 页面支持“应用并保存”一键生效（无需先应用再手动保存）。
- 支持每个标独立 `sort_by / sort_dir / page_size`。
- 查询接口提供 `warnings` 与 `missing_columns`，用于提示模板字段缺失。
- 查询页与查询配置页已拆分：
  - `/query`：只负责查询与结果展示
  - `/config`：只负责人机友好的查询配置（每个 group/table）
- 配置页不再直接暴露整份查询配置 JSON，改为表单化编辑：
  - 每个表的列顺序
  - `sort_by / sort_dir / page_size`
  - 每个显示列的英文/中文列名
- 配置页新增插件配置可视化区块（无需手改 JSON）：
  - 模块选择（`alarm / audit / general`）
  - 页面选择（`1-5`）
  - 启用开关、标题、`view_name`、`bind_group`、`page_size`
- 插件页右上角手动选择该 `group` 下具体表。
- **插件页 OPC UA 回写**：查询/翻页后自动将当前页列数据写入 PLC 数组（最长 50）；点击表格行更新 `diCursor`（翻页后重置为 `-1`）。
- 查询网页：表格查询入口（后续可扩展报警/审计专页）。
- 配置管理 API：查询页配置（列定义、分页）独立存储

## 目录结构

- `app/` FastAPI 服务代码
- `config/` 本程序配置与查询页配置
- `app/static/` 本地静态页面

## 启动方式

1. 安装依赖：
   - `pip install -r requirements.txt`
2. 启动：
   - `uvicorn app.main:app --host 0.0.0.0 --port 8090`
3. 访问：
   - `http://localhost:8090/query`（查询页）
   - `http://localhost:8090/config`（配置页）

## 首次启动必做

- 修改 `config/app_settings.json` 中数据库账号密码。
- 默认 `readonly_user / readonly_password` 仅为示例值，未创建对应 MySQL 用户时会报 1045 拒绝访问。
- 可先访问 `GET /api/db/check` 做连通性检查。

## 与采集程序的边界

- 不 import 采集程序主流程模块（`main.py`、通信模块）。
- 数据库侧仍为只读查询；插件页可通过 OPC UA **写回**当前页查询结果（独立 `asyncua` 客户端）。

## 插件页 OPC UA 回写配置（JSON）

在统一 profile（如 `config/测试.json`）中配置：

**全局连接**（profile 顶层）：

```json
"opcua": {
  "endpoint_url": "opc.tcp://192.168.x.x:4840",
  "username": "",
  "password": ""
}
```

`endpoint_url` 为空时不写 OPC。

**每插件页绑定**（`plugins.modules.<module>.pages.<n>.opcua_writeback`）：

```json
"opcua_writeback": {
  "cursor": "ns=6;s=::Query:cursor",
  "columns": {
    "code": "ns=6;s=::Query:arCode",
    "msg": "ns=6;s=::Query:arMsg"
  }
}
```

- 仅 `columns` 中出现的列会回写；每项对应 PLC 侧 `ARRAY[0..49]`
- 键名必须是**数据库字段名**（如 `collection_time`），与表格显示列配置相互独立
- 翻页/查询后自动写数组，并写 `cursor=-1`（未选中）；点击表格行后写 `cursor=行索引`（0–49，0 起）
- OPC 写失败只记日志，不影响查询 API 响应
- 配置页 **高级设定 · OPC UA 回写** 可编辑 `opcua` 与 `opcua_writeback` JSON

## 关键查询接口

- `GET /api/query/views` 获取所有查询视图配置
- `POST /api/history/by-view` 按视图配置执行查询（优先推荐）
- `POST /api/history` 通用原始查询接口（保留用于联调）
- `GET /api/db/check` 数据库连通性检查
- `POST /api/plugins/query/{plugin_key}` 插件页查询（可选 body `cursor`，默认 `-1` 表示未选中）
- `POST /api/plugins/cursor/{plugin_key}` 仅更新 cursor

## 自动化测试

```bash
pip install -r requirements.txt
pytest tests/ -v
pytest tests/ -v -m integration
```

集成测试会自动启动 `scripts/query_web_opcua_mock_server.py`（端口 4841）。

## 运维文档

- [操作手册](docs/OPERATIONS_GUIDE.md)
- [测试清单](docs/TEST_CHECKLIST.md)
- [切换预案](docs/CUTOVER_PLAN.md)
