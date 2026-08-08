# TODO / 变更索引

> 按日期**倒序**（最新在上）记录精炼变更与验收索引，详细任务看板见 `docs/NNN-状态-主题.md`。
> 本文件不复制任务文档全文，只做日期分段引用；规则见 [CLAUDE.md](CLAUDE.md)。

---

## 2026-08-08

- **ReportEditor 049 Win 落地（一键隐藏整模版边框）**：代码 `hideBordersOnEntireTemplate` + G3b；工具栏一点清封面/正文全部分页/封底；Win Setup `Report Editor AI-Setup-0.3.147-x64.exe`（SHA256 `a298ef00…ee59`）。看板 [docs/049-✅](docs/049-✅-ReportEditor一键隐藏整模版边框.md)。
- **ReportEditor 050 mac 手测通过**：导出后不再 SIGSEGV（含延时崩）；darwin 禁预热池 + 安全销毁已闭环。看板 [docs/050-✅](docs/050-✅-ReportEditor冒烟非批次手动导出SIGSEGV闪退.md)。
- **ReportEditor 048 UI**：问题反馈包表单改纵向 `settings-field-row`，消除标签/输入重叠。看板 [docs/048-🚧](docs/048-🚧-ReportEditor问题反馈包一键导出.md)。
- **ReportEditor 049 mac 手测通过**：一键隐藏边框整模版生效。看板 [docs/049-✅](docs/049-✅-ReportEditor一键隐藏整模版边框.md)。
- **ReportEditor 050b（延时 SIGSEGV）**：导出后预热池滞留隐藏窗，mac Accessibility 稍后查询崩溃；darwin 禁用复用/预热，导出即销毁；destroy 改 about:blank+300ms。看板见上。
- **ReportEditor 049 实现（一键隐藏边框整模版）**：`hideBordersOnEntireTemplate` 覆盖封面+全部正文页+封底；编辑器按钮改走整模版；G3b 单测。看板 [docs/049-✅](docs/049-✅-ReportEditor一键隐藏整模版边框.md)。
- **ReportEditor 050 兜底（导出收尾 Accessibility SIGSEGV）**：`safeDestroyBrowserWindow`（hide+延迟 destroy）；遮罩/PDF 窗共用；导出窗非白底/不可聚焦；finally 先关遮罩再动 PDF 窗。看板见上。
- **ReportEditor 0.3.147 本地打包（Mac DMG）**：含 041 续页眉脚 / 042 小数位 / 043 空值占位 / 047 旧值兼容 / 049 整模版一键隐藏边框修复、044 去 5 万取数上限、045 R1a/R2 跨份缓存、046 批次/非批次导出、048 问题反馈包。`packaging/mac/output/Report Editor AI-0.3.147-arm64.dmg`（SHA256 `dc831f55…c6c9`）。发版记录 `_Prj/SD_SMA_ReportEditor/_Doc/007_版本发布记录.md`。
- **ReportEditor 048 实现（问题反馈包）**：设置页导出 zip（Markdown+模版+结批 prefs+连接骨架+审计切片+可选 PDF）；审计失败旁路；`support.pack_export`；后端单测 4 绿。手测 ⌛️。看板 [docs/048-🚧](docs/048-🚧-ReportEditor问题反馈包一键导出.md)。
- **ReportEditor 050 补证（白屏不关 + Accessibility SIGSEGV）**：非批次「冒烟」手动导 PDF 已成功仍闪退；用户见白屏页不关。`.ips`：`EXC_BAD_ACCESS` @0x10，`CrBrowserMain` → `objc_msgSend` / **NSAccessibility**。看板见上。
- **ReportEditor 050 缺陷登记（冒烟非批次手动导出闪退）**：用户口述「猫眼」=本机「冒烟·一键无边框」(`cde79a7c`，nonBatch→Desktop)；同会话 PDF 曾写成功，随后 Electron `SIGSEGV` 闪退。看板见上。
- **ReportEditor 049 需求登记（一键隐藏边框整模版）**：现网只清当前 sheet/正文页，须逐页点选，违背「一键」；口径改为点一次覆盖封面+全部正文页+封底的眉脚/正文/zone 装饰（仍跳过表格、可一次撤销）；版式库本期不改。看板 [docs/049-✅](docs/049-✅-ReportEditor一键隐藏整模版边框.md)。
- **ReportEditor 042/043 修复（矢量绑定文案对齐 Mini）**：layout-v2 zone/正文 text·box·parameter 与静态表 cell 统一走 `resolveBoundParameterPreviewText`/`applyDecimalPlacesToDisplayText`——小数位生效（`12`+2位→`12.00`）；空 bound 走 `nullDisplayMode` 不再回落控件占位（PDF 不再出现字面 `value`）。单测锁 042/043 各场景。看板 [docs/042-✅](docs/042-✅-ReportEditor矢量导出封面小数位变整数.md) / [docs/043-✅](docs/043-✅-ReportEditor矢量导出空值显示value.md)。
- **ReportEditor 044 实现（去 5 万取数硬上限）**：前端 `TABLE_SQL_FILL_FULL_ROW_LIMIT` 50000→5M（仅异常防护）；分报表全量取数、未分报表按单份 `maxRows`；后端 `query/sql` 防护值同步 5M；预览 1000 与单份 maxRows clamp 保留。单测锁 ≥80000 反例。现场 8 万条实测 ⌛️。看板 [docs/044-🚧](docs/044-🚧-ReportEditor导出SQL取数无硬上限.md)。
- **ReportEditor 045 R1a/R2（矢量跨份缓存）**：随包字体字节 + IPC 结果跨份缓存（每份省 MB 级 base64 IPC 与解码）；封面/Logo dataURL 解码字节按内容寻址缓存（上限 24 条）。R3 连渲/R4 二进制回传评估已写入看板（R4 阻塞点：preload `notifyPdfExportReady` JSON 兜底会毁二进制载荷）；R5 待拍板。全量 629 绿。看板 [docs/045-🚧](docs/045-🚧-ReportEditor矢量导出跨份复用加速.md)。
- **ReportEditor 048 拍板（Q1–Q7）**：Markdown 主文档 + 附件（模版/配置/审计/失败 PDF）打一个 zip；模版预勾失败相关可改；审计近 7 天≤500 失败优先；连接骨架无密；一期仅导出；设置页+导出失败旁路；**默认附最近失败 PDF**。代码未开工。看板 [docs/048-🚧](docs/048-🚧-ReportEditor问题反馈包一键导出.md)。
- **ReportEditor 048 需求登记（问题反馈包一键导出）**：面向 Agent 复现的裁剪包，与全量 `.rebak` 区分。看板见上。
- **ReportEditor 047 修复（冒烟·一键无边框打不开）**：列表可见但打开 404——0.3.x 早期落盘旧值（`scalarSqlFillMode:"none"`、`nullDisplayMode:"empty"`、`mongoQuery:""`、`table*` 数组为 null、`TemplateElement` 残留 `pageNumberMode`）被收紧后的后端 schema 拒绝。`report_template.py` 增 `_normalize_legacy_element_raw` 兼容层（三元素模型 before 归一，与前端 hydrate 对齐），不改数据文件；新增 `test_template_legacy_field_compat.py`，后端快速套件 281 绿；实测该模板 API 404→200。看板 [docs/047-✅](docs/047-✅-ReportEditor冒烟一键无边框模板打不开.md)。
- **ReportEditor 041 H2 修复（矢量续页漏眉脚）**：`pdf-lib-layout-v2-render.paintPage` 旧 `showChrome` 在 SQL/静态表续页把页眉页脚一并跳过（Mini/Chromium 无条件渲染眉脚）；改为眉脚无条件绘制、仅正文 zone 装饰保留续页隐藏。对抗测试证明旧逻辑第 2 页即红；全量 624 绿。H1（数据侧仅封面配眉）待现场 JSON。看板 [docs/041-🚧](docs/041-🚧-ReportEditor矢量导出页眉仅封面正文无.md)。
- **ReportEditor 批次 vs 非批次实现（046 本机闭环）**：模版增 `reportKind`/`nonBatchOutputDir`（前后端+sidecar）；导出调度按类型分支——批次 `根\批号\`（文件名/目录 OPC 任一有效，皆无显式失败，废除静默回落）、非批次落模版绝对路径（写盘端自动建目录）；手动模拟结批同规则；编辑器加类型开关+目录校验；历史报表左侧多根下拉（全局根+非批次目录，不污染 watchDir）；审计增 `reportKind`/`outputDir`/`batchNo`。vitest 107 文件 623 全绿；Windows 手测 ⌛️。⚠️ 现场未绑批号 OPC 的批次导出升级后会显式失败。看板 [docs/046-🚧](docs/046-🚧-ReportEditor批次与非批次报表导出.md)。
- **ReportEditor 批次 vs 非批次（Q7–Q9 拍板）**：历史多根聚合；非批次目录不存在则创建；批号=文件名OPC或目录OPC任一有效，皆无则失败。看板 [docs/046-🚧](docs/046-🚧-ReportEditor批次与非批次报表导出.md)。
- **ReportEditor 批次 vs 非批次（Q1–Q6 拍板）**：类型只挂模版；非批次仅本机绝对路径；进历史+审计；手动导出也按类型；批次无批号禁止导出；文件名同现网批次。看板 [docs/046-🚧](docs/046-🚧-ReportEditor批次与非批次报表导出.md)；索引 [003](docs/003-⌛️-剩余任务与后续规划.md)。

## 2026-08-07

- **ReportEditor 批次 vs 非批次报表（需求登记）**：批次报表保持现网「大文件夹/`批号`/」落盘；非批次与批号无关，单独指定目标文件夹，触发生成写入该目录。看板 [docs/046-🚧](docs/046-🚧-ReportEditor批次与非批次报表导出.md)；索引 [003](docs/003-⌛️-剩余任务与后续规划.md)。

## 2026-08-04

- **ReportEditor 矢量跨份复用（需求登记）**：现状（每份 subset/嵌图/切 hash）评估为正确性优先的合理第一版；现场弱核 5 万·maxRows=1000 实测 13～17 分钟。待做 R1–R5（字体/图片复用、同窗连渲、二进制 IPC、可选自适应让核），冲刺 &lt;6 分钟。看板 [docs/045-🚧](docs/045-🚧-ReportEditor矢量导出跨份复用加速.md)；索引 [035](docs/035-🚧-ReportEditor导出性能档位与同机降载.md) / [003](docs/003-⌛️-剩余任务与后续规划.md)。

- **ReportEditor 0.3.146（040）**：模版「一键隐藏边框」覆盖当前 sheet 页眉/页脚/正文/zone 装饰（旧实现只改正文）；编辑器 zone 灰描边与 Mini 对齐；对抗测 G1–G6 + layout-v2 D10h；全量 602 绿。Mac DMG `packaging/mac/output/Report Editor AI-0.3.146-arm64.dmg`（SHA256 `157ef9fe…a94e`）。看板 [docs/040-✅](docs/040-✅-ReportEditor矢量导出页眉一键隐藏仍有边框.md)。

## 2026-07-29

- **ReportEditor 0.3.145（035 优先级重分配）**：档 3 `basic`→渲染 BelowNormal；档 4 `max`→渲染/后端 HIGHEST、主进程不降；档 0–2 仍 LOW 让核。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。

- **ReportEditor 导出 SQL 取数口径**：正式导出/结批应对齐「SQL 返回多少用多少」，不设结果集总量硬上限；现网 50000 钳制为待改实现。`maxRows` 仅管单份/分卷；预览 1000 保留。看板 [docs/044-🚧](docs/044-🚧-ReportEditor导出SQL取数无硬上限.md)。

- **现场口述补记（030）**：单表格 SQL 填充 **1000 行不触发** mappView 白屏刷新，**2000 行会触发**；敏感点更像单份渲染负载。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

---

## 2026-07-27

- **ReportEditor 矢量档（0.3.144）四缺陷登记**：页眉一键隐藏仍见边框 · 页眉仅封面 · 小数位变整数 · 空值显示 `value`。根因与复现/待补信息已分拆看板；代码修复待样本。  
  - [docs/040-✅](docs/040-✅-ReportEditor矢量导出页眉一键隐藏仍有边框.md)  
  - [docs/041-🚧](docs/041-🚧-ReportEditor矢量导出页眉仅封面正文无.md)  
  - [docs/042-✅](docs/042-✅-ReportEditor矢量导出封面小数位变整数.md)  
  - [docs/043-✅](docs/043-✅-ReportEditor矢量导出空值显示value.md)

---

## 2026-07-24

- **ReportEditor 0.3.144（039b）**：发版打包——开关「导出时全屏遮罩」不再误报登录项乱码；仅自启字段同步 Run，`reg` 按 GBK 解码。看板 [docs/039-🚧](docs/039-🚧-ReportEditor导出全屏遮罩.md)。

- **ReportEditor 039b**：设置页开关「导出时全屏遮罩」误报「登录项同步失败」乱码。根因＝改任意启动偏好都 `applyLoginItem` + 中文 Windows `reg delete` 缺项报错被 UTF-8 误读。修复：仅 `openAtLogin`/`silentStart` 才同步 Run；`reg` 按 GBK 解码且缺项视为幂等成功。单测 12 项全绿。看板 [docs/039-🚧](docs/039-🚧-ReportEditor导出全屏遮罩.md)。

## 2026-07-23

- **ReportEditor 0.3.143（039）**：现场兜底——导出/结批期在**主显示器全屏**显示「正在生成报表」遮罩，`setAlwaysOnTop('screen-saver')` 盖住同机 mappView 白屏；遮罩窗为独立 NORMAL 优先级渲染进程 + 内联静态 HTML（不加载 SPA），自身不会跟着饿死白屏。导出计数 0→1 弹、归 0 收（与 register/unregister 对称），进度显示「第 x/共 y 份」。安全阀：120s 硬超时、Esc/右上角 × 随时可关、五档批导不弹。配置 `exportOverlayEnabled` 默认开、设置页可关。契约/单测 21 项全绿。看板 [docs/039-🚧](docs/039-🚧-ReportEditor导出全屏遮罩.md)。

- **ReportEditor 0.3.142（035）**：现场矢量档也饿死 mappView 根因——降载只 `os.setPriority(0,…)` 降了空转主进程，真正吃 CPU 的**渲染进程**（pdf-lib/fontkit）与 **Python 后端**全程 NORMAL。改为导出期降渲染进程（full 档 IDLE、basic BelowNormal）+ 后端 BelowNormal，`coexistPause` 经档位透传，finally 恢复。i3-7100U+AR 占核仅剩约 1 Windows 核，另建议现场默认矢量档。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。

- **ReportEditor 0.3.141（037b）**：修「开静默、重启仍弹页」。第二根因＝升级后 HKCU\Run 存两份自启项（0.3.138 前无 `name` 用默认值名，0.3.138 起改固定值名却没清旧份）→ 开机双实例 → 第二实例触发无条件 `showMainWindowFromTray()` 弹窗。修复：`removeLegacyRunDuplicates` 清旧值名重复项；`second-instance` 对含 `--silent-start` 的第二实例不弹窗（该项随 0.3.140 提交入库）。测试 586 passed。看板 [docs/037-🚧](docs/037-🚧-ReportEditor开机自启与静默启动失效.md)。

- **ReportEditor 0.3.140（035）**：后三档变慢诊断——对照五档前基线，默认档 2 `prewarmPoolSize=0` 导致每次导出冷启动 SPA（Win ~1~3s）是主因，0.3.137 canvas 格线叠层为次因。改档 2 保留 1 预热窗去冷启动（yield/降载不变，同机共存性不变）；批导同步。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。

- **ReportEditor 0.3.139（038）**：五档批导收尾卸 quit 钩子后 `app.exit(0)`，消除 `0xC0000005` 盖退出码；写 `.five-tier-exit`。看板 [docs/038-✅](docs/038-✅-ReportEditor五档批导收尾ACCESS_VIOLATION.md)。

- **ReportEditor 038 五档批导收尾崩溃**：退出码 `-1073741819`（`0xC0000005` ACCESS_VIOLATION）；导出已成功后 `app.quit()` 阶段崩，待查根因。看板 [docs/038-✅](docs/038-✅-ReportEditor五档批导收尾ACCESS_VIOLATION.md)。

- **ReportEditor 0.3.138（037）**：开机自启 Run 强制加引号并校正死链；批导旁路不改登录项；设置页回显校验。看板 [docs/037-🚧](docs/037-🚧-ReportEditor开机自启与静默启动失效.md)。

- **ReportEditor 037 开机自启/静默**：本机证实 HKCU Run 指向不存在的嵌套路径且无引号（含空格 exe 名），故重启拉不起；偏好 json 缺失加重不同步。看板 [docs/037-🚧](docs/037-🚧-ReportEditor开机自启与静默启动失效.md)。


## 2026-07-22

- **ReportEditor 0.3.137（036 D21c）**：print 表框改整表 SVG 连续格线（D21b box-shadow 仍断点）。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.136（036 D21b）**：print 表框改 inset box-shadow，修断点/粗细/表间游离线。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.135 安装版五档复验**：路径 `ReportEditorAI`；重建冒烟后 `smoke-*-2026-07-22T14-27-28` 10/10 ok，档1–4 pages=4，矢量外框描边序正确。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.135 Windows Setup**：`Report Editor AI-Setup-0.3.135-x64.exe`（~168MB）；D20/D21 表框修复；SHA256 已写入 `latest.json`。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.135（036 D20/D21）**：矢量正文表先填后描恢复外框；print-to-pdf 表框改 `0.75pt`+collapse 匀线。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 002 清历史导出复验**：删桌面旧五档产物后重导 `smoke-*-2026-07-22T13-50-11` 10/10 ok；竖版档1–4 pages=4（含 SQL 续表）。看板 [docs/002-🚧](docs/002-🚧-表格系统评估与修复.md)。

- **ReportEditor 0.3.134 Windows Setup**：`Report Editor AI-Setup-0.3.134-x64.exe`（~168MB）；含同页纵表页底续页修复；SHA256 已写入 `latest.json`。看板 [docs/002-🚧](docs/002-🚧-表格系统评估与修复.md)。

- **ReportEditor 0.3.134**：同页纵表页底截断改为续页卡；Windows Setup 打包中。看板 [docs/002-🚧](docs/002-🚧-表格系统评估与修复.md)。

- **ReportEditor 002 纵表页底截断未续页**：`sumTableRowHeightsPx` 尊重 rowCount；锚点过紧改续卡 `hideOverflowSqlFillTable`。看板 [docs/002-🚧](docs/002-🚧-表格系统评估与修复.md)。

- **ReportEditor 冒烟模版微调 + 五档复验**：封面标题 28 / 作者块规范换行 / 无外框；`smoke-*-2026-07-22T11-34-32` 10/10 ok，档 0 badOverlap=0。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。

- **ReportEditor 0.3.133 Windows Setup**：`Report Editor AI-Setup-0.3.133-x64.exe`（~168MB）；SHA256 已写入 `packaging/updates/latest.json`（含 M10 + 仅内容叠字修复）。

- **ReportEditor 0.3.133（034 M10）**：主进程冷路径去 sync——端口探测 `execFile` async；备份读/日志写/`delete-export-file`/五档收尾用 `fs.promises`；契约 M10 ✅。看板 [docs/034-🚧](docs/034-🚧-ReportEditor全站架构复评-2026-07-22.md)。

- **ReportEditor 仅内容叠字修复**：档 0 封面大字号压行 → 字号 cap≤14 + 随字号行高 + `\n` 硬换行；单测防回归。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。

- **ReportEditor 冒烟无外框 + 竖/横五档复验**：全模版去 `showBorder`；Docker MariaDB 建「冒烟·竖/横」；五档 10/10 `ok`（`smoke-portrait`/`smoke-landscape`）。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md) · [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 035 手测 H1–H5**：默认预览稳、档 0 草稿、档 2/3/4 预览级、结批探活暂停/拆预热；证据 `retest-0.3.132-white-10-42-15` + 单测。H6/H7 现场 ⌛️。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。


- **ReportEditor 0.3.132（035 正文底色）**：`bodyBackgroundCss` 可编辑；装包白底五档 `retest-0.3.132-white-10-42-15`（gray249=0）。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。

- **ReportEditor 036 主路径闭环**：矢量↔预览对照 D1–D19 / C1–C10 已齐 → 改名 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.131（036 D19 角色色边）**：封面橙顶 / 正文靛蓝左 / 封尾紫底；`retest-0.3.131-10-24-32`。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.130（036 圆页码）**：直径按 zone×0.85；数字几何居中（复验 Δy≈档2）。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.129（036 眉表线）**：堆叠 zone 表近白格底盖共用边 → 先填再描线 + 下方画顶边。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.128（036 D6 表观感）**：装包复验表「完全不一样」→ 去外套框 + 表字号 `max(10px,0.85em)`（对齐 Mini）。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 0.3.127 hotfix**：安装测 Noto subset 缺字；矢量/Mini 改回朱雀仿宋；C9 仍≈0.8pt（`13-19-57`）。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 036 字体同源 + D8/P2（0.3.126）**：Noto TTF；`scaledFontSizePt`（修 px当 pt → C9 Δx≈0.8pt）；D11–D17 代码；批导 `13-11-28`。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 036 D18 色/线/圆 `12-53-45`**：表线 `#d4d4d8`、圆形页码 2.75em、zone/表字色、`parseCssColor` 现代 rgb；对照 `_compare_color_2026-07-22T12-53-45/`。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 036 P1 补测 `12-38-51`**：约定目录五档旁路；C7/C8 ✅；C9「批次报告」Δx≈12pt ❌ → D8 余量。对照图 `~/Desktop/report-editor-exports/_compare_p1_2026-07-22T12-38-51/`。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 036 P1 样式收敛（代码）**：layout-v2 D6/D8/D9/D10 + 模拟结批默认目录；0.3.124；单测 ✅。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 036 P0 样式收敛**：layout-v2 对齐 Mini 底色/×0.8 字号、`formatLayoutDate`、页码 `slashTotal`/`circle`；批导 `12-05-37` 复验 D1–D5/D7 ✅。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 036 矢量档↔预览稳样式对照**：冒烟批导 `11-56-48` 三页完整对比；列出 D1–D17（P0：底色/白卡片、日期、页码 N/M、截断；P1：表度量/×0.8 字号）。看板 [docs/036-✅](docs/036-✅-ReportEditor矢量档与预览稳样式对照.md)。

