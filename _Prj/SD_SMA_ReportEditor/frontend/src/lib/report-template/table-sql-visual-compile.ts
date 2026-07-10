/**
 * 将「可视化数据源」编译为 querySql + params（占位符 {{p0}}…），供导出生成器消费。
 * 仅允许 [a-zA-Z0-9_] 标识符；MongoDB 不走 SQL 可视化路径。
 */

import type {
  TableSqlFillConfig,
  TableSqlParamBinding,
  VisualSqlFilter,
  VisualSqlFilterKind,
} from "@/lib/report-template/table-sql-fill";
import {
  clampSqlFillParamColumnRefs,
  defaultSqlParam,
  ensureMinTableSqlParamSlots,
  ensureTableSqlColumnRoles,
  ensureTableSqlResultColumnNames,
  ensureVerticalFieldLabels,
  ensureVisualOutputColumnSlots,
  ensureVisualSource,
  isVerticalSqlFill,
  isVerticalSqlSlotBoundField,
  normalizeVisualSqlFilterShape,
  TABLE_SQL_COLUMN_PICK_BLANK,
  TABLE_SQL_COLUMN_PICK_SEQUENCE,
  TABLE_SQL_FILL_TABLE_PICK_SLOT,
  TABLE_SQL_VERTICAL_FIELD_PENDING,
  validateSqlIdentifier,
  VERTICAL_SQL_FILL_COL_COUNT,
  visualSqlSelectFieldNames,
} from "@/lib/report-template/table-sql-fill";
import { clampTableRowHeightPx, REPORT_TEMPLATE_TABLE_NODE_PADDING_PX, TEMPLATE_TABLE_MAX_COLS, TEMPLATE_TABLE_MAX_ROWS } from "@/lib/report-template/table-cell-metrics";
import { verticalSqlSelectColCount } from "@/lib/report-template/table-sql-vertical";

export function quoteSqlIdentifier(engineLower: string, name: string): string {
  validateSqlIdentifier(name);
  if (engineLower === "postgres" || engineLower === "sqlite") return `"${name.replace(/"/g, '""')}"`;
  return `\`${name.replace(/`/g, "")}\``;
}

/** 第 fi 条筛选条件在扁平 params 中的起始下标（与 compileVisualTableSql 一致） */
export function visualFilterParamSlotBase(filters: VisualSqlFilter[], filterIndex: number): number {
  let off = 0;
  const upto = Math.max(0, Math.min(filterIndex, filters.length));
  for (let i = 0; i < upto; i++) {
    off += filters[i].kind === "equality" ? 1 : 2;
  }
  return off;
}

/** 把扁平参数槽位映射回可视化筛选的具体绑定（visualFilterParamSlotBase 的逆映射） */
export function visualFilterBindingAtParamSlot(
  filters: VisualSqlFilter[],
  slot: number,
): TableSqlParamBinding | null {
  let off = 0;
  for (const f of filters) {
    const slots = f.kind === "equality" ? 1 : 2;
    if (slot < off + slots) {
      normalizeVisualSqlFilterShape(f);
      return f.bindings[slot - off] ?? null;
    }
    off += slots;
  }
  return null;
}

/**
 * OPC 节点选择确认后的统一回写。
 * 可视化模式必须写入 visualFilters 的绑定（面板输入框的数据源），随后 params/querySql
 * 由编译同步；若误写 params，界面不显示且下次编译会被 bindings 覆盖。
 * slot=TABLE_SQL_FILL_TABLE_PICK_SLOT 表示写入「表名 OPC 变量」。
 */
export function applyTableSqlFillOpcPick(fill: TableSqlFillConfig, slot: number, nodeId: string): void {
  const id = String(nodeId ?? "").trim();
  if (!id) return;
  if (slot === TABLE_SQL_FILL_TABLE_PICK_SLOT) {
    const vs = ensureVisualSource(fill);
    vs.tableSource = "opcua";
    vs.tableOpcNodeId = id;
    compileVisualTableSql(fill);
    return;
  }
  if (slot < 0) return;
  if (fill.fillMode === "visual") {
    const b = visualFilterBindingAtParamSlot(fill.visualFilters || [], slot);
    if (b) {
      b.source = "opcua";
      b.opcuaNodeId = id;
      compileVisualTableSql(fill);
    }
    return;
  }
  ensureMinTableSqlParamSlots(fill, slot + 1);
  const row = fill.params[slot];
  if (row) {
    row.source = "opcua";
    row.opcuaNodeId = id;
  }
}

