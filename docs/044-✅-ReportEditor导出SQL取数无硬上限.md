# ReportEditor：导出 SQL 取数不设硬上限

> 本文件为 **产品口径 / 任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-29。  
> **闭环日期**：2026-08-09（实现 + SQLite 8 万条分卷导出实机验收）。  
> **范围**：表格 SQL 填充的正式导出 / 结批取数路径。  
> **关联**：[023](023-🚧-ReportEditor模拟结批性能回归分析.md) · [002](002-🚧-表格系统评估与修复.md) · [030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md)。

---

# ✅ 已完成：产品口径登记

## 口径（2026-07-29 确认）

- **正式导出 / 结批**：SQL 能查出多少条，就取多少、用多少；**不对结果集总量设业务硬上限**。  
- **`maxRows`**：只表示「单份报表行数」以及是否按该值**分卷/分报表**，**不得**再当作总查询行数封顶。  
- **编辑器画布预览**：可继续保留 **1000 行**截断（保证编辑流畅），并继续用现有截断提示；预览页数/份数不以导出为准。

## 反例

- 现场需要导出约 **80000** 条时，旧硬上限 **50000** 会静默截断 → **不符合**上述口径。

---

# ✅ 已完成：去掉 50000 总量硬上限（2026-08-08）

## 实现

| 位置 | 改后 |
| --- | --- |
| `frontend/.../table-sql-fill-preview.ts` | `TABLE_SQL_FILL_FULL_ROW_LIMIT` 50000 → **5_000_000（仅异常防护值，不作产品截断）**；`sqlFillQueryLimit`：分报表模式取全量（防护值封顶）；未分报表按用户 `maxRows`（单份行数语义，不再叠 5 万总量帽） |
| `backend/api/routers/database.py` | `query/sql`：`min(body.limit, 50000)` → `min(body.limit, 5_000_000)`（fetchmany 防护值） |
| 预览 | `PREVIEW_LIMIT_MAX = 1000` **保留不动**（与口径一致） |
| 单份 `maxRows` clamp（hydrate / `clampTableSqlMaxRows` / report-split / schema `le=50000`） | **保留**——绑定「单份报表行数」语义，与总量无关 |

## 测试证据（单测）

- `table-sql-fill-preview.test.ts`「044: split export no longer capped at 50000」：分报表模式取数上限 ≥ 80000。  
- 发版记录已记（`_Doc/007` · 0.3.147 一带）。

---

# ✅ 已完成：8 万条分卷导出实机验收（2026-08-09）

证据包：`_Temp/support-pack-0.3.164-latest/`（模版 `a044-smoke-80k-split-sqlite`，SQLite 路径）。

| 项 | 结果 |
| --- | --- |
| 模版 | `reportKind=nonBatch`，`splitReportsOnMaxRows=true`，`maxRows=1000` |
| 审计 | `export.manual_pdf` `result=ok`：`totalReports=80`，`stats.sqlQueries=1`，`stats.sqlRows=80000` |
| 结论 | **未静默截断到 5 万**（旧行为≈50 份）；份数与行数与口径一致 |

同机另一包（`support-pack-0.3.146`）亦有 `totalReports=80` 的成功样本（并行路径下 `sqlRows` 会因多窗重复计数偏大，以 0.3.164 单次取数 `80000` 为准）。

勾选对照：

- [x] 手测导出：约 80 份 PDF、合计取数 80000（SQLite 兜底路径）。  
- [x] 去掉导出 5 万硬上限已写入 `_Doc/007_版本发布记录.md`。  
- [x] 023 已交叉引用本条口径（性能风险另跟 023/030/045）。

---

# ✅ 已完成：Docker 路径说明（非关闭阻塞项）

| 项 | 状态 |
| --- | --- |
| Docker Desktop | 已装；**引擎起不来**（本机缺 WSL2 / Virtualization） |
| `setup_044_docker.ps1` | 脚本就绪；需管理员 `wsl --install` → 重启 → Desktop Running 后再跑 |
| 本机 MariaDB / SQLite | README 已提供等价冒烟路径；**044 验收不依赖 Docker** |

说明见 [README-044-smoke-80k.md](../_Prj/SD_SMA_ReportEditor/getting-started/samples/README-044-smoke-80k.md)。  
若日后要对齐现网 MariaDB 容器，修好 WSL2 后执行 `setup_044_docker.ps1` 即可；**不阻塞本条闭环**。

---

# 存档：旧现状与拟改（已实现）

## 旧现状（改前）

多处把导出取数钳在 **50000**：

| 位置 | 行为 |
| --- | --- |
| `frontend/.../table-sql-fill-preview.ts` | `TABLE_SQL_FILL_FULL_ROW_LIMIT = 50000`；分报表模式取该值 |
| `backend/api/routers/database.py` | `query/sql`：`lim = max(1, min(body.limit, 50000))` |
| 预览接口 | `PREVIEW_LIMIT_MAX = 1000`（**保留**） |

## 验收对照

- [x] 分报表模式不再套 50000 总量帽（单测 + 8 万实机）。  
- [x] 未开分报表且 `maxRows` 小于结果集：按单份上限截断，无额外总量帽。  
- [x] 预览仍 ≤1000。  
- [x] 单测按新口径改写并含 ≥80000 反例。