- **ReportEditor 035 导出性能五档（至 0.3.132）**：5 档分段（默认预览稳）；取代 0.3.120 四档草案；本机 H1–H5 ✅。看板 [docs/035-🚧](docs/035-🚧-ReportEditor导出性能档位与同机降载.md)。

- **docs 叙事对齐**：034/003/030 将「导出性能 4 档 / 默认均衡」改为 **五档已落地**；M10 已于 0.3.133 落地。

- **ReportEditor 0.3.119（034 行为测 + M11）**：补全 gate/cancel-ui/KeepAlive 行为测；默认 PDF=版式优先（chromium）；旧 pdf-lib 一次性迁移；同机优先标草稿非交付。手测见 [docs/034-🚧](docs/034-🚧-ReportEditor全站架构复评-2026-07-22.md)「手测清单」。

- **ReportEditor 0.3.118（034 M1–M7）**：TemplateManager Observer lifecycle；Workbench loadWatch 离页停；OPC 浏览轮询门闩；契约 L7/L8/L10/L11/L13/L14；导出/结批取消 UI。看板 [docs/034-🚧](docs/034-🚧-ReportEditor全站架构复评-2026-07-22.md)。

- **PDF 交付拍板**：必须与**预览一致**；**不接受** pdf-lib draft-v1 草稿交差；M11 重定义。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [docs/034-🚧](docs/034-🚧-ReportEditor全站架构复评-2026-07-22.md)。

