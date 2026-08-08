# ReportEditor：手动导出「冒烟」非批次模版闪退（SIGSEGV）+ 白屏不关

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-08-08 · 本机 Electron 开发（0.3.146）。  
> **闭环日期**：2026-08-08（本机 mac 手测通过）。  
> **关联**：[046](046-🚧-ReportEditor批次与非批次报表导出.md) · [039](039-🚧-ReportEditor导出全屏遮罩.md)。

---

# ✅ 已完成：现象与现场证据（2026-08-08）

- 非批次「冒烟·一键无边框」手动导出：PDF 常已成功，随后 Electron `SIGSEGV`；可见白屏不关。  
- `.ips`：`EXC_BAD_ACCESS @0x10`，`CrBrowserMain` → `NSAccessibility…` → `objc_msgSend`。

---

# ✅ 已完成：代码兜底（2026-08-08）

| 项 | 做法 |
|----|------|
| `safeDestroyBrowserWindow` | hide → `about:blank` → **300ms** 后 destroy |
| 遮罩 / PDF 窗销毁 | 走安全销毁 |
| PDF 导出窗创建 | 非白底、`skipTaskbar`、`focusable:false` |
| finally | 先关遮罩，再处理 PDF 窗 |

---

# ✅ 已完成：050b 延时崩溃（2026-08-08）

**现象**：刚导出不崩，**过一会**仍 `SIGSEGV`（同 Accessibility 栈）。  
**根因**：成功导出会把隐藏 PDF 窗**放回预热池**长期滞留；macOS Accessibility（含 Cursor）稍后查询 → 空指针。

| 项 | 做法 |
|----|------|
| `pdfExportWarmPoolAllowed()` | **darwin 返回 false** |
| `releasePdfExportWindow` / finally | mac 上**不复用、不预热**，导出结束即销毁 |
| `ensurePdfExportWindowPrewarmed` | darwin 直接清池 |

Windows 现场仍保留预热池性能路径。

---

# ✅ 已完成：本机 mac 复测（2026-08-08）

用户确认：本机 mac 导出后**已不崩溃**（含此前「过一会再崩」路径）。
