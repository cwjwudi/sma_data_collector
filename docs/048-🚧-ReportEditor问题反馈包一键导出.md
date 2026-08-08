# ReportEditor：问题反馈包一键导出（给 Agent 复现排查）

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记 / 拍板**：2026-08-08（Q1–Q7）。  
> **实现日期**：2026-08-08（本机 TDD；设置页手测 ⌛️）。  
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

# ⌛️ 未完成：设置页手测

- [ ] 设置 → 问题反馈包：表单无重叠，导出 zip 可读。  
- [ ] 审计失败条目旁路可打出包。  
- [ ] 确认无明文密码；通过后改 `048-✅`、发版记录。