export function buildDistinctSelectSql(engineLower: string, table: string, column: string, limit: number): string {
  validateSqlIdentifier(table);
  validateSqlIdentifier(column);
  const lim = Math.min(200, Math.max(1, Math.round(limit)));
  const qt = quoteSqlIdentifier(engineLower, table.trim());
  const qc = quoteSqlIdentifier(engineLower, column.trim());
  return `SELECT DISTINCT ${qc} AS __dv FROM ${qt} WHERE ${qc} IS NOT NULL LIMIT ${lim}`;
}

function bindingSlotsForKind(kind: VisualSqlFilterKind): number {
  return kind === "equality" ? 1 : 2;
}

/** 编译成功返回 true；配置不完整时清空 querySql 并返回 false */
export function compileVisualTableSql(fill: TableSqlFillConfig): boolean {
  if (!fill.enabled || fill.fillMode !== "visual") return false;
  const vs = fill.visualSource;
  if (!vs?.connectionId?.trim() || !vs.table?.trim()) {
    fill.querySql = "";
    return false;
  }
  const eng = (vs.engine || "mysql").toLowerCase();
  if (eng === "mongodb") {
    fill.querySql = "";
    return false;
  }

  const selectFields = visualSqlSelectFieldNames(fill);
  if (!selectFields.length) {
    fill.querySql = "";
    return false;
  }

  try {
    validateSqlIdentifier(vs.table.trim());
    for (const c of selectFields) {
      validateSqlIdentifier(c);
    }
  } catch {
    fill.querySql = "";
    return false;
  }

  const qcols = selectFields.map((c) => quoteSqlIdentifier(eng, c)).join(", ");
  // 表名绑定 OPC 时产出 {{table}}；vs.table 仍是结构参考表（设计时选列 + 读失败兜底）
  const tableOpcBound = vs.tableSource === "opcua" && String(vs.tableOpcNodeId || "").trim().length > 0;
  const qtbl = tableOpcBound ? "{{table}}" : quoteSqlIdentifier(eng, vs.table.trim());

  const whereParts: string[] = [];
  const flatParams: TableSqlParamBinding[] = [];
  let pi = 0;

  for (const f of fill.visualFilters || []) {
    if (!f.column?.trim()) continue;
    try {
      validateSqlIdentifier(f.column.trim());
    } catch {
      continue;
    }
    const qc = quoteSqlIdentifier(eng, f.column.trim());
    const slots = bindingSlotsForKind(f.kind);
    while (f.defaults.length < slots) f.defaults.push("");
    f.defaults.length = slots;
    while (f.bindings.length < slots) f.bindings.push(defaultSqlParam());
    f.bindings.length = slots;

    if (f.kind === "equality") {
      whereParts.push(`${qc} = {{p${pi}}}`);
      const b = { ...f.bindings[0] };
      b.literalFallback = String(f.defaults[0] ?? "").trim();
      if (b.source !== "opcua") b.opcuaNodeId = "";
      flatParams.push(b);
      pi++;
      continue;
    }

    if (f.kind === "datetime_between" || f.kind === "date_between" || f.kind === "numeric_between") {
      whereParts.push(`${qc} >= {{p${pi}}} AND ${qc} <= {{p${pi + 1}}}`);
      const b0 = { ...f.bindings[0] };
      b0.literalFallback = String(f.defaults[0] ?? "").trim();
      if (b0.source !== "opcua") b0.opcuaNodeId = "";
      const b1 = { ...f.bindings[1] };
      b1.literalFallback = String(f.defaults[1] ?? "").trim();
      if (b1.source !== "opcua") b1.opcuaNodeId = "";
      flatParams.push(b0, b1);
      pi += 2;
    }
  }

  const whereSql = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";
  fill.querySql = `SELECT ${qcols} FROM ${qtbl}${whereSql}`;
  fill.params = flatParams;
  ensureMinTableSqlParamSlots(fill, Math.max(2, flatParams.length));
  return true;
}

