# ReportEditor 仪表盘健康项跳转后不亮控件

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 版本计划：[0.3.65](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.65.md)。  
> 相关代码：`asset-health-links.ts`、`editor-selection.ts`、`DashboardAssetHealth.vue`、`TemplateEditorWorkspace.vue`、`TemplateBodyCanvas.vue`、`LayoutPresetEditor.vue`。

---

# ✅ 已完成：健康告警点击跳转后控件无高亮（→ 0.3.65）

## 实现摘要

1. **连接级**（`missing_db` / `missing_default_database` 等）：链接不带 `focus`，带 `healthKind`；列表与编辑器顶栏明示「不会选中单个控件」。  
2. **控件级**：`meta.elementId` → `?focus=`；`findSelectableTemplateElement` 覆盖正文/封面/末页画布 **及** 页眉/页脚/装饰层。  
3. **页眉等 zone**：画布高亮 + 右侧定位面板；可跳转绑定的版式编辑器。  
4. **版式告警**：链到 `LayoutPresetEditor`，支持 `?focus=`。

## 测试

- 前端：`asset-health-links.test.ts`（A/E）、`editor-selection.test.ts`（C）  
- 后端：`test_binding_config_scan` B2/B4；`test_asset_health_scan` B3/B5/B6  

## 手工（F）

连接级进编辑器应见顶栏说明且无选中；正文/页眉 OPC 空节点应高亮对应控件。

---

# ✅ 说明：生产机健康告警与「库已存在 / 控件能选表」认知对齐

> 扫描口径与可视化路径不一致属产品说明，非本版代码缺陷。运维可填连接默认库消 `missing_default_database`；陈旧 `connectionId` 需清模版残留。详见历史分析（git `9dc93ed` 前文档）。与跳转关系：连接级仍无 `elementId`，不高亮是预期。
