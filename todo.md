# TODO / 变更索引

> 按日期**倒序**（最新在上）记录精炼变更与验收索引，详细任务看板见 `docs/NNN-状态-主题.md`。
> 本文件不复制任务文档全文，只做日期分段引用；规则见 [CLAUDE.md](CLAUDE.md)。

---

## 2026-07-20

- **ReportEditor 0.3.112（032 P0）**：`usePageLifecycle` + AiTools keep-alive 名 + 可移动卷 async/in-flight + History page-focus 停表（5s）+ 数据源探活/OPC 浏览离页 pause + 契约测 L1–L4/L9。看板 [docs/032-🚧](docs/032-🚧-ReportEditor全站架构评估与统一生命周期.md) · [docs/031-✅](docs/031-✅-ReportEditor历史报表分屏选路径后卡顿.md)。

- **032 生命周期拍板**：结批/心跳=A 级（任意页+最小化不停）；历史分屏 U 盘轮询离开页/退出分屏/最小化停；数据源 OPC 浏览与页内探活离页停、侧栏探活可留。详见 [docs/032-🚧](docs/032-🚧-ReportEditor全站架构评估与统一生命周期.md)。

- **全站架构评估（032）**：跳转/keep-alive 缺统一 pause 为系统性债（综合≈3.0/5）；统一 `usePageLifecycle` + P0→P2 修复计划；表格空间偏移已关、导出仍绑 printToPDF。看板 [docs/032-🚧](docs/032-🚧-ReportEditor全站架构评估与统一生命周期.md)；003 已按 032 重排。

- **历史报表分屏选路径后卡顿（✅ 短期 0.3.112）**：主因 sync 枚举已改 async + page-focus；缩略图并发与 V 手测仍开。看板 [docs/031-✅](docs/031-✅-ReportEditor历史报表分屏选路径后卡顿.md)。

- **ReportEditor 0.3.111 Mac 已打包**：`Report Editor AI-0.3.111-arm64.dmg`；`latest.json` 已写 darwin SHA256（win32 仍空，需 Windows 机打 NSIS）。

- **ReportEditor 0.3.111**：分卷导出首份 fullSqlFill 缓存复用 + 只渲染当前 reportPartIndex（030/023）。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **ReportEditor 0.3.110**：结批 CPU 节制（默认并行1、≤4逻辑核预算、导出 BelowNormal/分卷 yield）；现场 i3-7100U+Hypervisor 少一核+同机 DB。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **结批占满 CPU → mappView 白屏（登记）**：Windows 实际结批 Electron 隐藏窗不节流 + 默认并行 4，同机 mappView 白屏；根因与现场缓解已写看板。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **019 导出相框 /「表格空间向右偏移」复核**：根因仍为 slack 28 + chrome inset 欠缩放（0.3.98 已修）；代码仍在；U1–U9 8 项绿；`latest.json` 0.3.109 SHA 空未打新包。看板 [docs/019-✅](docs/019-✅-ReportEditor导出PDF纸张外框.md)。

## 2026-07-15

- **ReportEditor 模拟结批性能回归分析（进行中）**：登记本机模拟结批、多重线性回归和趋势可视化任务；首轮基于 5000/50000 条压力测试锚点估算当前重复查询路径与分页取数优化路径的理论上限，真实自动化压测和分页优化验证待补。看板 [docs/023-🚧](docs/023-🚧-ReportEditor模拟结批性能回归分析.md)。
- **历史报表双向复制/移动（拍板中）**：[docs/022-⌛️](docs/022-⌛️-ReportEditor历史报表复制到U盘.md)——仅分屏；手选右侧路径；U 盘确认后打开；Q10–17 已齐；Q18/Q19 待回。

## 2026-07-14

