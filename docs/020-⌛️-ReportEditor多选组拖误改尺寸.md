# ReportEditor 多选组拖时尺寸被一起改掉

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：先记录 + 源码对照；**未开工改代码**。  
> **发现**：2026-07-14 · 用户反馈「现在多选拖拽尺寸会一起变更」。  
> **相关（已完成、不复开政策）**：[docs/011-✅](011-✅-ReportEditor模版版式多选控件.md) B1 约定组拖只移位置、缩放柄仅 primary。

---

# ⌛️ 未完成：多选拖移不应改 w/h

## 现象（用户原话）

> 现在多选拖拽尺寸会一起变更

（「秒」疑为输入截断；按「会一起变更了」登记。）

## 产品约定（011 · 回顾）

| 操作 | 预期 |
|------|------|
| 多选 **组拖** | 只改各控件 `x`/`y`，**不改变尺寸** |
| 多选 **缩放** | 缩放柄 **仅 primary**；只改当前主选的 `w`/`h` |
| 对齐 / 分布 | 只改 `x`/`y` |

## 代码对照结论

### 1. 组缩放「一起改尺寸」——当前**没有**这条路径

- 模版 [`TemplateBodyCanvas.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateBodyCanvas.vue)：`v-if="isPrimary(el.id)"` 才渲染缩放柄；`resize` 状态只带单个 `sid`。  
- 版式 [`LayoutPresetPaperCanvas.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/LayoutPresetPaperCanvas.vue)：同样仅 primary + 单 `sid`。  
→ **不是**「拖一角、全集同宽高」的组缩放实现。

### 2. 高置信根因：组**拖移**后调用的 clamp 会缩高度/宽度

模版组拖在 `ptrMove` 里对每个选中项：

```ts
el.x = …; el.y = …;
clamp(el);  // → clampElementToLayout
```

[`clampElementToLayout`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/snapshot-fingerprint.ts) 在收紧位置时还有：

```ts
el.h = Math.max(20, Math.min(el.h, contentH - el.y));
```

当组拖把控件往下推、使 `y + h > contentH` 时：**先写大了的 y，再按「剩余高度」砍 `h`**。多选时多个控件同时贴底 → **多个控件高度一起变矮**，观感就是「拖拽时尺寸一起变更」。

贴右同理可能压 `w`（`el.w = min(el.w, contentW)` 在超宽时；更常见是底边砍高）。

版式 [`clampZoneElement`](../_Prj/SD_SMA_ReportEditor/frontend/src/lib/report-template/layout-zone-element.ts) 主要是 `y = min(y, zh - h)` **回推位置、尽量保尺寸**，组拖副作用相对轻；模版路径更明显。

### 3. 鉴别

| 操作 | 若看到 |
|------|--------|
| 多选 **拖移**（无缩放柄）后若干控件变矮/变窄 | 对齐本条主因 |
| 拖 **主选缩放柄** 后其它项也同尺寸 | 需另复现（当前代码不应发生） |
| 想要的是「组缩放」能力 | 属新需求，非本条 bug；另开看板 |

## 拟修复（待「开工」）

1. 组拖 / 单拖 **移动**路径：只用「保尺寸、回推 x/y」的 clamp（或局部 `clampPositionOnly`），**禁止**因越界改写 `w`/`h`。  
2. 完整 `clampElementToLayout` 仍可用于粘贴、改纸张、加载校正等需要收紧尺寸的场景。  
3. 单测：`y` 推过底边 → 移动后 `h` 不变、`y` 被钳到 `contentH - h`；多选两条同测。  
4. 模版对称检查版式组拖是否也需统一。  
5. 建议 bump 小版本（如 0.3.98）。

## 验收

- [ ] 多选组拖贴底/贴右：各控件 **w/h 不变**，仅位置回弹在画布内  
- [ ] 单选拖移同样不误缩尺寸  
- [ ] primary 缩放柄仍只改主选尺寸  
- [ ] 粘贴超大控件 / 换纸张后的尺寸收紧行为不回归（仍走完整 clamp）

## 不做（本条登记）

- 本轮不改代码（仅看板）  
- 不做「多选组缩放」功能（除非用户另开需求）  
- 不回改 011 已完成叙述  
