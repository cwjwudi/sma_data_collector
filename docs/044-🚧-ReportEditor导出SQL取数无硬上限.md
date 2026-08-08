# ReportEditor：导出 SQL 取数不设硬上限

> 本文件为 **产品口径 / 待改看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-29。  
> **范围**：表格 SQL 填充的正式导出 / 结批取数路径。  
> **关联**：[023](023-🚧-ReportEditor模拟结批性能回归分析.md) · [002](002-🚧-表格系统评估与修复.md) · [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

---

# ✅ 已完成：产品口径登记

## 口径（2026-07-29 确认）

- **正式导出 / 结批**：SQL 能查出多少条，就取多少、用多少；**不对结果集总量设业务硬上限**。  
- **`maxRows`**：只表示「单份报表行数」以及是否按该值**分卷/分报表**，**不得**再当作总查询行数封顶。  
- **编辑器画布预览**：可继续保留 **1000 行**截断（保证编辑流畅），并继续用现有截断提示；预览页数/份数不以导出为准。

## 反例

- 现场需要导出约 **80000** 条时，现网硬上限 **50000** 会静默截断 → **不符合**上述口径。

---

# ✅ 已完成：去掉 50000 总量硬上限（2026-08-08）

## 实现

| 位置 | 改后 |
| --- | --- |
| `frontend/.../table-sql-fill-preview.ts` | `TABLE_SQL_FILL_FULL_ROW_LIMIT` 50000 → **5_000_000（仅异常防护值，不作产品截断）**；`sqlFillQueryLimit`：分报表模式取全量（防护值封顶）；未分报表按用户 `maxRows`（单份行数语义，不再叠 5 万总量帽） |
| `backend/api/routers/database.py` | `query/sql`：`min(body.limit, 50000)` → `min(body.limit, 5_000_000)`（fetchmany 防护值） |
| 预览 | `PREVIEW_LIMIT_MAX = 1000` **保留不动**（与口径一致） |
| 单份 `maxRows` clamp（hydrate / `clampTableSqlMaxRows` / report-split / schema `le=50000`） | **保留**——绑定「单份报表行数」语义（拟改方向第 3 条允许另定单份上限），与总量无关 |

## 测试证据

- `table-sql-fill-preview.test.ts` 新增「044: split export no longer capped at 50000」：分报表模式取数上限 ≥ 80000（现场反例量级）；原有 `sqlFillQueryLimit` 语义用例全部保持绿。  
- 全量 vitest：**107 文件 / 629 用例全绿**；后端 `database.py` 语法自检通过（2026-08-08）。

---

# 🚧 进行中：本机 / 现场 8 万条实测

## 本机准备（2026-08-08）

说明见 [README-044-smoke-80k.md](../_Prj/SD_SMA_ReportEditor/getting-started/samples/README-044-smoke-80k.md)。

| 路径 | 状态 |
|------|------|
| Docker Desktop | 已安装；**缺 WSL2**，引擎暂无法启动（需管理员 `wsl --install` 后重启） |
| Docker MariaDB 灌库脚本 | `scripts/dev/setup_044_docker.ps1` + `setup_044_smoke_80k.py`（就绪，待引擎） |
| SQLite 兜底（可立即测） | 已灌 **80000** 行 + 模版「测试·044·8万条分卷导出（SQLite）」；输出桌面 `ReportEditor044Smoke` |

- [ ] **手测导出**：重启 AI 版 → 报表生成导出该模版 → 桌面 PDF 份数≈80、合计行 80000（旧行为≈50 份）。  
- [ ] Docker 路径：管理员装 WSL → Desktop Running → `setup_044_docker.ps1` 再导一次（与现网 MariaDB 对齐）。  
- [ ] 下次发版在 `_Doc/007_版本发布记录.md` 记「去掉导出 5 万硬上限」；023 补 8 万+ 场景阈值与风险说明。

## 旧现状存档（改前）

多处把导出取数钳在 **50000**：

| 位置 | 行为 |
| --- | --- |
| `frontend/.../table-sql-fill-preview.ts` | `TABLE_SQL_FILL_FULL_ROW_LIMIT = 50000`；`sqlFillQueryLimit(fullSqlFill=true)` 分报表模式取该值，否则取 `min(maxRows, 50000)` |
| `frontend/.../table-sql-fill.ts` | hydrate 时 `maxRows = Math.min(50000, …)` |
| `frontend/.../table-sql-fill-report-split.ts` | `clampMaxRows` 上限 50000 |
| `backend/schemas/report_template.py` | `maxRows` Field `le=50000` |
| `backend/api/routers/database.py` | `query/sql`：`lim = max(1, min(body.limit, 50000))` |
| 预览接口 | `PREVIEW_LIMIT_MAX = 1000`（**保留**，与口径一致） |

版本说明（0.3.x 发布记录）曾写「导出尊重用户 maxRows（上限 50000）」——属当时实现选择，**现已由产品口径否决总量封顶**。

## 拟改方向（待实现，本条仅登记）

1. **导出取数**：`fullSqlFill=true` 时不再用 50000 截断；请求后端时传「无业务上限」语义（或足够大的防护值仅作异常防护，不作产品截断）。  
2. **后端 `query/sql`**：去掉或大幅放宽 `50000` 钳制；超时 / OOM / 取消仍要有，但失败要显式报错，禁止静默截断。  
3. **`maxRows`**：保留为分卷切分参数；hydrate / schema 的 `le=50000` 若仍绑在「单份行数」上，可另定合理单份上限，或与分卷逻辑解耦后再定。  
4. **预览 1000**：不动。  
5. **性能**：大结果集（如 8 万+）仍依赖 023/030 的分卷缓存与后续游标取数；去掉上限后更需关注内存与墙钟，不在本条一次做完。  
   - **同机 HMI 提示（现场口述 2026-07-29）**：单表格 **1000 行不闪**、**2000 行会闪** mappView（见 [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)）。取数无总量上限后，单份 `maxRows` / 分卷粒度仍可能影响是否白屏，需与「不丢行」分开权衡。

## 验收对照（2026-08-08）

- [x] 分报表模式不再套 50000 总量帽（单测锁 ≥80000）；现场实际行数一致性待上表实测。  
- [x] 未开分报表且 `maxRows` 小于结果集：按单份上限截断（现有产品语义），无额外总量帽。  
- [x] 预览仍 ≤1000，截断提示不变。  
- [x] 单测（`sqlFillQueryLimit`）按新口径改写并新增反例用例。