- **ReportEditor 0.3.99**：多选拖一角 AABB 组缩放 + 组拖移保尺寸；看板 [docs/020-✅](docs/020-✅-ReportEditor多选组缩放.md)。
- **ReportEditor 0.3.98**：导出 PDF 1:1 铺满 + 恢复角色色粗边（019/021 合批）；看板 [docs/019-✅](docs/019-✅-ReportEditor导出PDF纸张外框.md) · [docs/021-✅](docs/021-✅-ReportEditor导出保留角色色粗边.md)。
- **019+021 合批实施（补测试用例）**：同版本一起做；U/V/N 用例已落地为自动化契约测；已随 0.3.98。
- **历史报表一键复制到 U 盘（仅登记）**：新建 [docs/022-⌛️](docs/022-⌛️-ReportEditor历史报表复制到U盘.md)——整夹/单夹复制 + 建议 U 盘左右分屏模式；仅桌面；未改代码。
- **ReportEditor 0.3.97**：多选共有属性扩展；看板 [docs/018-✅](docs/018-✅-ReportEditor多选共有小数位数.md)。
- **ReportEditor 0.3.96**：AI 能力矩阵 A；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.95 macOS 已打包**：`Report Editor AI-0.3.95-arm64.dmg`；`latest.json` 已写 SHA256（win32 亦已补全）。
- **ReportEditor 0.3.95**：探活 claim 只读误伤修复（施为仍须 write；health 可读作状态证据）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **OPC UA 动态采集间隔与 PLC 联调完成**：`time` / `time_and_variable` 支持通过 `interval_point` 在线定义采集间隔；完成配置、Web UI、PLC 点位与 OPC UA 映射修改，并在 `192.168.50.233` 验证 5 秒→2 秒切换、非法值回退及外部触发独立性。详见 [_Prj/SD_SMA_DATA_COLLECTOR/docs/001-✅-OPCUA动态采集间隔联调.md](_Prj/SD_SMA_DATA_COLLECTOR/docs/001-✅-OPCUA动态采集间隔联调.md)。
- **ReportEditor 0.3.94 已合入 main**：AI 对话深色玻璃 UI + 真流式/claim 清屏修复；看板 [docs/016-✅](docs/016-✅-ReportEditor-AI对话UI改版.md)。
- **探活 claim 误伤只读查证（仅登记）**：[docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)——「分析审计」后用 health 读确认探活已开，仍被改写成缺写入工具；**已于 0.3.95 修复**。
- **ReportEditor AI 吞正文（深入根因）**：[docs/016-✅](docs/016-✅-ReportEditor-AI对话UI改版.md)——claim guard 强制再调前的 `replace ""` 清泡（已随 0.3.94 修）。
- **ReportEditor AI 流式回归（根因订正）**：[docs/016-✅](docs/016-✅-ReportEditor-AI对话UI改版.md)——主因是后端整轮缓冲后再模拟 delta，非前端 Markdown；拟真转发上游 content（已合入）。
- **ReportEditor AI 流式回归（先记后修）**：[docs/016-✅](docs/016-✅-ReportEditor-AI对话UI改版.md)——玻璃态改版后正文流式像失效；根因订正后已修。
- **ReportEditor 0.3.94（分支试做）**：AI 对话深色玻璃 UI；已合入 main，看板 [docs/016-✅](docs/016-✅-ReportEditor-AI对话UI改版.md)。
- **ReportEditor AI 对话 UI（排版拍板）**：[docs/016-✅](docs/016-✅-ReportEditor-AI对话UI改版.md) Q1=C（抽屉+可展开）、Q2=A（仅面板深色玻璃）、Q3=A（顶栏切模型）、Q4=B（无会话侧栏）、Q5=B（仅复制）、Q6=A（无附件）；已落地。

## 2026-07-13

