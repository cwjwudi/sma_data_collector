# ReportEditor 历史报表：子文件夹穿透 + 分页防卡顿

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **修复版本：0.3.68**。  
> 相关：[`ReportHistory.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/ReportHistory.vue)、[`export-dir-scan.cjs`](../_Prj/SD_SMA_ReportEditor/frontend/electron/export-dir-scan.cjs)、`scan-export-entries` IPC。

---

# ✅ 已完成：历史报表单层进入子目录 + 分页浏览

## 产品诉求（已落地）

1. 可看到并进入导出根下的**子文件夹**（非递归平铺）。  
2. 当前层文件夹 + PDF **混排分页**（默认每页 50，可选 20/100）。  
3. 面包屑 / 上级；`cwd` 不得逃出绑定根。  
4. 仪表盘「近期 PDF」浅扫 `limit:5`，mirror `limit:15`。

## 实现摘要（0.3.68）

- `electron/export-dir-scan.cjs`：`scanExportEntries` / `scanExportPdfsCompat`  
- IPC：`scan-export-entries`；旧 `scan-export-pdfs` 薄封装兼容  
- `ReportHistory`：面包屑、文件夹行、分页、generation 防竞态  
- 单测：`export-dir-scan.test.ts`、`report-history-nav.test.ts`

## 验收

- [x] 根下可见子文件夹；进入后仅本层条目  
- [x] 分页与每页条数  
- [x] 逃逸路径拒绝（单测 A4）  
- [x] 仪表盘仍可扫近期 PDF  
