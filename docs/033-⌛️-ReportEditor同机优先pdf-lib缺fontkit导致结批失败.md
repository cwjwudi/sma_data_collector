# ReportEditor：同机优先（pdf-lib）缺 fontkit → OPC 自动结批失败

> 本文件为 **任务看板**；规则见 [CLAUDE.md](../CLAUDE.md)。  
> **发现**：2026-07-22 · 现场/工控机 Win 安装版 **0.3.115**（路径含 `ReportEditorAI`）。  
> **关联**：[030](030-🚧-ReportEditor结批占满CPU导致mappView白屏.md) 同机优先 · [Plan 0.3.115](../_Prj/SD_SMA_ReportEditor/_Doc/009_版本Plan/0.3.115.md)。  
> **本轮**：只登记现象 + 根因；**未改代码**。

---

# ✅ 已完成：登记报错与根因（2026-07-22）

## 现象（用户截图）

OPC UA **自动结批**连续失败 Toast（绑定 1/2/4 同类文案，绑定 3 另见加载失败）：

1. **主错误（绑定 1、2、4）**  
   `Error: Input to 'PDFDocument.embedFont' was a custom font, but no 'fontkit' instance was found. You must register a 'fontkit' instance with 'PDFDocument.registerFontkit(...)' before embedding custom fonts.`

2. **伴随错误（绑定 3）**  
   `Error: ERR_FAILED (-2) loading 'file:///C:/Users/SMA/AppData/Local/Programs/ReportEditorAI/.../resources/web/index.html#/pdf-export?...&engine=pdf-lib&seq=...'`  
   → 导出隐藏窗加载 `index.html#/pdf-export` 失败（常见于并发/崩溃后导航竞态，见下「放大器」）。

3. **界面上下文（第一张图）**  
   版式属性面板可见「字体 / 刷新本机字体列表」；右下角 AI 悬浮钮被圈出。  
   **结论**：报错主体是后台 **OPC 自动结批 → pdf-lib 同机优先**，不是 AI 抽屉本身；字体面板仅说明现场模版会走自定义/CJK 字体路径。

## 调用链（简）

```text
OPC 自动结批（默认 pdfExportEngine=pdf-lib）
  → main pdf-export-run（engine=pdf-lib）
  → 隐藏窗 #/pdf-export?...&engine=pdf-lib
  → PdfExportView：getBundledCjkFont → renderPdfLibExportPartBase64
  → pdf-lib-export-render.ts：
       PDFDocument.create()
       loadBundledFontBytes(...)  // 读到 Noto OTF bytes
       doc.embedFont(fontBytes, { subset: true })  // ← 抛 fontkit 缺失
```

关键位置（当前 `main` / 0.3.115）：

| 点 | 路径 |
|----|------|
| 嵌入自定义字体 | `frontend/src/lib/report-template/pdf-lib-export-render.ts` ≈ L147–158 |
| 随包字体 IPC | `frontend/electron/main.cjs` · `bundled-cjk-font` |
| 默认引擎 | `pdf-export-engine.ts` / prefs：`pdf-lib` |
| 依赖 | `package.json` 有 `pdf-lib`，**无** `@pdf-lib/fontkit` |

## 根因结论

| # | 结论 | 置信度 |
|---|------|--------|
| **1 主因** | pdf-lib **嵌入自定义字体（Noto OTF + `subset: true`）必须先** `doc.registerFontkit(fontkit)`，并依赖包 `@pdf-lib/fontkit`。0.3.115 实现了读字体字节 + `embedFont`，**漏装/漏注册 fontkit** → 与官方报错文案完全一致 | **高** |
| **2 放大器** | 多绑定并行自动结批：一路 pdf-lib 抛错后隐藏窗状态异常，另一路 `loadURL`/`hash` 切换出现 `ERR_FAILED (-2)` | **中高** |
| **非主因** | AI 悬浮钮、版式「本机字体」下拉本身不触发该 toast；标准字体 Helvetica 路径不会走 custom embed（仅在 **拿不到** Noto bytes 时回退） | **低** |

> 为何「有 Noto 反而炸」：随包字体读成功 → 走 custom `embedFont` → 必需要 fontkit；若字体文件缺失则回退 Helvetica，中文变 `?`，但**不会**报这句 fontkit 错。

## 建议修复（未开工）

1. `npm i @pdf-lib/fontkit`（前端依赖）。  
2. `pdf-lib-export-render.ts`：`import fontkit from '@pdf-lib/fontkit'`（或 `import * as fontkit`），在 `embedFont` 前 `doc.registerFontkit(fontkit)`。  
3. 单测：有假 font bytes 时不再抛 fontkit 文案（可 mock embed）。  
4. 现场缓解（不改代码）：报表生成 → 高级设置切 **版式优先（chromium）** 后重试自动结批。  
5. 可选：并发结批时加强对导出窗 `ERR_FAILED` 的销毁/重建（033 次要）。

## 验收（落地后）

- [ ] 同机优先 + 随包 Noto：自动结批不再出现 fontkit 报错  
- [ ] `engineMeta.fontEmbedded === true`  
- [ ] 多绑定并行结批：不再连带 `ERR_FAILED` 刷屏（或可降级重试）  
- [ ] 版式优先路径不回归  

---

# ⌛️ 未完成：修复与回归

| ID | 类型 | 内容 | 状态 |
|----|------|------|------|
| **U1** | 单测/契约 | 源码含 `registerFontkit` + 依赖 `@pdf-lib/fontkit` | ⌛️ |
| **F1** | 修复 | 注册 fontkit 后再 `embedFont` | ⌛️ |
| **V1** | 手测 Win | 0.3.115+ 补丁包：同机优先自动结批 4 绑定 | ⌛️ |

## 不做（本轮）

- 不改 AI 助手 UI。  
- 不在本轮做 pdf-lib 版式 1:1（仍属 030 draft-v1）。  