- **ReportEditor 0.3.93 已发版**：数据源滑动解锁 D3 + 60s 限时自动上锁；看板 [docs/017-✅](docs/017-✅-ReportEditor数据源滑动解锁与限时上锁.md)。
- **ReportEditor 数据源滑动解锁（视觉 D3 拍板）**：[docs/017-✅](docs/017-✅-ReportEditor数据源滑动解锁与限时上锁.md) Q7=D3（Indigo 克制光扫）；Q1–Q7 齐。
- **ReportEditor 0.3.92 已发版**：AI 能力矩阵 N（检查更新确认流 + 禁安装断言）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.91 已发版**：AI 能力矩阵 M（诊断事实工具 + 口头结论守卫）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.90 已发版**：AI 能力矩阵 L（结批写回/并行上限可读回）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.89 已发版**：AI 能力矩阵 K（预检事实 + 模拟结批确认流）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.88 已发版**：AI 能力矩阵 J（导出目录 set/pick）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.87 已发版**：AI 能力矩阵 I（模版展示排序 + reload）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.86 已发版**：AI 能力矩阵 H（打开模版/版式确认跳转）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.85 已发版**：AI 能力矩阵 G（新建空白模版/版式 + 冒烟缺连接失败）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.84 已发版**：AI 能力矩阵 F（写入总闸统一拒绝全部 write/confirm）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.83 已发版**：AI 能力矩阵 E（恢复/复位确认流 + ui_reload；非法 bundle 拒绝）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor AI 对话 UI 改版（仅登记）**：新建 [docs/016-✅](docs/016-✅-ReportEditor-AI对话UI改版.md)——参考 ChatGPT 玻璃态；附图 `docs/assets/016-ai-chat-ui-reference.png`；已合入 0.3.94。
- **ReportEditor 0.3.82 已发版**：AI 能力矩阵 D（加密备份 pending + 密文不进 LLM）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.81 已发版**：AI 能力矩阵 C（删除模版/版式确认流 + 非法 id 防护）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.80 测试加固**：能力矩阵 B 逐步用例 B1–B9（后端 14 + 前端 assets mirror）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.80 已发版**：AI 能力矩阵 B（复制模版/版式单测 + 提示词）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.79 macOS 已打包**：`Report Editor AI-0.3.79-arm64.dmg`；`latest.json` 已写 SHA256；Portal 未挂载。
- **ReportEditor 0.3.79 已发版**：AI 多轮默认简洁（最近 8 条进请求 + 提示词）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.78 已发版**：流式同轮先工具后正文；写类 tool 即时刷新；upsert 补 datasource reload；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.77 已发版**：AI 排队改输入框上方收纳条（不进消息流）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor AI 排队 UI（仅计划）**：[docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)——排队改输入框上方收纳条（类 Cursor），不进消息流；出队后再进时间线。
- **ReportEditor 0.3.76 macOS 已打包**：`Report Editor AI-0.3.76-arm64.dmg`；`latest.json` 已写 SHA256；Portal 未挂载。
- **ReportEditor 0.3.76 已发版**：模版/版式多选 B3（共有外观批改、混合态）；看板 [docs/011-✅](docs/011-✅-ReportEditor模版版式多选控件.md)。
- **ReportEditor 多选 B3（约定细化）**：[docs/011-✅](docs/011-✅-ReportEditor模版版式多选控件.md)——交集字段、混合态、首批外观清单、永不批改边界、I/M/N/E 用例；后按默认实现。
- **ReportEditor 0.3.75 已发版**：模版/版式多选 B2（Shift 区间、六对齐、两等距分布）；看板 [docs/011-✅](docs/011-✅-ReportEditor模版版式多选控件.md)。
- **ReportEditor 多选 B2（计划）**：[docs/011-✅](docs/011-✅-ReportEditor模版版式多选控件.md) 按默认拍板——Shift 区间、六对齐、两分布、工具栏入口、一次 undo；可开工。
- **ReportEditor 0.3.74 已发版**：整机单实例；局域网应用内 AI（开关+Token）；桌面独有提示；看板 [docs/015-✅](docs/015-✅-ReportEditor整机单实例与浏览器访问.md)。
- **ReportEditor 局域网 AI（计划）**：[docs/015-✅](docs/015-✅-ReportEditor整机单实例与浏览器访问.md) 拍板要实现应用内 AI；复用 `allow_lan_access` + Agent Token；桌面独有能力明确提示。
- **ReportEditor 整机单实例（计划补充）**：[docs/015-✅](docs/015-✅-ReportEditor整机单实例与浏览器访问.md) 复用托盘恢复、锁前 quit、pendingFocus 竞态、明确不做项与 M6。
- **ReportEditor 0.3.73 已发版**：模版/版式保存审计（变更明细、15 分钟合并、中文展示）；看板 [docs/013-✅](docs/013-✅-ReportEditor模版版式编辑审计.md)。
- **ReportEditor 整机单实例 + 浏览器访问（仅计划）**：新建 [docs/015-✅](docs/015-✅-ReportEditor整机单实例与浏览器访问.md)——强制一个 Electron；说明本机/局域网浏览器能力与 AI 本机限制。
- **ReportEditor 模版/版式审计（计划补充）**：[docs/013-✅](docs/013-✅-ReportEditor模版版式编辑审计.md) 无变更不记；旧类型全中文；字段中文名表 + 表格 SQL 截断；变更明细与 15 分钟合并。
- **ReportEditor 0.3.72 已发版**：AI 助手正文 SSE 流式；排队/持久化/调宽/Markdown；看板 [docs/014-✅](docs/014-✅-ReportEditor-AI流式输出.md)。
- **ReportEditor AI 流式（计划补充）**：[docs/014-✅](docs/014-✅-ReportEditor-AI流式输出.md) 确认关抽屉不停止；补测试用例 B/F/M/R；持久化/调宽/排队；G1–G15。
- **ReportEditor 0.3.71 已发版**：AI 工具轨迹假失败修正（无 `ok` 字段的成功读工具不再标红）；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.70 已发版**：模版/版式多选 B1（Ctrl 加选、框选、组操作、属性摘要）；看板 [docs/011-✅](docs/011-✅-ReportEditor模版版式多选控件.md)（B2/B3 ⌛️）。
- **ReportEditor 模版/版式多选（计划补充）**：原 [docs/011](docs/011-✅-ReportEditor模版版式多选控件.md) 确认属性批改 **B3 后置**；增补交集字段约定与 E1–E6 测试用例；MVP（B1）仅摘要 + 组操作。
- **ReportEditor 0.3.69 已发版**：移除「演示与培训」与 demo-pack；存量仿真连接保留可手删；看板 [docs/012-✅](docs/012-✅-ReportEditor移除演示与培训.md)。
- **ReportEditor 移除演示与培训**：已拆除设置区块、`/demo/*`、demo-pack IPC/打包目录、`demo_remote_*` 配置面；AI `ensure_user_demo_database` 工具下线；存量 `is_demo` 保留（B1）。看板 [docs/012-✅](docs/012-✅-ReportEditor移除演示与培训.md)。
- **ReportEditor AI 流式输出（仅计划）**：新建 [docs/014](docs/014-✅-ReportEditor-AI流式输出.md)——助手正文 SSE 流式；工具轮默认非流 + 事件；推翻 006「不做 SSE」边界（后由 **0.3.72** 落地）。
- **ReportEditor 0.3.68 已发版**：历史报表子文件夹穿透 + 分页；看板 [docs/010-✅](docs/010-✅-ReportEditor历史报表子文件夹穿透.md)。
- **ReportEditor 模版/版式编辑审计（仅计划）**：新建 [docs/013-✅](docs/013-✅-ReportEditor模版版式编辑审计.md)——保存/删除/复制落 `template.*`/`layout.*`；不记画布拖拽；与现有 `auditLog` 对齐（后由 **0.3.73** 落地）。
- **ReportEditor 0.3.67 已发版**：导出 PDF 去掉封面橙 / 正文蓝紫纸张装饰边；看板 [docs/009-✅](docs/009-✅-ReportEditor导出纸张橙边框.md)。
- **ReportEditor 导出纸张橙边框（文档订正）**：看板更名为 [docs/009-✅](docs/009-✅-ReportEditor导出纸张橙边框.md)——截图确认橙边在**整页纸张四周**（非表格附近）；主因锁定 `MiniPreviewChrome` 装饰未在导出路径剥离。
- **ReportEditor 模版/版式多选控件（仅计划）**：新建 [docs/011-⌛️](docs/011-⌛️-ReportEditor模版版式多选控件.md)——Ctrl/Cmd 加选、框选、组移动/删除/剪贴板；属性批量与对齐为二期。
- **ReportEditor 历史报表子文件夹穿透（仅计划）**：原 [docs/010](docs/010-✅-ReportEditor历史报表子文件夹穿透.md) 计划（已于 0.3.68 实现）。
- **ReportEditor 0.3.66 已发版**：AI 工具轨迹可见；探活口头结论与工具不符时强制再调；看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)（轨迹 H1 ✅，能力矩阵仍 ⌛️）。
- **ReportEditor 表格导出橙边框（仅文档）**：原 [docs/009](docs/009-✅-ReportEditor导出纸张橙边框.md) 初版（已订正为整页纸张四周）。
- **ReportEditor 0.3.65 已发版**：健康告警跳转高亮（含页眉/区）、连接级明示、版式进编辑器；看板 [docs/007-✅](docs/007-✅-ReportEditor健康跳转不高亮.md)。
- **ReportEditor 健康跳转不高亮（文档）**：看板 [docs/007](docs/007-✅-ReportEditor健康跳转不高亮.md) 补充测试矩阵 A–G（仪表盘链接 / 扫描 meta / focus 选中模型 / 连接级体验 / 版式 / 手工 / 认知对齐）。
- **ReportEditor 0.3.64 已发版**：数据源锁定提示不再把连接表单底部按钮顶出；看板 [docs/008-✅](docs/008-✅-ReportEditor数据源锁定表单按钮被顶出.md)。
- **ReportEditor 数据源锁定表单按钮被顶出**：看板 [docs/008](docs/008-✅-ReportEditor数据源锁定表单按钮被顶出.md) 测试矩阵 A–E 后实现。
- **ReportEditor AI Agent 可观测性（仅文档）**：看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md) 新增 H1——说开探活必须真开否则重试/如实失败；对话框须展示工具调用与状态。
- **ReportEditor 健康跳转不高亮（仅文档）**：新建 [docs/007-⌛️](docs/007-⌛️-ReportEditor健康跳转不高亮.md)——分析仪表盘告警点击后无控件高亮：连接级 issue 无 `elementId`；版式只链列表；页眉/zone 不在 `sel` 查找范围；并记录生产「库已存在」与 `missing_db` 的 ID 不一致可能。
- **ReportEditor 0.3.63 已发版**：修复定时探活反复开关不生效（串行落库 / 字符串 false / mirror pending_token）。看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)。
- **ReportEditor 0.3.62 已发版**：LLM 上游错误中文映射；ChatGPT≠API / 硅基模型 mismatch 提示；能力域 SYSTEM_PROMPT；探活 H1 ✅。看板 [docs/006-🚧](docs/006-🚧-ReportEditor-AI上游错误体验.md)（能力矩阵 A–N 仍 ⌛️）。
- **ReportEditor AI 能力域扩展（文档）**：写入矩阵扩至版式/打开编辑/排序/演示冒烟/导出结批/诊断/更新等；验收 A–N。
- **ReportEditor 0.3.61 已发版**：新建非表格控件默认 `showBorder=false`；一键隐藏边框；看板 [docs/005-✅](docs/005-✅-ReportEditor控件默认无边框.md)。
- **ReportEditor 0.3.59 / 0.3.58 / 0.3.57**：数据源 UI 相关，见 [docs/004-✅](docs/004-✅-ReportEditor数据源UI修复.md)。

