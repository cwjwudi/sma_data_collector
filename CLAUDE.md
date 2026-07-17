# P000 SD SMA SCADA — Claude Code / Cursor / Codex / Agent 项目规则

本文件为 **Claude Code**、Cursor、Codex 及其他兼容的 AI Agent 提供 **本仓库** 级约定，请严格遵循。

> **双文件关系**：根目录 [AGENTS.md](AGENTS.md) 不重复正文，只**引用本文件（CLAUDE.md）**为唯一事实来源。规则以本文件为准；两者供不同工具默认读取。**改规则时改本文件即可**，AGENTS.md 保持引用不必同步正文。

---

## 项目定位

- **项目**：新马药机（SmartData）侧的 **SCADA / 数据采集 / 电子报表 / 数据库** 一体化仓库。需求来源见 [`_Doc/001_需求整理/新马数据需求整理.md`](_Doc/001_需求整理/新马数据需求整理.md)。
- **目标用户与环境**：交付与运行在 **Windows** 现场；下位为 **B&R Automation Studio** PLC，经 **OPC UA** 上送数据，存入 **MySQL/SQLite**，报表输出 **PDF**（可加密、可拷贝至 U 盘）。**开发可跨平台**（当前 dev 机为 macOS），但涉及现场行为的验证需回到 Windows。
- **技术栈**：
  - **后端（Python）**：FastAPI + Uvicorn、SQLAlchemy(2.0.25)、PyMySQL、`opcua`（采集器，旧库）/ `asyncua`（其余，新库）、Pydantic、cryptography。
  - **前端（ReportEditor）**：Vue 3 + Vite + TypeScript(strict) + Pinia + Electron；图表 ECharts、PDF 用 pdfjs-dist；集成 OpenAI 兼容 LLM 辅助。
  - **PLC**：B&R Automation Studio（Structured Text / C，mappView）。
  - **依赖与运行**：Python 侧用 **uv**（`uv sync`、`uv run`），勿用 `pip`/`pipenv`/`poetry` 作为主要方式；前端用 **npm**（Node `>=20 <24`）。
- **入口**：
  - 四个 Python 服务的统一运行入口为 **`_Launcher/`**（`sd_sma_launcher.py`，监管 8091–8094）。
  - 各服务也可单独用其 `start_*.bat`（`python -m uvicorn ...`）启动。
  - ReportEditor 前端：`_Prj/SD_SMA_ReportEditor/frontend/` 内 `npm run electron:dev` / `npm run dev`。

---

## 架构概览

```
仓库根目录
├── CLAUDE.md / AGENTS.md   # Agent 规则（本文件为正文，AGENTS.md 引用之）
├── README.md               # 功能与使用说明（不写日期型变更日志）
├── todo.md                 # 按日期【倒序】的精炼变更/验收索引（最新在最上）
├── pyproject.toml / uv.lock / .python-version  # 根级 uv 本机开发/测试环境（Python 3.12）
├── docs/                   # AI 自动编写的文档与任务看板（NNN-状态-主题.md）
├── _Doc/                   # 人工需求 / 会议纪要 / 架构 / 教程 / 配图
│   └── … ReportEditor 另有 _Prj/SD_SMA_ReportEditor/_Doc/（含 009_版本Plan/ 按版本号的产品计划）
├── _Launcher/              # 统一启动器（进程监管、便携打包脚本）
├── _Prj/                   # 7 个子工程（见下表）
│   ├── SD_SMA_DATA_COLLECTOR/          # 采集服务(8091)：communication/core/database/runtime/web_config
│   ├── SD_SMA_DATA_COLLECTOR_QUERY_WEB/# 查询+OPC UA 回写(8092)：app/ + pytest 套件
│   ├── SD_SMA_DB_ADMIN/                # 数据库备份/恢复/CSV(8093)：app/
│   ├── SD_SMA_REPORT_COPY/            # 报表拷贝至 U 盘(8094)：app/
│   ├── SD_SMA_ReportEditor/          # Electron+Vue3+FastAPI+AI：backend/ frontend/ rptp/ packaging/ _Doc/
│   ├── SD_SMA_SCADA_DEMO/            # B&R PLC 工程（mappView）
│   └── SMA_DATA/                     # B&R 早期原型（遗留归档，勿新用）
└── web-portal-demo/        # ReportEditor 自动更新/分发静态站点暂存
```

新增相对独立的子系统时，仍以 **`SD_SMA_功能名/`**（大写下划线，沿用现有命名）的形式放在 `_Prj/` 下，与既有子工程并列，自包含 `config/`、`tests/`、`README.md`，并在 `_Launcher`/README 说明如何启动。B&R 工程保持 Automation Studio 目录结构不动。