/** 根据 visualSource.columns 重新编译 SQL，并同步 resultColumnNames / 参数列引用 */
export function syncVisualFillQueryAndResultNames(fill: TableSqlFillConfig, colCount: number): void {
  if (!fill.enabled || fill.fillMode !== "visual") return;
  ensureVisualSource(fill);
  const cc = isVerticalSqlFill(fill) ? VERTICAL_SQL_FILL_COL_COUNT : colCount;
  ensureVisualOutputColumnSlots(fill, cc);
  if (isVerticalSqlFill(fill)) ensureVerticalFieldLabels(fill);
  else ensureTableSqlColumnRoles(fill, cc);
  compileVisualTableSql(fill);
  ensureTableSqlResultColumnNames(fill, cc);
  if (isVerticalSqlFill(fill)) {
    if (!String(fill.resultColumnNames[0] ?? "").trim()) fill.resultColumnNames[0] = "名称";
    if (!String(fill.resultColumnNames[1] ?? "").trim()) fill.resultColumnNames[1] = "值";
  } else {
    const n = Math.max(1, Math.min(TEMPLATE_TABLE_MAX_COLS, Math.floor(Number(cc)) || 1));
    const vc = fill.visualSource!.columns;
    const roles = fill.columnRoles || [];
    for (let i = 0; i < n; i++) {
      const role = roles[i] ?? "field";
      if (role === "sequence") {
        if (!String(fill.resultColumnNames[i] ?? "").trim()) fill.resultColumnNames[i] = "序号";
        continue;
      }
      if (role === "blank") continue;
      if (!String(fill.resultColumnNames[i] ?? "").trim()) {
        fill.resultColumnNames[i] = vc[i] ?? "";
      }
    }
  }
  clampSqlFillParamColumnRefs(fill, cc);
}

/**
 * 画布第一行下拉写入某一列（横表）。
 * fieldName 可为库字段名、空串（空白列）、或 TABLE_SQL_COLUMN_PICK_SEQUENCE。
 */
export function applyVisualSqlOutputColumnPick(
  fill: TableSqlFillConfig,
  colCount: number,
  columnIndex: number,
  fieldName: string,
  gridHeaderCell?: { text?: string },
): void {
  ensureVisualSource(fill);
  if (isVerticalSqlFill(fill)) {
    // 纵表改走 applyVerticalSqlSlotField（画布名称列按槽位选字段）
    applyVerticalSqlSlotField(fill, columnIndex, fieldName);
    return;
  }
  const cc = colCount;
  ensureVisualOutputColumnSlots(fill, cc);
  ensureTableSqlResultColumnNames(fill, cc);

  ensureTableSqlColumnRoles(fill, cc);
  const roles = fill.columnRoles!;
  const prevFieldName = String(fill.visualSource!.columns[columnIndex] ?? "").trim();
  const prevHeaderName = String(fill.resultColumnNames[columnIndex] ?? "").trim();
  const prevRole = roles[columnIndex] ?? "field";

  if (fieldName === TABLE_SQL_COLUMN_PICK_SEQUENCE) {
    roles[columnIndex] = "sequence";
    fill.visualSource!.columns[columnIndex] = "";
    if (!prevHeaderName || prevHeaderName === prevFieldName || prevRole !== "sequence") {
      fill.resultColumnNames[columnIndex] = "序号";
    }
    if (gridHeaderCell && typeof gridHeaderCell.text === "string") gridHeaderCell.text = "序号";
  } else if (fieldName === TABLE_SQL_COLUMN_PICK_BLANK || !String(fieldName).trim()) {
    roles[columnIndex] = "blank";
    fill.visualSource!.columns[columnIndex] = "";
    if (!prevHeaderName || prevHeaderName === prevFieldName) {
      fill.resultColumnNames[columnIndex] = "";
    }
    if (gridHeaderCell && typeof gridHeaderCell.text === "string") gridHeaderCell.text = "";
  } else {
    roles[columnIndex] = "field";
    fill.visualSource!.columns[columnIndex] = fieldName;
    if (!prevHeaderName || prevHeaderName === prevFieldName || prevRole !== "field") {
      fill.resultColumnNames[columnIndex] = fieldName;
    }
    if (gridHeaderCell && typeof gridHeaderCell.text === "string") gridHeaderCell.text = fieldName;
  }
  syncVisualFillQueryAndResultNames(fill, cc);
}

