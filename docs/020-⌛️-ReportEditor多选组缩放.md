# ReportEditor 多选：拖一角组缩放

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **流程**：诉求已澄清；**先记看板，说「开工」再改代码**。  
> **发现 / 澄清**：2026-07-14 · 用户要的是**功能**，不是误报 bug。  
> **推翻**：011 B1「缩放柄仅改 primary」——本条改为多选时拖一角 → **全部选中项一起缩放**。  
> **误登记说明**：同日初版曾写成「组拖 clamp 砍高」；用户澄清后**作废该主叙事**（clamp 保尺寸可作为本条实现时顺手修，不单开）。  
> **排队**：与 [docs/019](019-⌛️-ReportEditor导出PDF纸张外框.md) 并列待开工；优先听用户指定。

---

# ⌛️ 未完成：多选拖一个角，选中项一起缩放

## 产品诉求（用户原话）

> 我想要的是拖一个角，所有被选中的都缩放

## 现状（011 · 将变更）

| 操作 | 现状 | 本条目标 |
|------|------|----------|
| 多选组**拖移** | 只改 `x`/`y` | 保持 |
| 多选**缩放** | 柄仅 primary，**只改主选** w/h | **拖任一角（主选柄）→ 全集按同一缩放变换** |
| 对齐 / 分布 | 只改位置 | 不变 |

锚点：[`TemplateBodyCanvas.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/TemplateBodyCanvas.vue) / [`LayoutPresetPaperCanvas.vue`](../_Prj/SD_SMA_ReportEditor/frontend/src/components/report-template/LayoutPresetPaperCanvas.vue) 的 `beginResize` / `ptrMove`（当前 `resize.sid` 单元素）。

## 拟拍板（默认 ★ · 待确认或开工即按此）

| # | 问题 | 默认 ★ |
|---|------|--------|
| **Q1** | 缩放语义 | **相对选中并集 AABB**：以对角为锚，按柄拖出的 `sx`/`sy` 变换每个控件的 `x,y,w,h`（相对布局比例保持，像画板组缩放） |
| **Q2** | 柄画在哪 | 仍只在 **primary** 上出八向/表格左右柄；拖它时对**整组**施加 Q1 变换（不做独立组包围盒 UI，二期可加） |
| **Q3** | Shift | 与单选一致：**锁比例**（`sx === sy`） |
| **Q4** | 表格 | 与单选一致：组内表格**只参与水平缩放**（改 `w`/`x`）；高度仍由行内容贴合，不跟组 `sy` 拉高外框 |
| **Q5** | 模版 / 版式 | **同一套**规则与纯函数 |
| **Q6** | 最小尺寸 | 每项不低于现有 floor（text 等 20/16；表用 `minOuterSize*`）；触底则整组 scale 再夹紧 |
| **Q7** | 撤销 | 一次拖放手势 = **一次 undo**（与现有拖拽 debounce 对齐） |
| **Q8** | 单选 | 行为不变 |

**备选（不默认）**：对每项施加与 primary **相同的 Δw/Δh**（位置不动或只改 primary 锚边）——简单但不保持相对排版，易挤叠；用户说「都缩放」更贴 Q1。

## 实现范围（开工后）

1. 新建纯函数（如 `selection-group-resize.ts`）：输入选中几何 + 柄 + 指针 Δ → 各 id 新 `x,y,w,h`；单测 AABB / Shift / 最小尺寸 / 含 table。  
2. `TemplateBodyCanvas` / `LayoutPresetPaperCanvas`：`resize` 状态在 `selectedIds.length ≥ 2` 时带上组 origins，写回全集。  
3. 组拖移路径顺手：移动用「只钳 x/y、不砍 w/h」（避免贴边误缩），与组缩放同版可合入。  
4. 模版 + 版式对称；建议 bump **0.3.98**（若与 019 错开版本则跟当时发版号）。

## 验收

- [ ] ≥2 选中：拖 primary 一角 → 全部选中项尺寸与位置按 AABB 比例变化  
- [ ] Shift 锁比；松手可 undo 一次恢复  
- [ ] 含表格时表高不因组 `sy` 被硬拉；表宽跟组水平缩放  
- [ ] 单选缩放不回归  
- [ ] 模版与版式一致  

## 不做（本条登记）

- 不单独做「组包围盒八向柄」UI（Q2 默认用 primary 柄）  
- 不在右侧多选面板做 W/H 数字批改（画布组缩放优先）  
- 不回改 011 已完成章节正文（本条为政策增量）  
- 本轮登记不改代码  
