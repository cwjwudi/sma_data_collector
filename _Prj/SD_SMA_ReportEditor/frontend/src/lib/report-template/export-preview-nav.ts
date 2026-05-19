import type { EditorSheet } from "@/lib/report-template/editor-sheet";

/** 导出预览卡片 → 与左侧「封面 / 正文 / 末页」及正文分页索引对齐 */
export type ExportPreviewNavPayload =
  | { sheet: Extract<EditorSheet, "cover"> }
  | { sheet: Extract<EditorSheet, "back"> }
  | { sheet: Extract<EditorSheet, "body">; bodyPageIndex: number };