- **同机优先 PDF 版式不可用（登记）**：现场「SMA报警报表」draft-v1 乱码/`{{v}}`/`[table id]`；临时用版式优先。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **034 架构平复改动清单**：整理 M1–M14；**M1–M7 ✅ 0.3.118**；**030 8k/≥4 零闪硬验收临时挂起**。看板 [docs/034-🚧](docs/034-🚧-ReportEditor全站架构复评-2026-07-22.md) · [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **ReportEditor 全站架构复评（034）**：相对 032 复评综合 ≈3.0→**≈3.9**（M1–M7 后）。看板 [docs/034-🚧](docs/034-🚧-ReportEditor全站架构复评-2026-07-22.md)。

- **ReportEditor 0.3.117（033）**：仿宋随包（朱雀仿宋→`FangSong`）；导出窗 `ERR_FAILED` 销毁重建重试。看板 [docs/033-✅](docs/033-✅-ReportEditor同机优先pdf-lib缺fontkit导致结批失败.md)。

- **ReportEditor 0.3.116（033）**：注册 `@pdf-lib/fontkit`；字体 UI 显示 `Noto Sans SC（默认）`；`prebuild` 拉随包 OTF。看板 [docs/033-✅](docs/033-✅-ReportEditor同机优先pdf-lib缺fontkit导致结批失败.md)。

- **同机优先 pdf-lib 缺 fontkit（登记→已修）**：现场 0.3.115 OPC 自动结批 `embedFont` 缺 fontkit。看板 [docs/033-✅](docs/033-✅-ReportEditor同机优先pdf-lib缺fontkit导致结批失败.md)。

## 2026-07-21

- **ReportEditor 0.3.115**：默认 **同机优先**（pdf-lib 旁路 printToPDF）；高级设置可切 **版式优先**；审计记录 engine/exportMode；随包 Noto 位。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **030 双模式评估**：导出开关正式名 **同机优先**（pdf-lib，默认）/ **版式优先**（chromium 回滚）；弃用「性能/质量」以免与 PDF 版式语义撞车；审计字段约定已写入看板。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [Plan 0.3.115](_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.115.md)。

- **030/0.3.115 开工**：模版导出预检 + 版式保存/属性面板 **字体检查**；随包 Noto 拉取脚本；`pdfExportEngine` 脚手架。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) · [Plan 0.3.115](_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.115.md)。

- **030 拍板补充**：实现策略 A（先零闪）；验收以**自动结批**为准；中文随包嵌入 Noto Sans SC。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **ReportEditor 0.3.114 Plan（选型）**：旁路 `printToPDF`；Spike-A 脚手架已通。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **030 拍板：结批中 HMI 必须可操作** → 否决导出互斥；主路径旁路 printToPDF。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

- **结批降 CPU 现场复核（0.3.113）**：配方刷 1 次；生产≈8000/4 份每份刷 HMI。看板 [docs/030-🚧](docs/030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

## 2026-07-20

- **ReportEditor 0.3.113（032 P1）**：Dashboard/Layout/签名 lifecycle + Observer restart；缩略图并发≤2；导出写盘 async + cancelPdfExport；023 口径更正。看板 [docs/032-🚧](docs/032-🚧-ReportEditor全站架构评估与统一生命周期.md)。

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
