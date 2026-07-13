# ReportEditor 模版 / 版式编辑器：多选控件

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **B1（MVP）已于 0.3.70 落地**；B2 / B3 仍 ⌛️。  
> 相关：`TemplateEditorWorkspace` / `TemplateBodyCanvas` / `LayoutPresetEditor` / `LayoutPresetPaperCanvas` / `selection-set.ts`。

---

# 🚧 进行中：多选控件（B1 ✅ · B2/B3 ⌛️）

## 批次状态

| 批次 | 范围 | 状态 |
|------|------|------|
| **B1 · MVP** | 多选状态 + 高亮 + Ctrl/Cmd 加选 + 框选 + 组移动/删除/多剪贴板 + 属性摘要 | ✅ **0.3.70** |
| **B2** | Shift 区间加选；对齐 / 分布 | ⌛️ |
| **B3 · 属性批改** | 交集字段批改 + E1–E6 | ⌛️（已拍板后置） |

## B1 实现摘要（0.3.70）

- `selection-set.ts`：toggle / range / marquee / primary  
- 剪贴板支持 `template_multi` / `layout_multi`  
- 模版 + 版式：Ctrl/Cmd 加选、空白框选、组拖、批量删、多元素 C/X/V、Esc 清空  
- 右侧多选：「已选 N 项」+ 类型计数；点项切单选；无表格格编辑  
- 缩放柄仅 primary；页眉 zone 只读层不参与框选批量删  

## 属性面板（回顾）

- 单选：完整属性面板  
- 多选 MVP：仅摘要（B3 再开交集字段）  

## B3 属性批改 · 建议字段（交集）

| 字段族 | 适用 | 冲突时 |
|--------|------|--------|
| `showBorder` | 非 table 或集合内均非 table | 含 table → 隐藏该项 |
| 填充色 / 文字色 | 选中项均有对应属性 | 缺省则隐藏 |
| 字号 / 字重（若模型统一） | text/box 等同构 | 混入其它类型 → 隐藏 |
| 换行 `textAutoWrap` | 均为 text/box | 否则隐藏 |
| X/Y/W/H 数值 | **默认不做** | — |
| OPC/SQL 绑定、签名、表格单元格 | **永不批改** | 仅单选 |

## 测试

### A. 纯函数 ✅

A1–A4 + marquee apply（`selection-set.test.ts`）；多元素剪贴板（`editor-element-clipboard.test.ts`）

### E. 属性批改（B3 · 后置）

| # | 用例 |
|---|------|
| E1 | 两同类型 text 多选 → 共有色/边框；改 `showBorder` → 两者同变、一次 undo |
| E2 | text + table 多选 → 无表格格编辑；边框按冲突规则 |
| E3 | 颜色不同 → 「混合」；选新色后统一 |
| E4 | 绑定类入口不可用 |
| E5 | 摘要切单选 → 完整属性面板 |
| E6 | 版式路径同 E1/E3 |

## 验收（B1）

- [x] Ctrl 点两个 → 双高亮  
- [x] 框选 → 集合正确  
- [x] Delete 一次去掉全部  
- [x] 组拖 Δ 一致  
- [x] focus 路由仍单选  
- [x] 多选属性为摘要  

## 本轮范围

- ✅ B1 实现与发版  
- ⌛️ B2 / B3  