---

## 环境与工具

- **Python 一律用 uv**：仓库根已提供统一开发/测试环境（`pyproject.toml` + `uv.lock`，锁定 **Python 3.12**）。
  - 首次：`uv sync`（在仓库根）。
  - 跑某子工程测试：`uv run --directory _Prj/<子工程> python -m pytest tests -q`。
  - **注意 Python 版本**：`sqlalchemy==2.0.25` 在 **Python 3.13 上会崩**（`TypingOnly` 断言），故 `.python-version` 钉 3.12；将来升级 Python 时需同步升 SQLAlchemy。
  - 现场部署仍以各子工程 `requirements*.txt` 与 `_Launcher/requirements-unified.txt` 为准；根级 uv 环境是它们的并集，仅供本机开发测试，不参与打包交付。
- **前端用 npm**：`_Prj/SD_SMA_ReportEditor/frontend/` 下 `npm install` 后 `npm run test`（vitest）、`npm run electron:dev`（联调）。
- **Windows / 现场**：服务默认绑定 `127.0.0.1`，可用 `SD_SMA_BIND_HOST` 覆盖；跨机访问需配 `SD_SMA_WEB_TOKEN`（见下「部署环境变量」）。

### 部署环境变量

| 变量 | 作用 |
| ---- | ---- |
| `SD_SMA_DB_PASSWORD` | 数据库密码注入（采集器 / QUERY_WEB），配置文件不再保存明文口令 |
| `SD_SMA_WEB_TOKEN` | 四个 Web 服务远程访问令牌（请求头 `X-SD-SMA-Token`；loopback 免令牌，未设置时非本机一律 403） |
| `SD_SMA_BIND_HOST` | `start_collector.bat` / `start_query_web.bat` 监听地址覆盖（默认 127.0.0.1） |
| `SD_SMA_RESTART_*` | Launcher 崩溃自动重启策略（默认 60s 窗口最多重启 3 次、指数退避 1s/2s/4s，设 `SD_SMA_RESTART_MAX_RESTARTS=0` 恢复 fail-fast） |
| `SD_SMA_STORAGE_MAX_QUEUE_SIZE` / `SD_SMA_STORAGE_DROP_LOG_INTERVAL` | 采集器内存缓冲上限与超限丢弃告警节流 |
| `REPORT_EDITOR_CORS_ORIGINS` | ReportEditor 后端 CORS 白名单扩展（逗号分隔） |
| `MARIADB_ROOT_PASSWORD` | ReportEditor docker-compose 演示库口令（必填，不再内置默认值） |

---

## Git 与版本控制

本仓库采用「**队列任务完成即提交推送**」策略，以 [`.cursor/rules/queued-task-then-push.mdc`](.cursor/rules/queued-task-then-push.mdc) 为准：

- **每完成用户队列（queued）中的一条任务**（补文档、更新配图、改 README、修 bug 等），在收尾时：
  - 若有未跟踪或未提交的更改：执行 **`git add`** 与 **`git commit`**（简明中文说明，如 `docs(sd-sma): …`、`fix(collector): …` 等与团队惯例一致的前缀）。
  - **随后执行 `git push`**，将当前分支同步到 **`origin`**，避免本地堆积未推送提交。
- 若用户明确表示**暂不推送**或**仅本地保存**，尊重其选择（只 `commit` 不 `push`，或都不做）。
- **推送前排除不应入库的路径**：仅本机 `Temp`、个人密钥、含真实口令的现场 `config/*.json` 等**不要 `git add`**；只提交已纳入版本控制的文档与约定工程文件。
- **提交粒度**：一条队列任务对应一次（或一组语义清晰的）提交，不夹带无关改动。

---

## 任务事项推进与跟踪

所有涉及代码、文档、配置、测试、设计或验收推进的任务，都要在 **`docs/`** 下维护一份可视化任务说明文档，用于承载事项的范围、子任务、状态、证据与后续动作。`todo.md` 只保留按日期**倒序**归档的精炼索引，不作为主要任务看板。

### ReportEditor 版本 Plan（产品计划，非任务看板）

- 路径：[`_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/`](_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/)；文件名 = 版本号（如 `0.3.57.md`）。
- **用途**：该版本要做什么、验收标准、版本级规则；与 [`007_版本发布记录.md`](_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md)（发版后事实）分工。
- **不是** `docs/NNN-状态-主题.md` 的替代：实施时仍须有（或复用）根目录任务看板，子任务用 H1（✅/🚧/⌛️）；Plan 顶部链到对应 `docs/NNN-…`；`todo.md` 只写精炼索引。
- 用户指定在 `009_版本Plan/*.md` 写计划时：更新该 Plan，并按本节新建/更新 `docs/` 看板，二者交叉引用，不把 H1 状态只写在 Plan 里而无看板。