## 2026-07-12

- **剩余任务与后续规划汇总（交接）**：新建 [docs/003-⌛️-剩余任务与后续规划.md](docs/003-⌛️-剩余任务与后续规划.md)——跨 001/002 的统一索引/路线图，含 git 快照（`origin/main`=`ec49152`，本地领先 12 提交未推）、分类速查（本机可闭环 / 需运行应用 / 需产品决策 / 需现场真库）与建议推进顺序。同步订正 001「待提交」段（A 档已合并为 `ec49152`）。
- **表格系统缺陷修复（进行中）**：详见 [docs/002-🚧-表格系统评估与修复.md](docs/002-🚧-表格系统评估与修复.md)。已修并提交（TDD 先红后绿，前端全套 243 passed、vue-tsc 0 错误）：纵表/横表 0 行不再渲染字面 "…"（20dcdd4）；窄/多列表格列宽拖拽退化区不再反向/整体重置（d82bd57）；放开表格单行内容高度上限 240px→整页界避免长内容裁剪（6e7f792）；P1-A 预览截断提示逻辑核心 `sqlFillPreviewTruncationHint`（77859d5，UI 横幅待接入）；P2-A SQL 参数值方言正确转义、闭合 MySQL 反斜杠注入/断串（0262de6，真参数化重构待后续）；**P2-C 表格模型去重**——抽 `table-grid-core.ts` 共享网格原语（`ensureTableGridCore` 泛型化 / clamp / 列宽 / chrome / 列背景），`model.ts`（Template 系）与 `layout-zone-element.ts`（Zone 系）改薄委托，消除约 11 对平行复制中的网格原语层；`intrinsicOuterHeight`/外框 clamp 的 SQL 填充高度**历史漂移刻意保留**为需决策的后续（合并会改可见高度）。行为保持：243 passed、`tsc` 触及文件 0 错误。；**P3-A 度量函数副作用剥离**——列宽/高度/最小尺寸 getter（`templateTableColumnInnerWidthsPx`/`intrinsicOuterHeightFor*Table`/`minOuterSizeFor*`/`computeZoneTableContentRowHeightsPx` 等）内部原本调 `ensureTableGrid` 就地改 `el`，被放进 Vue computed/渲染即渲染期非用户 mutation（undo/redo 隐患、重复 ensure）；抽只读原语 `tableColumnInnerWidthsPxReadonly` 用钳制值+补齐副本重算不写回，getter 全部去 ensure，真 mutator 保留。TDD 新增 `table-metrics-readonly.test.ts` 5 用例先红后绿（空数组不被补齐、`tableCells` 引用不变、逐值与旧路径一致）。行为保持：248 passed、`tsc` 触及文件 0 错误。用户决策：240px＝放开上限+超页跨页断行（放开已做，行内跨页断行待排期）；P1-A＝预览与导出都按单报表上限、超出给提示不显示全量、保留后端 1000 上限。
- **表格系统深度评估**：三路并行审计 ReportEditor 表格控件（几何度量层 / SQL 填充分页链路 / 组件层与重复），评级设计 B+ / 实现 B- / 完整度 C+，产出按严重度排序缺陷与执行顺序（P2-A SQL 参数值参数化、P2-C 模型去重、P3 性能/副作用、合并单元格等盲区待推进）。
- **Git 策略调整**：改为以 `.cursor/rules/queued-task-then-push.mdc` 为准——每完成一条队列任务即 `git add`+`commit`+`push`；CLAUDE.md/AGENTS.md 已同步。
- **新增 Agent 规则与文档约定**：创建 [CLAUDE.md](CLAUDE.md)（唯一正文）与 [AGENTS.md](AGENTS.md)（引用 CLAUDE.md）；确立「任务看板写 `docs/NNN-状态-主题.md`、H1 状态子任务、`todo.md` 倒序索引、README 只写功能说明」等约定。建立 `docs/` 任务目录。
- **安全与可靠性缺陷修复（A 档 ✅）**：详见 [docs/001-✅-安全与可靠性缺陷修复.md](docs/001-✅-安全与可靠性缺陷修复.md)；C 档现场收尾见 [docs/028-⌛️-口令轮换与git历史清洗.md](docs/028-⌛️-口令轮换与git历史清洗.md)。
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
