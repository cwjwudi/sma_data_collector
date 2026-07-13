# AGENTS.md — P000 SD SMA SCADA

本仓库对 **所有 AI Agent**（Codex、Cursor、Claude Code 及其他兼容工具）的约定，**正文统一维护在 [CLAUDE.md](CLAUDE.md)**。

> 本文件不重复规则内容，只作引用入口，避免双份漂移。**请先完整阅读 [CLAUDE.md](CLAUDE.md) 再开始工作。**

## 规则要点索引（详见 CLAUDE.md 对应章节）

- **项目定位 / 架构概览** — 新马药机 SCADA 一体化仓库；后端 FastAPI+uv、前端 Vue3+Electron、下位 B&R PLC；子工程在 `_Prj/`，统一入口 `_Launcher/`。
- **环境与工具** — Python 一律 **uv**（`uv sync` / `uv run --directory _Prj/<子工程> python -m pytest`，锁定 Python 3.12）；前端 **npm**（Node 20–23）。部署环境变量见 CLAUDE.md 表格。
- **Git 与版本控制** — 每完成一条队列任务即 `git add`+`commit`+`push` 到 `origin`（与 [`.cursor/rules/queued-task-then-push.mdc`](.cursor/rules/queued-task-then-push.mdc) 一致）；排除本机 Temp / 密钥 / 含密配置等不应入库路径；用户说暂不推送则尊重。
- **任务事项推进与跟踪** — 任务看板写在 **`docs/NNN-状态-主题.md`**，子任务用 H1 状态标题（✅/🚧/⌛️）；`todo.md` 只记按日期**倒序**的精炼索引；`README.md` 只写功能/使用说明。
- **模块化约定** — 新子系统建 `_Prj/SD_SMA_功能名/`，自包含接口/逻辑/配置/测试。
- **文件命名** — 普通 Markdown 用 `YYYY-MM-DD-` 前缀；任务文档用 `NNN-状态-主题.md`。

以上均以 **[CLAUDE.md](CLAUDE.md)** 为准；如有冲突，以 CLAUDE.md 为唯一正文。