### 任务文档命名

1. **相近任务复用优先**：新建 `NNN-状态-主题.md` 前，先扫 `docs/` 已有文件名（只看名，不必打开），若已有非常相近/同名功能点（如 `020-✅-报表编辑器优化.md`），优先在该文件内追加/修改 H1 子任务，不另建相近主题文件。
2. **编号递增**：确认无可复用文档后，统一命名 **`NNN-状态-主题.md`**（`NNN` 三位数字，扫描 `docs/` 已有 `NNN-*.md` 取最大 +1），例如 `001-✅-安全与可靠性缺陷修复.md`。
3. **文件名状态与整体进度一致**：
   - **`NNN-⌛️-主题.md`**：尚未启动，或只有计划设想。
   - **`NNN-🚧-主题.md`**：正在推进，有局部实现/文档/验收但未完全闭环。
   - **`NNN-✅-主题.md`**：已完成，且代码、测试、README 或任务文档中的验收证据可证明基本闭环。
4. **状态变化要重命名**：进入实施改 `🚧`，完成改 `✅`；编号与主题稳定，只改状态标记。
5. **用户指定文件优先**：用户明确指定某 `*.md` 作为本轮执行/计划/记录文件时，优先在该文件补充更新，不自动新建编号文档；若缺 H1 状态结构，应在原文件中整理为 H1 状态标题。
6. **历史文档兼容**：既有日期前缀文档等不强制批量改名；当它们被本轮继续推进并作当前看板时，再按新规则整理或拆分。

### 任务文档结构

1. **所有可执行子任务都必须是 H1 标题**：
   - `# ✅ 已完成：子任务名称`
   - `# 🚧 进行中：子任务名称`
   - `# ⌛️ 未完成：子任务名称`
2. **状态含义固定**：✅=代码/测试/README 已证明基本闭环；🚧=有局部实现，尚缺关键边界/真实样本验收/性能治理/体验闭环；⌛️=尚未实现或仅设想。
3. **详细信息写在对应 H1 下**：目标、范围、实现说明、验收方式、证据、风险、后续动作都放该 H1 下；不要把关键细节散落在 H1 之外，也不要只用普通 checklist 替代 H1 子任务。
4. **部分完成必须拆分**：父事项只完成一部分时，不要整体标 ✅；应拆成多个 H1 子任务，或保留 🚧 并在正文写清已完成/未完成边界。

### 推进流程

1. **执行前**：查 `todo.md` 与 `docs/` 已有文件名（可只看名）；用户指定执行文件时以其为准，否则先判断是否复用相近既有文档再决定是否新建编号文档。若开始实施，确保对应文档名为 `NNN-🚧-主题.md`，并用 H1 状态标题写清本轮范围、验收标准、当前子任务。若用户给了路线图/计划文档，对照明确一致项、超范围项、需拆分项。
2. **执行中**：随进展维护 H1 状态与正文证据；新发现/风险/真实样本验收结果写入对应 H1 下；用户已指定执行文件时写回该文件；新增独立事项优先在当前文档新增 H1，成独立大任务再建下一编号文档。
3. **执行后**：闭环的 H1 标 ✅，未闭环保持 🚧/⌛️ 并写清缺口；仅当文档内本轮交付范围全部闭环才把文件名改 `NNN-✅-主题.md`，仍有进行中子任务则保持 `NNN-🚧-主题.md`；在 `todo.md` **顶部**追加日期分段，简述做了什么、影响范围、如何验收，引用对应编号文档而非复制全文；**[README.md](README.md)** 只维护功能/使用说明，不堆日期流水账；最后按上文「Git 与版本控制」策略 `git add`+`commit`+`push` 本轮改动（用户表示暂不推送则尊重）。

---

## 执行计划类 Markdown（路线图 / 勾选任务清单）

当某个 `*.md`（如 `todo.md`、`docs/NNN-状态-主题.md`、某路线图）被**用户或本轮对话明确指定**为执行计划/任务列表时，除遵守上文外还应：

