import type { InjectionKey, Ref } from "vue";
import type { BindingPreviewCell } from "@/lib/report-template/binding-preview-utils";

/** 画布内点击表格单元格时，供右侧属性面板联动编辑 */
export interface TemplateTableCellPick {
  elId: string;
  row: number;
  col: number;
}

export const templateTableCellPickKey: InjectionKey<Ref<TemplateTableCellPick | null>> =
  Symbol("templateTableCellPick");

/** 版式预设编辑器：画布表格单元格选中，供右侧 LayoutPresetElementProps 联动 */
export const layoutPresetTableCellPickKey: InjectionKey<Ref<TemplateTableCellPick | null>> =
  Symbol("layoutPresetTableCellPick");

/** 导出预览：拉取 OPC / SQL 绑定值的会话（由模版编辑器 provide） */
export interface BindingPreviewRefreshOptions {
  /** 刷新 OPC UA 绑定；默认 true */
  opc?: boolean;
  /** 刷新 SQL 单元格绑定与整表填充预览；默认 true */
  sql?: boolean;
  /** 为 true 时不设置 loading，避免「刷新中」文案闪烁 */
  silent?: boolean;
  /** PDF 导出时拉取数据库填充表可拆分报表所需的完整行集；编辑器预览保持轻量 */
  fullSqlFill?: boolean;
}

export interface ReportBindingPreviewState {
  values: Ref<Record<string, BindingPreviewCell>>;
  loading: Ref<boolean>;
  refresh: (opts?: BindingPreviewRefreshOptions) => Promise<void>;
}

export const reportBindingPreviewKey: InjectionKey<ReportBindingPreviewState> =
  Symbol("reportBindingPreview");
