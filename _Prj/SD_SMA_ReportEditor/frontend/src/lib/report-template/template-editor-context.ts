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
  /**
   * 是否把 SQL 填充预览行数写回模版 tableRows（会触发撤销栈 deep watch）。
   * 切换画布视图时建议 false，避免与 DOM 重建抢主线程。默认 true。
   */
  mutateTemplateRows?: boolean;
}

/** 一次绑定刷新实际取数统计（结批审计用） */
export interface BindingPreviewStats {
  /** OPC UA 点位读取次数（含 SQL 参数用到的 OPC 读取） */
  opcReads: number;
  /** SQL 查询次数（标量绑定 + 整表填充） */
  sqlQueries: number;
  /** SQL 返回数据行数合计 */
  sqlRows: number;
}

export interface ReportBindingPreviewState {
  values: Ref<Record<string, BindingPreviewCell>>;
  loading: Ref<boolean>;
  refresh: (opts?: BindingPreviewRefreshOptions) => Promise<void>;
  /** 最近一次 refresh 的取数统计；未刷新过为 null */
  lastStats: Ref<BindingPreviewStats | null>;
}

export const reportBindingPreviewKey: InjectionKey<ReportBindingPreviewState> =
  Symbol("reportBindingPreview");
