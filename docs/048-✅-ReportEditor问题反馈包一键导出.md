# ReportEditor：问题反馈包一键导出（给 Agent 复现排查）

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记 / 拍板**：2026-08-08（Q1–Q7）。  
> **实现日期**：2026-08-08；**现场手测闭环**：2026-08-09（support-pack 实包验收）。  
> **关联**：配置备份 · 操作审计 [013](013-✅-ReportEditor模版版式编辑审计.md)。

---

# ✅ 已完成：产品诉求与 Q1–Q7 拍板

见历史口径：Markdown + 附件 → zip；模版预勾失败相关；审计 7 天≤500 失败优先；连接骨架无密；一期仅导出；设置页 + 失败旁路；默认附 PDF。

---

# ✅ 已完成：实现（2026-08-08）

| 层 | 内容 |
|----|------|
| 后端 | `modules/support_pack.py` 组 zip；`POST /settings/support-pack/export`、`GET …/suggestions`；审计 `support.pack_export` |
| 前端 | 设置页 `SupportPackSection`；`support-pack-client.ts`；操作审计失败展开行「导出问题反馈包」旁路 |
| 测 | `modules/test_support_pack.py` 4 例；`auditLabels` 含 `support.pack_export` |

包内：`ISSUE.md` / `AGENT_PROMPT.md` / `ENV.md` / `manifest.json` / `data/*` / `attachments/*.pdf`（可关）。

# ✅ 已完成：设置页 UI 排版（2026-08-08）

误用未定义的 `settings-field`，标签/输入横向挤叠。改为与其它设置区一致的 `settings-field-row` 纵向堆叠；文本域全宽、模版列表可换行。

---

# ✅ 已完成：安装版手测 / Agent 实包验收（2026-08-09）

用户自装 **0.3.164** 导出 `support-pack-0.3.146-20260808T214949Z.zip`（包名版本号曾被硬编码回落，已改为读 `loadAppCurrentVersion` / UA），Agent 解压核对：

| 项 | 证据 |
|----|------|
| 结构 | `ISSUE.md` / `ENV.md` / `AGENT_PROMPT.md` / `manifest.json` 齐全 |
| 数据 | `data/templates/a044-…json`、`generator-prefs.json`、`connections-skeleton.json`、`audit.jsonl`（41 条） |
| 附件 | 3 份分卷 PDF（`part-1/2/3-of-80`） |
| 无密 | connections 为骨架，未见明文口令 |
| 可用性 | ISSUE 写明「正常导出了几次」；审计含多次 `export.manual_pdf` ok + 历史 `support.pack_export` ok；Agent 可据包复现场景 |

用户明确：若 Agent 判断反馈包好用，即将本功能标 ✅。本轮据此闭环。
