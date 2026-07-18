# ReportEditor：从签名库切到历史报表后缩略图停在「滚动到此加载预览」

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **状态**：⌛️ 待修。  
> **发现**：2026-07-18 · Windows 包 **0.3.107** 手测（用户）。  
> **相关**：[`ReportHistoryPane.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-history/ReportHistoryPane.vue)（`IntersectionObserver` / `visibleCards` / `ensureCardObserver`）· [`ReportHistory.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/views/ReportHistory.vue)。

---

# ⌛️ 待修：路由切入历史报表后缩略图懒加载不触发

## 现象（已确认 · Win 0.3.107）

1. 先打开 **签名库**，再切换到 **历史报表**（缩略图模式）。  
2. 左右分屏卡片已在视口内（共 3 项 · 第 1/1 页，无需滚动），缩略图区域仍显示占位文案 **「滚动到此加载预览…」**，不加载 PDF 预览图。  
3. 截图：[FILES/029-历史报表缩略图懒加载占位.png](FILES/029-历史报表缩略图懒加载占位.png)。

## 初步怀疑（待代码验证）

[`ReportHistoryPane.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-history/ReportHistoryPane.vue)：

- 缩略图靠 `IntersectionObserver`（`root: null`，`rootMargin: 400px`）把卡片 path 写入 `visibleCards` 后才渲染预览。  
- `watch(entries)` 会 **清空** `visibleCards`；若此时卡片已在视口、Observer 不再回调，会一直停在占位。  
- 从其它页（签名库）切入时，若组件曾挂在隐藏容器 / `keep-alive` 非激活态再显示，首屏可见卡片可能 **不会再次触发** intersection。  
- 已有 `defineExpose({ ensureCardObserver })`，但切入路由时是否强制 re-observe / 主动标可见待查。

## 建议修复方向（实现时再定）

1. 路由 `onActivated` / 列表刷新后：对已挂载卡片 re-observe，或检测已在视口则直接加入 `visibleCards`。  
2. `entries` 变更清空后，下一帧主动扫一遍相交状态（勿只等滚动）。  
3. 补单测或最小复现步骤（签名库 → 历史报表，首屏 3 卡应出图）。

## 验收

- [ ] Win：签名库 → 历史报表（缩略图），首屏卡片自动出预览，无需手动滚动  
- [ ] 本页刷新 / 换目录后懒加载仍正常  
- [ ] 长列表滚动懒加载不回归  

## 不做

- 本看板仅登记问题；不改为「全部立即加载」除非产品另拍板。  
