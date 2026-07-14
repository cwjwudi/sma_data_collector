# ReportEditor 数据源锁定后连接表单按钮被顶出

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 相关组件：`ConnectionManager.vue`、`OpcUaPanel.vue`、`connection-form-pane.css`。  
> 版本计划：[0.3.64](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.64.md)。  
> 相近历史：[docs/004-✅-ReportEditor数据源UI修复.md](004-✅-ReportEditor数据源UI修复.md)。

---

# ✅ 已完成：锁定提示挤占高度，底部操作按钮被顶出可视区（→ 0.3.64）

## 现象（现场截图 · 2026-07-13）

- 数据源锁定时多出蓝底提示，底部「删除」等按钮被顶出面板白底 / 可视区。

## 实现（0.3.64）

1. `.conn-form-pane`：`overflow: hidden` + 列 flex。  
2. `.conn-form-pane__body`：`flex:1; min-height:0; overflow-y:auto`（hint + 字段可滚）。  
3. `.conn-form-pane__actions`：`flex-shrink:0`，操作条固定在面板底。  
4. `ConnectionManager` / `OpcUaPanel` 共用该结构。

## 测试

- `connection-form-pane-layout.test.ts`（B1–B4）  
- `ConnectionManager.test.ts` 008 段（A1–A6 + 结构）  
- `workbench-layout.test.ts` 004 不回归  

## 手工（D）

锁定 / 解锁半屏窗口：操作条应始终贴在左侧连接面板底部可见。
