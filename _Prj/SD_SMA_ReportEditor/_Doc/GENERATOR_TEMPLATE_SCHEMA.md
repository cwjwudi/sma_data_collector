# 模版 JSON schemaVersion 2

源码定义见：
- `frontend/src/lib/report-template/model.ts`
- `backend/schemas/report_template.py`

## 模版中的版式字段与磁盘版式的关系

主应用可通过 **FastAPI** 持久化「版式预设」，单文件 JSON 存放在后端数据目录下的 `layout_presets`（见 `backend/core/settings.py` 中 `LAYOUT_PRESETS_DIR`）。每条预设有一个稳定的 **`id`**（文件名 `{id}.json`）。

模版 `ReportTemplate` 通过以下字段引用版式 **`id`**（字符串）：

| 字段 | 语义 |
|------|------|
| `layoutPresetId` | **正文重复页** 选用的版式；创建向导里对应 `pageRole === "normal"` 的条目。 |
| `coverLayoutPresetId` | **封面** 选用的版式；对应 `pageRole === "cover"`。 |
| `backLayoutPresetId` | **末页（封尾）** 选用的版式；对应 `pageRole === "back"`。 |

同时模版内各自保存快照字段（纸张边距与页眉页脚带高等），例如：

- `layoutSnapshot` · `coverLayoutSnapshot` · `backLayoutSnapshot`

**生成器读取顺序建议**（离线生成 Word/PDF/Markdown 等时）：

1. **载入模版根 JSON**，得到上述三个 `*LayoutPresetId` 与各 `*LayoutSnapshot`，以及三套页各自的内嵌控件数组：`headerElements`/`footerElements`、封面/末页 `coverHeaderElements`、`backBodyZoneElements` 等（见 `ReportTemplate` 全字段）。
2. **若需在导出时追随「版式库」最新**，可用 `layoutPresetId` / `coverLayoutPresetId` / `backLayoutPresetId` 去磁盘（或后端 `GET /layout-presets/{id}`）读取最新版 JSON，并用其覆盖或合并边距类字段；若在编辑器中始终以快照为准离线生成，则可 **仅读取模版内快照与内嵌控件**，忽略步骤 2。
3. **正文画布**使用 `elements`；**封面/末页画布**分别使用 `coverElements`、`backElements`。

## 电子签名与签名库

- 画布控件类型 `signature` 在模版中仍为 `TemplateElement`。
- `imageSrc`：手写或载入后的 **data URL 预览**，便于离线预览。
- `signatureAssetId`（可为空）：引用签名库条目 id（磁盘 `signatures/` 目录，API `GET /signatures/{id}`）。生成器可优先据此从服务端取持久化签字图；若条目缺失可回退到 `imageSrc`。

## 兼容性

缺失 `signatureAssetId` 的旧 JSON 等价于空字符串（前后端 hydrate 会使用默认值）。
