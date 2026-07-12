# TODO / 变更索引

> 按日期**倒序**（最新在上）记录精炼变更与验收索引，详细任务看板见 `docs/NNN-状态-主题.md`。
> 本文件不复制任务文档全文，只做日期分段引用；规则见 [CLAUDE.md](CLAUDE.md)。

---

## 2026-07-12

- **表格系统深度评估 + 修复排期**：详见 [docs/002-🚧-表格系统评估与修复.md](docs/002-🚧-表格系统评估与修复.md)。三路并行审计 ReportEditor 表格控件（几何度量层 / SQL 填充分页链路 / 组件层与重复），产出评级（设计 B+ / 实现 B- / 完整度 C+）与按严重度排序的缺陷：P1「预览取 1000 行 vs 导出取全量」的分页份数所见非所得、长内容 240px 静默裁剪、纵表 0 行渲染字面 "…"；P2 SQL 参数值前端拼接漏反斜杠、窄表列宽拖拽失效、Template/Zone 模型复制漂移；P3 度量副作用/性能/高缩放亚像素；及合并单元格等整类能力缺口。已排定修复执行顺序，下一步从 P1 起修（TDD）。
- **Git 策略调整**：改为以 `.cursor/rules/queued-task-then-push.mdc` 为准——每完成一条队列任务即 `git add`+`commit`+`push`；CLAUDE.md/AGENTS.md 已同步。
- **新增 Agent 规则与文档约定**：创建 [CLAUDE.md](CLAUDE.md)（唯一正文）与 [AGENTS.md](AGENTS.md)（引用 CLAUDE.md）；确立「任务看板写 `docs/NNN-状态-主题.md`、H1 状态子任务、`todo.md` 倒序索引、README 只写功能说明」等约定。建立 `docs/` 任务目录。
- **安全与可靠性缺陷修复（A 档）**：详见 [docs/001-🚧-安全与可靠性缺陷修复.md](docs/001-🚧-安全与可靠性缺陷修复.md)。
  - 新增根级 uv 开发/测试环境（`pyproject.toml`+`uv.lock`+`.python-version`，锁 Python 3.12）。
  - 采集器可靠性三件套：失败批次回队防丢数、跨年分表运行期补建、DB 写入 `to_thread` 化不阻塞事件循环。
  - ReportEditor 后端安全：pk 过滤值参数化、只读判定加固、CORS 白名单化。
  - 四个 Web 服务统一 token 鉴权（`SD_SMA_WEB_TOKEN`）+ 默认绑定 127.0.0.1 + 资源泄漏治理。
  - Launcher 退出码修正 + 崩溃指数退避自动重启；`check_config.py` 崩溃修复。
  - 明文口令改 `SD_SMA_DB_PASSWORD` 注入、含密配置摘除跟踪与脱敏。
  - 仓库卫生：摘除 `data_collector.log`、`.gitignore` 修正、README 补全 7 子工程。
  - **验收**：六套件全绿（采集器 104 / QUERY_WEB 77 含 OPC UA 集成 / ReportEditor 后端 65 / Launcher 15 / DB_ADMIN 13 / REPORT_COPY 9），全程 TDD 先红后绿。
  - **待办**：改动未提交（交用户手动 git）；C 档口令轮换 + git 历史清洗待现场执行。
- **全仓评估**：完成 7 个子工程体量/质量/安全评估，产出缺陷分级（P0 明文口令入历史、P1 零鉴权/静默丢数、P2 复制粘贴/依赖漂移等），作为上述修复的依据。
