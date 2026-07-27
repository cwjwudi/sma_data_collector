# ReportEditor：矢量导出 · 封面空字符显示 “value”

> 本文件为 **缺陷看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **登记日期**：2026-07-27 · 现场装包 **0.3.144**（与 `frontend/package.json` / Portal Setup 一致）。  
> **范围**：导出档 **1「矢量版式」**（`layout-v2`）；封面数据库 / OPC UA 绑定空值。  
> **关联**：[042](042-🚧-ReportEditor矢量导出封面小数位变整数.md) · [036](036-✅-ReportEditor矢量档与预览稳样式对照.md)。

---

# 🚧 进行中：现象与根因排查

## 现象

- 封面绑定 SQL / OPC UA 的参数（或单元格）实值为空字符串 / NULL。  
- 预览侧按空值策略多为空白（`nullDisplayMode: blank`）。  
- **档 1 矢量导出** 打印出字面量 **`value`**（或用户描述的占位文案）。

## 代码根因（本机已核对 · 高置信）

预览（Mini）对绑定参数：

```ts
resolveBoundParameterPreviewText({
  bindingKind, text: el.text, nullDisplayMode, decimalPlaces,
  previewCell: hit, ...
});
```

空 bound + `nullDisplayMode: "blank"` → **返回 `""`**，**不会**回落 `el.text`。  
单测已锁：`parameter-null-display.test.ts`「does not fall back to {{value}} when bound text is empty」。

矢量 layout-v2：

```ts
const bound = cellText(values[ck]);
// zone parameter/text：
} else if (bound) {
  text = bound;
} else {
  text = String(el.text || "");   // ← 空绑定回落控件文案
}
// 正文 parameter/text：
const text = bound || String(el.text || "");
```

当 `previewValues` 有键且 `text: ""`（或缺失键导致 `bound==""`）时：

- Mini：空白  
- 矢量：画 `el.text`  

若控件占位 / 历史字段为 `"value"`、`"{{value}}"`、列名 `value` 等，PDF 即出现用户所见字样。

注释里虽写「绑定成功时不回落占位」，但实现用 `if (bound)` 把 **空字符串当成未绑定**，与 `resolveParameterDisplayText` 的「有 bound 结果且为空 → 走 nullDisplayMode」不一致。

静态表单元格同样：`bound || grid[r][c].text`。

## 本机复现（逻辑级 · 已对照）

| 路径 | binding sql，preview `{ text: "" }`，`el.text = "value"`，`nullDisplayMode: blank` |
|------|----------------------------------------------------------------------------------|
| Mini | `""` |
| layout-v2 现状 | `"value"` |

建议补失败单测：封面 parameter + 上述条件，PDF 文本 **不得** 含 `value`。

## 建议修复方向

1. layout-v2 统一改用 `resolveBoundParameterPreviewText` / `resolveParameterDisplayText`（与 [042](042-🚧-ReportEditor矢量导出封面小数位变整数.md) 同一改造点）。  
2. 判定「已有预览结果」用 `previewCell != null`（或 key 存在），**不要**用 `if (bound)` 真值。  
3. 尊重 `nullDisplayMode`：`blank` / `emptyLabel`（「空值」）/ `fallbackText`。  
4. 仅在真正未取到预览（无 key、加载中）时才显示 unbound 提示，且避免默认 `"value"` 占位；必要时清洗历史 `el.text === "value"`。  
5. 与 039 同 PR 改更合适，避免矢量绑定显示再分叉。

## 需要补充的信息

| # | 请提供 |
|---|--------|
| 1 | 准确版本号；档 1 PDF + 同戳档 2 / 预览截图 |
| 2 | 出问题的控件 JSON：`type`、`text`、`bindingKind`、`nullDisplayMode`、`sqlText` / `opcuaNodeId` |
| 3 | 导出当时该 `param:<id>` / `zparam:<id>` 在 previewValues 里的实际 `text`（日志或调试导出） |
| 4 | 空值来源：SQL 空串、无行、OPC Bad、还是节点值为空？ |
| 5 | 期望空值表现：空白 / 「空值」/ 自定义回落文案？ |

---

# ⌛️ 未完成：空值策略对齐预览并验收

- [ ] layout-v2 接入 `resolveBoundParameterPreviewText`  
- [ ] 单测：空 bound + text=`value` → PDF 无 `value`  
- [ ] 与 042 一并回归封面绑定参数  
