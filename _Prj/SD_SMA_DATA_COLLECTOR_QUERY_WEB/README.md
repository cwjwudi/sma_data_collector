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
- 查询网页：表格查询入口（后续可扩展报警/审计专页）。
- 配置管理 API：
  - 采集配置子集模板读取与保存
  - 导出采集配置 JSON
  - 直写到 `SD_SMA_DATA_COLLECTOR/config`（带备份、原子替换）
  - 查询页配置（列定义、分页）独立存储

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
- 仅通过数据库和配置文件路径交互。
- 支持“导出配置”和“直写配置”两种模式。

## 关键查询接口

- `GET /api/query/views` 获取所有查询视图配置
- `POST /api/history/by-view` 按视图配置执行查询（优先推荐）
- `POST /api/history` 通用原始查询接口（保留用于联调）
- `GET /api/db/check` 数据库连通性检查

## 运维文档

- [操作手册](docs/OPERATIONS_GUIDE.md)
- [测试清单](docs/TEST_CHECKLIST.md)
- [切换预案](docs/CUTOVER_PLAN.md)
