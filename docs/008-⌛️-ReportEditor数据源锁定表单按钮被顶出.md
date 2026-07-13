# ReportEditor 数据源锁定后连接表单按钮被顶出

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> 相关组件：`ConnectionManager.vue`、`connection-form-pane.css`；数据源滑动锁见 `DatasourceLockToggle.vue`。  
> 相近历史：[docs/004-✅-ReportEditor数据源UI修复.md](004-✅-ReportEditor数据源UI修复.md)。

---

# ⌛️ 未完成：锁定提示挤占高度，底部操作按钮被顶出可视区

## 现象（现场截图 · 2026-07-13）

- 数据源 → 数据库工作台 → 连接 `SMA_DATABASE`。  
- **数据源已锁定**时，表单顶部多出一条蓝底提示：「数据源已锁定，仅可查看与测试连接。」  
- 相对未锁定状态，表单内容整体下移；底部 **「删除」** 等操作按钮被挤到面板白底之外 / 视口下方，需额外滚动才能看到，观感像布局破损。  
- 右侧架构预览正常；问题仅在左侧 `conn-form-pane`。

## 根因（代码对照 · 文档阶段）

`ConnectionManager.vue` 在锁定时于表单顶部插入：

```vue
<p v-if="locked" class="demo-conn-hint">数据源已锁定，仅可查看与测试连接。</p>
```

`.conn-form-pane` / `.actions`（见 `connection-form-pane.css`）为常规文档流排布，**未**为操作区做吸底或为可滚动区预留 hint 高度；多出 hint 后，固定高度侧栏内底部按钮被推出可视区。

同类：远程演示连接也有 `.demo-conn-hint`，长提示时可能同类风险。

## 拟改（确认后开工）

1. 侧栏表单：内容区 `overflow-y: auto`，操作按钮 **吸底固定**（或 sticky），hint 不挤掉按钮。  
2. 或缩短锁定文案 / 并入标题行，减少占位。  
3. 验收：锁定 / 未锁定 / 远程演示三种状态下，「测试连接 / 仅保存 / 测试并保存 / 删除」均完整可见，无需猜滚动。

## 本轮范围

- ✅ 记录现象与定位要点（本文档）  
- ⌛️ 布局修复与回归（待开工）