/** 切换横/纵表布局；纵表强制 2 列并补默认表头 */
export function applyTableSqlLayoutMode(
  fill: TableSqlFillConfig,
  mode: "horizontal" | "vertical",
  setTableCols?: (n: number) => void,
): void {
  fill.layoutMode = mode;
  ensureVisualSource(fill);
  if (mode === "vertical") {
    setTableCols?.(VERTICAL_SQL_FILL_COL_COUNT);
    ensureTableSqlResultColumnNames(fill, VERTICAL_SQL_FILL_COL_COUNT);
    if (!String(fill.resultColumnNames[0] ?? "").trim()) fill.resultColumnNames[0] = "名称";
    if (!String(fill.resultColumnNames[1] ?? "").trim()) fill.resultColumnNames[1] = "值";
    if (!fill.visualSource!.columns.length) {
      // 默认一条待选字段行（非空白分隔），避免一切换纵表就全是分隔行
      fill.visualSource!.columns = [TABLE_SQL_VERTICAL_FIELD_PENDING];
    }
    ensureVerticalFieldLabels(fill);
  }
  syncVisualFillQueryAndResultNames(
    fill,
    mode === "vertical" ? VERTICAL_SQL_FILL_COL_COUNT : Math.max(1, fill.visualSource!.columns.length || 4),
  );
}

/** 纵表：在槽位列表末尾追加字段或空白分隔行 */
export function appendVerticalSqlSlot(fill: TableSqlFillConfig, kind: "field" | "blank"): void {
  ensureVisualSource(fill);
  ensureVerticalFieldLabels(fill);
  if ((fill.visualSource!.columns.length || 0) >= TEMPLATE_TABLE_MAX_ROWS - 1) return;
  if (kind === "blank") {
    fill.visualSource!.columns.push("");
    fill.verticalFieldLabels!.push("");
  } else {
    fill.visualSource!.columns.push(TABLE_SQL_VERTICAL_FIELD_PENDING);
    fill.verticalFieldLabels!.push("");
  }
  syncVisualFillQueryAndResultNames(fill, VERTICAL_SQL_FILL_COL_COUNT);
}

/**
 * 纵表：写入某一槽位。
 * - 空串 / TABLE_SQL_COLUMN_PICK_BLANK → 空白分隔行
 * - TABLE_SQL_VERTICAL_FIELD_PENDING → 待选字段行
 * - 其它 → 库字段名
 */
export function applyVerticalSqlSlotField(
  fill: TableSqlFillConfig,
  slotIndex: number,
  fieldName: string,
): void {
  ensureVisualSource(fill);
  ensureVerticalFieldLabels(fill);
  const slots = fill.visualSource!.columns;
  while (slots.length <= slotIndex) {
    slots.push(TABLE_SQL_VERTICAL_FIELD_PENDING);
    fill.verticalFieldLabels!.push("");
  }
  const raw = String(fieldName ?? "").trim();
  if (!raw || raw === TABLE_SQL_COLUMN_PICK_BLANK) {
    slots[slotIndex] = "";
  } else if (raw === TABLE_SQL_COLUMN_PICK_SEQUENCE) {
    slots[slotIndex] = TABLE_SQL_VERTICAL_FIELD_PENDING;
  } else {
    slots[slotIndex] = raw;
  }
  // 选了真实字段且左列标签仍空时，默认用字段名（可在属性里改）
  if (isVerticalSqlSlotBoundField(slots[slotIndex]) && !String(fill.verticalFieldLabels![slotIndex] ?? "").trim()) {
    fill.verticalFieldLabels![slotIndex] = "";
  }
  syncVisualFillQueryAndResultNames(fill, VERTICAL_SQL_FILL_COL_COUNT);
}

