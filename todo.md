# TODO / 变更索引

> 按日期**倒序**（最新在上）记录精炼变更与验收索引，详细任务看板见 `docs/NNN-状态-主题.md`。
> 本文件不复制任务文档全文，只做日期分段引用；规则见 [CLAUDE.md](CLAUDE.md)。

---

## 2026-07-13

- **ReportEditor 数据源 UI 重诊（文档先行，待 0.3.58）**：0.3.57 未闭环——工作台仍空白、锁进度与拖柄不同步。看板改回 [docs/004-🚧-ReportEditor数据源UI修复.md](docs/004-🚧-ReportEditor数据源UI修复.md)；计划 [`009_版本Plan/0.3.58.md`](_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.58.md)。**主因**：`ConnectionManager` 使用 `draft` 但未声明 → 挂载 `ReferenceError`；并响应同事建议补 Vue/布局契约测试。**本条仅文档，代码待确认后再改。**
- **ReportEditor 0.3.57 已发版（部分）**：滑动锁外观止血；工作台空白误判已闭环。原看板曾标 ✅，现以 004-🚧 / 0.3.58 续修为准。
- **ReportEditor 0.3.57 计划与文档分工对齐**：建立任务看板与版本 Plan 交叉引用；更新 CLAUDE/AGENTS/todo。

## 2026-07-12

- **剩余任务与后续规划汇总（交接）**：新建 [docs/003-⌛️-剩余任务与后续规划.md](docs/003-⌛️-剩余任务与后续规划.md)——跨 001/002 的统一索引/路线图，含 git 快照（`origin/main`=`ec49152`，本地领先 12 提交未推）、分类速查（本机可闭环 / 需运行应用 / 需产品决策 / 需现场真库）与建议推进顺序。同步订正 001「待提交」段（A 档已合并为 `ec49152`）。
- **表格系统缺陷修复（进行中）**：详见 [docs/002-🚧-表格系统评估与修复.md](docs/002-🚧-表格系统评估与修复.md)。已修并提交（TDD 先红后绿，前端全套 243 passed、vue-tsc 0 错误）：纵表/横表 0 行不再渲染字面 "…"（20dcdd4）；窄/多列表格列宽拖拽退化区不再反向/整体重置（d82bd57）；放开表格单行内容高度上限 240px→整页界避免长内容裁剪（6e7f792）；P1-A 预览截断提示逻辑核心 `sqlFillPreviewTruncationHint`（77859d5，UI 横幅待接入）；P2-A SQL 参数值方言正确转义、闭合 MySQL 反斜杠注入/断串（0262de6，真参数化重构待后续）；**P2-C 表格模型去重**——抽 `table-grid-core.ts` 共享网格原语（`ensureTableGridCore` 泛型化 / clamp / 列宽 / chrome / 列背景），`model.ts`（Template 系）与 `layout-zone-element.ts`（Zone 系）改薄委托，消除约 11 对平行复制中的网格原语层；`intrinsicOuterHeight`/外框 clamp 的 SQL 填充高度**历史漂移刻意保留**为需决策的后续（合并会改可见高度）。行为保持：243 passed、`tsc` 触及文件 0 错误。；**P3-A 度量函数副作用剥离**——列宽/高度/最小尺寸 getter（`templateTableColumnInnerWidthsPx`/`intrinsicOuterHeightFor*Table`/`minOuterSizeFor*`/`computeZoneTableContentRowHeightsPx` 等）内部原本调 `ensureTableGrid` 就地改 `el`，被放进 Vue computed/渲染即渲染期非用户 mutation（undo/redo 隐患、重复 ensure）；抽只读原语 `tableColumnInnerWidthsPxReadonly` 用钳制值+补齐副本重算不写回，getter 全部去 ensure，真 mutator 保留。TDD 新增 `table-metrics-readonly.test.ts` 5 用例先红后绿（空数组不被补齐、`tableCells` 引用不变、逐值与旧路径一致）。行为保持：248 passed、`tsc` 触及文件 0 错误。用户决策：240px＝放开上限+超页跨页断行（放开已做，行内跨页断行待排期）；P1-A＝预览与导出都按单报表上限、超出给提示不显示全量、保留后端 1000 上限。
- **表格系统深度评估**：三路并行审计 ReportEditor 表格控件（几何度量层 / SQL 填充分页链路 / 组件层与重复），评级设计 B+ / 实现 B- / 完整度 C+，产出按严重度排序缺陷与执行顺序（P2-A SQL 参数值参数化、P2-C 模型去重、P3 性能/副作用、合并单元格等盲区待推进）。
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
