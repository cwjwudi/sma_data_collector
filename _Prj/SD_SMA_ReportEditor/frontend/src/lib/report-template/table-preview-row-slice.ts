/** 导出预览表格切片（静态 / SQL 共用；含行内跨页视觉行区间） */
export interface TablePreviewRowSlice {
  dataRowStart: number;
  dataRowCount: number;
  includeHeaderRow: boolean;
  /** 行内跨页：视觉行起点（含）；仅 dataRowCount===1 且拆分时有意义 */
  rowTextLineStart?: number;
  /** 行内跨页：视觉行终点（不含） */
  rowTextLineEnd?: number;
  rowFragment?: boolean;
}