/** 纵表：删除槽位 */
export function removeVerticalSqlSlot(fill: TableSqlFillConfig, slotIndex: number): void {
  if (!fill.visualSource) return;
  ensureVerticalFieldLabels(fill);
  if (slotIndex < 0 || slotIndex >= fill.visualSource.columns.length) return;
  fill.visualSource.columns.splice(slotIndex, 1);
  fill.verticalFieldLabels!.splice(slotIndex, 1);
  if (!fill.visualSource.columns.length) {
    fill.visualSource.columns.push(TABLE_SQL_VERTICAL_FIELD_PENDING);
    fill.verticalFieldLabels!.push("");
  }
  syncVisualFillQueryAndResultNames(fill, VERTICAL_SQL_FILL_COL_COUNT);
}

/**
 * 按纵表槽位数同步表格物理行数（表头 + 槽位行），便于无预览数据时在画布上选字段。
 * 有 SQL 预览数据时仍由 syncTemplateTableRowsForSqlFillPreview 覆盖为逻辑行数。
 * 若元素带有外框高度，则至少撑到贴合全部槽位行（避免编辑画布按矮外框裁剪）。
 */
export function syncTableRowsForVerticalSqlSlots(
  el: {
    type?: string;
    tableRows?: number;
    tableRowHeightPx?: number;
    h?: number;
    tableSqlFill?: TableSqlFillConfig | null;
  },
  ensureGrid?: () => void,
): void {
  if (el.type !== "table") return;
  const fill = el.tableSqlFill;
  if (!fill || !isVerticalSqlFill(fill) || fill.fillMode !== "visual") return;
  ensureVisualSource(fill);
  const slots = Math.max(1, fill.visualSource!.columns.length);
  el.tableRows = 1 + slots;
  ensureGrid?.();
  if (typeof el.h === "number" && Number.isFinite(el.h)) {
    const rowH = clampTableRowHeightPx(el.tableRowHeightPx);
    const p = REPORT_TEMPLATE_TABLE_NODE_PADDING_PX;
    const needH = p.top + p.bottom + el.tableRows * rowH + 1;
    // 始终贴合槽位行高（增行抬高、减行收矮），避免旧外框偏矮裁切末行
    el.h = needH;
  }
}

/**
 * 属性面板改「行数」时：纵表将「表头 + 槽位」对齐到 tableRows，增删 visualSource.columns。
 * tableRows 至少为 2（1 表头 + 1 字段槽）。
 */
export function resizeVerticalSqlSlotsToTableRows(fill: TableSqlFillConfig, tableRows: number): void {
  if (!isVerticalSqlFill(fill) || fill.fillMode !== "visual") return;
  ensureVisualSource(fill);
  ensureVerticalFieldLabels(fill);
  const slotsNeeded = Math.max(
    1,
    Math.min(TEMPLATE_TABLE_MAX_ROWS - 1, (Math.floor(Number(tableRows)) || 2) - 1),
  );
  const cols = fill.visualSource!.columns;
  const labels = fill.verticalFieldLabels!;
  while (cols.length < slotsNeeded) {
    cols.push(TABLE_SQL_VERTICAL_FIELD_PENDING);
    labels.push("");
  }
  while (cols.length > slotsNeeded) {
    cols.pop();
    labels.pop();
  }
  if (!cols.length) {
    cols.push(TABLE_SQL_VERTICAL_FIELD_PENDING);
    labels.push("");
  }
  syncVisualFillQueryAndResultNames(fill, VERTICAL_SQL_FILL_COL_COUNT);
}

/** 查询任务用的结果列数（纵表=SELECT 字段数；横表=物理列数，含 blank/sequence 占位） */
export function sqlFillPreviewColCount(fill: TableSqlFillConfig, tableCols: number): number {
  if (isVerticalSqlFill(fill)) return Math.max(1, verticalSqlSelectColCount(fill));
  return Math.max(1, Math.min(TEMPLATE_TABLE_MAX_COLS, Math.floor(Number(tableCols)) || 1));
}