1. **执行前（核对）**：打开 `todo.md`、对应 `docs/NNN-状态-主题.md` 与被指明的计划文档，区分「与本轮一致」「不一致/超范围」「需拆分为多步」的条目，不默认整份计划都在本轮范围。
2. **执行后（更新勾选）**：在约定那份文档（或 `todo.md`，以用户指定为准）更新状态——完全完成改 `[x]`；仅部分完成**不要**把父条目标为完成，应把可独立验收部分改 `[x]`、或拆子项分别勾选、或在该条注明「部分完成：……」，未完成部分保持 `[ ]`。多文档并存时同一事实优先在用户指定执行文件或 `docs/NNN-状态-主题.md` 详写，其他位置用简短引用/日期分段对齐。

---

## 模块化约定（子工程 `SD_SMA_功能名/`）

相对独立的新功能以 `_Prj/SD_SMA_功能名/` 目录组织（大写下划线，沿用现有命名）。

| 方面 | 约定 |
| ---- | ---- |
| 包内职责 | 分层清晰：路由/接口、业务模块、数据访问、配置、静态资源分文件存放（参考 ReportEditor `backend/{api,modules,schemas,core}` 或采集器 `communication/core/database/runtime`）。跨子工程复用的逻辑应抽公共实现而非复制粘贴（现状存在 `opcua_client.py`/`config_manager.py` 多份拷贝，属技术债，新代码勿延续）。 |
| 入口 | 通过 `start_*.bat`（`uvicorn`）或注册进 `_Launcher/launcher_config.json`，并在 README 说明；前端型子模块经 npm scripts 暴露。 |
| 测试 | 测试放 `子工程/tests/`（或 ReportEditor 后端的 `modules/test_*.py`），文件名 `test_*.py`；单套件 `uv run --directory _Prj/<子工程> python -m pytest tests -q`。**依赖本机真实资源**（真实 OPC UA server、真实 MySQL、ArSim）的用例应打 `@pytest.mark.integration`（QUERY_WEB 已用此 marker，OPC UA mock 起在 4841 端口，约 5 分钟）；快速门禁跑 `-m "not integration"` 应在任何机器全绿，重型集成套件按需 `-m integration`。 |

**好处**：子工程可独立开发测试，边界明确，便于拆分与打包。

---

## 文件命名约定

- **新建普通 Markdown**（除固定文件外）用 **`YYYY-MM-DD-` + 主题**；同一天多份依次 `-a-`、`-b-` 递增。
- **任务事项文档例外**：任务推进/跟踪文档用 **`docs/NNN-状态-主题.md`**，不用日期前缀。
- 固定文件如 `README.md`、`todo.md`、`AGENTS.md`、`CLAUDE.md`、各子工程 `README.md` 不受日期前缀约束。

---

## 约定摘要

| 环节 | 动作 |
| ---- | ---- |
| 任务文档 | 所有任务推进在 `docs/NNN-状态-主题.md` 维护；新建前先按 `docs/` 文件名复用相近既有文档，否则编号递增 |
| ReportEditor 版本 Plan | `_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/<version>.md` 写产品计划；实施状态在 `docs/` 看板；发版事实在 `007_版本发布记录.md` |
| 子任务 | 文档内子任务用 H1：`# ✅ 已完成：...` / `# 🚧 进行中：...` / `# ⌛️ 未完成：...` |
| 指定文件 | 用户明确指定某执行/计划 `.md` 时，优先在该文件补充，不自动新建编号文档 |
| 计划文档 | 某 `.md` 作执行清单时：执行前与 `todo.md`、编号任务文档核对范围；执行后更新 `[x]` / 部分完成拆项 |
| 环境/运行 | Python 一律 uv（Python 3.12）、前端 npm（Node 20–23）；现场注意绑定地址与鉴权环境变量 |
| Git/版本控制 | 每完成一条队列任务即 `git add`+`commit`+`push` 到 `origin`；排除不应入库路径（本机 Temp / 密钥 / 含密配置）；用户说暂不推送则尊重 |
| 新功能 | 独立子工程 `_Prj/SD_SMA_功能名/`，自包含接口、逻辑、配置、测试；勿延续跨工程复制粘贴 |
| 收尾-记录 | 详细进展写编号任务文档；精炼索引写入 `todo.md`（日期分段、**倒序、最新在上**） |
| 收尾-README | 只更新功能/使用说明，不写日期型变更日志 |
| 新建文档 | 普通 `.md` 用 `YYYY-MM-DD-`；任务文档用 `NNN-状态-主题.md` |
| 规则维护 | 规则以本文件为唯一正文；AGENTS.md 只引用不复制 |

---

> 本仓库以本文件为 Agent 共同约定的**唯一正文**，[AGENTS.md](AGENTS.md) 引用之。改规则改本文件即可。
