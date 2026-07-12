# TODO / 变更索引

> 按日期**倒序**（最新在上）记录精炼变更与验收索引，详细任务看板见 `docs/NNN-状态-主题.md`。
> 本文件不复制任务文档全文，只做日期分段引用；规则见 [CLAUDE.md](CLAUDE.md)。

---

## 2026-07-12

- **新增 Agent 规则与文档约定**：创建 [CLAUDE.md](CLAUDE.md)（唯一正文）与 [AGENTS.md](AGENTS.md)（引用 CLAUDE.md）；确立「任务看板写 `docs/NNN-状态-主题.md`、H1 状态子任务、`todo.md` 倒序索引、README 只写功能说明、Agent 不自行 git」等约定。建立 `docs/` 任务目录。
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
